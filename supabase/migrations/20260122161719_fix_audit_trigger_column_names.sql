/*
  # Fix Audit Trigger Column Names
  
  1. Problem
    - The audit_trigger_function references columns 'old_values' and 'new_values'
    - But the audit_logs table has columns 'old_data' and 'new_data'
    - This causes INSERT operations on purchase_requests to fail
  
  2. Solution
    - Update the trigger function to use the correct column names
*/

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;