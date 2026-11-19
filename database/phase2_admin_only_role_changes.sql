
-- ============================================================
-- MAINTFLOW PHASE 2
-- ADMIN-ONLY USER ROLE CHANGES
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION
public.enforce_admin_only_user_role_changes()

RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public

AS $$

DECLARE
    v_actor_role text;

BEGIN

    -- Only execute this check when the role actually changes
    IF NEW.role IS DISTINCT FROM OLD.role THEN

        -- Identify the authenticated actor
        SELECT u.role
        INTO v_actor_role
        FROM public.users AS u
        WHERE u.id = auth.uid();

        -- Only Admin may change user roles
        IF COALESCE(v_actor_role, '') <> 'admin' THEN

            RAISE EXCEPTION
                'Forbidden: Only Admin users can change user roles'
                USING ERRCODE = '42501';

        END IF;

    END IF;

    RETURN NEW;

END;
$$;


-- Install trigger

DROP TRIGGER IF EXISTS
trg_admin_only_user_role_changes
ON public.users;

CREATE TRIGGER
trg_admin_only_user_role_changes

BEFORE UPDATE OF role ON public.users

FOR EACH ROW

WHEN (OLD.role IS DISTINCT FROM NEW.role)

EXECUTE FUNCTION
public.enforce_admin_only_user_role_changes();


COMMIT;

-- ============================================================
-- ADMIN-ONLY ROLE CHANGE PROTECTION INSTALLED
-- ============================================================
