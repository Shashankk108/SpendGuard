/*
  # Audit Trail and Email Notification System

  1. New Tables
    - `audit_logs` - Comprehensive audit trail for all database operations
      - `id` (uuid, primary key)
      - `user_id` (uuid) - The user who performed the action
      - `user_email` (text) - Email of the user (denormalized for history)
      - `action` (text) - 'INSERT', 'UPDATE', 'DELETE'
      - `entity_type` (text) - Table name (e.g., 'purchase_requests', 'profiles')
      - `entity_id` (uuid) - ID of the affected record
      - `old_data` (jsonb) - Previous state of the record
      - `new_data` (jsonb) - New state of the record
      - `changes` (jsonb) - Summary of what changed
      - `ip_address` (text) - Client IP if available
      - `user_agent` (text) - Browser/client info if available
      - `created_at` (timestamptz)

    - `email_notifications` - Mock email storage for testing
      - `id` (uuid, primary key)
      - `recipient_email` (text) - Who would receive the email
      - `recipient_name` (text) - Name of recipient
      - `subject` (text) - Email subject line
      - `body_text` (text) - Plain text email body
      - `body_html` (text) - HTML email body
      - `related_entity_type` (text) - What triggered the email
      - `related_entity_id` (uuid) - ID of related record
      - `status` (text) - 'queued', 'sent', 'failed'
      - `created_at` (timestamptz)
      - `sent_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Audit logs viewable only by admins
    - Email notifications viewable only by admins
    - System functions can bypass RLS for logging

  3. Functions
    - Audit trigger function for automatic logging
    - Email notification creation functions
*/

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  changes jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Email notifications table
CREATE TABLE IF NOT EXISTS email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  body_text text NOT NULL,
  body_html text,
  related_entity_type text,
  related_entity_id uuid,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all email notifications"
  ON email_notifications FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage email notifications"
  ON email_notifications FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_email_notifications_status ON email_notifications(status);
CREATE INDEX IF NOT EXISTS idx_email_notifications_created_at ON email_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_notifications_recipient ON email_notifications(recipient_email);

-- Function to compute changes between old and new data
CREATE OR REPLACE FUNCTION compute_json_changes(old_data jsonb, new_data jsonb)
RETURNS jsonb AS $$
DECLARE
  result jsonb := '{}';
  key text;
BEGIN
  IF old_data IS NULL THEN
    RETURN new_data;
  END IF;
  
  IF new_data IS NULL THEN
    RETURN old_data;
  END IF;

  FOR key IN SELECT jsonb_object_keys(new_data)
  LOOP
    IF old_data->key IS DISTINCT FROM new_data->key THEN
      result := result || jsonb_build_object(
        key, jsonb_build_object(
          'old', old_data->key,
          'new', new_data->key
        )
      );
    END IF;
  END LOOP;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
  audit_user_id uuid;
  audit_user_email text;
  old_row jsonb;
  new_row jsonb;
  changes_data jsonb;
BEGIN
  audit_user_id := auth.uid();
  
  SELECT email INTO audit_user_email 
  FROM auth.users 
  WHERE id = audit_user_id;

  IF TG_OP = 'DELETE' THEN
    old_row := to_jsonb(OLD);
    new_row := NULL;
    changes_data := NULL;
    
    INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, old_data, new_data, changes)
    VALUES (audit_user_id, audit_user_email, 'DELETE', TG_TABLE_NAME, OLD.id, old_row, new_row, changes_data);
    
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD);
    new_row := to_jsonb(NEW);
    changes_data := compute_json_changes(old_row, new_row);
    
    INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, old_data, new_data, changes)
    VALUES (audit_user_id, audit_user_email, 'UPDATE', TG_TABLE_NAME, NEW.id, old_row, new_row, changes_data);
    
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    old_row := NULL;
    new_row := to_jsonb(NEW);
    changes_data := NULL;
    
    INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, old_data, new_data, changes)
    VALUES (audit_user_id, audit_user_email, 'INSERT', TG_TABLE_NAME, NEW.id, old_row, new_row, changes_data);
    
    RETURN NEW;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create audit triggers on main tables
