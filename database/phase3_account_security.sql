-- ============================================================
-- MAINTFLOW PHASE 3
-- EMPLOYEE NUMBER AND ACCOUNT SECURITY
-- ============================================================

BEGIN;

-- 1. Add account-security fields to existing users.
-- employee_number remains nullable until existing accounts
-- have been assigned verified employee numbers.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS employee_number TEXT,
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN
        NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;


-- 2. Enforce numeric employee numbers without leading zeros.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_employee_number_format_check'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_employee_number_format_check
            CHECK (
                employee_number IS NULL
                OR employee_number ~ '^[1-9][0-9]*$'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_employee_number_key'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_employee_number_key
            UNIQUE (employee_number);
    END IF;
END $$;


-- 3. Create password-reset request history.

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Nullable so request history survives account deletion.
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

    -- Snapshot retained for historical reference.
    employee_number TEXT NOT NULL,

    request_note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',

    admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    admin_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    CONSTRAINT password_reset_requests_employee_number_check
        CHECK (employee_number ~ '^[1-9][0-9]*$'),

    CONSTRAINT password_reset_requests_note_length_check
        CHECK (request_note IS NULL OR char_length(request_note) <= 500),

    CONSTRAINT password_reset_requests_admin_note_length_check
        CHECK (admin_note IS NULL OR char_length(admin_note) <= 500)
);


-- 4. Track reset claims and allow one active request per identified user.

ALTER TABLE public.password_reset_requests
    ADD COLUMN IF NOT EXISTS reset_started_at TIMESTAMPTZ,
    DROP CONSTRAINT IF EXISTS password_reset_requests_status_check,
    ADD CONSTRAINT password_reset_requests_status_check
        CHECK (status IN ('pending', 'approved', 'processing', 'rejected', 'completed'));

CREATE UNIQUE INDEX IF NOT EXISTS
    password_reset_requests_one_active_per_user_idx
ON public.password_reset_requests (user_id)
WHERE status IN ('pending', 'approved', 'processing') AND user_id IS NOT NULL;

DROP INDEX IF EXISTS public.password_reset_requests_one_pending_per_user_idx;


-- 5. Indexes for Admin request management and user history.

CREATE INDEX IF NOT EXISTS
    password_reset_requests_status_created_idx
ON public.password_reset_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS
    password_reset_requests_user_created_idx
ON public.password_reset_requests (user_id, created_at DESC);


-- 6. Protect the reset-request table with RLS.

ALTER TABLE public.password_reset_requests
    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
    password_reset_requests_read_own_or_admin
ON public.password_reset_requests;

CREATE POLICY password_reset_requests_read_own_or_admin
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = auth.uid()
          AND u.role = 'admin'
    )
);


-- 7. All reset-request writes will go through protected
-- server-side API routes using the service-role client.
-- Browser clients cannot directly create or modify requests.

REVOKE ALL ON TABLE public.password_reset_requests
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.password_reset_requests
TO authenticated;

GRANT ALL ON TABLE public.password_reset_requests
TO service_role;

COMMIT;
