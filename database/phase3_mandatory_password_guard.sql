BEGIN;

-- Block operational database modifications when
-- the authenticated user must change their password.

CREATE OR REPLACE FUNCTION
public.enforce_password_change_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_must_change boolean;
BEGIN
    -- Trusted background operations without an end-user
    -- JWT are handled separately by database permissions.
    IF v_user_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;

        RETURN NEW;
    END IF;

    SELECT u.must_change_password
    INTO v_must_change
    FROM public.users AS u
    WHERE u.id = v_user_id;

    -- Fail closed if the user profile cannot be verified.
    IF v_must_change IS NULL OR v_must_change THEN
        RAISE EXCEPTION
            'Password change required before modifying MaintFlow data'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
public.enforce_password_change_before_write()
FROM PUBLIC, anon, authenticated;

-- Install the guard on operational application tables.
DO $$
DECLARE
    table_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'users',
        'equipment',
        'inventory',
        'work_orders',
        'work_order_parts',
        'pm_schedules'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_password_change_guard ON public.%I',
            table_name
        );

        EXECUTE format(
            'CREATE TRIGGER trg_password_change_guard
             BEFORE INSERT OR UPDATE OR DELETE
             ON public.%I
             FOR EACH ROW
             EXECUTE FUNCTION
             public.enforce_password_change_before_write()',
            table_name
        );
    END LOOP;
END;
$$;

COMMIT;