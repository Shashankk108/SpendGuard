/*
  # Fix Email Notification Trigger
  
  1. Problem
    - The notify_request_submitted() function references columns that don't exist
    - Uses 'notification_type', 'request_id', 'body' instead of correct column names
    - References NEW.title and NEW.amount which don't exist on purchase_requests
  
  2. Solution
    - Update function to use correct column names from email_notifications table
    - Use correct column names from purchase_requests table
*/

CREATE OR REPLACE FUNCTION notify_request_submitted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' AND (OLD IS NULL OR OLD.status = 'draft') THEN
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
      'purchase_request',
      NEW.id,
      'New Purchase Request Pending Approval: ' || NEW.vendor_name || ' - $' || NEW.total_amount,
      'A new purchase request from ' || NEW.cardholder_name || ' for $' || NEW.total_amount || ' at ' || NEW.vendor_name || ' has been submitted and requires your approval.'
    FROM approvers a
    JOIN profiles p ON p.id = a.user_id
    WHERE a.is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;