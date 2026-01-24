/*
  # Fix Admin Functions and Add Backup Recovery System

  1. New Tables
    - `deleted_data_backup` - Stores backup of deleted records for recovery
  
  2. Fixed Functions
    - Recreate all admin functions with proper implementation
  
  3. Security
    - All functions restricted to admin role only
*/

DROP FUNCTION IF EXISTS admin_clear_all_purchases(text);
DROP FUNCTION IF EXISTS admin_clear_all_purchases(text, boolean);

CREATE TABLE IF NOT EXISTS deleted_data_backup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type text NOT NULL,
  table_name text NOT NULL,
  record_count integer NOT NULL DEFAULT 0,
  data jsonb NOT NULL,
  deleted_by uuid REFERENCES profiles(id),
  deleted_by_email text,
  deleted_at timestamptz DEFAULT now(),
  can_restore boolean DEFAULT true,
  restore_expires_at timestamptz DEFAULT (now() + interval '30 days')
);

ALTER TABLE deleted_data_backup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage backup data" ON deleted_data_backup;

CREATE POLICY "Admins can manage backup data"
  ON deleted_data_backup FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE FUNCTION admin_clear_all_purchases(confirm_text text, create_backup boolean DEFAULT true)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  deleted_count integer;
  deleted_receipts integer;
  deleted_signatures integer;
  deleted_analysis integer;
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
      INSERT INTO deleted_data_backup (backup_type, table_name, record_count, data, deleted_by, deleted_by_email)
      VALUES ('clear_all', 'purchase_requests', jsonb_array_length(requests_backup), requests_backup, admin_user_id, admin_email);
    END IF;
    
    IF receipts_backup IS NOT NULL THEN
      INSERT INTO deleted_data_backup (backup_type, table_name, record_count, data, deleted_by, deleted_by_email)
      VALUES ('clear_all', 'purchase_receipts', jsonb_array_length(receipts_backup), receipts_backup, admin_user_id, admin_email);
    END IF;
    
    IF signatures_backup IS NOT NULL THEN
      INSERT INTO deleted_data_backup (backup_type, table_name, record_count, data, deleted_by, deleted_by_email)
      VALUES ('clear_all', 'approval_signatures', jsonb_array_length(signatures_backup), signatures_backup, admin_user_id, admin_email);
    END IF;
  END IF;

  DELETE FROM receipt_analysis;
  GET DIAGNOSTICS deleted_analysis = ROW_COUNT;
  
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
      'deleted_analysis', deleted_analysis,
      'backup_created', create_backup,
      'action', 'ADMIN_CLEAR_ALL_PURCHASES'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'deleted_requests', deleted_count,
    'deleted_receipts', deleted_receipts,
    'deleted_signatures', deleted_signatures,
    'deleted_analysis', deleted_analysis,
    'backup_created', create_backup,
    'message', 'All purchases cleared successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_truncate_all_data(confirm_text text)
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

  TRUNCATE TABLE receipt_analysis CASCADE;
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

CREATE OR REPLACE FUNCTION admin_get_employee_stats(employee_id uuid)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  emp_profile profiles%ROWTYPE;
  total_requests integer;
  approved_requests integer;
  rejected_requests integer;
  pending_requests integer;
  total_spent numeric;
  avg_amount numeric;
  first_request timestamptz;
  last_request timestamptz;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  SELECT * INTO emp_profile FROM profiles WHERE id = employee_id;
  
  IF emp_profile.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'approved'),
    COUNT(*) FILTER (WHERE status = 'rejected'),
    COUNT(*) FILTER (WHERE status = 'pending'),
    COALESCE(SUM(total_amount) FILTER (WHERE status = 'approved'), 0),
    COALESCE(AVG(total_amount), 0),
    MIN(created_at),
    MAX(created_at)
  INTO 
    total_requests, approved_requests, rejected_requests, pending_requests,
    total_spent, avg_amount, first_request, last_request
  FROM purchase_requests
  WHERE requester_id = employee_id;

  RETURN jsonb_build_object(
    'employee', jsonb_build_object(
      'id', emp_profile.id,
      'full_name', emp_profile.full_name,
      'email', emp_profile.email,
      'department', emp_profile.department,
      'role', emp_profile.role,
      'created_at', emp_profile.created_at
    ),
    'stats', jsonb_build_object(
      'total_requests', total_requests,
      'approved_requests', approved_requests,
      'rejected_requests', rejected_requests,
      'pending_requests', pending_requests,
      'total_spent', total_spent,
      'avg_amount', ROUND(avg_amount::numeric, 2),
      'approval_rate', CASE WHEN total_requests > 0 THEN ROUND((approved_requests::numeric / total_requests) * 100, 1) ELSE 0 END,
      'first_request', first_request,
      'last_request', last_request
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_get_employee_audit_trail(employee_id uuid, limit_count integer DEFAULT 50)
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  emp_profile profiles%ROWTYPE;
  audit_data jsonb;
  requests_data jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  SELECT * INTO emp_profile FROM profiles WHERE id = employee_id;
  
  IF emp_profile.id IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;

  SELECT jsonb_agg(row_to_json(al) ORDER BY al.created_at DESC)
  INTO audit_data
  FROM (
    SELECT id, action, entity_type, entity_id, changes, created_at
    FROM audit_logs
    WHERE user_id = employee_id
    ORDER BY created_at DESC
    LIMIT limit_count
  ) al;

  SELECT jsonb_agg(row_to_json(pr) ORDER BY pr.created_at DESC)
  INTO requests_data
  FROM (
    SELECT id, vendor_name, total_amount, status, category, created_at, updated_at
    FROM purchase_requests
    WHERE requester_id = employee_id
    ORDER BY created_at DESC
    LIMIT limit_count
  ) pr;

  RETURN jsonb_build_object(
    'employee', jsonb_build_object(
      'id', emp_profile.id,
      'full_name', emp_profile.full_name,
      'email', emp_profile.email
    ),
    'audit_logs', COALESCE(audit_data, '[]'::jsonb),
    'requests', COALESCE(requests_data, '[]'::jsonb)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_list_backups()
RETURNS jsonb AS $$
DECLARE
  is_admin boolean;
  backups_data jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  SELECT jsonb_agg(row_to_json(b) ORDER BY b.deleted_at DESC)
  INTO backups_data
  FROM (
    SELECT 
      id, 
      backup_type, 
      table_name, 
      record_count, 
      deleted_by_email, 
      deleted_at,
      can_restore,
      restore_expires_at,
      restore_expires_at > now() as is_restorable
    FROM deleted_data_backup
    ORDER BY deleted_at DESC
    LIMIT 50
  ) b;

  RETURN COALESCE(backups_data, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION admin_delete_backup(backup_id uuid)
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

  DELETE FROM deleted_data_backup WHERE id = backup_id;

  RETURN jsonb_build_object('success', true, 'message', 'Backup deleted permanently');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
