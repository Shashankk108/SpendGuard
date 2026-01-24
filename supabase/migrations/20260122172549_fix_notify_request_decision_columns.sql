/*
  # Fix Email Notification Trigger Column Names

  1. Problem
    - notify_request_decision function references non-existent columns:
      - notification_type (should use related_entity_type)
      - request_id (should use related_entity_id)
      - body (should use body_text)

  2. Solution
    - Update function to use correct column names from email_notifications table
*/

CREATE OR REPLACE FUNCTION notify_request_decision()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('approved', 'rejected') AND OLD.status = 'pending' THEN
    INSERT INTO email_notifications (
      recipient_email, 
      recipient_name, 
      related_entity_type, 
      related_entity_id, 
      subject, 
      body_text
    )
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