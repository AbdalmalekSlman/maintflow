
-- ============================================================
-- MAINTFLOW PHASE 2
-- TECHNICIAN WORK ORDER COLUMN RESTRICTIONS
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION
public.guard_technician_work_order_columns()

RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public

AS $$

DECLARE
    v_actor_role text;

BEGIN

    -- Identify the authenticated user's role
    SELECT u.role
    INTO v_actor_role
    FROM public.users AS u
    WHERE u.id = auth.uid();

    -- Apply restrictions to Technicians and Shift Technicians
    IF v_actor_role IN (
        'technician',
        'shift_technician'
    ) THEN

        -- Only these fields may be changed
        IF (
            to_jsonb(NEW)
            - ARRAY[
                'status',
                'outcome_notes',
                'completed_at',
                'updated_at'
            ]::text[]
        ) IS DISTINCT FROM (
            to_jsonb(OLD)
            - ARRAY[
                'status',
                'outcome_notes',
                'completed_at',
                'updated_at'
            ]::text[]
        ) THEN

            RAISE EXCEPTION
                'Forbidden: Technicians cannot modify administrative work order fields. Only status, outcome_notes and completed_at may be updated.'
                USING ERRCODE = '42501';

        END IF;

    END IF;

    RETURN NEW;

END;
$$;


-- Replace existing guard if this migration is reapplied

DROP TRIGGER IF EXISTS
trg_guard_technician_work_order_columns
ON public.work_orders;


CREATE TRIGGER
trg_guard_technician_work_order_columns

BEFORE UPDATE ON public.work_orders

FOR EACH ROW

EXECUTE FUNCTION
public.guard_technician_work_order_columns();


COMMIT;
