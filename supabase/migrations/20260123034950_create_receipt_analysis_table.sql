/*
  # Create Receipt Analysis Table
  
  1. New Tables
    - `receipt_analyses`
      - `id` (uuid, primary key)
      - `receipt_id` (uuid, foreign key to purchase_receipts)
      - `request_id` (uuid, foreign key to purchase_requests)
      - `extracted_vendor` (text) - vendor name extracted from receipt
      - `extracted_amount` (numeric) - amount extracted from receipt
      - `extracted_date` (date) - date extracted from receipt
      - `extracted_items` (jsonb) - list of items found on receipt
      - `vendor_match` (boolean) - whether vendor matches
      - `amount_match` (boolean) - whether amount matches
      - `date_match` (boolean) - whether date is within acceptable range
      - `confidence_score` (numeric) - overall confidence 0-100
      - `recommendation` (text) - AI recommendation (approve/review/reject)
      - `analysis_notes` (text) - detailed analysis notes
      - `raw_extraction` (jsonb) - full raw extraction data
      - `analyzed_at` (timestamptz)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS
    - Allow authenticated users to read analyses for receipts they can access
    - Allow service role to insert analyses
*/

CREATE TABLE IF NOT EXISTS receipt_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES purchase_receipts(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  extracted_vendor text,
  extracted_amount numeric(12, 2),
  extracted_date date,
  extracted_items jsonb DEFAULT '[]'::jsonb,
  vendor_match boolean DEFAULT false,
  amount_match boolean DEFAULT false,
  date_match boolean DEFAULT false,
  confidence_score numeric(5, 2) DEFAULT 0,
  recommendation text CHECK (recommendation IN ('approve', 'review', 'reject')),
  analysis_notes text,
  raw_extraction jsonb DEFAULT '{}'::jsonb,
  analyzed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipt_analyses_receipt_id ON receipt_analyses(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_analyses_request_id ON receipt_analyses(request_id);

ALTER TABLE receipt_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approvers can view all receipt analyses"
  ON receipt_analyses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin')
    )
  );

CREATE POLICY "Users can view analyses for their own receipts"
  ON receipt_analyses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_receipts
      WHERE purchase_receipts.id = receipt_analyses.receipt_id
      AND purchase_receipts.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert analyses"
  ON receipt_analyses
  FOR INSERT
  TO authenticated
  WITH CHECK (true);
