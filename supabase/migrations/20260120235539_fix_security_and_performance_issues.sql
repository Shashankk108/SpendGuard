/*
  # Fix Security and Performance Issues

  1. Indexes for Foreign Keys
    - Add index on approval_signatures.approver_id
    - Add index on approval_signatures.request_id
    - Add index on approvers.user_id
    - Add index on budgets.created_by
    - Add index on purchase_requests.requester_id
    - Add index on supporting_documents.request_id

  2. RLS Policy Optimization
    - Update all policies to use (select auth.uid()) instead of auth.uid()
    - This prevents re-evaluation for each row and improves performance

  3. Function Search Path Security
    - Set immutable search_path on all functions to prevent search_path injection attacks
*/

-- =============================================================================
-- PART 1: Add indexes for unindexed foreign keys
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_approval_signatures_approver_id 
  ON approval_signatures(approver_id);

CREATE INDEX IF NOT EXISTS idx_approval_signatures_request_id 
  ON approval_signatures(request_id);

CREATE INDEX IF NOT EXISTS idx_approvers_user_id 
  ON approvers(user_id);

CREATE INDEX IF NOT EXISTS idx_budgets_created_by 
  ON budgets(created_by);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_requester_id 
  ON purchase_requests(requester_id);

CREATE INDEX IF NOT EXISTS idx_supporting_documents_request_id 
  ON supporting_documents(request_id);

-- =============================================================================
-- PART 2: Fix RLS policies to use (select auth.uid()) pattern
-- =============================================================================

-- Drop and recreate profiles policies
DROP POLICY IF EXISTS "Leadership can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = (select auth.uid()));

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

CREATE POLICY "Leadership can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.user_id = (select auth.uid())
      AND approvers.is_active = true
    )
  );

-- Drop and recreate purchase_requests policies
DROP POLICY IF EXISTS "Approvers can update pending requests" ON purchase_requests;
DROP POLICY IF EXISTS "Approvers can view all requests for reporting" ON purchase_requests;
DROP POLICY IF EXISTS "Approvers can view pending requests" ON purchase_requests;
DROP POLICY IF EXISTS "Users can insert own requests" ON purchase_requests;
DROP POLICY IF EXISTS "Users can update own draft requests" ON purchase_requests;
DROP POLICY IF EXISTS "Users can view own requests" ON purchase_requests;

CREATE POLICY "Users can view own requests"
  ON purchase_requests FOR SELECT
  TO authenticated
  USING (requester_id = (select auth.uid()));

CREATE POLICY "Users can insert own requests"
  ON purchase_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

CREATE POLICY "Users can update own draft requests"
  ON purchase_requests FOR UPDATE
  TO authenticated
  USING (requester_id = (select auth.uid()) AND status = 'draft')
  WITH CHECK (requester_id = (select auth.uid()));

CREATE POLICY "Approvers can view pending requests"
  ON purchase_requests FOR SELECT
  TO authenticated
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.user_id = (select auth.uid())
      AND approvers.is_active = true
    )
  );

CREATE POLICY "Approvers can view all requests for reporting"
  ON purchase_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.user_id = (select auth.uid())
      AND approvers.is_active = true
    )
  );

CREATE POLICY "Approvers can update pending requests"
  ON purchase_requests FOR UPDATE
  TO authenticated
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.user_id = (select auth.uid())
      AND approvers.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.user_id = (select auth.uid())
      AND approvers.is_active = true
    )
  );

-- Drop and recreate approval_signatures policies
DROP POLICY IF EXISTS "Approvers can insert signatures" ON approval_signatures;
DROP POLICY IF EXISTS "Approvers can view all signatures" ON approval_signatures;
DROP POLICY IF EXISTS "Users can view signatures on their requests" ON approval_signatures;

CREATE POLICY "Approvers can insert signatures"
  ON approval_signatures FOR INSERT
  TO authenticated
  WITH CHECK (
    approver_id = (select auth.uid()) AND
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.user_id = (select auth.uid())
      AND approvers.is_active = true
    )
  );

CREATE POLICY "Approvers can view all signatures"
  ON approval_signatures FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.user_id = (select auth.uid())
      AND approvers.is_active = true
    )
  );

CREATE POLICY "Users can view signatures on their requests"
  ON approval_signatures FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests
      WHERE purchase_requests.id = approval_signatures.request_id
      AND purchase_requests.requester_id = (select auth.uid())
    )
  );

-- Drop and recreate supporting_documents policies
DROP POLICY IF EXISTS "Approvers can view all documents" ON supporting_documents;
DROP POLICY IF EXISTS "Users can delete documents on their draft requests" ON supporting_documents;
DROP POLICY IF EXISTS "Users can insert documents on their requests" ON supporting_documents;
DROP POLICY IF EXISTS "Users can view documents on their requests" ON supporting_documents;

CREATE POLICY "Users can view documents on their requests"
  ON supporting_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests
      WHERE purchase_requests.id = supporting_documents.request_id
      AND purchase_requests.requester_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can insert documents on their requests"
  ON supporting_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_requests
      WHERE purchase_requests.id = supporting_documents.request_id
      AND purchase_requests.requester_id = (select auth.uid())
    )
  );

