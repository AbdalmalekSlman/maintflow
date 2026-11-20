BEGIN;

-- =====================================================
-- MAINTFLOW PHASE 3
-- BLOCK OPERATIONAL DATA READS UNTIL PASSWORD CHANGE
-- =====================================================

-- Check the authenticated employee's account status.
CREATE OR REPLACE FUNCTION
public.is_account_password_ready()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = auth.uid()
          AND u.must_change_password = FALSE
    );
$$;

-- Prevent anonymous users from calling the function.
REVOKE ALL
ON FUNCTION public.is_account_password_ready()
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.is_account_password_ready()
TO authenticated;


-- Add a restrictive SELECT policy to each
-- operational application table.
DO $$
DECLARE
    target_table text;
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'equipment',
        'inventory',
        'work_orders',
        'work_order_parts',
        'pm_schedules'
    ]
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS password_change_read_guard
             ON public.%I',
            target_table
        );

        EXECUTE format(
            'CREATE POLICY password_change_read_guard
             ON public.%I
             AS RESTRICTIVE
             FOR SELECT
             TO authenticated
             USING (
                 (SELECT public.is_account_password_ready())
             )',
            target_table
        );
    END LOOP;
END;
$$;

COMMIT;