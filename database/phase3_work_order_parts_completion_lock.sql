BEGIN;

CREATE OR REPLACE FUNCTION
public.guard_completed_work_order_parts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_work_order_id uuid;
    v_status text;
BEGIN
    -- Determine the affected Work Order.
    IF TG_OP = 'DELETE' THEN
        v_work_order_id := OLD.work_order_id;
    ELSE
        v_work_order_id := NEW.work_order_id;
    END IF;

    -- Check its current status.
    SELECT wo.status
    INTO v_status
    FROM public.work_orders AS wo
    WHERE wo.id = v_work_order_id
    FOR UPDATE;

    IF v_status IN (
        'completed_pending_review',
        'verified_closed'
    ) THEN
        RAISE EXCEPTION
            'Work Order is completed. Spare parts cannot be modified until the Work Order is reopened.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
trg_guard_completed_work_order_parts
ON public.work_order_parts;

CREATE TRIGGER trg_guard_completed_work_order_parts
BEFORE INSERT OR UPDATE OR DELETE
ON public.work_order_parts
FOR EACH ROW
EXECUTE FUNCTION public.guard_completed_work_order_parts();

REVOKE ALL ON FUNCTION
public.guard_completed_work_order_parts()
FROM PUBLIC, anon, authenticated;

COMMIT;