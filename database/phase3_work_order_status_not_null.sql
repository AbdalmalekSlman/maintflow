BEGIN;

-- Every Work Order must have a valid status.
-- Existing default: 'assigned'.

ALTER TABLE public.work_orders
ALTER COLUMN status SET NOT NULL;

COMMIT;