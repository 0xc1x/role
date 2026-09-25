
-- ============================================================
-- Fix infinite recursion in RLS policies for profiles table
-- 
-- Problem: policies on `profiles` do `SELECT FROM profiles` 
-- inside their qualifier, which triggers the same policy → infinite loop.
--
-- Solution: Create a SECURITY DEFINER helper function that 
-- reads the role from `profiles` bypassing RLS, then rewrite 
-- all policies to use this function instead of subquerying profiles.
-- ============================================================

-- 1. Create a private schema for security definer functions
CREATE SCHEMA IF NOT EXISTS auth_helpers;

-- 2. Helper function: returns the current user's role from profiles
-- SECURITY DEFINER runs as the function owner (superuser), bypassing RLS
CREATE OR REPLACE FUNCTION auth_helpers.my_role()
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
  UNION ALL
  SELECT 'user'::app_role  -- fallback
  LIMIT 1;
$$;

-- 3. Grant execute to authenticated and anon roles
GRANT EXECUTE ON FUNCTION auth_helpers.my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION auth_helpers.my_role() TO anon;

-- 4. Drop all existing policies on profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Business can view business profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- 5. Recreate profiles policies using auth_helpers.my_role() — NO self-referencing subqueries
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');

CREATE POLICY "Business can view business profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth_helpers.my_role() = 'business');

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth_helpers.my_role() = 'admin');

-- 6. Fix businesses policies — replace profiles subquery with auth_helpers.my_role()
DROP POLICY IF EXISTS "Admins full access on businesses" ON businesses;
CREATE POLICY "Admins full access on businesses"
  ON businesses FOR ALL
  TO authenticated
  USING (auth_helpers.my_role() = 'admin')
  WITH CHECK (auth_helpers.my_role() = 'admin');

-- 7. Fix offers policies — replace profiles subquery with auth_helpers.my_role()
DROP POLICY IF EXISTS "Admins full access on offers" ON offers;
CREATE POLICY "Admins full access on offers"
  ON offers FOR ALL
  TO authenticated
  USING (auth_helpers.my_role() = 'admin')
  WITH CHECK (auth_helpers.my_role() = 'admin');
