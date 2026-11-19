
-- ============================================================
-- MAINTFLOW PHASE 2
-- INVENTORY DIRECT-UPDATE PROTECTION
--
-- All authenticated roles must use adjust_stock()
-- or the approved work-order consumption RPC.
--
-- Direct INSERT remains available under existing RLS.
-- Direct SELECT remains available under existing RLS.
-- ============================================================

BEGIN;

-- 1. Remove the broad inventory UPDATE policy.

DROP POLICY IF EXISTS inv_upd
ON public.inventory;


-- 2. Revoke direct table UPDATE privileges.

REVOKE UPDATE
ON TABLE public.inventory
FROM authenticated, anon, PUBLIC;


-- 3. Also revoke any column-level UPDATE grants.

REVOKE UPDATE (
    part_name,
    part_number,
    stock_quantity,
    min_threshold,
    updated_at
)
ON TABLE public.inventory
FROM authenticated, anon, PUBLIC;


-- 4. Add a permanent database constraint:
-- stock_quantity must never be negative.

DO $$
BEGIN

    IF EXISTS (
        SELECT 1
        FROM public.inventory
        WHERE stock_quantity < 0
    ) THEN
        RAISE EXCEPTION
            'Cannot install inventory constraint: existing negative stock records found';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.inventory'::regclass
          AND conname = 'inventory_stock_quantity_nonnegative'
    ) THEN

        ALTER TABLE public.inventory
        ADD CONSTRAINT inventory_stock_quantity_nonnegative
        CHECK (stock_quantity >= 0)
        NOT VALID;

    END IF;

    ALTER TABLE public.inventory
    VALIDATE CONSTRAINT inventory_stock_quantity_nonnegative;

END $$;


COMMIT;

-- ============================================================
-- INVENTORY DIRECT-UPDATE PROTECTION INSTALLED
-- ============================================================
