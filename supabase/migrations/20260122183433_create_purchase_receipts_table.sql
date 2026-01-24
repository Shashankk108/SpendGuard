/*
  # Create Purchase Receipts Table

  This migration creates a table to track receipt uploads for approved purchases.

  1. New Tables
    - `purchase_receipts`
      - `id` (uuid, primary key)
      - `request_id` (uuid, foreign key to purchase_requests)
      - `user_id` (uuid, foreign key to auth.users)
      - `file_name` (text) - Original file name
      - `file_url` (text) - Storage URL or base64 data
      - `file_type` (text) - MIME type
      - `file_size` (integer) - Size in bytes
      - `uploaded_at` (timestamptz) - When receipt was uploaded
      - `notes` (text) - Optional notes about the receipt
      - `verified` (boolean) - Whether receipt has been verified by admin
      - `verified_by` (uuid) - Who verified the receipt
      - `verified_at` (timestamptz) - When it was verified

  2. Security
    - Enable RLS
    - Users can upload receipts for their own approved requests
    - Approvers can view and verify receipts
*/

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'image/jpeg',
  file_size integer DEFAULT 0,
  uploaded_at timestamptz DEFAULT now(),
  notes text,
  verified boolean DEFAULT false,
  verified_by uuid REFERENCES auth.users(id),
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own receipts"
  ON purchase_receipts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can upload receipts for own approved requests"
  ON purchase_receipts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = request_id
      AND pr.requester_id = auth.uid()
      AND pr.status = 'approved'
    )
  );

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

CREATE POLICY "Approvers can verify receipts"
  ON purchase_receipts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('approver', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('approver', 'admin')
    )
  );

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_request_id ON purchase_receipts(request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_user_id ON purchase_receipts(user_id);

ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS receipt_status text DEFAULT 'pending' 
  CHECK (receipt_status IN ('pending', 'uploaded', 'verified'));

COMMENT ON TABLE purchase_receipts IS 'Stores receipt uploads for approved purchase requests';
COMMENT ON COLUMN purchase_receipts.file_url IS 'Can store base64 encoded image data or storage URL';