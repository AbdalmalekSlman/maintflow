BEGIN;

DROP POLICY IF EXISTS
password_reset_requests_read_own_or_admin
ON public.password_reset_requests;

CREATE POLICY password_reset_requests_read_own_or_admin
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR (
        public.is_account_password_ready()
        AND public.get_user_role() = 'admin'
    )
);

COMMIT;