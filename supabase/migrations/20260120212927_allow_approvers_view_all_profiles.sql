/*
  # Allow Approvers to View All Profiles

  1. Problem
    - Currently only admins can view all profiles
    - Approvers see "Unknown" for department in analytics because they can't fetch other profiles
    - This breaks leadership dashboard functionality

  2. Changes
    - Update the "Admins can view all profiles" policy to include approvers
    - Rename to "Leadership can view all profiles" for clarity

  3. Security
    - Only users with role 'admin' or 'approver' can view all profiles
    - Regular employees still can only view their own profile
*/

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

CREATE POLICY "Leadership can view all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR auth.uid() = id
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'approver'
    )
  );
