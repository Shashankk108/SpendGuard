/*
  # GoDaddy Integration and In-App Notifications System

  ## Overview
  This migration creates the infrastructure for:
  1. In-app notification system for real-time user alerts
  2. GoDaddy order tracking and automatic receipt import
  3. External vendor synchronization framework

  ## New Tables

  ### 1. `notifications`
  In-app notification center for users
  - `id` (uuid, primary key)
  - `user_id` (uuid, references auth.users)
  - `type` (text) - notification category
  - `title` (text) - notification headline
  - `message` (text) - detailed message
  - `action_url` (text, nullable) - link to relevant page
  - `metadata` (jsonb) - additional context data
  - `is_read` (boolean) - read status
  - `created_at` (timestamptz)

  ### 2. `godaddy_orders`
  Stores synced orders from GoDaddy account
  - `id` (uuid, primary key)
  - `order_id` (text) - GoDaddy's order ID
  - `domain_or_product` (text) - product name/domain
  - `order_date` (date)
  - `order_total` (numeric)
  - `currency` (text)
  - `receipt_url` (text, nullable)
  - `raw_api_response` (jsonb)
  - `sync_status` (text) - pending/synced/matched/unmatched
  - `matched_request_id` (uuid, nullable)
  - `match_confidence` (numeric, nullable)
  - `synced_at` (timestamptz)
  - `created_at` (timestamptz)

  ### 3. `external_vendor_sync`
  Tracks sync job status for external vendors
  - `id` (uuid, primary key)
  - `vendor_type` (text) - godaddy/aws/azure/etc
  - `last_sync_at` (timestamptz)
  - `orders_synced` (integer)
  - `status` (text) - success/failed/running
  - `error_message` (text, nullable)
  - `created_at` (timestamptz)

  ## Modified Tables

  ### `purchase_requests` additions
  - `vendor_type` (text) - standard/godaddy/aws/etc
  - `external_order_id` (text, nullable)
  - `external_receipt_status` (text) - pending/fetched/failed/manual

  ## Security
  - RLS enabled on all new tables
  - Users can only see their own notifications
  - Leaders can view all GoDaddy orders
  - Sync status visible to leaders only
*/

-- ================================================
-- NOTIFICATIONS TABLE
-- ================================================

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  action_url text,
  metadata jsonb DEFAULT '{}',
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ================================================
-- GODADDY ORDERS TABLE
-- ================================================

CREATE TABLE IF NOT EXISTS godaddy_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id text NOT NULL UNIQUE,
  domain_or_product text NOT NULL,
  product_type text,
  order_date date NOT NULL,
  order_total numeric(12,2) NOT NULL,
  currency text DEFAULT 'USD',
  receipt_url text,
  receipt_data text,
  raw_api_response jsonb DEFAULT '{}',
  sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'matched', 'unmatched', 'failed')),
  matched_request_id uuid REFERENCES purchase_requests(id) ON DELETE SET NULL,
  match_confidence numeric(5,2),
  match_reasons jsonb DEFAULT '[]',
  synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_godaddy_orders_order_id ON godaddy_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_godaddy_orders_sync_status ON godaddy_orders(sync_status);
CREATE INDEX IF NOT EXISTS idx_godaddy_orders_matched_request ON godaddy_orders(matched_request_id);
CREATE INDEX IF NOT EXISTS idx_godaddy_orders_order_date ON godaddy_orders(order_date DESC);

ALTER TABLE godaddy_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders can view all GoDaddy orders"
  ON godaddy_orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND approvers.is_active = true
    )
  );

CREATE POLICY "Leaders can update GoDaddy orders"
  ON godaddy_orders FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin')
    )
  );

CREATE POLICY "System can insert GoDaddy orders"
  ON godaddy_orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ================================================
-- EXTERNAL VENDOR SYNC TABLE
-- ================================================

CREATE TABLE IF NOT EXISTS external_vendor_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_type text NOT NULL,
  last_sync_at timestamptz,
  next_sync_at timestamptz,
  orders_synced integer DEFAULT 0,
  orders_matched integer DEFAULT 0,
  status text DEFAULT 'idle' CHECK (status IN ('idle', 'running', 'success', 'failed')),
  error_message text,
  sync_config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_vendor_sync_type ON external_vendor_sync(vendor_type);

