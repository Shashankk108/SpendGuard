/*
  # SQL Query Execution Function for Admin Dashboard

  1. New Functions
    - `execute_sql_query` - Allows admins to execute SELECT queries
    - Restricted to SELECT statements only for safety
    - Returns JSON array of results

  2. Security
    - Only admins can execute this function
    - Only SELECT queries are allowed (no INSERT, UPDATE, DELETE, DROP, etc.)
*/

CREATE OR REPLACE FUNCTION execute_sql_query(query_text text)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  is_admin boolean;
  normalized_query text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO is_admin;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  normalized_query := UPPER(TRIM(query_text));
  
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

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query_text || ') t' INTO result;
  
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
