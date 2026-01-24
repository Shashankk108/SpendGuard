/*
  # Add Receipt Responses and Comments System

  This migration enhances the receipt workflow with:
  
  1. New Tables
    - `receipt_responses` - Stores leader responses to receipts
      - `id` (uuid, primary key)
      - `receipt_id` (uuid, foreign key to purchase_receipts)
      - `responder_id` (uuid, foreign key to auth.users)
      - `action` (text) - approved, rejected, needs_info
      - `comment` (text) - Leader's comment/response
      - `created_at` (timestamptz)

  2. Changes to purchase_receipts
    - Add `status` column (pending, approved, rejected, needs_info)
    - Add `employee_comment` column for initial employee notes

  3. Security
    - Enable RLS on receipt_responses
    - Leaders can add responses
    - Users can view responses on their own receipts
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'purchase_receipts' AND column_name = 'status'
  ) THEN
    ALTER TABLE purchase_receipts ADD COLUMN status text DEFAULT 'pending' 
      CHECK (status IN ('pending', 'approved', 'rejected', 'needs_info'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'purchase_receipts' AND column_name = 'employee_comment'
  ) THEN
    ALTER TABLE purchase_receipts ADD COLUMN employee_comment text;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS receipt_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL CHECK (action IN ('approved', 'rejected', 'needs_info')),
  comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE receipt_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'receipt_responses' AND policyname = 'Users can view responses on own receipts'
  ) THEN
    CREATE POLICY "Users can view responses on own receipts"
      ON receipt_responses
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM purchase_receipts pr
          WHERE pr.id = receipt_id
          AND pr.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'receipt_responses' AND policyname = 'Leaders can view all responses'
  ) THEN
    CREATE POLICY "Leaders can view all responses"
      ON receipt_responses
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('approver', 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'receipt_responses' AND policyname = 'Leaders can add responses'
  ) THEN
    CREATE POLICY "Leaders can add responses"
      ON receipt_responses
      FOR INSERT
      TO authenticated
      WITH CHECK (
        responder_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid()
          AND p.role IN ('approver', 'admin')
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_receipt_responses_receipt_id ON receipt_responses(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_responses_responder_id ON receipt_responses(responder_id);

COMMENT ON TABLE receipt_responses IS 'Stores leader responses and comments on uploaded receipts';
COMMENT ON COLUMN receipt_responses.action IS 'Leader action: approved, rejected, or needs_info for requesting more details';