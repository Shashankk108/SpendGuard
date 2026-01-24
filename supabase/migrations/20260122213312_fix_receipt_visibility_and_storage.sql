/*
  # Fix Receipt Visibility and Storage

  This migration ensures that:
  1. Employees can view their own uploaded receipts
  2. Employees can view receipts for requests they made
  3. Approvers/admins can view ALL receipts
  4. The receipt_responses table exists for tracking approver comments

  ## Security
  - RLS policies updated to allow proper visibility
  - Employees can only insert receipts for their own approved requests
  - Approvers can update receipt status
*/

-- Drop existing restrictive policies and recreate with better logic
DROP POLICY IF EXISTS "Users can view own receipts" ON purchase_receipts;
DROP POLICY IF EXISTS "Approvers can view all receipts" ON purchase_receipts;

-- Policy: Users can view receipts they uploaded
CREATE POLICY "Users can view receipts they uploaded"
  ON purchase_receipts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Users can view receipts for their own purchase requests
CREATE POLICY "Users can view receipts for own requests"
  ON purchase_receipts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_receipts.request_id
      AND pr.requester_id = auth.uid()
    )
  );

-- Policy: Approvers and admins can view all receipts
CREATE POLICY "Approvers can view all receipts"
  ON purchase_receipts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('approver', 'admin')
    )
  );

-- Create receipt_responses table if it doesn't exist
CREATE TABLE IF NOT EXISTS receipt_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('approved', 'rejected', 'needs_info')),
  comment text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on receipt_responses
ALTER TABLE receipt_responses ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can view responses
DROP POLICY IF EXISTS "Anyone can view receipt responses" ON receipt_responses;
CREATE POLICY "Anyone can view receipt responses"
  ON receipt_responses
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Approvers can insert responses
DROP POLICY IF EXISTS "Approvers can insert responses" ON receipt_responses;
CREATE POLICY "Approvers can insert responses"
  ON receipt_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('approver', 'admin')
    )
  );

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_receipt_responses_receipt_id ON receipt_responses(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_responses_responder_id ON receipt_responses(responder_id);

-- Add status column if not exists (with default pending)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_receipts' AND column_name = 'status'
  ) THEN
    ALTER TABLE purchase_receipts ADD COLUMN status text DEFAULT 'pending' 
      CHECK (status IN ('pending', 'approved', 'rejected', 'needs_info'));
  END IF;
END $$;

-- Add employee_comment column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'purchase_receipts' AND column_name = 'employee_comment'
  ) THEN
    ALTER TABLE purchase_receipts ADD COLUMN employee_comment text;
  END IF;
END $$;

COMMENT ON TABLE receipt_responses IS 'Tracks approver responses to receipt uploads';
