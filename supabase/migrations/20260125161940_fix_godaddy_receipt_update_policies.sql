/*
  # Fix GoDaddy Receipt Update Policies

  1. Updates
    - Allow leaders/approvers to update receipt_requested fields
    - Allow employees to update receipt_uploaded fields for orders linked to their requests
    
  2. Security
    - Leaders can request receipts
    - Employees can only upload receipts for their own matched requests
*/

DROP POLICY IF EXISTS "Leaders can update GoDaddy orders" ON godaddy_orders;

CREATE POLICY "Leaders can update GoDaddy orders for receipt requests"
  ON godaddy_orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('approver', 'admin')
    )
  );

CREATE POLICY "Employees can upload receipts for their orders"
  ON godaddy_orders
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = godaddy_orders.matched_request_id
      AND pr.requester_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = godaddy_orders.matched_request_id
      AND pr.requester_id = auth.uid()
    )
  );
