-- ============================================================================
-- MaintFlow Security Policies & Row Level Security (RLS) Configuration
-- ============================================================================

-- 1. Enable RLS across all core operational and profile tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_schedules ENABLE ROW LEVEL SECURITY;

-- 2. Helper Function: Fetch current user's role securely
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. Profiles Table Policies
-- ============================================================================
DROP POLICY IF EXISTS "Allow authenticated users to read profiles for RBAC" ON profiles;
CREATE POLICY "Allow authenticated users to read profiles for RBAC"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Allow users to update their own profile" ON profiles;
CREATE POLICY "Allow users to update their own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ============================================================================
-- 4. Equipment Policies (Manager: View-Only | Others: Full Access)
-- ============================================================================
DROP POLICY IF EXISTS "Allow read access for authenticated users on equipment" ON equipment;
CREATE POLICY "Allow read access for authenticated users on equipment"
  ON equipment FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Restrict equipment modifications to non-managers" ON equipment;
CREATE POLICY "Restrict equipment modifications to non-managers"
  ON equipment FOR ALL
  TO authenticated
  USING (public.get_user_role() NOT IN ('manager'))
  WITH CHECK (public.get_user_role() NOT IN ('manager'));

-- ============================================================================
-- 5. Inventory Policies (Manager: View-Only | Others: Full Access)
-- ============================================================================
DROP POLICY IF EXISTS "Allow read access for authenticated users on inventory" ON inventory;
CREATE POLICY "Allow read access for authenticated users on inventory"
  ON inventory FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Restrict inventory modifications to non-managers" ON inventory;
CREATE POLICY "Restrict inventory modifications to non-managers"
  ON inventory FOR ALL
  TO authenticated
  USING (public.get_user_role() NOT IN ('manager'))
  WITH CHECK (public.get_user_role() NOT IN ('manager'));

-- ============================================================================
-- 6. Work Orders Policies (Manager: View-Only | Others: Full Access)
-- ============================================================================
DROP POLICY IF EXISTS "Allow read access for authenticated users on work_orders" ON work_orders;
CREATE POLICY "Allow read access for authenticated users on work_orders"
  ON work_orders FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Restrict work_orders modifications to non-managers" ON work_orders;
CREATE POLICY "Restrict work_orders modifications to non-managers"
  ON work_orders FOR ALL
  TO authenticated
  USING (public.get_user_role() NOT IN ('manager'))
  WITH CHECK (public.get_user_role() NOT IN ('manager'));

-- ============================================================================
-- 7. PM Schedules Policies (Manager: View-Only | Others: Full Access)
-- ============================================================================
DROP POLICY IF EXISTS "Allow read access for authenticated users on pm_schedules" ON pm_schedules;
CREATE POLICY "Allow read access for authenticated users on pm_schedules"
  ON pm_schedules FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Restrict pm_schedules modifications to non-managers" ON pm_schedules;
CREATE POLICY "Restrict pm_schedules modifications to non-managers"
  ON pm_schedules FOR ALL
  TO authenticated
  USING (public.get_user_role() NOT IN ('manager'))
  WITH CHECK (public.get_user_role() NOT IN ('manager'));

  -- Revoke and drop insecure wildcard policies on operational tables
DROP POLICY IF EXISTS "Enable read access for all users" ON equipment;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON work_orders;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON equipment;
DROP POLICY IF EXISTS "Enable write/update for Technicians and Team Leaders only" ON equipment;
-- Enforce strict role-based and tenant-aware policies
CREATE POLICY "Enable read access for authenticated users"
ON equipment FOR SELECT
TO authenticated
USING (true); -- Or scope to user's facility/department if applicable

CREATE POLICY "Enable write/update for Technicians and Team Leaders only"
ON equipment FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('technician', 'team_leader')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role IN ('technician', 'team_leader')
  )
);

-- Create a robust helper function to check user roles from JWT metadata or profiles table
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text AS $$
BEGIN
  RETURN (
    SELECT role FROM public.profiles WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enforce View-Only for Managers on Work Orders
DROP POLICY IF EXISTS "Work Orders Insert Policy" ON work_orders;
CREATE POLICY "Work Orders Insert Policy" ON work_orders
FOR INSERT TO authenticated
WITH CHECK (public.get_user_role() IN ('technician', 'team_leader'));
DROP POLICY IF EXISTS "Work Orders Update Policy" ON work_orders;
CREATE POLICY "Work Orders Update Policy" ON work_orders
FOR UPDATE TO authenticated
USING (public.get_user_role() IN ('technician', 'team_leader'))
WITH CHECK (public.get_user_role() IN ('technician', 'team_leader'));
DROP POLICY IF EXISTS "Work Orders Delete Policy" ON work_orders;
CREATE POLICY "Work Orders Delete Policy" ON work_orders
FOR DELETE TO authenticated
USING (public.get_user_role() IN ('team_leader')); -- Managers excluded entirely from delete
-- Create or replace secure helper function to check user roles from public schema
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (
    SELECT role 
    FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- EXAMPLE: WORK ORDERS RLS POLICIES
-- ==========================================
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy: Technicians, Team Leaders, and Managers can view work orders
DROP POLICY IF EXISTS "Enable read access for authenticated staff" ON public.work_orders;
CREATE POLICY "Enable read access for authenticated staff"
ON public.work_orders
FOR SELECT
TO authenticated
USING (public.get_user_role() IN ('technician', 'team_leader', 'manager', 'admin'));

-- 2. Insert Policy: Strictly block Managers from inserting work orders
DROP POLICY IF EXISTS "Enable insert for non-managers" ON public.work_orders;
CREATE POLICY "Enable insert for non-managers"
ON public.work_orders
FOR INSERT
TO authenticated
WITH CHECK (public.get_user_role() IN ('technician', 'team_leader', 'admin'));

-- 3. Update Policy: Strictly block Managers from updating work orders
DROP POLICY IF EXISTS "Enable update for non-managers" ON public.work_orders;
CREATE POLICY "Enable update for non-managers"
ON public.work_orders
FOR UPDATE
TO authenticated
USING (public.get_user_role() IN ('technician', 'team_leader', 'admin'))
WITH CHECK (public.get_user_role() IN ('technician', 'team_leader', 'admin'));

-- 4. Delete Policy: Strictly block Managers and Technicians from deleting work orders (Admin/Team Leader only)
DROP POLICY IF EXISTS "Enable delete for privileged roles" ON public.work_orders;
CREATE POLICY "Enable delete for privileged roles"
ON public.work_orders
FOR DELETE
TO authenticated
USING (public.get_user_role() IN ('team_leader', 'admin'));

-- INCORRECT (Insecure Wildcard):
-- CREATE POLICY "allow_all_updates" ON public.equipment FOR UPDATE USING (true);

-- SECURE REPLACEMENT:
DROP POLICY IF EXISTS "Equipment update policy" ON public.equipment;
CREATE POLICY "Equipment update policy"
ON public.equipment
FOR UPDATE
TO authenticated
USING (public.get_user_role() IN ('team_leader', 'admin'))
WITH CHECK (public.get_user_role() IN ('team_leader', 'admin'));