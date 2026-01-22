/*
  # Fix Approvers Update Policy for Purchase Requests

  1. Problem
    - The existing "Approvers can update pending requests" policy has USING but no WITH CHECK
    - This causes RLS violations when approvers try to change the status

  2. Solution
    - Drop the existing policy
    - Create a new policy with both USING and WITH CHECK clauses
    - Allow approvers to update status from 'pending' to 'approved' or 'rejected'
*/

DROP POLICY IF EXISTS "Approvers can update pending requests" ON purchase_requests;

CREATE POLICY "Approvers can update pending requests"
  ON purchase_requests
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())
      AND approvers.is_active = true
    )
  )
  WITH CHECK (
    status IN ('approved', 'rejected')
    AND EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.email = (SELECT profiles.email FROM profiles WHERE profiles.id = auth.uid())
      AND approvers.is_active = true
    )
  );
