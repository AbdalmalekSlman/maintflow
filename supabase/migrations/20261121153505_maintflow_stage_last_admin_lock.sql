BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_last_admin_demotion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    admin_count integer;
BEGIN
    -- Only check when an Admin is being demoted.
    IF OLD.role = 'admin'
       AND NEW.role IS DISTINCT FROM 'admin'
    THEN

        -- Share the lock used by prevent_last_admin_deletion().
        PERFORM pg_catalog.pg_advisory_xact_lock(7342026112001::bigint);

        SELECT COUNT(*)
        INTO admin_count
        FROM public.users
        WHERE role = 'admin';

        IF admin_count <= 1 THEN
            RAISE EXCEPTION
                'Cannot change the role of the last Admin account'
                USING ERRCODE = '23514';
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
trg_prevent_last_admin_demotion
ON public.users;

CREATE TRIGGER trg_prevent_last_admin_demotion
BEFORE UPDATE OF role
ON public.users
FOR EACH ROW
WHEN (OLD.role IS DISTINCT FROM NEW.role)
EXECUTE FUNCTION public.prevent_last_admin_demotion();

REVOKE ALL
ON FUNCTION public.prevent_last_admin_demotion()
FROM PUBLIC, anon, authenticated;

COMMIT;
