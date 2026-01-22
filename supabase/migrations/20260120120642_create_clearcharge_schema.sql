/*
  # ClearCharge P-Card Pre-Approval System Schema

  1. New Tables
    - `profiles` - User profiles linked to auth.users
      - `id` (uuid, primary key, references auth.users)
      - `email` (text, unique)
      - `full_name` (text)
      - `p_card_name` (text) - Name as it appears on P-Card
      - `department` (text)
      - `role` (text) - 'employee', 'approver', 'admin'
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `approvers` - Approver configuration with thresholds
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles) - nullable for external approvers
      - `name` (text)
      - `email` (text)
      - `title` (text)
      - `min_amount` (numeric) - Minimum amount requiring this approver
      - `max_amount` (numeric) - Maximum amount (null for unlimited)
      - `approval_order` (integer) - Order in approval chain
      - `is_active` (boolean)

    - `purchase_requests` - Main purchase request records
      - `id` (uuid, primary key)
      - `requester_id` (uuid, references profiles)
      - `cardholder_name` (text)
      - `p_card_name` (text)
      - `expense_date` (date)
      - `vendor_name` (text)
      - `vendor_location` (text)
      - `purchase_amount` (numeric)
      - `currency` (text)
      - `tax_amount` (numeric)
      - `shipping_amount` (numeric)
      - `total_amount` (numeric)
      - `business_purpose` (text)
      - `detailed_description` (text)
      - `po_bypass_reason` (text) - 'vendor_limitations', 'time_sensitivity', 'other'
      - `po_bypass_explanation` (text)
      - `category` (text)
      - `is_software_subscription` (boolean)
      - `it_license_confirmed` (boolean)
      - `is_preferred_vendor` (boolean)
      - `status` (text) - 'draft', 'pending', 'approved', 'rejected'
      - `employee_signature_url` (text)
      - `employee_signed_at` (timestamptz)
      - `rejection_reason` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `approval_signatures` - Approval chain signatures
      - `id` (uuid, primary key)
      - `request_id` (uuid, references purchase_requests)
      - `approver_id` (uuid, references approvers)
      - `approver_name` (text)
      - `approver_title` (text)
      - `signature_url` (text)
      - `action` (text) - 'approved', 'rejected'
      - `comments` (text)
      - `signed_at` (timestamptz)

    - `supporting_documents` - File attachments
      - `id` (uuid, primary key)
      - `request_id` (uuid, references purchase_requests)
      - `file_name` (text)
      - `file_url` (text)
      - `file_type` (text)
      - `file_size` (integer)
      - `uploaded_at` (timestamptz)

    - `prohibited_categories` - Blocked purchase categories
      - `id` (uuid, primary key)
      - `name` (text)
      - `description` (text)
      - `is_active` (boolean)

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users to manage their own data
    - Approver policies for viewing assigned requests
*/

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  p_card_name text,
  department text,
  role text NOT NULL DEFAULT 'employee',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Approvers table
CREATE TABLE IF NOT EXISTS approvers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text NOT NULL,
  title text NOT NULL,
  min_amount numeric NOT NULL DEFAULT 0,
  max_amount numeric,
  approval_order integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE approvers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view active approvers"
  ON approvers FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage approvers"
  ON approvers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Purchase requests table
CREATE TABLE IF NOT EXISTS purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cardholder_name text NOT NULL,
  p_card_name text NOT NULL,
  expense_date date NOT NULL,
  vendor_name text NOT NULL,
  vendor_location text,
  purchase_amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  tax_amount numeric DEFAULT 0,
  shipping_amount numeric DEFAULT 0,
  total_amount numeric NOT NULL,
  business_purpose text NOT NULL,
  detailed_description text NOT NULL,
  po_bypass_reason text,
  po_bypass_explanation text,
  category text NOT NULL,
  is_software_subscription boolean DEFAULT false,
  it_license_confirmed boolean DEFAULT false,
  is_preferred_vendor boolean DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  employee_signature_url text,
  employee_signed_at timestamptz,
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests"
  ON purchase_requests FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Users can insert own requests"
  ON purchase_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update own draft requests"
  ON purchase_requests FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft')
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Approvers can view pending requests"
  ON purchase_requests FOR SELECT
  TO authenticated
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND approvers.is_active = true
    )
  );

CREATE POLICY "Approvers can update pending requests"
  ON purchase_requests FOR UPDATE
  TO authenticated
  USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND approvers.is_active = true
    )
  );

CREATE POLICY "Admins can view all requests"
  ON purchase_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Approval signatures table
CREATE TABLE IF NOT EXISTS approval_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  approver_id uuid REFERENCES approvers(id) ON DELETE SET NULL,
  approver_name text NOT NULL,
  approver_title text NOT NULL,
  signature_url text,
  action text NOT NULL,
  comments text,
  signed_at timestamptz DEFAULT now()
);

ALTER TABLE approval_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view signatures on their requests"
  ON approval_signatures FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests
      WHERE purchase_requests.id = approval_signatures.request_id
      AND purchase_requests.requester_id = auth.uid()
    )
  );

CREATE POLICY "Approvers can insert signatures"
  ON approval_signatures FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND approvers.is_active = true
    )
  );

CREATE POLICY "Approvers can view all signatures"
  ON approval_signatures FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND approvers.is_active = true
    )
  );

-- Supporting documents table
CREATE TABLE IF NOT EXISTS supporting_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size integer,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE supporting_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view documents on their requests"
  ON supporting_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests
      WHERE purchase_requests.id = supporting_documents.request_id
      AND purchase_requests.requester_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert documents on their requests"
  ON supporting_documents FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_requests
      WHERE purchase_requests.id = supporting_documents.request_id
      AND purchase_requests.requester_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete documents on their draft requests"
  ON supporting_documents FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests
      WHERE purchase_requests.id = supporting_documents.request_id
      AND purchase_requests.requester_id = auth.uid()
      AND purchase_requests.status = 'draft'
    )
  );

CREATE POLICY "Approvers can view all documents"
  ON supporting_documents FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.email = (SELECT email FROM profiles WHERE id = auth.uid())
      AND approvers.is_active = true
    )
  );

-- Prohibited categories table
CREATE TABLE IF NOT EXISTS prohibited_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE prohibited_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view prohibited categories"
  ON prohibited_categories FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage prohibited categories"
  ON prohibited_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Insert default approvers based on the approval matrix
INSERT INTO approvers (name, email, title, min_amount, max_amount, approval_order) VALUES
  ('Merrill Raman', 'merrill.raman@company.com', 'Department Head', 501, NULL, 1),
  ('Ryan Greene', 'ryan.greene@company.com', 'Finance Director', 1500, NULL, 2),
  ('CEO', 'ceo@company.com', 'Chief Executive Officer', 100001, NULL, 3);

-- Insert default prohibited categories
INSERT INTO prohibited_categories (name, description) VALUES
  ('Technology Hardware', 'Laptops, phones, tablets, and other computing devices'),
  ('Travel - Air', 'Airline tickets and air travel expenses'),
  ('Travel - Rail', 'Train tickets and rail travel expenses'),
  ('Gift Cards', 'All types of gift cards and prepaid cards');

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_requests_updated_at
  BEFORE UPDATE ON purchase_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
