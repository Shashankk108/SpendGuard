/*
  # Budgets Table and Enhanced Approver Access

  1. New Tables
    - `budgets` - Department budget management
      - `id` (uuid, primary key)
      - `department` (text) - Department name
      - `fiscal_year` (integer) - Fiscal year (e.g., 2026)
      - `fiscal_quarter` (integer, nullable) - Optional quarter (1-4)
      - `allocated_amount` (numeric) - Total budget allocated
      - `start_date` (date) - Budget period start
      - `end_date` (date) - Budget period end
      - `notes` (text, nullable) - Optional notes
      - `created_by` (uuid) - User who created the budget
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on budgets table
    - Approvers and admins can view all budgets
    - Only admins can create/update/delete budgets
    - Add policies for approvers to view ALL purchase requests (not just pending)

  3. New Function
    - get_budget_utilization() - Calculate spent vs allocated by department
*/

-- Create budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department text NOT NULL,
  fiscal_year integer NOT NULL,
  fiscal_quarter integer,
  allocated_amount numeric NOT NULL DEFAULT 0,
  start_date date NOT NULL,
  end_date date NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_quarter CHECK (fiscal_quarter IS NULL OR (fiscal_quarter >= 1 AND fiscal_quarter <= 4)),
  CONSTRAINT valid_date_range CHECK (end_date > start_date),
  CONSTRAINT positive_budget CHECK (allocated_amount >= 0)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- Approvers and admins can view all budgets
CREATE POLICY "Approvers and admins can view budgets"
  ON budgets FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND approvers.is_active = true
    )
  );

-- Only admins can insert budgets
CREATE POLICY "Admins can insert budgets"
  ON budgets FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Only admins can update budgets
CREATE POLICY "Admins can update budgets"
  ON budgets FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Only admins can delete budgets
CREATE POLICY "Admins can delete budgets"
  ON budgets FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add policy for approvers to view ALL purchase requests (historical)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Approvers can view all requests for reporting'
    AND tablename = 'purchase_requests'
  ) THEN
    CREATE POLICY "Approvers can view all requests for reporting"
      ON purchase_requests FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM approvers
          WHERE approvers.email = (SELECT email FROM profiles WHERE id = auth.uid())
          AND approvers.is_active = true
        )
      );
  END IF;
END $$;

-- Create index for budget queries
CREATE INDEX IF NOT EXISTS idx_budgets_department ON budgets(department);
CREATE INDEX IF NOT EXISTS idx_budgets_fiscal_year ON budgets(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_budgets_date_range ON budgets(start_date, end_date);

-- Create index for purchase_requests queries used in analytics
CREATE INDEX IF NOT EXISTS idx_purchase_requests_status ON purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_created_at ON purchase_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_category ON purchase_requests(category);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_vendor ON purchase_requests(vendor_name);
