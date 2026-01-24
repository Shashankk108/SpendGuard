/*
  # Fix Admin Functions

  1. Fixes
    - Fix entity_id type issue in audit_logs (use NULL instead of string)
    - Add proper WHERE clause to pcard_settings updates
    - Fix all admin functions to work correctly

  2. Changes
    - Recreate all admin functions with proper SQL
*/

CREATE OR REPLACE FUNCTION admin_reset_pcard_limit(new_limit numeric)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  old_limit numeric;
  settings_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  SELECT id, monthly_limit INTO settings_id, old_limit
  FROM pcard_settings
  LIMIT 1;

  IF settings_id IS NULL THEN
    INSERT INTO pcard_settings (card_name, monthly_limit, reset_day, hard_stop_enabled)
    VALUES ('Primary P-Card', new_limit, 1, true)
    RETURNING id INTO settings_id;
    old_limit := 0;
  ELSE
    UPDATE pcard_settings
    SET monthly_limit = new_limit,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = settings_id;
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, changes)
  SELECT 
    auth.uid(),
    p.email,
    'UPDATE',
    'pcard_settings',
    settings_id,
    jsonb_build_object('old_limit', old_limit, 'new_limit', new_limit, 'action', 'ADMIN_RESET_PCARD_LIMIT')
  FROM profiles p WHERE p.id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'old_limit', old_limit,
    'new_limit', new_limit,
    'message', 'P-Card monthly limit updated successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_clear_all_purchases(confirm_text text)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  deleted_count integer;
  deleted_receipts integer;
  deleted_signatures integer;
  admin_user_id uuid;
  admin_email text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  IF confirm_text != 'CONFIRM_DELETE_ALL_PURCHASES' THEN
    RAISE EXCEPTION 'Invalid confirmation text. Please enter exact confirmation phrase.';
  END IF;

  admin_user_id := auth.uid();
  SELECT email INTO admin_email FROM profiles WHERE id = admin_user_id;

  DELETE FROM receipt_analysis;
  
  DELETE FROM purchase_receipts;
  GET DIAGNOSTICS deleted_receipts = ROW_COUNT;

  DELETE FROM approval_signatures;
  GET DIAGNOSTICS deleted_signatures = ROW_COUNT;

  DELETE FROM purchase_requests;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, changes)
  VALUES (
    admin_user_id,
    admin_email,
    'DELETE',
    'purchase_requests',
    NULL,
    jsonb_build_object(
      'deleted_requests', deleted_count,
      'deleted_receipts', deleted_receipts,
      'deleted_signatures', deleted_signatures,
      'action', 'ADMIN_CLEAR_ALL_PURCHASES'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_requests', deleted_count,
    'deleted_receipts', deleted_receipts,
    'deleted_signatures', deleted_signatures,
    'message', 'All purchases cleared successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_reset_monthly_usage()
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  current_month_start date;
  current_usage numeric;
  affected_count integer;
  admin_user_id uuid;
  admin_email text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  admin_user_id := auth.uid();
  SELECT email INTO admin_email FROM profiles WHERE id = admin_user_id;

  current_month_start := date_trunc('month', CURRENT_DATE)::date;

  SELECT COALESCE(SUM(total_amount), 0) INTO current_usage
  FROM purchase_requests
  WHERE status = 'approved'
    AND expense_date >= current_month_start;

  UPDATE purchase_requests
  SET status = 'archived',
      updated_at = now()
  WHERE status = 'approved'
    AND expense_date >= current_month_start;
  GET DIAGNOSTICS affected_count = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, changes)
  VALUES (
    admin_user_id,
    admin_email,
    'UPDATE',
    'purchase_requests',
    NULL,
    jsonb_build_object(
      'action', 'ADMIN_RESET_MONTHLY_USAGE',
      'archived_count', affected_count,
      'previous_usage', current_usage,
      'month', to_char(current_month_start, 'YYYY-MM')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'archived_count', affected_count,
    'previous_usage', current_usage,
    'message', 'Monthly usage reset successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_pcard_monthly_usage()
RETURNS jsonb AS $$
DECLARE
  current_month_start date;
  monthly_usage numeric;
  limit_amount numeric;
  hard_stop boolean;
BEGIN
  current_month_start := date_trunc('month', CURRENT_DATE)::date;

  SELECT COALESCE(SUM(total_amount), 0) INTO monthly_usage
  FROM purchase_requests
  WHERE status = 'approved'
    AND expense_date >= current_month_start;

  SELECT COALESCE(monthly_limit, 15000), COALESCE(hard_stop_enabled, true)
  INTO limit_amount, hard_stop
  FROM pcard_settings
  LIMIT 1;

  IF limit_amount IS NULL THEN
    limit_amount := 15000;
    hard_stop := true;
  END IF;

  RETURN jsonb_build_object(
    'current_usage', COALESCE(monthly_usage, 0),
    'monthly_limit', limit_amount,
    'remaining', limit_amount - COALESCE(monthly_usage, 0),
    'utilization_percent', ROUND((COALESCE(monthly_usage, 0) / NULLIF(limit_amount, 0)) * 100, 2),
    'hard_stop_enabled', hard_stop,
    'is_limit_reached', COALESCE(monthly_usage, 0) >= limit_amount AND hard_stop,
    'month', to_char(current_month_start, 'YYYY-MM')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_set_hard_stop(enabled boolean)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  settings_id uuid;
  admin_user_id uuid;
  admin_email text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  admin_user_id := auth.uid();
  SELECT email INTO admin_email FROM profiles WHERE id = admin_user_id;

  SELECT id INTO settings_id FROM pcard_settings LIMIT 1;

  IF settings_id IS NULL THEN
    INSERT INTO pcard_settings (card_name, monthly_limit, reset_day, hard_stop_enabled)
    VALUES ('Primary P-Card', 15000, 1, enabled)
    RETURNING id INTO settings_id;
  ELSE
    UPDATE pcard_settings
    SET hard_stop_enabled = enabled,
        updated_at = now(),
        updated_by = auth.uid()
    WHERE id = settings_id;
  END IF;

  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, changes)
  VALUES (
    admin_user_id,
    admin_email,
    'UPDATE',
    'pcard_settings',
    settings_id,
    jsonb_build_object('enabled', enabled, 'action', 'ADMIN_SET_HARD_STOP')
  );

  RETURN jsonb_build_object(
    'success', true,
    'hard_stop_enabled', enabled,
    'message', CASE WHEN enabled THEN 'Hard stop enabled - new requests blocked at limit' ELSE 'Hard stop disabled - requests allowed beyond limit' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Admins can manage pcard settings" ON pcard_settings;
DROP POLICY IF EXISTS "All authenticated users can view pcard settings" ON pcard_settings;

CREATE POLICY "Anyone can view pcard settings"
  ON pcard_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert pcard settings"
  ON pcard_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update pcard settings"
  ON pcard_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete pcard settings"
  ON pcard_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

INSERT INTO pcard_settings (card_name, monthly_limit, reset_day, hard_stop_enabled)
SELECT 'Primary P-Card', 15000, 1, true
WHERE NOT EXISTS (SELECT 1 FROM pcard_settings);
