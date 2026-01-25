/*
  # Add GoDaddy Receipt Request System

  1. New Columns on godaddy_orders
    - `receipt_requested` (boolean) - Whether a receipt has been requested
    - `receipt_requested_at` (timestamp) - When the receipt was requested
    - `receipt_requested_by` (uuid) - Who requested the receipt
    - `receipt_uploaded` (boolean) - Whether a receipt has been uploaded
    - `receipt_file_url` (text) - URL of the uploaded receipt file
    - `receipt_file_name` (text) - Name of the uploaded receipt file
    - `receipt_uploaded_at` (timestamp) - When the receipt was uploaded
    - `receipt_uploaded_by` (uuid) - Who uploaded the receipt

  2. Creates notifications when receipt is requested
*/

ALTER TABLE godaddy_orders ADD COLUMN IF NOT EXISTS receipt_requested boolean DEFAULT false;
ALTER TABLE godaddy_orders ADD COLUMN IF NOT EXISTS receipt_requested_at timestamptz;
ALTER TABLE godaddy_orders ADD COLUMN IF NOT EXISTS receipt_requested_by uuid REFERENCES profiles(id);
ALTER TABLE godaddy_orders ADD COLUMN IF NOT EXISTS receipt_uploaded boolean DEFAULT false;
ALTER TABLE godaddy_orders ADD COLUMN IF NOT EXISTS receipt_file_url text;
ALTER TABLE godaddy_orders ADD COLUMN IF NOT EXISTS receipt_file_name text;
ALTER TABLE godaddy_orders ADD COLUMN IF NOT EXISTS receipt_uploaded_at timestamptz;
ALTER TABLE godaddy_orders ADD COLUMN IF NOT EXISTS receipt_uploaded_by uuid REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_godaddy_orders_receipt_requested ON godaddy_orders(receipt_requested) WHERE receipt_requested = true;

CREATE OR REPLACE FUNCTION notify_godaddy_receipt_request()
RETURNS trigger AS $$
DECLARE
  requester_email text;
  requester_name text;
BEGIN
  IF NEW.matched_request_id IS NOT NULL THEN
    SELECT p.email, p.full_name INTO requester_email, requester_name
    FROM profiles p
    JOIN purchase_requests pr ON pr.requester_id = p.id
    WHERE pr.id = NEW.matched_request_id;

    IF requester_email IS NOT NULL THEN
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        data,
        created_at
      )
      SELECT 
        pr.requester_id,
        'godaddy_receipt_request',
        'GoDaddy Receipt Requested',
        'Leadership has requested a receipt for your GoDaddy order #' || NEW.order_id || ' ($' || NEW.order_total || '). Please upload the receipt from your GoDaddy account.',
        jsonb_build_object(
          'godaddy_order_id', NEW.id,
          'order_id', NEW.order_id,
          'order_total', NEW.order_total,
          'domain_or_product', NEW.domain_or_product,
          'request_id', NEW.matched_request_id
        ),
        now()
      FROM purchase_requests pr
      WHERE pr.id = NEW.matched_request_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_godaddy_receipt_request ON godaddy_orders;
CREATE TRIGGER trigger_godaddy_receipt_request
  AFTER UPDATE ON godaddy_orders
  FOR EACH ROW
  WHEN (OLD.receipt_requested = false AND NEW.receipt_requested = true)
  EXECUTE FUNCTION notify_godaddy_receipt_request();
