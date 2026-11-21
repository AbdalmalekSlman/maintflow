BEGIN;

CREATE OR REPLACE FUNCTION
public.guard_completed_work_order_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_role text;
BEGIN
    SELECT u.role INTO v_role
    FROM public.users AS u
    WHERE u.id = auth.uid();

    -- A submitted work order is locked until an
    -- authorized reviewer reopens it.
    IF OLD.status = 'completed_pending_review' THEN

        IF COALESCE(v_role, '') NOT IN (
            'admin',
            'superintendent',
            'team_leader'
        ) THEN
            RAISE EXCEPTION
                'Work Order is pending review. Only an authorized reviewer can modify or reopen it.'
                USING ERRCODE = '42501';
        END IF;

    END IF;

    -- Verified closed Work Orders remain locked.
    -- Only Admin or Superintendent may reopen them.
    IF OLD.status = 'verified_closed' THEN

        IF COALESCE(v_role, '') NOT IN (
            'admin',
            'superintendent'
        ) THEN
            RAISE EXCEPTION
                'Verified Closed Work Order cannot be modified by this role.'
                USING ERRCODE = '42501';
        END IF;

    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
trg_guard_completed_work_order_updates
ON public.work_orders;

CREATE TRIGGER trg_guard_completed_work_order_updates
BEFORE UPDATE
ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION
public.guard_completed_work_order_updates();

REVOKE ALL ON FUNCTION
public.guard_completed_work_order_updates()
FROM PUBLIC, anon, authenticated;

COMMIT;