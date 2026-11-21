BEGIN;

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
    bucket_key text PRIMARY KEY,
    attempts integer NOT NULL DEFAULT 0,
    window_started_at timestamptz NOT NULL DEFAULT NOW(),
    updated_at timestamptz NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE public.auth_rate_limits
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.auth_rate_limits
ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit(
    p_bucket_key text,
    p_max_attempts integer,
    p_window_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_attempts integer;
    v_now timestamptz := clock_timestamp();
BEGIN
    IF p_bucket_key IS NULL
       OR length(p_bucket_key) < 16
       OR length(p_bucket_key) > 256
       OR p_max_attempts NOT BETWEEN 1 AND 1000
       OR p_window_seconds NOT BETWEEN 1 AND 86400
    THEN
        RAISE EXCEPTION 'Invalid rate limit parameters';
    END IF;

    INSERT INTO public.auth_rate_limits AS rl (
        bucket_key,
        attempts,
        window_started_at,
        updated_at
    )
    VALUES (
        p_bucket_key,
        1,
        v_now,
        v_now
    )
    ON CONFLICT (bucket_key)
    DO UPDATE SET
        attempts = CASE
            WHEN rl.window_started_at
                 <= v_now - make_interval(secs => p_window_seconds)
            THEN 1
            ELSE rl.attempts + 1
        END,
        window_started_at = CASE
            WHEN rl.window_started_at
                 <= v_now - make_interval(secs => p_window_seconds)
            THEN v_now
            ELSE rl.window_started_at
        END,
        updated_at = v_now
    RETURNING attempts INTO v_attempts;

    RETURN v_attempts <= p_max_attempts;
END;
$$;

REVOKE ALL ON FUNCTION
public.consume_auth_rate_limit(text, integer, integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.consume_auth_rate_limit(text, integer, integer)
TO service_role;

COMMIT;