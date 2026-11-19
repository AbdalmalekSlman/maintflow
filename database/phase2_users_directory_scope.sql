
-- ============================================================
-- MAINTFLOW PHASE 2
-- RESTRICT USER DIRECTORY VISIBILITY
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS users_directory_scope
ON public.users;

CREATE POLICY users_directory_scope
ON public.users
AS RESTRICTIVE
FOR SELECT
TO authenticated

USING (
    id = auth.uid()
    OR COALESCE(public.get_user_role(), '') IN (
        'admin',
        'manager',
        'superintendent'
    )
);

COMMIT;
