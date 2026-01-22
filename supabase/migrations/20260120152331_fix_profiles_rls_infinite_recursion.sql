/*
  # Fix infinite recursion in profiles RLS policies
  
  The "Admins can view all profiles" policy was querying the profiles table
  to check admin status, which triggered infinite recursion.
  
  ## Changes
  1. Create a security definer function to check admin status without RLS
  2. Drop the problematic policy
  3. Recreate the policy using the new function
*/

-- Create a security definer function to check if user is admin
-- This bypasses RLS and prevents infinite recursion
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Recreate admin policies using the security definer function
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_admin() OR auth.uid() = id);

-- Also fix the approvers admin policy
DROP POLICY IF EXISTS "Admins can manage approvers" ON approvers;

CREATE POLICY "Admins can manage approvers"
  ON approvers FOR ALL
  TO authenticated
  USING (is_admin());

-- Fix purchase_requests admin policy
DROP POLICY IF EXISTS "Admins can view all requests" ON purchase_requests;

CREATE POLICY "Admins can view all requests"
  ON purchase_requests FOR SELECT
  TO authenticated
  USING (is_admin());

-- Fix prohibited_categories admin policy
DROP POLICY IF EXISTS "Admins can manage prohibited categories" ON prohibited_categories;

CREATE POLICY "Admins can manage prohibited categories"
  ON prohibited_categories FOR ALL
  TO authenticated
  USING (is_admin());
