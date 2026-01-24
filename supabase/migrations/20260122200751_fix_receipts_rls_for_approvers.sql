/*
  # Fix Receipt Visibility for Approvers/Leadership

  1. Changes
    - Update purchase_receipts SELECT policy to check both profiles.role AND approvers table
    - This ensures approvers in the approvers table can view receipts
  
  2. Security
    - Maintains existing security model
    - Allows approvers to view all receipts for review
*/

DROP POLICY IF EXISTS "Approvers can view all receipts" ON purchase_receipts;

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
    OR
    EXISTS (
      SELECT 1 FROM approvers a
      WHERE a.user_id = auth.uid()
      AND a.is_active = true
    )
  );

DROP POLICY IF EXISTS "Approvers can verify receipts" ON purchase_receipts;

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
    OR
    EXISTS (
      SELECT 1 FROM approvers a
      WHERE a.user_id = auth.uid()
      AND a.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() 
      AND p.role IN ('approver', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM approvers a
      WHERE a.user_id = auth.uid()
      AND a.is_active = true
    )
  );