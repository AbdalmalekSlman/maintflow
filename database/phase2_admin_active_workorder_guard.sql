
BEGIN;

-- Ensure Team Leader references remain historical-safe.
ALTER TABLE public.work_orders
DROP CONSTRAINT IF EXISTS work_orders_team_leader_id_fkey;

ALTER TABLE public.work_orders
ADD CONSTRAINT work_orders_team_leader_id_fkey
FOREIGN KEY (team_leader_id)
REFERENCES public.users(id)
ON DELETE SET NULL;


-- Prevent deleting users with active assignments.
CREATE OR REPLACE FUNCTION
public.prevent_user_deletion_with_active_work_orders()

RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public

AS $$
DECLARE
    v_assigned_count integer;
    v_leader_count integer;
BEGIN

    SELECT COUNT(*)
    INTO v_assigned_count
    FROM public.work_orders
    WHERE assigned_to = OLD.id
      AND status IS DISTINCT FROM 'verified_closed';

    SELECT COUNT(*)
    INTO v_leader_count
    FROM public.work_orders
    WHERE team_leader_id = OLD.id
      AND status IS DISTINCT FROM 'verified_closed';

    IF v_assigned_count > 0 OR v_leader_count > 0 THEN
        RAISE EXCEPTION
            'Forbidden: Reassign or close all active work orders before deleting this user'
            USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION
public.prevent_user_deletion_with_active_work_orders()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS
trg_prevent_active_work_orders_user_delete
ON public.users;

CREATE TRIGGER
trg_prevent_active_work_orders_user_delete
BEFORE DELETE ON public.users
FOR EACH ROW
EXECUTE FUNCTION
public.prevent_user_deletion_with_active_work_orders();

COMMIT;
