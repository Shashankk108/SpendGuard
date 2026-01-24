/*
  # Fix approvers update policy for purchase_requests

  The current policy lacks a WITH CHECK clause, which is required
  for UPDATE operations to validate the new row values.

  This migration:
  1. Drops the existing approvers update policy
  2. Creates a new policy with proper WITH CHECK clause
     that allows approvers to change status to approved/rejected
*/

DROP POLICY IF EXISTS "Approvers can update pending requests" ON purchase_requests;

CREATE POLICY "Approvers can update pending requests"
  ON purchase_requests
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending' 
    AND is_user_approver()
  )
  WITH CHECK (
    is_user_approver()
    AND status IN ('pending', 'approved', 'rejected')
  );
