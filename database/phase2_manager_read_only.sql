
-- ============================================================
-- MAINTFLOW PHASE 2
-- STRICT MANAGER READ-ONLY ENFORCEMENT
--
-- Apply AFTER:
--   1. security_policies.sql
--   2. phase1_hotfix.sql
--
-- Does not remove SELECT permissions.
-- Does not change other roles' existing permissions.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Ensure RLS is enabled on all application tables
-- ------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_order_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_schedules ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 2. Replace the broad self-update policy.
--
-- Preserve self-profile updates for non-Managers.
-- Managers cannot update their own user record.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS users_self_update
ON public.users;

DROP POLICY IF EXISTS users_self_update_non_manager
ON public.users;

CREATE POLICY users_self_update_non_manager
ON public.users
FOR UPDATE
TO authenticated
USING (
    id = auth.uid()
    AND COALESCE(public.get_user_role(), '') <> 'manager'
)
WITH CHECK (
    id = auth.uid()
    AND role = public.get_user_role()
    AND COALESCE(public.get_user_role(), '') <> 'manager'
);


-- ------------------------------------------------------------
-- 3. Restrictive policies for USERS
-- ------------------------------------------------------------

DROP POLICY IF EXISTS manager_deny_users_insert ON public.users;
DROP POLICY IF EXISTS manager_deny_users_update ON public.users;
DROP POLICY IF EXISTS manager_deny_users_delete ON public.users;

CREATE POLICY manager_deny_users_insert
ON public.users
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_users_update
ON public.users
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
)
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_users_delete
ON public.users
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
);


-- ------------------------------------------------------------
-- 4. Restrictive policies for EQUIPMENT
-- ------------------------------------------------------------

DROP POLICY IF EXISTS manager_deny_equipment_insert ON public.equipment;
DROP POLICY IF EXISTS manager_deny_equipment_update ON public.equipment;
DROP POLICY IF EXISTS manager_deny_equipment_delete ON public.equipment;

CREATE POLICY manager_deny_equipment_insert
ON public.equipment
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_equipment_update
ON public.equipment
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
)
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_equipment_delete
ON public.equipment
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
);


-- ------------------------------------------------------------
-- 5. Restrictive policies for INVENTORY
-- ------------------------------------------------------------

DROP POLICY IF EXISTS manager_deny_inventory_insert ON public.inventory;
DROP POLICY IF EXISTS manager_deny_inventory_update ON public.inventory;
DROP POLICY IF EXISTS manager_deny_inventory_delete ON public.inventory;

CREATE POLICY manager_deny_inventory_insert
ON public.inventory
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_inventory_update
ON public.inventory
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
)
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_inventory_delete
ON public.inventory
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
);


-- ------------------------------------------------------------
-- 6. Restrictive policies for WORK ORDERS
-- ------------------------------------------------------------

DROP POLICY IF EXISTS manager_deny_work_orders_insert ON public.work_orders;
DROP POLICY IF EXISTS manager_deny_work_orders_update ON public.work_orders;
DROP POLICY IF EXISTS manager_deny_work_orders_delete ON public.work_orders;

CREATE POLICY manager_deny_work_orders_insert
ON public.work_orders
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_work_orders_update
ON public.work_orders
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
)
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_work_orders_delete
ON public.work_orders
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
);


-- ------------------------------------------------------------
-- 7. Restrictive policies for PREVENTIVE MAINTENANCE
-- ------------------------------------------------------------

DROP POLICY IF EXISTS manager_deny_pm_insert ON public.pm_schedules;
DROP POLICY IF EXISTS manager_deny_pm_update ON public.pm_schedules;
DROP POLICY IF EXISTS manager_deny_pm_delete ON public.pm_schedules;

CREATE POLICY manager_deny_pm_insert
ON public.pm_schedules
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_pm_update
ON public.pm_schedules
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
)
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_pm_delete
ON public.pm_schedules
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
);


-- ------------------------------------------------------------
-- 8. Restrictive policies for WORK ORDER PARTS
-- ------------------------------------------------------------

DROP POLICY IF EXISTS manager_deny_wop_insert ON public.work_order_parts;
DROP POLICY IF EXISTS manager_deny_wop_update ON public.work_order_parts;
DROP POLICY IF EXISTS manager_deny_wop_delete ON public.work_order_parts;

CREATE POLICY manager_deny_wop_insert
ON public.work_order_parts
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_wop_update
ON public.work_order_parts
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
)
WITH CHECK (
    COALESCE(public.get_user_role(), '') <> 'manager'
);

CREATE POLICY manager_deny_wop_delete
ON public.work_order_parts
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
    COALESCE(public.get_user_role(), '') <> 'manager'
);


COMMIT;

-- ============================================================
-- PHASE 2 MANAGER READ-ONLY POLICIES APPLIED
-- ============================================================
