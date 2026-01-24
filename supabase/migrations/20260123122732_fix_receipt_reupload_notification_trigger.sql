/*
  # Fix Receipt Re-upload Notification Trigger

  1. Changes
    - Updates the trigger function to use the correct table name `email_notifications` instead of `email_queue`
    - Fixes column names to match the email_notifications table schema
*/

CREATE OR REPLACE FUNCTION public.notify_receipt_reupload_request()
RETURNS TRIGGER AS $$
DECLARE
  v_request_record RECORD;
  v_requester_email TEXT;
  v_requester_name TEXT;
  v_approver_name TEXT;
  v_email_body TEXT;
BEGIN
  IF NEW.reupload_requested = true AND (OLD.reupload_requested = false OR OLD.reupload_requested IS NULL) THEN
    SELECT 
      pr.id,
      pr.vendor_name,
      pr.total_amount,
      p.email,
      p.full_name
    INTO v_request_record
    FROM public.purchase_requests pr
    JOIN public.profiles p ON p.id = pr.requester_id
    WHERE pr.id = NEW.request_id;

    IF v_request_record IS NOT NULL THEN
      v_requester_email := v_request_record.email;
      v_requester_name := v_request_record.full_name;

      SELECT full_name INTO v_approver_name
      FROM public.profiles
      WHERE id = NEW.reupload_requested_by;

      v_email_body := 'Hello ' || COALESCE(v_requester_name, 'Employee') || ',' || E'\n\n' ||
        'A re-upload of the receipt has been requested for your purchase request.' || E'\n\n' ||
        'Vendor: ' || v_request_record.vendor_name || E'\n' ||
        'Amount: $' || v_request_record.total_amount || E'\n' ||
        'Requested by: ' || COALESCE(v_approver_name, 'An approver') || E'\n\n' ||
        'Reason: ' || COALESCE(NEW.reupload_reason, 'The receipt image was unclear or incomplete') || E'\n\n' ||
        'Please log in to the SpendGuard system and upload a new receipt for this request.' || E'\n\n' ||
        'Thank you.';

      INSERT INTO public.email_notifications (
        recipient_email,
        recipient_name,
        subject,
        body_text,
        related_entity_type,
        related_entity_id,
        status
      ) VALUES (
        v_requester_email,
        v_requester_name,
        'Receipt Re-upload Requested - ' || v_request_record.vendor_name,
        v_email_body,
        'purchase_receipt',
        NEW.id,
        'queued'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
