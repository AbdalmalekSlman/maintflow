BEGIN;

-- 1. Store previous completion details.

CREATE TABLE IF NOT EXISTS public.work_order_reopening_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    work_order_id uuid NOT NULL
        REFERENCES public.work_orders(id)
        ON DELETE CASCADE,

    previous_status text NOT NULL,
    new_status text NOT NULL,

    previous_completed_at timestamptz,
    previous_outcome_notes text,

    reopened_by uuid
        REFERENCES public.users(id)
        ON DELETE SET NULL,

    reopened_at timestamptz NOT NULL DEFAULT NOW()
);

-- 2. Protect audit records.

ALTER TABLE public.work_order_reopening_history
ENABLE ROW LEVEL SECURITY;

REVOKE ALL
ON public.work_order_reopening_history
FROM PUBLIC, anon, authenticated;

-- Service-role access for administrative recovery.
GRANT SELECT, INSERT
ON public.work_order_reopening_history
TO service_role;


-- 3. Automatically archive completion details and
-- clear the timestamp when a Work Order is reopened.

CREATE OR REPLACE FUNCTION
public.record_work_order_reopening()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF OLD.status IN (
        'completed_pending_review',
        'verified_closed'
    )
    AND NEW.status IN (
        'assigned',
        'in_progress'
    )
    AND OLD.status IS DISTINCT FROM NEW.status
    THEN

        INSERT INTO public.work_order_reopening_history (
            work_order_id,
            previous_status,
            new_status,
            previous_completed_at,
            previous_outcome_notes,
            reopened_by
        )
        VALUES (
            OLD.id,
            OLD.status,
            NEW.status,
            OLD.completed_at,
            OLD.outcome_notes,
            auth.uid()
        );

        -- The Work Order is active again.
        NEW.completed_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
trg_record_work_order_reopening
ON public.work_orders;

CREATE TRIGGER trg_record_work_order_reopening
BEFORE UPDATE OF status
ON public.work_orders
FOR EACH ROW
EXECUTE FUNCTION public.record_work_order_reopening();

REVOKE ALL ON FUNCTION
public.record_work_order_reopening()
FROM PUBLIC, anon, authenticated;

COMMIT;