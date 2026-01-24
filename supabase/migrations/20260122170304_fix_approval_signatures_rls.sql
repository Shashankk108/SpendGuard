/*
  # Fix Approval Signatures RLS Policy
  
  1. Problem
    - The insert policy checks approver_id = auth.uid() but approver_id references approvers.id (record ID)
    - Should check that the approver_id belongs to an approver record with user_id = auth.uid()
  
  2. Solution
    - Drop and recreate the insert policy with correct logic
*/

DROP POLICY IF EXISTS "Approvers can insert signatures" ON approval_signatures;

CREATE POLICY "Approvers can insert signatures"
  ON approval_signatures
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM approvers
      WHERE approvers.id = approval_signatures.approver_id
      AND approvers.user_id = auth.uid()
      AND approvers.is_active = true
    )
  );