DROP TRIGGER IF EXISTS audit_purchase_requests ON purchase_requests;
CREATE TRIGGER audit_purchase_requests
  AFTER INSERT OR UPDATE OR DELETE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_profiles ON profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_approvers ON approvers;
CREATE TRIGGER audit_approvers
  AFTER INSERT OR UPDATE OR DELETE ON approvers
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

DROP TRIGGER IF EXISTS audit_approval_signatures ON approval_signatures;
CREATE TRIGGER audit_approval_signatures
  AFTER INSERT OR UPDATE OR DELETE ON approval_signatures
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Function to create email notification for request submission
CREATE OR REPLACE FUNCTION notify_request_submitted()
RETURNS TRIGGER AS $$
DECLARE
  requester_name text;
  approver_record RECORD;
BEGIN
  IF NEW.status = 'pending' AND (OLD IS NULL OR OLD.status = 'draft') THEN
    SELECT full_name INTO requester_name FROM profiles WHERE id = NEW.requester_id;
    
    FOR approver_record IN 
      SELECT name, email FROM approvers 
      WHERE is_active = true 
      AND min_amount <= NEW.total_amount 
      AND (max_amount IS NULL OR max_amount >= NEW.total_amount)
      ORDER BY approval_order
      LIMIT 1
    LOOP
      INSERT INTO email_notifications (
        recipient_email, recipient_name, subject, body_text, body_html, 
        related_entity_type, related_entity_id, status
      ) VALUES (
        approver_record.email,
        approver_record.name,
        'New Purchase Request Pending Approval - $' || NEW.total_amount::text,
        'A new purchase request requires your approval.' || E'\n\n' ||
        'Requester: ' || COALESCE(requester_name, 'Unknown') || E'\n' ||
        'Amount: $' || NEW.total_amount::text || E'\n' ||
        'Vendor: ' || NEW.vendor_name || E'\n' ||
        'Purpose: ' || NEW.business_purpose || E'\n\n' ||
        'Please log in to SpendGuard to review and approve this request.',
        '<h2>New Purchase Request</h2>' ||
        '<p>A new purchase request requires your approval.</p>' ||
        '<table style="border-collapse: collapse; margin: 20px 0;">' ||
        '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Requester</strong></td><td style="padding: 8px; border: 1px solid #ddd;">' || COALESCE(requester_name, 'Unknown') || '</td></tr>' ||
        '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 8px; border: 1px solid #ddd;">$' || NEW.total_amount::text || '</td></tr>' ||
        '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Vendor</strong></td><td style="padding: 8px; border: 1px solid #ddd;">' || NEW.vendor_name || '</td></tr>' ||
        '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Purpose</strong></td><td style="padding: 8px; border: 1px solid #ddd;">' || NEW.business_purpose || '</td></tr>' ||
        '</table>' ||
        '<p><a href="#">Log in to SpendGuard</a> to review this request.</p>',
        'purchase_requests',
        NEW.id,
        'queued'
      );
    END LOOP;
    
    INSERT INTO email_notifications (
      recipient_email, recipient_name, subject, body_text, body_html,
      related_entity_type, related_entity_id, status
    ) SELECT 
      p.email,
      p.full_name,
      'Your Purchase Request Has Been Submitted - $' || NEW.total_amount::text,
      'Your purchase request has been submitted for approval.' || E'\n\n' ||
      'Amount: $' || NEW.total_amount::text || E'\n' ||
      'Vendor: ' || NEW.vendor_name || E'\n' ||
      'Status: Pending Approval' || E'\n\n' ||
      'You will receive a notification once your request has been reviewed.',
      '<h2>Request Submitted</h2>' ||
      '<p>Your purchase request has been submitted for approval.</p>' ||
      '<table style="border-collapse: collapse; margin: 20px 0;">' ||
      '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 8px; border: 1px solid #ddd;">$' || NEW.total_amount::text || '</td></tr>' ||
      '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Vendor</strong></td><td style="padding: 8px; border: 1px solid #ddd;">' || NEW.vendor_name || '</td></tr>' ||
      '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Status</strong></td><td style="padding: 8px; border: 1px solid #ddd;">Pending Approval</td></tr>' ||
      '</table>' ||
      '<p>You will receive a notification once your request has been reviewed.</p>',
      'purchase_requests',
      NEW.id,
      'queued'
    FROM profiles p WHERE p.id = NEW.requester_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create email notification for request approval/rejection
