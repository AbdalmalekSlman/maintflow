BEGIN;

CREATE OR REPLACE FUNCTION public.validate_work_order_assignments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_assignee_role text;
    v_leader_role text;
BEGIN
    -- New work orders require both assignments.
    IF TG_OP = 'INSERT' THEN
        IF NEW.assigned_to IS NULL THEN
            RAISE EXCEPTION
                'A Technician must be assigned'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.team_leader_id IS NULL THEN
            RAISE EXCEPTION
                'A Team Leader must be assigned'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.created_by IS NULL
           OR NEW.created_by IS DISTINCT FROM auth.uid()
        THEN
            RAISE EXCEPTION
                'Work Order creator must be the authenticated user'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Validate an assigned employee whenever specified.
    -- NULL remains permissible on UPDATE to preserve the
    -- existing ON DELETE SET NULL foreign-key behavior.
    IF NEW.assigned_to IS NOT NULL THEN
        SELECT role
        INTO v_assignee_role
        FROM public.users
        WHERE id = NEW.assigned_to;

        IF COALESCE(v_assignee_role, '') NOT IN (
            'technician',
            'shift_technician'
        ) THEN
            RAISE EXCEPTION
                'Assigned employee must be a Technician or Shift Technician'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.team_leader_id IS NOT NULL THEN
        SELECT role
        INTO v_leader_role
        FROM public.users
        WHERE id = NEW.team_leader_id;

        IF COALESCE(v_leader_role, '') <> 'team_leader' THEN
            RAISE EXCEPTION
                'Assigned Team Leader must have the team_leader role'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
trg_validate_work_order_assignments
ON public.work_orders;

CREATE TRIGGER trg_validate_work_order_assignments
BEFORE INSERT OR UPDATE OF assigned_to, team_leader_id, created_by
ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.validate_work_order_assignments();

REVOKE ALL
ON FUNCTION public.validate_work_order_assignments()
FROM PUBLIC, anon, authenticated;

COMMIT;