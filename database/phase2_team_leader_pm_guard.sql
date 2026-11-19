
-- ============================================================
-- MAINTFLOW PHASE 2
-- TEAM LEADER PM SECURITY GUARD
--
-- Team Leaders may:
--   - Create PM schedules pending approval.
--   - Complete active PM schedules.
--
-- Team Leaders may NOT:
--   - Approve pending schedules.
--   - Change PM frequency.
--   - Modify PM descriptions or equipment.
--   - Change arbitrary due dates.
--
-- Admin and Superintendent retain their permissions.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Restrict which PM records Team Leaders can update
-- ------------------------------------------------------------

DROP POLICY IF EXISTS pm_upd ON public.pm_schedules;

CREATE POLICY pm_upd
ON public.pm_schedules
FOR UPDATE
TO authenticated

USING (
    public.get_user_role() IN (
        'admin',
        'superintendent'
    )
    OR (
        public.get_user_role() = 'team_leader'
        AND status = 'active'
    )
)

WITH CHECK (
    public.get_user_role() IN (
        'admin',
        'superintendent'
    )
    OR (
        public.get_user_role() = 'team_leader'
        AND status = 'active'
    )
);


-- ------------------------------------------------------------
-- 2. Create Team Leader PM column-level guard
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION
public.guard_team_leader_pm_updates()

RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public

AS $$

DECLARE
    v_role text;
    v_expected_due_date date;

BEGIN

    SELECT u.role
    INTO v_role
    FROM public.users AS u
    WHERE u.id = auth.uid();

    IF v_role IS NULL THEN
        RAISE EXCEPTION
            'Unauthorized: unable to verify user role'
            USING ERRCODE = '42501';
    END IF;

    IF v_role = 'team_leader' THEN

        -- Team Leaders can only complete ACTIVE schedules
        IF OLD.status IS DISTINCT FROM 'active' THEN
            RAISE EXCEPTION
                'Forbidden: Team Leaders cannot approve or modify pending PM schedules'
                USING ERRCODE = '42501';
        END IF;

        -- Status cannot be changed by a Team Leader
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION
                'Forbidden: Team Leaders cannot change PM approval status'
                USING ERRCODE = '42501';
        END IF;

        -- Only next_due_date and updated_at may change
        IF (
            to_jsonb(NEW)
            - ARRAY['next_due_date', 'updated_at']::text[]
        ) IS DISTINCT FROM (
            to_jsonb(OLD)
            - ARRAY['next_due_date', 'updated_at']::text[]
        ) THEN

            RAISE EXCEPTION
                'Forbidden: Team Leaders cannot modify PM frequency, description, title or equipment'
                USING ERRCODE = '42501';

        END IF;

        -- Calculate the only permitted next due date
        IF OLD.next_due_date IS NULL THEN
            RAISE EXCEPTION
                'Cannot complete PM: existing due date is missing';
        END IF;

        CASE LOWER(BTRIM(OLD.frequency::text))

            WHEN 'daily' THEN
                v_expected_due_date :=
                    OLD.next_due_date::date + 1;

            WHEN 'weekly' THEN
                v_expected_due_date :=
                    OLD.next_due_date::date + 7;

            WHEN 'monthly' THEN
                v_expected_due_date :=
                    (
                        OLD.next_due_date::date
                        + INTERVAL '1 month'
                    )::date;

            WHEN 'quarterly' THEN
                v_expected_due_date :=
                    (
                        OLD.next_due_date::date
                        + INTERVAL '3 months'
                    )::date;

            WHEN 'yearly' THEN
                v_expected_due_date :=
                    (
                        OLD.next_due_date::date
                        + INTERVAL '1 year'
                    )::date;

            ELSE
                RAISE EXCEPTION
                    'Unsupported PM frequency: %',
                    OLD.frequency;

        END CASE;

        -- Reject arbitrary due-date modifications
        IF NEW.next_due_date::date
           IS DISTINCT FROM v_expected_due_date THEN

            RAISE EXCEPTION
                'Forbidden: Team Leaders can only advance the PM due date by its configured frequency'
                USING ERRCODE = '42501';

        END IF;

    END IF;

    RETURN NEW;

END;
$$;


-- ------------------------------------------------------------
-- 3. Install trigger
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS
trg_guard_team_leader_pm_updates
ON public.pm_schedules;

CREATE TRIGGER
trg_guard_team_leader_pm_updates

BEFORE UPDATE ON public.pm_schedules

FOR EACH ROW

EXECUTE FUNCTION
public.guard_team_leader_pm_updates();


COMMIT;

-- ============================================================
-- TEAM LEADER PM SECURITY GUARD INSTALLED
-- ============================================================
