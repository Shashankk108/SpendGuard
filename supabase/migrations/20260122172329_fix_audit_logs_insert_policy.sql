/*
  # Fix Audit Logs Insert Permission

  1. Problem
    - The audit_trigger_function attempts to insert into audit_logs
    - But audit_logs has RLS enabled with no INSERT policy
    - This causes approval actions to fail silently

  2. Solution
    - Recreate the audit_trigger_function with SECURITY DEFINER
    - This allows the trigger to bypass RLS when inserting audit logs
    - The function will run with the privileges of the function owner (postgres)

  3. Security Notes
    - SECURITY DEFINER is safe here because:
      - The trigger only fires on specific table operations
      - It only inserts predetermined data (the row being modified)
      - Users cannot call this function directly
*/

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  old_data jsonb := NULL;
  new_data jsonb := NULL;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_data := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
  ELSIF TG_OP = 'INSERT' THEN
    new_data := to_jsonb(NEW);
  END IF;

  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), old_data, new_data);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;