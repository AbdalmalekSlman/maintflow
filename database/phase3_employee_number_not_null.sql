BEGIN;

-- Every MaintFlow user must have an employee number.
-- Abort if any existing user has a NULL employee number.

ALTER TABLE public.users
ALTER COLUMN employee_number SET NOT NULL;

COMMIT;