CREATE POLICY "Users can delete documents on their draft requests"
  ON supporting_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests
      WHERE purchase_requests.id = supporting_documents.request_id
      AND purchase_requests.requester_id = (select auth.uid())
      AND purchase_requests.status = 'draft'
    )
  );

CREATE POLICY "Approvers can view all documents"
  ON supporting_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.user_id = (select auth.uid())
      AND approvers.is_active = true
    )
  );

-- Drop and recreate budgets policies
DROP POLICY IF EXISTS "Admins can delete budgets" ON budgets;
DROP POLICY IF EXISTS "Admins can insert budgets" ON budgets;
DROP POLICY IF EXISTS "Admins can update budgets" ON budgets;
DROP POLICY IF EXISTS "Approvers and admins can view budgets" ON budgets;

CREATE POLICY "Approvers and admins can view budgets"
  ON budgets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.user_id = (select auth.uid())
      AND approvers.is_active = true
    )
  );

CREATE POLICY "Admins can insert budgets"
  ON budgets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM approvers a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.user_id = (select auth.uid())
      AND a.is_active = true
      AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can update budgets"
  ON budgets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.user_id = (select auth.uid())
      AND a.is_active = true
      AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM approvers a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.user_id = (select auth.uid())
      AND a.is_active = true
      AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete budgets"
  ON budgets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.user_id = (select auth.uid())
      AND a.is_active = true
      AND p.role = 'admin'
    )
  );

-- Drop and recreate audit_logs policies
DROP POLICY IF EXISTS "Admins can view all audit logs" ON audit_logs;

CREATE POLICY "Admins can view all audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.user_id = (select auth.uid())
      AND a.is_active = true
      AND p.role = 'admin'
    )
  );

-- Drop and recreate email_notifications policies
DROP POLICY IF EXISTS "Admins can manage email notifications" ON email_notifications;
DROP POLICY IF EXISTS "Admins can view all email notifications" ON email_notifications;

CREATE POLICY "Admins can view all email notifications"
  ON email_notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.user_id = (select auth.uid())
      AND a.is_active = true
      AND p.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage email notifications"
  ON email_notifications FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.user_id = (select auth.uid())
      AND a.is_active = true
      AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM approvers a
      JOIN profiles p ON p.id = a.user_id
      WHERE a.user_id = (select auth.uid())
      AND a.is_active = true
      AND p.role = 'admin'
    )
  );

-- =============================================================================
-- PART 3: Fix function search_path for security
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION compute_json_changes(old_data jsonb, new_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  key text;
BEGIN
  FOR key IN SELECT jsonb_object_keys(old_data) UNION SELECT jsonb_object_keys(new_data)
  LOOP
    IF old_data->key IS DISTINCT FROM new_data->key THEN
      result := result || jsonb_build_object(key, jsonb_build_object('old', old_data->key, 'new', new_data->key));
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_data jsonb;
  new_data jsonb;
  changes jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_data := to_jsonb(OLD);
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (auth.uid(), 'delete', TG_TABLE_NAME, OLD.id, old_data, NULL);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    changes := compute_json_changes(old_data, new_data);
    IF changes != '{}'::jsonb THEN
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
      VALUES (auth.uid(), 'update', TG_TABLE_NAME, NEW.id, old_data, new_data);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    new_data := to_jsonb(NEW);
    INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values)
    VALUES (auth.uid(), 'insert', TG_TABLE_NAME, NEW.id, NULL, new_data);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION notify_request_submitted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' AND (OLD IS NULL OR OLD.status = 'draft') THEN
    INSERT INTO email_notifications (recipient_email, recipient_name, notification_type, request_id, subject, body)
    SELECT 
      p.email,
      p.full_name,
      'request_submitted',
      NEW.id,
      'New Purchase Request Pending Approval: ' || NEW.title,
      'A new purchase request "' || NEW.title || '" for $' || NEW.amount || ' has been submitted and requires your approval.'
    FROM approvers a
    JOIN profiles p ON p.id = a.user_id
    WHERE a.is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION notify_request_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' THEN
    INSERT INTO email_notifications (recipient_email, recipient_name, notification_type, request_id, subject, body)
    SELECT 
      p.email,
      p.full_name,
      CASE WHEN NEW.status = 'approved' THEN 'request_approved' ELSE 'request_rejected' END,
      NEW.id,
      'Purchase Request ' || INITCAP(NEW.status) || ': ' || NEW.title,
      'Your purchase request "' || NEW.title || '" for $' || NEW.amount || ' has been ' || NEW.status || '.'
    FROM profiles p
    WHERE p.id = NEW.requester_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION mark_emails_as_sent(email_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE email_notifications
  SET status = 'sent', sent_at = now()
  WHERE id = ANY(email_ids);
END;
$$;

CREATE OR REPLACE FUNCTION execute_sql_query(query_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query_text || ') t' INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;