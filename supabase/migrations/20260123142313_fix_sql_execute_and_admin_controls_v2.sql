/*
  # Fix SQL Execute Function and Add Admin Controls

  1. Fixes
    - Fix execute_sql_query to strip trailing semicolons properly

  2. New Columns
    - Add hard_stop_enabled to pcard_settings
    - Add updated_by to pcard_settings

  3. New Functions
    - admin_reset_pcard_limit - Reset P-Card monthly limit
    - admin_clear_all_purchases - Clear all purchase data
    - admin_reset_monthly_usage - Archive current month usage
    - get_pcard_monthly_usage - Get current P-Card usage status
    - admin_set_hard_stop - Enable/disable hard stop at limit
*/

CREATE OR REPLACE FUNCTION execute_sql_query(query_text text)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  is_admin boolean;
  normalized_query text;
  clean_query text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  clean_query := TRIM(query_text);
  clean_query := RTRIM(clean_query, ';');
  clean_query := TRIM(clean_query);
  
  normalized_query := UPPER(clean_query);
  
  IF NOT (normalized_query LIKE 'SELECT%') THEN
    RAISE EXCEPTION 'Only SELECT queries are allowed for safety';
  END IF;

  IF normalized_query LIKE '%INSERT%' OR
     normalized_query LIKE '%UPDATE%' OR
     normalized_query LIKE '%DELETE%' OR
     normalized_query LIKE '%DROP%' OR
     normalized_query LIKE '%CREATE%' OR
     normalized_query LIKE '%ALTER%' OR
     normalized_query LIKE '%TRUNCATE%' OR
     normalized_query LIKE '%GRANT%' OR
     normalized_query LIKE '%REVOKE%' THEN
    RAISE EXCEPTION 'Modifying queries are not allowed';
  END IF;

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || clean_query || ') t' INTO result;
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pcard_settings' AND column_name = 'hard_stop_enabled'
  ) THEN
    ALTER TABLE pcard_settings ADD COLUMN hard_stop_enabled boolean DEFAULT true;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pcard_settings' AND column_name = 'updated_by'
  ) THEN
    ALTER TABLE pcard_settings ADD COLUMN updated_by uuid REFERENCES profiles(id);
  END IF;
END $$;

INSERT INTO pcard_settings (card_name, monthly_limit, reset_day, hard_stop_enabled)
VALUES ('Primary P-Card', 15000, 1, true)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION admin_reset_pcard_limit(new_limit numeric)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  old_limit numeric;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  SELECT monthly_limit INTO old_limit
  FROM pcard_settings
  LIMIT 1;

  UPDATE pcard_settings
  SET monthly_limit = new_limit,
      updated_at = now(),
      updated_by = auth.uid();

  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, changes)
  SELECT 
    auth.uid(),
    p.email,
    'UPDATE',
    'pcard_settings',
    'monthly_limit',
    jsonb_build_object('old_limit', old_limit, 'new_limit', new_limit)
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

  DELETE FROM receipt_analysis;
  
  DELETE FROM purchase_receipts;
  GET DIAGNOSTICS deleted_receipts = ROW_COUNT;

  DELETE FROM approval_signatures;
  GET DIAGNOSTICS deleted_signatures = ROW_COUNT;

  DELETE FROM purchase_requests;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, changes)
  SELECT 
    auth.uid(),
    p.email,
    'DELETE',
    'purchase_requests',
    'ALL',
    jsonb_build_object(
      'deleted_requests', deleted_count,
      'deleted_receipts', deleted_receipts,
      'deleted_signatures', deleted_signatures,
      'action', 'ADMIN_CLEAR_ALL_PURCHASES'
    )
  FROM profiles p WHERE p.id = auth.uid();

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
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

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
  SELECT 
    auth.uid(),
    p.email,
    'UPDATE',
    'purchase_requests',
    'monthly_reset',
    jsonb_build_object(
      'action', 'ADMIN_RESET_MONTHLY_USAGE',
      'archived_count', affected_count,
      'previous_usage', current_usage,
      'month', to_char(current_month_start, 'YYYY-MM')
    )
  FROM profiles p WHERE p.id = auth.uid();

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
    'current_usage', monthly_usage,
    'monthly_limit', limit_amount,
    'remaining', limit_amount - monthly_usage,
    'utilization_percent', ROUND((monthly_usage / NULLIF(limit_amount, 0)) * 100, 2),
    'hard_stop_enabled', hard_stop,
    'is_limit_reached', monthly_usage >= limit_amount AND hard_stop,
    'month', to_char(current_month_start, 'YYYY-MM')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_set_hard_stop(enabled boolean)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  UPDATE pcard_settings
  SET hard_stop_enabled = enabled,
      updated_at = now(),
      updated_by = auth.uid();

  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, changes)
  SELECT 
    auth.uid(),
    p.email,
    'UPDATE',
    'pcard_settings',
    'hard_stop_enabled',
    jsonb_build_object('enabled', enabled)
  FROM profiles p WHERE p.id = auth.uid();

  RETURN jsonb_build_object(
    'success', true,
    'hard_stop_enabled', enabled,
    'message', CASE WHEN enabled THEN 'Hard stop enabled - new requests blocked at limit' ELSE 'Hard stop disabled - requests allowed beyond limit' END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
