BEGIN;

-- Prevent anonymous and authenticated users
-- from truncating inventory tables.
REVOKE TRUNCATE
ON TABLE
    public.inventory,
    public.work_order_parts
FROM PUBLIC, anon, authenticated;

-- Prevent these roles from creating or modifying
-- triggers on inventory tables.
REVOKE TRIGGER
ON TABLE
    public.inventory,
    public.work_order_parts
FROM PUBLIC, anon, authenticated;

COMMIT;