CREATE OR REPLACE FUNCTION notify_request_decision()
RETURNS TRIGGER AS $$
DECLARE
  requester_record RECORD;
  decision_status text;
  decision_color text;
BEGIN
  IF NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' THEN
    SELECT id, email, full_name INTO requester_record 
    FROM profiles WHERE id = NEW.requester_id;
    
    IF NEW.status = 'approved' THEN
      decision_status := 'Approved';
      decision_color := '#10b981';
    ELSE
      decision_status := 'Rejected';
      decision_color := '#ef4444';
    END IF;
    
    INSERT INTO email_notifications (
      recipient_email, recipient_name, subject, body_text, body_html,
      related_entity_type, related_entity_id, status
    ) VALUES (
      requester_record.email,
      requester_record.full_name,
      'Your Purchase Request Has Been ' || decision_status || ' - $' || NEW.total_amount::text,
      'Your purchase request has been ' || LOWER(decision_status) || '.' || E'\n\n' ||
      'Amount: $' || NEW.total_amount::text || E'\n' ||
      'Vendor: ' || NEW.vendor_name || E'\n' ||
      'Decision: ' || decision_status || E'\n' ||
      CASE WHEN NEW.rejection_reason IS NOT NULL THEN 'Reason: ' || NEW.rejection_reason || E'\n' ELSE '' END ||
      E'\n' ||
      'Log in to SpendGuard to view the details.',
      '<h2>Request ' || decision_status || '</h2>' ||
      '<p>Your purchase request has been <strong style="color: ' || decision_color || ';">' || LOWER(decision_status) || '</strong>.</p>' ||
      '<table style="border-collapse: collapse; margin: 20px 0;">' ||
      '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount</strong></td><td style="padding: 8px; border: 1px solid #ddd;">$' || NEW.total_amount::text || '</td></tr>' ||
      '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Vendor</strong></td><td style="padding: 8px; border: 1px solid #ddd;">' || NEW.vendor_name || '</td></tr>' ||
      '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Decision</strong></td><td style="padding: 8px; border: 1px solid #ddd; color: ' || decision_color || ';">' || decision_status || '</td></tr>' ||
      CASE WHEN NEW.rejection_reason IS NOT NULL THEN '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Reason</strong></td><td style="padding: 8px; border: 1px solid #ddd;">' || NEW.rejection_reason || '</td></tr>' ELSE '' END ||
      '</table>' ||
      '<p><a href="#">Log in to SpendGuard</a> to view the details.</p>',
      'purchase_requests',
      NEW.id,
      'queued'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create email notification triggers
DROP TRIGGER IF EXISTS trigger_notify_request_submitted ON purchase_requests;
CREATE TRIGGER trigger_notify_request_submitted
  AFTER INSERT OR UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION notify_request_submitted();

DROP TRIGGER IF EXISTS trigger_notify_request_decision ON purchase_requests;
CREATE TRIGGER trigger_notify_request_decision
  AFTER UPDATE ON purchase_requests
  FOR EACH ROW EXECUTE FUNCTION notify_request_decision();

-- Mark queued emails as "sent" (simulating email delivery)
CREATE OR REPLACE FUNCTION mark_emails_as_sent()
RETURNS void AS $$
BEGIN
  UPDATE email_notifications 
  SET status = 'sent', sent_at = now() 
  WHERE status = 'queued';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