ALTER TABLE external_vendor_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leaders can view sync status"
  ON external_vendor_sync FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin')
    )
  );

CREATE POLICY "System can manage sync status"
  ON external_vendor_sync FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ================================================
-- ADD COLUMNS TO PURCHASE_REQUESTS
-- ================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requests' AND column_name = 'vendor_type'
  ) THEN
    ALTER TABLE purchase_requests ADD COLUMN vendor_type text DEFAULT 'standard';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requests' AND column_name = 'external_order_id'
  ) THEN
    ALTER TABLE purchase_requests ADD COLUMN external_order_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_requests' AND column_name = 'external_receipt_status'
  ) THEN
    ALTER TABLE purchase_requests ADD COLUMN external_receipt_status text DEFAULT 'manual';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_requests_vendor_type ON purchase_requests(vendor_type);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_external_order ON purchase_requests(external_order_id) WHERE external_order_id IS NOT NULL;

-- ================================================
-- NOTIFICATION HELPER FUNCTION
-- ================================================

CREATE OR REPLACE FUNCTION create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_action_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, action_url, metadata)
  VALUES (p_user_id, p_type, p_title, p_message, p_action_url, p_metadata)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- ================================================
-- TRIGGER: Auto-notify on request status change
-- ================================================

CREATE OR REPLACE FUNCTION notify_request_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM create_notification(
        NEW.requester_id,
        'request_approved',
        'Purchase Request Approved',
        'Your request for ' || NEW.vendor_name || ' ($' || NEW.total_amount || ') has been approved.',
        '/request/' || NEW.id,
        jsonb_build_object('request_id', NEW.id, 'vendor', NEW.vendor_name, 'amount', NEW.total_amount)
      );
      
      IF NEW.vendor_type = 'godaddy' THEN
        PERFORM create_notification(
          NEW.requester_id,
          'godaddy_receipt_pending',
          'GoDaddy Receipt Import Pending',
          'Your GoDaddy receipt will be automatically imported once the order is detected.',
          '/request/' || NEW.id,
          jsonb_build_object('request_id', NEW.id, 'vendor_type', 'godaddy')
        );
      END IF;
    ELSIF NEW.status = 'rejected' THEN
      PERFORM create_notification(
        NEW.requester_id,
        'request_rejected',
        'Purchase Request Rejected',
        'Your request for ' || NEW.vendor_name || ' ($' || NEW.total_amount || ') was not approved.',
        '/request/' || NEW.id,
        jsonb_build_object('request_id', NEW.id, 'vendor', NEW.vendor_name, 'amount', NEW.total_amount)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_request_status ON purchase_requests;
CREATE TRIGGER trigger_notify_request_status
  AFTER UPDATE ON purchase_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_request_status_change();

-- ================================================
-- TRIGGER: Notify on receipt upload needed
-- ================================================

CREATE OR REPLACE FUNCTION notify_receipt_reupload()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.reupload_requested = true AND (OLD.reupload_requested IS NULL OR OLD.reupload_requested = false) THEN
    PERFORM create_notification(
      NEW.user_id,
      'receipt_reupload_needed',
      'Receipt Re-upload Required',
      COALESCE(NEW.reupload_reason, 'Your approver has requested a clearer receipt image.'),
      '/my-receipts',
      jsonb_build_object('receipt_id', NEW.id, 'request_id', NEW.request_id)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_receipt_reupload ON purchase_receipts;
CREATE TRIGGER trigger_notify_receipt_reupload
  AFTER UPDATE ON purchase_receipts
  FOR EACH ROW
  EXECUTE FUNCTION notify_receipt_reupload();

-- ================================================
-- Initialize GoDaddy sync record
-- ================================================

INSERT INTO external_vendor_sync (vendor_type, status, sync_config)
VALUES ('godaddy', 'idle', '{"sync_interval_hours": 4, "auto_match": true}')
ON CONFLICT (vendor_type) DO NOTHING;

-- ================================================
-- Function: Get user notification count
-- ================================================

CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM notifications
  WHERE user_id = auth.uid()
  AND is_read = false;
$$;

-- ================================================
-- Function: Mark all notifications as read
-- ================================================

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE notifications
  SET is_read = true
  WHERE user_id = auth.uid()
  AND is_read = false;
$$;