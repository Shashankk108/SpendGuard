/*
  # Add Receipt Re-upload Request Feature

  1. Changes to purchase_receipts
    - `reupload_requested` (boolean) - Flag indicating if a re-upload has been requested
    - `reupload_requested_at` (timestamptz) - When the re-upload was requested
    - `reupload_requested_by` (uuid) - Who requested the re-upload
    - `reupload_reason` (text) - Reason for requesting re-upload

  2. Security
    - Approvers can update the reupload_requested fields
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_receipts' AND column_name = 'reupload_requested'
  ) THEN
    ALTER TABLE public.purchase_receipts ADD COLUMN reupload_requested boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_receipts' AND column_name = 'reupload_requested_at'
  ) THEN
    ALTER TABLE public.purchase_receipts ADD COLUMN reupload_requested_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_receipts' AND column_name = 'reupload_requested_by'
  ) THEN
    ALTER TABLE public.purchase_receipts ADD COLUMN reupload_requested_by uuid REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_receipts' AND column_name = 'reupload_reason'
  ) THEN
    ALTER TABLE public.purchase_receipts ADD COLUMN reupload_reason text;
  END IF;
END $$;

DROP POLICY IF EXISTS "Approvers can request receipt reupload" ON public.purchase_receipts;
CREATE POLICY "Approvers can request receipt reupload"
  ON public.purchase_receipts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin', 'leadership')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin', 'leadership')
    )
  );

CREATE OR REPLACE FUNCTION public.notify_receipt_reupload_request()
RETURNS TRIGGER AS $$
DECLARE
  v_request_record RECORD;
  v_requester_email TEXT;
  v_requester_name TEXT;
  v_approver_name TEXT;
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

      INSERT INTO public.email_queue (
        recipient_email,
        recipient_name,
        subject,
        template_type,
        template_data
      ) VALUES (
        v_requester_email,
        v_requester_name,
        'Receipt Re-upload Requested - ' || v_request_record.vendor_name,
        'receipt_reupload_request',
        jsonb_build_object(
          'requester_name', v_requester_name,
          'vendor_name', v_request_record.vendor_name,
          'amount', v_request_record.total_amount,
          'approver_name', COALESCE(v_approver_name, 'An approver'),
          'reason', COALESCE(NEW.reupload_reason, 'The receipt image was unclear or incomplete'),
          'request_id', v_request_record.id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_notify_receipt_reupload ON public.purchase_receipts;
CREATE TRIGGER trigger_notify_receipt_reupload
  AFTER UPDATE ON public.purchase_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_receipt_reupload_request();
