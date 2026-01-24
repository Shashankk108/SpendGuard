/*
  # Fix admin clear function - handle missing tables gracefully

  Updates the admin_clear_all_purchases function to handle cases
  where tables like receipt_analysis might not exist
*/

DROP FUNCTION IF EXISTS admin_clear_all_purchases(text, boolean);

CREATE FUNCTION admin_clear_all_purchases(confirm_text text, create_backup boolean DEFAULT true)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  deleted_count integer := 0;
  deleted_receipts integer := 0;
  deleted_signatures integer := 0;
  admin_user_id uuid;
  admin_email text;
  requests_backup jsonb;
  receipts_backup jsonb;
  signatures_backup jsonb;
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

  IF create_backup THEN
    SELECT jsonb_agg(row_to_json(pr)) INTO requests_backup FROM purchase_requests pr;
    SELECT jsonb_agg(row_to_json(rec)) INTO receipts_backup FROM purchase_receipts rec;
    SELECT jsonb_agg(row_to_json(sig)) INTO signatures_backup FROM approval_signatures sig;
    
    IF requests_backup IS NOT NULL THEN
      INSERT INTO deleted_data_backup (backup_type, table_name, record_count, data, deleted_by, deleted_by_email, can_restore, restore_expires_at)
      VALUES ('clear_all', 'purchase_requests', jsonb_array_length(requests_backup), requests_backup, admin_user_id, admin_email, true, now() + interval '30 days');
    END IF;
    
    IF receipts_backup IS NOT NULL THEN
      INSERT INTO deleted_data_backup (backup_type, table_name, record_count, data, deleted_by, deleted_by_email, can_restore, restore_expires_at)
      VALUES ('clear_all', 'purchase_receipts', jsonb_array_length(receipts_backup), receipts_backup, admin_user_id, admin_email, true, now() + interval '30 days');
    END IF;
    
    IF signatures_backup IS NOT NULL THEN
      INSERT INTO deleted_data_backup (backup_type, table_name, record_count, data, deleted_by, deleted_by_email, can_restore, restore_expires_at)
      VALUES ('clear_all', 'approval_signatures', jsonb_array_length(signatures_backup), signatures_backup, admin_user_id, admin_email, true, now() + interval '30 days');
    END IF;
  END IF;

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
      'backup_created', create_backup,
      'action', 'ADMIN_CLEAR_ALL_PURCHASES'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_requests', deleted_count,
    'deleted_receipts', deleted_receipts,
    'deleted_signatures', deleted_signatures,
    'backup_created', create_backup,
    'message', 'All purchases cleared successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP FUNCTION IF EXISTS admin_truncate_all_data(text);

CREATE FUNCTION admin_truncate_all_data(confirm_text text)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
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

  IF confirm_text != 'PERMANENTLY_DELETE_EVERYTHING' THEN
    RAISE EXCEPTION 'Invalid confirmation text for truncate operation.';
  END IF;

  admin_user_id := auth.uid();
  SELECT email INTO admin_email FROM profiles WHERE id = admin_user_id;

  TRUNCATE TABLE purchase_receipts CASCADE;
  TRUNCATE TABLE approval_signatures CASCADE;
  TRUNCATE TABLE purchase_requests CASCADE;

  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, changes)
  VALUES (
    admin_user_id,
    admin_email,
    'DELETE',
    'ALL_TABLES',
    NULL,
    jsonb_build_object('action', 'ADMIN_TRUNCATE_ALL_DATA', 'warning', 'All data permanently destroyed')
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'All data has been permanently truncated. No backup was created.'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
