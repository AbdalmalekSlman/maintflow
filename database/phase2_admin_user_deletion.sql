
-- ============================================================
-- MAINTFLOW PHASE 2
-- ADMIN USER ACCOUNT DELETION
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Preserve historical records when a user is deleted
-- ------------------------------------------------------------

ALTER TABLE public.work_orders
DROP CONSTRAINT IF EXISTS work_orders_assigned_to_fkey;

ALTER TABLE public.work_orders
ADD CONSTRAINT work_orders_assigned_to_fkey
FOREIGN KEY (assigned_to)
REFERENCES public.users(id)
ON DELETE SET NULL;


ALTER TABLE public.work_orders
DROP CONSTRAINT IF EXISTS work_orders_created_by_fkey;

ALTER TABLE public.work_orders
ADD CONSTRAINT work_orders_created_by_fkey
FOREIGN KEY (created_by)
REFERENCES public.users(id)
ON DELETE SET NULL;


ALTER TABLE public.work_order_parts
DROP CONSTRAINT IF EXISTS work_order_parts_logged_by_fkey;

ALTER TABLE public.work_order_parts
ADD CONSTRAINT work_order_parts_logged_by_fkey
FOREIGN KEY (logged_by)
REFERENCES public.users(id)
ON DELETE SET NULL;


-- ------------------------------------------------------------
-- 2. Replace the broad Admin ALL policy
-- Separate INSERT and UPDATE from DELETE.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS users_admin_all
ON public.users;

DROP POLICY IF EXISTS users_admin_insert
ON public.users;

DROP POLICY IF EXISTS users_admin_update
ON public.users;

CREATE POLICY users_admin_insert
ON public.users
FOR INSERT
TO authenticated
WITH CHECK (
    public.get_user_role() = 'admin'
);

CREATE POLICY users_admin_update
ON public.users
FOR UPDATE
TO authenticated
USING (
    public.get_user_role() = 'admin'
)
WITH CHECK (
    public.get_user_role() = 'admin'
);


-- ------------------------------------------------------------
-- 3. Disable direct deletion of public.users
-- Deletion must go through Supabase Auth Admin API.
-- ------------------------------------------------------------

REVOKE DELETE
ON TABLE public.users
FROM authenticated, anon, PUBLIC;


-- ------------------------------------------------------------
-- 4. Prevent deletion of the last Admin
-- Advisory lock protects against concurrent deletions.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION
public.prevent_last_admin_deletion()

RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public

AS $$

DECLARE
    v_admin_count integer;

BEGIN

    IF OLD.role = 'admin' THEN

        -- Serialize Admin deletion checks
        PERFORM pg_catalog.pg_advisory_xact_lock(
            7342026112001::bigint
        );

        SELECT COUNT(*)
        INTO v_admin_count
        FROM public.users
        WHERE role = 'admin';

        IF v_admin_count <= 1 THEN

            RAISE EXCEPTION
                'Forbidden: Cannot delete the last Admin account'
                USING ERRCODE = '42501';

        END IF;

    END IF;

    RETURN OLD;

END;
$$;


REVOKE ALL ON FUNCTION
public.prevent_last_admin_deletion()
FROM PUBLIC, anon, authenticated;


DROP TRIGGER IF EXISTS
trg_prevent_last_admin_deletion
ON public.users;

CREATE TRIGGER
trg_prevent_last_admin_deletion

BEFORE DELETE ON public.users

FOR EACH ROW

EXECUTE FUNCTION
public.prevent_last_admin_deletion();


COMMIT;

-- ============================================================
-- ADMIN USER DELETION PROTECTION INSTALLED
-- ============================================================
