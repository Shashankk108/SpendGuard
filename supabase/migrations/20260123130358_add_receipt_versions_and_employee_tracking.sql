/*
  # Add Receipt Versioning and Employee Tracking

  1. Changes to purchase_receipts
    - `version` (integer) - Version number for this receipt (starts at 1)
    - `previous_receipt_id` (uuid) - Reference to the previous version if this is a reupload
    - `is_current` (boolean) - Whether this is the current/active version

  2. Security
    - Employees can view their own receipts with all versions
    - Employees can upload new versions of their receipts
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_receipts' AND column_name = 'version'
  ) THEN
    ALTER TABLE public.purchase_receipts ADD COLUMN version integer DEFAULT 1;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_receipts' AND column_name = 'previous_receipt_id'
  ) THEN
    ALTER TABLE public.purchase_receipts ADD COLUMN previous_receipt_id uuid REFERENCES public.purchase_receipts(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'purchase_receipts' AND column_name = 'is_current'
  ) THEN
    ALTER TABLE public.purchase_receipts ADD COLUMN is_current boolean DEFAULT true;
  END IF;
END $$;

UPDATE public.purchase_receipts SET version = 1, is_current = true WHERE version IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_request_current 
  ON public.purchase_receipts(request_id, is_current) 
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_user_id 
  ON public.purchase_receipts(user_id);

DROP POLICY IF EXISTS "Users can view their own receipts with history" ON public.purchase_receipts;
CREATE POLICY "Users can view their own receipts with history"
  ON public.purchase_receipts
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.purchase_requests pr
      WHERE pr.id = purchase_receipts.request_id
      AND pr.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can upload receipts for their requests" ON public.purchase_receipts;
CREATE POLICY "Users can upload receipts for their requests"
  ON public.purchase_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.purchase_requests pr
      WHERE pr.id = request_id
      AND pr.requester_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update their own receipts" ON public.purchase_receipts;
CREATE POLICY "Users can update their own receipts"
  ON public.purchase_receipts
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
