/*
  # Fix Email Notification Column References

  1. Problem
    - notify_request_decision uses NEW.title and NEW.amount which don't exist
    - Correct columns are vendor_name/business_purpose and total_amount

  2. Solution
    - Update to use correct purchase_requests column names
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
      'Purchase Request ' || INITCAP(NEW.status) || ': ' || NEW.vendor_name || ' - $' || NEW.total_amount,
      'Your purchase request for ' || NEW.vendor_name || ' ($' || NEW.total_amount || ') has been ' || NEW.status || '.'
    FROM profiles p
    WHERE p.id = NEW.requester_id;
  END IF;
  RETURN NEW;
END;
$$;