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

COMMIT;