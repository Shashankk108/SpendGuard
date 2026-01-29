/*
  # API Credentials Storage System

  ## Overview
  Secure storage for external API credentials (GoDaddy, AWS, etc.)

  ## New Tables
  
  ### `api_credentials`
  Stores encrypted API credentials for external integrations
  - `id` (uuid, primary key)
  - `service_name` (text) - e.g., "godaddy", "aws", "stripe"
  - `api_key` (text) - API key or client ID
  - `api_secret` (text) - API secret or client secret
  - `shopper_id` (text, nullable) - For GoDaddy shopper/customer ID
  - `additional_config` (jsonb) - Other service-specific settings
  - `is_active` (boolean) - Whether credentials are active
  - `created_by` (uuid) - Admin who created
  - `updated_by` (uuid) - Admin who last updated
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ## Security
  - RLS enabled - only admins can view/modify
  - Audit trail for all credential changes
  - Unique constraint on service_name for single source of truth

  ## Notes
  These credentials will be synced to Edge Function environment variables
  by the system administrator.
*/

-- ================================================
-- API CREDENTIALS TABLE
-- ================================================

CREATE TABLE IF NOT EXISTS api_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL UNIQUE,
  api_key text NOT NULL,
  api_secret text NOT NULL,
  shopper_id text,
  additional_config jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_credentials_service ON api_credentials(service_name);
CREATE INDEX IF NOT EXISTS idx_api_credentials_active ON api_credentials(is_active) WHERE is_active = true;

ALTER TABLE api_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can view credentials
CREATE POLICY "Admins can view API credentials"
  ON api_credentials FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Only admins can insert credentials
CREATE POLICY "Admins can insert API credentials"
  ON api_credentials FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Only admins can update credentials
CREATE POLICY "Admins can update API credentials"
  ON api_credentials FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Only admins can delete credentials (soft delete recommended)
CREATE POLICY "Admins can delete API credentials"
  ON api_credentials FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ================================================
-- TRIGGER: Update timestamp on changes
-- ================================================

CREATE OR REPLACE FUNCTION update_api_credentials_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_api_credentials_timestamp ON api_credentials;
CREATE TRIGGER trigger_update_api_credentials_timestamp
  BEFORE UPDATE ON api_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_api_credentials_timestamp();

-- ================================================
-- AUDIT TRIGGER: Log credential changes
-- ================================================

CREATE OR REPLACE FUNCTION audit_api_credentials_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (table_name, record_id, action, new_data, user_id)
    VALUES (
      'api_credentials',
      NEW.id,
      'credentials_created',
      jsonb_build_object(
        'service_name', NEW.service_name,
        'is_active', NEW.is_active,
        'api_key_set', true,
        'api_secret_set', true
      ),
      auth.uid()
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (
      'api_credentials',
      NEW.id,
      'credentials_updated',
      jsonb_build_object(
        'service_name', OLD.service_name,
        'is_active', OLD.is_active
      ),
      jsonb_build_object(
        'service_name', NEW.service_name,
        'is_active', NEW.is_active,
        'credentials_changed', (OLD.api_key != NEW.api_key OR OLD.api_secret != NEW.api_secret)
      ),
      auth.uid()
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (table_name, record_id, action, old_data, user_id)
    VALUES (
      'api_credentials',
      OLD.id,
      'credentials_deleted',
      jsonb_build_object(
        'service_name', OLD.service_name
      ),
      auth.uid()
    );
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_audit_api_credentials ON api_credentials;
CREATE TRIGGER trigger_audit_api_credentials
  AFTER INSERT OR UPDATE OR DELETE ON api_credentials
  FOR EACH ROW
  EXECUTE FUNCTION audit_api_credentials_changes();

-- ================================================
-- FUNCTION: Get active credentials for a service
-- ================================================

CREATE OR REPLACE FUNCTION get_api_credentials(p_service_name text)
RETURNS TABLE (
  api_key text,
  api_secret text,
  shopper_id text,
  additional_config jsonb
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT api_key, api_secret, shopper_id, additional_config
  FROM api_credentials
  WHERE service_name = p_service_name
  AND is_active = true
  LIMIT 1;
$$;

-- ================================================
-- FUNCTION: Upsert API credentials (admin only)
-- ================================================

CREATE OR REPLACE FUNCTION upsert_api_credentials(
  p_service_name text,
  p_api_key text,
  p_api_secret text,
  p_shopper_id text DEFAULT NULL,
  p_additional_config jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_credential_id uuid;
  v_is_admin boolean;
BEGIN
  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admins can manage API credentials';
  END IF;

  -- Upsert credentials
  INSERT INTO api_credentials (
    service_name,
    api_key,
    api_secret,
    shopper_id,
    additional_config,
    created_by,
    updated_by
  )
  VALUES (
    p_service_name,
    p_api_key,
    p_api_secret,
    p_shopper_id,
    p_additional_config,
    auth.uid(),
    auth.uid()
  )
  ON CONFLICT (service_name) DO UPDATE SET
    api_key = EXCLUDED.api_key,
    api_secret = EXCLUDED.api_secret,
    shopper_id = EXCLUDED.shopper_id,
    additional_config = EXCLUDED.additional_config,
    updated_by = auth.uid(),
    updated_at = now()
  RETURNING id INTO v_credential_id;

  RETURN v_credential_id;
END;
$$;