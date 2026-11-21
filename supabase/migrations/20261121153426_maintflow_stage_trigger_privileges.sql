BEGIN;

-- Anonymous visitors must not have direct access
-- to MaintFlow operational tables.

REVOKE SELECT, INSERT, UPDATE, DELETE
ON TABLE
    public.equipment,
    public.inventory,
    public.pm_schedules,
    public.work_order_parts,
    public.work_orders
FROM PUBLIC, anon;

-- These functions are used by triggers, so API roles do not need EXECUTE.
REVOKE EXECUTE ON FUNCTION
    public.enforce_admin_only_user_role_changes(),
    public.enforce_work_order_status_rules(),
    public.guard_team_leader_pm_updates(),
    public.guard_technician_work_order_columns()
FROM PUBLIC, anon, authenticated;

-- This retired trigger function may still exist on older installations.
DO $$
BEGIN
    IF to_regprocedure('public.deduct_inventory_on_part_log()') IS NOT NULL THEN
        REVOKE EXECUTE ON FUNCTION public.deduct_inventory_on_part_log()
        FROM PUBLIC, anon, authenticated;

        ALTER FUNCTION public.deduct_inventory_on_part_log()
        SET search_path = pg_catalog, public;
    END IF;
END;
$$;

COMMIT;
