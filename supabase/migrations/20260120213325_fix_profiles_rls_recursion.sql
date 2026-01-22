/*
  # Fix Profiles RLS Infinite Recursion

  1. Problem
    - The "Leadership can view all profiles" policy causes infinite recursion
    - It queries profiles table within a policy on profiles table

  2. Solution
    - Create a security definer function to check approver status
    - This function bypasses RLS and prevents recursion
    - Update the policy to use this function

  3. Security
    - Function runs with definer privileges to bypass RLS
    - Only checks if user has approver role
*/

CREATE OR REPLACE FUNCTION is_approver()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'approver'
  );
$$;

DROP POLICY IF EXISTS "Leadership can view all profiles" ON profiles;

CREATE POLICY "Leadership can view all profiles"
  ON profiles
  FOR SELECT
  TO authenticated
  USING (
    is_admin()
    OR is_approver()
    OR auth.uid() = id
  );
