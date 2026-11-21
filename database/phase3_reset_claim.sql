BEGIN;

CREATE OR REPLACE FUNCTION public.claim_password_reset(
    p_request_id uuid,
    p_admin_id uuid
)
RETURNS TABLE (
    target_user_id uuid,
    target_employee_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    -- Only trusted server-side callers can execute this.
    -- The API must verify the Admin's authenticated session.

    RETURN QUERY
    UPDATE public.password_reset_requests AS r
    SET
        status = 'processing',
        admin_id = p_admin_id,
        reset_started_at = NOW()
    WHERE r.id = p_request_id
      AND r.user_id IS NOT NULL
      AND (
          r.status = 'approved'
          OR (
              r.status = 'processing'
              AND r.reset_started_at < NOW() - INTERVAL '5 minutes'
          )
      )
    RETURNING r.user_id, r.employee_number;
END;
$$;

REVOKE ALL ON FUNCTION
public.claim_password_reset(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.claim_password_reset(uuid, uuid)
TO service_role;

COMMIT;
