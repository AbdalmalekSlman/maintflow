-- Schema-only MaintFlow baseline derived from the development catalog.

-- This migration targets a fresh Supabase project and contains no fixture or employee data.

SET LOCAL search_path = public, extensions, pg_catalog;

CREATE TYPE public.pm_frequency AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'yearly');

CREATE TABLE public.auth_rate_limits (
    bucket_key text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    window_started_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    asset_tag text,
    location text,
    status text DEFAULT 'operational'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    part_name text NOT NULL,
    part_number text,
    stock_quantity integer DEFAULT 0 NOT NULL,
    min_threshold integer DEFAULT 5 NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.password_reset_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    employee_number text NOT NULL,
    request_note text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_id uuid,
    admin_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    completed_at timestamp with time zone,
    reset_started_at timestamp with time zone
);

CREATE TABLE public.pm_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    equipment_id uuid NOT NULL,
    frequency pm_frequency DEFAULT 'monthly'::pm_frequency NOT NULL,
    next_due_date date NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    status text DEFAULT 'active'::text NOT NULL
);

CREATE TABLE public.users (
    id uuid NOT NULL,
    full_name text NOT NULL,
    email text NOT NULL,
    role text DEFAULT 'technician'::text NOT NULL,
    push_token text,
    created_at timestamp with time zone DEFAULT now(),
    employee_number text NOT NULL,
    must_change_password boolean DEFAULT false NOT NULL,
    password_changed_at timestamp with time zone
);

CREATE TABLE public.work_order_parts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid,
    part_id uuid,
    quantity_used integer NOT NULL,
    logged_by uuid,
    logged_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.work_order_reopening_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_order_id uuid NOT NULL,
    previous_status text NOT NULL,
    new_status text NOT NULL,
    previous_completed_at timestamp with time zone,
    previous_outcome_notes text,
    reopened_by uuid,
    reopened_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.work_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    priority text DEFAULT 'medium'::text,
    equipment_id uuid,
    created_by uuid,
    assigned_to uuid,
    status text DEFAULT 'assigned'::text NOT NULL,
    outcome_notes text,
    created_at timestamp with time zone DEFAULT now(),
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    verified_at timestamp with time zone,
    team_leader_id uuid
);

ALTER TABLE public.auth_rate_limits ADD CONSTRAINT auth_rate_limits_pkey PRIMARY KEY (bucket_key);

ALTER TABLE public.equipment ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);

ALTER TABLE public.equipment ADD CONSTRAINT equipment_serial_number_key UNIQUE (asset_tag);

ALTER TABLE public.equipment ADD CONSTRAINT equipment_status_check CHECK ((status = ANY (ARRAY['operational'::text, 'under_maintenance'::text, 'out_of_service'::text])));

ALTER TABLE public.inventory ADD CONSTRAINT inventory_part_number_key UNIQUE (part_number);

ALTER TABLE public.inventory ADD CONSTRAINT inventory_pkey PRIMARY KEY (id);

ALTER TABLE public.inventory ADD CONSTRAINT inventory_stock_quantity_nonnegative CHECK ((stock_quantity >= 0));

ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_admin_note_length_check CHECK (((admin_note IS NULL) OR (char_length(admin_note) <= 500)));

ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_employee_number_check CHECK ((employee_number ~ '^[1-9][0-9]*$'::text));

ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_note_length_check CHECK (((request_note IS NULL) OR (char_length(request_note) <= 500)));

ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_pkey PRIMARY KEY (id);

ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'processing'::text, 'rejected'::text, 'completed'::text])));

ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_pkey PRIMARY KEY (id);

ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE public.users ADD CONSTRAINT users_employee_number_format_check CHECK (((employee_number IS NULL) OR (employee_number ~ '^[1-9][0-9]*$'::text)));

ALTER TABLE public.users ADD CONSTRAINT users_employee_number_key UNIQUE (employee_number);

ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'superintendent'::text, 'team_leader'::text, 'technician'::text, 'shift_technician'::text, 'stock_keeper'::text])));

ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_pkey PRIMARY KEY (id);

ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_quantity_positive CHECK ((quantity_used > 0));

ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_quantity_used_check CHECK ((quantity_used > 0));

ALTER TABLE public.work_order_reopening_history ADD CONSTRAINT work_order_reopening_history_pkey PRIMARY KEY (id);

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_pkey PRIMARY KEY (id);

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])));

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_status_check CHECK ((status = ANY (ARRAY['assigned'::text, 'in_progress'::text, 'completed_pending_review'::text, 'verified_closed'::text])));

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_title_not_blank CHECK ((char_length(btrim(title)) > 0));

ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE public.pm_schedules ADD CONSTRAINT pm_schedules_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;

ALTER TABLE public.users ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_part_id_fkey FOREIGN KEY (part_id) REFERENCES inventory(id) ON DELETE RESTRICT;

ALTER TABLE public.work_order_parts ADD CONSTRAINT work_order_parts_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;

ALTER TABLE public.work_order_reopening_history ADD CONSTRAINT work_order_reopening_history_reopened_by_fkey FOREIGN KEY (reopened_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE public.work_order_reopening_history ADD CONSTRAINT work_order_reopening_history_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE;

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;

ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_team_leader_id_fkey FOREIGN KEY (team_leader_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX password_reset_requests_status_created_idx ON public.password_reset_requests USING btree (status, created_at DESC);

CREATE INDEX password_reset_requests_user_created_idx ON public.password_reset_requests USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX equipment_asset_tag_unique_idx ON public.equipment USING btree (lower(btrim(asset_tag))) WHERE ((asset_tag IS NOT NULL) AND (btrim(asset_tag) <> ''::text));

CREATE UNIQUE INDEX password_reset_requests_one_active_per_user_idx ON public.password_reset_requests USING btree (user_id) WHERE ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'processing'::text])) AND (user_id IS NOT NULL));

CREATE OR REPLACE FUNCTION public.adjust_stock(p_part_id uuid, p_delta integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_role text;
  v_updated_id uuid;

BEGIN

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  SELECT u.role
  INTO v_role
  FROM public.users AS u
  WHERE u.id = auth.uid();

  IF COALESCE(v_role, '') NOT IN (
    'admin',
    'stock_keeper',
    'superintendent',
    'team_leader'
  ) THEN
    RAISE EXCEPTION
      'Forbidden: role is not allowed to adjust inventory';
  END IF;

  IF p_part_id IS NULL
     OR p_delta IS NULL
     OR p_delta = 0 THEN
    RAISE EXCEPTION 'Invalid stock adjustment';
  END IF;

  UPDATE public.inventory

  SET
    stock_quantity = stock_quantity + p_delta,
    updated_at = now()

  WHERE id = p_part_id
    AND stock_quantity + p_delta >= 0

  RETURNING id INTO v_updated_id;

  IF v_updated_id IS NULL THEN
    RAISE EXCEPTION
      'Inventory item not found or adjustment would make stock negative';
  END IF;

END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_password_reset(p_request_id uuid, p_admin_id uuid)
 RETURNS TABLE(target_user_id uuid, target_employee_number text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
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
$function$;

CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit(p_bucket_key text, p_max_attempts integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.deduct_inventory_on_part_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update public.inventory
  set stock_quantity = stock_quantity - new.quantity_used,
      updated_at = now()
  where id = new.part_id;
  
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_admin_only_user_role_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
    v_actor_role text;

BEGIN

    -- Only execute this check when the role actually changes
    IF NEW.role IS DISTINCT FROM OLD.role THEN

        -- Identify the authenticated actor
        SELECT u.role
        INTO v_actor_role
        FROM public.users AS u
        WHERE u.id = auth.uid();

        -- Only Admin may change user roles
        IF COALESCE(v_actor_role, '') <> 'admin' THEN

            RAISE EXCEPTION
                'Forbidden: Only Admin users can change user roles'
                USING ERRCODE = '42501';

        END IF;

    END IF;

    RETURN NEW;

END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_password_change_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_must_change boolean;
BEGIN
    -- Trusted background operations without an end-user
    -- JWT are handled separately by database permissions.
    IF v_user_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;

        RETURN NEW;
    END IF;

    SELECT u.must_change_password
    INTO v_must_change
    FROM public.users AS u
    WHERE u.id = v_user_id;

    -- Fail closed if the user profile cannot be verified.
    IF v_must_change IS NULL OR v_must_change THEN
        RAISE EXCEPTION
            'Password change required before modifying MaintFlow data'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_work_order_status_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  actor_role text;
begin
  select role into actor_role
  from public.users
  where id = auth.uid();

  if tg_op = 'INSERT' then
    if new.status is distinct from 'assigned' then
      raise exception 'New work orders must be created with status ''assigned''';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'verified_closed'
       and new.status is distinct from 'verified_closed'
       and coalesce(actor_role, '') not in ('admin', 'superintendent') then
      raise exception 'Verified closed work orders cannot be reopened by role ''%''', coalesce(actor_role, 'unknown');
    end if;

    if new.status = 'verified_closed'
       and old.status is distinct from 'verified_closed'
       and coalesce(actor_role, '') not in ('admin', 'superintendent', 'team_leader') then
      raise exception 'Role ''%'' is not permitted to set status to ''verified_closed''', coalesce(actor_role, 'unknown');
    end if;

    return new;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT role FROM public.users WHERE id = auth.uid() $function$;

CREATE OR REPLACE FUNCTION public.guard_completed_work_order_parts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_work_order_id uuid;
    v_status text;
BEGIN
    -- Determine the affected Work Order.
    IF TG_OP = 'DELETE' THEN
        v_work_order_id := OLD.work_order_id;
    ELSE
        v_work_order_id := NEW.work_order_id;
    END IF;

    -- Check its current status.
    SELECT wo.status
    INTO v_status
    FROM public.work_orders AS wo
    WHERE wo.id = v_work_order_id
    FOR UPDATE;

    IF v_status IN (
        'completed_pending_review',
        'verified_closed'
    ) THEN
        RAISE EXCEPTION
            'Work Order is completed. Spare parts cannot be modified until the Work Order is reopened.'
            USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_completed_work_order_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_role text;
BEGIN
    SELECT u.role INTO v_role
    FROM public.users AS u
    WHERE u.id = auth.uid();

    -- A submitted work order is locked until an
    -- authorized reviewer reopens it.
    IF OLD.status = 'completed_pending_review' THEN

        IF COALESCE(v_role, '') NOT IN (
            'admin',
            'superintendent',
            'team_leader'
        ) THEN
            RAISE EXCEPTION
                'Work Order is pending review. Only an authorized reviewer can modify or reopen it.'
                USING ERRCODE = '42501';
        END IF;

    END IF;

    -- Verified closed Work Orders remain locked.
    -- Only Admin or Superintendent may reopen them.
    IF OLD.status = 'verified_closed' THEN

        IF COALESCE(v_role, '') NOT IN (
            'admin',
            'superintendent'
        ) THEN
            RAISE EXCEPTION
                'Verified Closed Work Order cannot be modified by this role.'
                USING ERRCODE = '42501';
        END IF;

    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_team_leader_pm_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

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
$function$;

CREATE OR REPLACE FUNCTION public.guard_technician_work_order_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

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
$function$;

CREATE OR REPLACE FUNCTION public.is_account_password_ready()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public.users AS u
        WHERE u.id = auth.uid()
          AND u.must_change_password = FALSE
    );
$function$;

CREATE OR REPLACE FUNCTION public.log_work_order_part(p_work_order_id uuid, p_part_id uuid, p_quantity_used integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_wo_status text;
  v_assigned_to uuid;
  v_current_stock integer;

BEGIN

  -- Authentication
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION
      'Unauthorized: authentication required';
  END IF;

  -- Validate inputs
  IF p_work_order_id IS NULL
     OR p_part_id IS NULL
     OR p_quantity_used IS NULL
     OR p_quantity_used <= 0 THEN

    RAISE EXCEPTION
      'Work order, spare part, and a positive whole-number quantity are required';

  END IF;

  -- Get the actual user role
  SELECT u.role
  INTO v_actor_role
  FROM public.users AS u
  WHERE u.id = v_actor_id;

  -- Authorize spare-part consumption
  IF COALESCE(v_actor_role, '') NOT IN (
    'admin',
    'superintendent',
    'team_leader',
    'technician',
    'shift_technician'
  ) THEN

    RAISE EXCEPTION
      'Forbidden: role is not allowed to log spare parts';

  END IF;

  -- Lock work order
  SELECT wo.status, wo.assigned_to
  INTO v_wo_status, v_assigned_to
  FROM public.work_orders AS wo
  WHERE wo.id = p_work_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  -- Technicians may only log parts against their own work orders
  IF v_actor_role IN (
    'technician',
    'shift_technician'
  )
  AND v_assigned_to IS DISTINCT FROM v_actor_id THEN

    RAISE EXCEPTION
      'Forbidden: you can only log parts against your assigned work orders';

  END IF;

  -- Prevent usage on verified closed work orders
  IF v_wo_status = 'verified_closed' THEN
    RAISE EXCEPTION
      'Cannot log parts on a verified and closed work order';
  END IF;

  -- Lock inventory row
  SELECT i.stock_quantity
  INTO v_current_stock
  FROM public.inventory AS i
  WHERE i.id = p_part_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spare part not found';
  END IF;

  -- Verify sufficient stock
  IF v_current_stock IS NULL
     OR v_current_stock < p_quantity_used THEN

    RAISE EXCEPTION
      'Insufficient stock: available %, requested %',
      COALESCE(v_current_stock, 0),
      p_quantity_used;

  END IF;

  -- Deduct inventory
  UPDATE public.inventory

  SET
    stock_quantity = stock_quantity - p_quantity_used,
    updated_at = now()

  WHERE id = p_part_id
    AND stock_quantity >= p_quantity_used;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Insufficient stock or spare part not found';
  END IF;

  -- Record spare-part usage
  INSERT INTO public.work_order_parts (
    work_order_id,
    part_id,
    quantity_used,
    logged_by
  )

  VALUES (
    p_work_order_id,
    p_part_id,
    p_quantity_used,
    v_actor_id
  );

END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_last_admin_deletion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$

DECLARE
    v_admin_count integer;

BEGIN

    IF OLD.role = 'admin' THEN

        -- Serialize Admin deletion checks
        PERFORM pg_catalog.pg_advisory_xact_lock(
            7342026112001::bigint
        );

        SELECT COUNT(*)
        INTO v_admin_count
        FROM public.users
        WHERE role = 'admin';

        IF v_admin_count <= 1 THEN

            RAISE EXCEPTION
                'Forbidden: Cannot delete the last Admin account'
                USING ERRCODE = '42501';

        END IF;

    END IF;

    RETURN OLD;

END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_last_admin_demotion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    admin_count integer;
BEGIN
    -- Only check when an Admin is being demoted.
    IF OLD.role = 'admin'
       AND NEW.role IS DISTINCT FROM 'admin'
    THEN

        -- Serialize concurrent Admin demotions.
        PERFORM pg_advisory_xact_lock(7698, 1001);

        SELECT COUNT(*)
        INTO admin_count
        FROM public.users
        WHERE role = 'admin';

        IF admin_count <= 1 THEN
            RAISE EXCEPTION
                'Cannot change the role of the last Admin account'
                USING ERRCODE = '23514';
        END IF;

    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_user_deletion_with_active_work_orders()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_assigned_count integer;
    v_leader_count integer;
BEGIN

    SELECT COUNT(*)
    INTO v_assigned_count
    FROM public.work_orders
    WHERE assigned_to = OLD.id
      AND status IS DISTINCT FROM 'verified_closed';

    SELECT COUNT(*)
    INTO v_leader_count
    FROM public.work_orders
    WHERE team_leader_id = OLD.id
      AND status IS DISTINCT FROM 'verified_closed';

    IF v_assigned_count > 0 OR v_leader_count > 0 THEN
        RAISE EXCEPTION
            'Forbidden: Reassign or close all active work orders before deleting this user'
            USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_work_order_reopening()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
    IF OLD.status IN (
        'completed_pending_review',
        'verified_closed'
    )
    AND NEW.status IN (
        'assigned',
        'in_progress'
    )
    AND OLD.status IS DISTINCT FROM NEW.status
    THEN

        INSERT INTO public.work_order_reopening_history (
            work_order_id,
            previous_status,
            new_status,
            previous_completed_at,
            previous_outcome_notes,
            reopened_by
        )
        VALUES (
            OLD.id,
            OLD.status,
            NEW.status,
            OLD.completed_at,
            OLD.outcome_notes,
            auth.uid()
        );

        -- The Work Order is active again.
        NEW.completed_at := NULL;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_work_order_assignments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
    v_assignee_role text;
    v_leader_role text;
BEGIN
    -- New work orders require both assignments.
    IF TG_OP = 'INSERT' THEN
        IF NEW.assigned_to IS NULL THEN
            RAISE EXCEPTION
                'A Technician must be assigned'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.team_leader_id IS NULL THEN
            RAISE EXCEPTION
                'A Team Leader must be assigned'
                USING ERRCODE = '23514';
        END IF;

        IF NEW.created_by IS NULL
           OR NEW.created_by IS DISTINCT FROM auth.uid()
        THEN
            RAISE EXCEPTION
                'Work Order creator must be the authenticated user'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Validate an assigned employee whenever specified.
    -- NULL remains permissible on UPDATE to preserve the
    -- existing ON DELETE SET NULL foreign-key behavior.
    IF NEW.assigned_to IS NOT NULL THEN
        SELECT role
        INTO v_assignee_role
        FROM public.users
        WHERE id = NEW.assigned_to;

        IF COALESCE(v_assignee_role, '') NOT IN (
            'technician',
            'shift_technician'
        ) THEN
            RAISE EXCEPTION
                'Assigned employee must be a Technician or Shift Technician'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.team_leader_id IS NOT NULL THEN
        SELECT role
        INTO v_leader_role
        FROM public.users
        WHERE id = NEW.team_leader_id;

        IF COALESCE(v_leader_role, '') <> 'team_leader' THEN
            RAISE EXCEPTION
                'Assigned Team Leader must have the team_leader role'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.pm_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_order_parts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_order_reopening_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY eq_del ON public.equipment AS PERMISSIVE FOR DELETE TO authenticated USING ((get_user_role() = 'admin'::text));

CREATE POLICY eq_read ON public.equipment AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY eq_upd ON public.equipment AS PERMISSIVE FOR UPDATE TO authenticated USING ((get_user_role() = ANY (ARRAY['admin'::text, 'superintendent'::text, 'team_leader'::text]))) WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'superintendent'::text, 'team_leader'::text])));

CREATE POLICY eq_write ON public.equipment AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'superintendent'::text, 'team_leader'::text])));

CREATE POLICY manager_deny_equipment_delete ON public.equipment AS RESTRICTIVE FOR DELETE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_equipment_insert ON public.equipment AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_equipment_update ON public.equipment AS RESTRICTIVE FOR UPDATE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text)) WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY password_change_read_guard ON public.equipment AS RESTRICTIVE FOR SELECT TO authenticated USING (( SELECT is_account_password_ready() AS is_account_password_ready));

CREATE POLICY inv_del ON public.inventory AS PERMISSIVE FOR DELETE TO authenticated USING ((get_user_role() = 'admin'::text));

CREATE POLICY inv_ins ON public.inventory AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'stock_keeper'::text, 'superintendent'::text, 'team_leader'::text])));

CREATE POLICY inv_read ON public.inventory AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY manager_deny_inventory_delete ON public.inventory AS RESTRICTIVE FOR DELETE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_inventory_insert ON public.inventory AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_inventory_update ON public.inventory AS RESTRICTIVE FOR UPDATE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text)) WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY password_change_read_guard ON public.inventory AS RESTRICTIVE FOR SELECT TO authenticated USING (( SELECT is_account_password_ready() AS is_account_password_ready));

CREATE POLICY password_reset_requests_read_own_or_admin ON public.password_reset_requests AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (is_account_password_ready() AND (get_user_role() = 'admin'::text))));

CREATE POLICY manager_deny_pm_delete ON public.pm_schedules AS RESTRICTIVE FOR DELETE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_pm_insert ON public.pm_schedules AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_pm_update ON public.pm_schedules AS RESTRICTIVE FOR UPDATE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text)) WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY password_change_read_guard ON public.pm_schedules AS RESTRICTIVE FOR SELECT TO authenticated USING (( SELECT is_account_password_ready() AS is_account_password_ready));

CREATE POLICY pm_del ON public.pm_schedules AS PERMISSIVE FOR DELETE TO authenticated USING ((get_user_role() = 'admin'::text));

CREATE POLICY pm_ins ON public.pm_schedules AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((get_user_role() = ANY (ARRAY['admin'::text, 'superintendent'::text])) OR ((get_user_role() = 'team_leader'::text) AND (status = 'pending_approval'::text))));

CREATE POLICY pm_read ON public.pm_schedules AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY pm_upd ON public.pm_schedules AS PERMISSIVE FOR UPDATE TO authenticated USING (((get_user_role() = ANY (ARRAY['admin'::text, 'superintendent'::text])) OR ((get_user_role() = 'team_leader'::text) AND (status = 'active'::text)))) WITH CHECK (((get_user_role() = ANY (ARRAY['admin'::text, 'superintendent'::text])) OR ((get_user_role() = 'team_leader'::text) AND (status = 'active'::text))));

CREATE POLICY manager_deny_users_delete ON public.users AS RESTRICTIVE FOR DELETE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_users_insert ON public.users AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_users_update ON public.users AS RESTRICTIVE FOR UPDATE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text)) WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY users_admin_insert ON public.users AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((get_user_role() = 'admin'::text));

CREATE POLICY users_admin_update ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING ((get_user_role() = 'admin'::text)) WITH CHECK ((get_user_role() = 'admin'::text));

CREATE POLICY users_directory_scope ON public.users AS RESTRICTIVE FOR SELECT TO authenticated USING (((id = auth.uid()) OR (COALESCE(get_user_role(), ''::text) = ANY (ARRAY['admin'::text, 'manager'::text, 'superintendent'::text]))));

CREATE POLICY users_read ON public.users AS PERMISSIVE FOR SELECT TO authenticated USING (((id = auth.uid()) OR (COALESCE(get_user_role(), ''::text) = ANY (ARRAY['admin'::text, 'manager'::text, 'superintendent'::text]))));

CREATE POLICY users_self_update_non_manager ON public.users AS PERMISSIVE FOR UPDATE TO authenticated USING (((id = auth.uid()) AND (COALESCE(get_user_role(), ''::text) <> 'manager'::text))) WITH CHECK (((id = auth.uid()) AND (role = get_user_role()) AND (COALESCE(get_user_role(), ''::text) <> 'manager'::text)));

CREATE POLICY manager_deny_wop_delete ON public.work_order_parts AS RESTRICTIVE FOR DELETE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_wop_insert ON public.work_order_parts AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_wop_update ON public.work_order_parts AS RESTRICTIVE FOR UPDATE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text)) WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY password_change_read_guard ON public.work_order_parts AS RESTRICTIVE FOR SELECT TO authenticated USING (( SELECT is_account_password_ready() AS is_account_password_ready));

CREATE POLICY wop_read ON public.work_order_parts AS PERMISSIVE FOR SELECT TO authenticated USING (true);

CREATE POLICY manager_deny_work_orders_delete ON public.work_orders AS RESTRICTIVE FOR DELETE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_work_orders_insert ON public.work_orders AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY manager_deny_work_orders_update ON public.work_orders AS RESTRICTIVE FOR UPDATE TO authenticated USING ((COALESCE(get_user_role(), ''::text) <> 'manager'::text)) WITH CHECK ((COALESCE(get_user_role(), ''::text) <> 'manager'::text));

CREATE POLICY password_change_read_guard ON public.work_orders AS RESTRICTIVE FOR SELECT TO authenticated USING (( SELECT is_account_password_ready() AS is_account_password_ready));

CREATE POLICY wo_del ON public.work_orders AS PERMISSIVE FOR DELETE TO authenticated USING ((get_user_role() = 'admin'::text));

CREATE POLICY wo_insert ON public.work_orders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((get_user_role() = ANY (ARRAY['admin'::text, 'superintendent'::text, 'team_leader'::text])) OR ((get_user_role() = 'shift_technician'::text) AND (assigned_to = auth.uid()))));

CREATE POLICY wo_read ON public.work_orders AS PERMISSIVE FOR SELECT TO authenticated USING (((get_user_role() <> ALL (ARRAY['technician'::text, 'shift_technician'::text])) OR (assigned_to = auth.uid())));

CREATE POLICY wo_upd ON public.work_orders AS PERMISSIVE FOR UPDATE TO authenticated USING (((get_user_role() = ANY (ARRAY['admin'::text, 'superintendent'::text, 'team_leader'::text])) OR ((get_user_role() = ANY (ARRAY['technician'::text, 'shift_technician'::text])) AND (assigned_to = auth.uid())))) WITH CHECK (((get_user_role() = ANY (ARRAY['admin'::text, 'superintendent'::text, 'team_leader'::text])) OR ((get_user_role() = ANY (ARRAY['technician'::text, 'shift_technician'::text])) AND (assigned_to = auth.uid()))));

CREATE TRIGGER trg_password_change_guard BEFORE INSERT OR DELETE OR UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION enforce_password_change_before_write();

CREATE TRIGGER trg_password_change_guard BEFORE INSERT OR DELETE OR UPDATE ON public.inventory FOR EACH ROW EXECUTE FUNCTION enforce_password_change_before_write();

CREATE TRIGGER trg_guard_team_leader_pm_updates BEFORE UPDATE ON public.pm_schedules FOR EACH ROW EXECUTE FUNCTION guard_team_leader_pm_updates();

CREATE TRIGGER trg_password_change_guard BEFORE INSERT OR DELETE OR UPDATE ON public.pm_schedules FOR EACH ROW EXECUTE FUNCTION enforce_password_change_before_write();

CREATE TRIGGER trg_admin_only_user_role_changes BEFORE UPDATE OF role ON public.users FOR EACH ROW WHEN ((old.role IS DISTINCT FROM new.role)) EXECUTE FUNCTION enforce_admin_only_user_role_changes();

CREATE TRIGGER trg_password_change_guard BEFORE INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION enforce_password_change_before_write();

CREATE TRIGGER trg_prevent_active_work_orders_user_delete BEFORE DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION prevent_user_deletion_with_active_work_orders();

CREATE TRIGGER trg_prevent_last_admin_deletion BEFORE DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION prevent_last_admin_deletion();

CREATE TRIGGER trg_prevent_last_admin_demotion BEFORE UPDATE OF role ON public.users FOR EACH ROW WHEN ((old.role IS DISTINCT FROM new.role)) EXECUTE FUNCTION prevent_last_admin_demotion();

CREATE TRIGGER trg_guard_completed_work_order_parts BEFORE INSERT OR DELETE OR UPDATE ON public.work_order_parts FOR EACH ROW EXECUTE FUNCTION guard_completed_work_order_parts();

CREATE TRIGGER trg_password_change_guard BEFORE INSERT OR DELETE OR UPDATE ON public.work_order_parts FOR EACH ROW EXECUTE FUNCTION enforce_password_change_before_write();

CREATE TRIGGER trg_enforce_work_order_status BEFORE INSERT OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION enforce_work_order_status_rules();

CREATE TRIGGER trg_guard_completed_work_order_updates BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION guard_completed_work_order_updates();

CREATE TRIGGER trg_guard_technician_work_order_columns BEFORE UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION guard_technician_work_order_columns();

CREATE TRIGGER trg_password_change_guard BEFORE INSERT OR DELETE OR UPDATE ON public.work_orders FOR EACH ROW EXECUTE FUNCTION enforce_password_change_before_write();

CREATE TRIGGER trg_record_work_order_reopening BEFORE UPDATE OF status ON public.work_orders FOR EACH ROW EXECUTE FUNCTION record_work_order_reopening();

CREATE TRIGGER trg_validate_work_order_assignments BEFORE INSERT OR UPDATE OF assigned_to, team_leader_id, created_by ON public.work_orders FOR EACH ROW EXECUTE FUNCTION validate_work_order_assignments();

REVOKE ALL ON TABLE public.auth_rate_limits FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.equipment FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.inventory FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.password_reset_requests FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.pm_schedules FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.users FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.work_order_parts FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.work_order_reopening_history FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.work_orders FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.adjust_stock(p_part_id uuid, p_delta integer) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_password_reset(p_request_id uuid, p_admin_id uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.consume_auth_rate_limit(p_bucket_key text, p_max_attempts integer, p_window_seconds integer) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.deduct_inventory_on_part_log() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_admin_only_user_role_changes() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_password_change_before_write() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_work_order_status_rules() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_completed_work_order_parts() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_completed_work_order_updates() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_team_leader_pm_updates() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.guard_technician_work_order_columns() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_account_password_ready() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.log_work_order_part(p_work_order_id uuid, p_part_id uuid, p_quantity_used integer) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_last_admin_deletion() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_last_admin_demotion() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.prevent_user_deletion_with_active_work_orders() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_work_order_reopening() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_work_order_assignments() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.adjust_stock(p_part_id uuid, p_delta integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.adjust_stock(p_part_id uuid, p_delta integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.claim_password_reset(p_request_id uuid, p_admin_id uuid) TO service_role;

GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(p_bucket_key text, p_max_attempts integer, p_window_seconds integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_on_part_log() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_on_part_log() TO anon;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_on_part_log() TO authenticated;

GRANT EXECUTE ON FUNCTION public.deduct_inventory_on_part_log() TO service_role;

GRANT EXECUTE ON FUNCTION public.enforce_admin_only_user_role_changes() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.enforce_admin_only_user_role_changes() TO anon;

GRANT EXECUTE ON FUNCTION public.enforce_admin_only_user_role_changes() TO authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_admin_only_user_role_changes() TO service_role;

GRANT EXECUTE ON FUNCTION public.enforce_password_change_before_write() TO service_role;

GRANT EXECUTE ON FUNCTION public.enforce_work_order_status_rules() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.enforce_work_order_status_rules() TO anon;

GRANT EXECUTE ON FUNCTION public.enforce_work_order_status_rules() TO authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_work_order_status_rules() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_role() TO service_role;

GRANT EXECUTE ON FUNCTION public.guard_completed_work_order_parts() TO service_role;

GRANT EXECUTE ON FUNCTION public.guard_completed_work_order_updates() TO service_role;

GRANT EXECUTE ON FUNCTION public.guard_team_leader_pm_updates() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.guard_team_leader_pm_updates() TO anon;

GRANT EXECUTE ON FUNCTION public.guard_team_leader_pm_updates() TO authenticated;

GRANT EXECUTE ON FUNCTION public.guard_team_leader_pm_updates() TO service_role;

GRANT EXECUTE ON FUNCTION public.guard_technician_work_order_columns() TO PUBLIC;

GRANT EXECUTE ON FUNCTION public.guard_technician_work_order_columns() TO anon;

GRANT EXECUTE ON FUNCTION public.guard_technician_work_order_columns() TO authenticated;

GRANT EXECUTE ON FUNCTION public.guard_technician_work_order_columns() TO service_role;

GRANT EXECUTE ON FUNCTION public.is_account_password_ready() TO authenticated;

GRANT EXECUTE ON FUNCTION public.is_account_password_ready() TO service_role;

GRANT EXECUTE ON FUNCTION public.log_work_order_part(p_work_order_id uuid, p_part_id uuid, p_quantity_used integer) TO authenticated;

GRANT EXECUTE ON FUNCTION public.log_work_order_part(p_work_order_id uuid, p_part_id uuid, p_quantity_used integer) TO service_role;

GRANT EXECUTE ON FUNCTION public.prevent_last_admin_deletion() TO service_role;

GRANT EXECUTE ON FUNCTION public.prevent_last_admin_demotion() TO service_role;

GRANT EXECUTE ON FUNCTION public.prevent_user_deletion_with_active_work_orders() TO service_role;

GRANT EXECUTE ON FUNCTION public.record_work_order_reopening() TO service_role;

GRANT EXECUTE ON FUNCTION public.validate_work_order_assignments() TO service_role;

GRANT DELETE ON TABLE public.auth_rate_limits TO service_role;

GRANT INSERT ON TABLE public.auth_rate_limits TO service_role;

GRANT MAINTAIN ON TABLE public.auth_rate_limits TO service_role;

GRANT REFERENCES ON TABLE public.auth_rate_limits TO service_role;

GRANT SELECT ON TABLE public.auth_rate_limits TO service_role;

GRANT TRIGGER ON TABLE public.auth_rate_limits TO service_role;

GRANT TRUNCATE ON TABLE public.auth_rate_limits TO service_role;

GRANT UPDATE ON TABLE public.auth_rate_limits TO service_role;

GRANT MAINTAIN ON TABLE public.equipment TO anon;

GRANT REFERENCES ON TABLE public.equipment TO anon;

GRANT DELETE ON TABLE public.equipment TO authenticated;

GRANT INSERT ON TABLE public.equipment TO authenticated;

GRANT MAINTAIN ON TABLE public.equipment TO authenticated;

GRANT REFERENCES ON TABLE public.equipment TO authenticated;

GRANT SELECT ON TABLE public.equipment TO authenticated;

GRANT UPDATE ON TABLE public.equipment TO authenticated;

GRANT DELETE ON TABLE public.equipment TO service_role;

GRANT INSERT ON TABLE public.equipment TO service_role;

GRANT MAINTAIN ON TABLE public.equipment TO service_role;

GRANT REFERENCES ON TABLE public.equipment TO service_role;

GRANT SELECT ON TABLE public.equipment TO service_role;

GRANT TRIGGER ON TABLE public.equipment TO service_role;

GRANT TRUNCATE ON TABLE public.equipment TO service_role;

GRANT UPDATE ON TABLE public.equipment TO service_role;

GRANT MAINTAIN ON TABLE public.inventory TO anon;

GRANT REFERENCES ON TABLE public.inventory TO anon;

GRANT DELETE ON TABLE public.inventory TO authenticated;

GRANT INSERT ON TABLE public.inventory TO authenticated;

GRANT MAINTAIN ON TABLE public.inventory TO authenticated;

GRANT REFERENCES ON TABLE public.inventory TO authenticated;

GRANT SELECT ON TABLE public.inventory TO authenticated;

GRANT DELETE ON TABLE public.inventory TO service_role;

GRANT INSERT ON TABLE public.inventory TO service_role;

GRANT MAINTAIN ON TABLE public.inventory TO service_role;

GRANT REFERENCES ON TABLE public.inventory TO service_role;

GRANT SELECT ON TABLE public.inventory TO service_role;

GRANT TRIGGER ON TABLE public.inventory TO service_role;

GRANT TRUNCATE ON TABLE public.inventory TO service_role;

GRANT UPDATE ON TABLE public.inventory TO service_role;

GRANT SELECT ON TABLE public.password_reset_requests TO authenticated;

GRANT DELETE ON TABLE public.password_reset_requests TO service_role;

GRANT INSERT ON TABLE public.password_reset_requests TO service_role;

GRANT MAINTAIN ON TABLE public.password_reset_requests TO service_role;

GRANT REFERENCES ON TABLE public.password_reset_requests TO service_role;

GRANT SELECT ON TABLE public.password_reset_requests TO service_role;

GRANT TRIGGER ON TABLE public.password_reset_requests TO service_role;

GRANT TRUNCATE ON TABLE public.password_reset_requests TO service_role;

GRANT UPDATE ON TABLE public.password_reset_requests TO service_role;

GRANT MAINTAIN ON TABLE public.pm_schedules TO anon;

GRANT REFERENCES ON TABLE public.pm_schedules TO anon;

GRANT DELETE ON TABLE public.pm_schedules TO authenticated;

GRANT INSERT ON TABLE public.pm_schedules TO authenticated;

GRANT MAINTAIN ON TABLE public.pm_schedules TO authenticated;

GRANT REFERENCES ON TABLE public.pm_schedules TO authenticated;

GRANT SELECT ON TABLE public.pm_schedules TO authenticated;

GRANT UPDATE ON TABLE public.pm_schedules TO authenticated;

GRANT DELETE ON TABLE public.pm_schedules TO service_role;

GRANT INSERT ON TABLE public.pm_schedules TO service_role;

GRANT MAINTAIN ON TABLE public.pm_schedules TO service_role;

GRANT REFERENCES ON TABLE public.pm_schedules TO service_role;

GRANT SELECT ON TABLE public.pm_schedules TO service_role;

GRANT TRIGGER ON TABLE public.pm_schedules TO service_role;

GRANT TRUNCATE ON TABLE public.pm_schedules TO service_role;

GRANT UPDATE ON TABLE public.pm_schedules TO service_role;

GRANT SELECT ON TABLE public.users TO authenticated;

GRANT UPDATE (full_name) ON TABLE public.users TO authenticated;

GRANT UPDATE (push_token) ON TABLE public.users TO authenticated;

GRANT UPDATE (role) ON TABLE public.users TO authenticated;

GRANT DELETE ON TABLE public.users TO service_role;

GRANT INSERT ON TABLE public.users TO service_role;

GRANT MAINTAIN ON TABLE public.users TO service_role;

GRANT REFERENCES ON TABLE public.users TO service_role;

GRANT SELECT ON TABLE public.users TO service_role;

GRANT TRIGGER ON TABLE public.users TO service_role;

GRANT TRUNCATE ON TABLE public.users TO service_role;

GRANT UPDATE ON TABLE public.users TO service_role;

GRANT MAINTAIN ON TABLE public.work_order_parts TO anon;

GRANT REFERENCES ON TABLE public.work_order_parts TO anon;

GRANT DELETE ON TABLE public.work_order_parts TO authenticated;

GRANT INSERT ON TABLE public.work_order_parts TO authenticated;

GRANT MAINTAIN ON TABLE public.work_order_parts TO authenticated;

GRANT REFERENCES ON TABLE public.work_order_parts TO authenticated;

GRANT SELECT ON TABLE public.work_order_parts TO authenticated;

GRANT UPDATE ON TABLE public.work_order_parts TO authenticated;

GRANT DELETE ON TABLE public.work_order_parts TO service_role;

GRANT INSERT ON TABLE public.work_order_parts TO service_role;

GRANT MAINTAIN ON TABLE public.work_order_parts TO service_role;

GRANT REFERENCES ON TABLE public.work_order_parts TO service_role;

GRANT SELECT ON TABLE public.work_order_parts TO service_role;

GRANT TRIGGER ON TABLE public.work_order_parts TO service_role;

GRANT TRUNCATE ON TABLE public.work_order_parts TO service_role;

GRANT UPDATE ON TABLE public.work_order_parts TO service_role;

GRANT DELETE ON TABLE public.work_order_reopening_history TO service_role;

GRANT INSERT ON TABLE public.work_order_reopening_history TO service_role;

GRANT MAINTAIN ON TABLE public.work_order_reopening_history TO service_role;

GRANT REFERENCES ON TABLE public.work_order_reopening_history TO service_role;

GRANT SELECT ON TABLE public.work_order_reopening_history TO service_role;

GRANT TRIGGER ON TABLE public.work_order_reopening_history TO service_role;

GRANT TRUNCATE ON TABLE public.work_order_reopening_history TO service_role;

GRANT UPDATE ON TABLE public.work_order_reopening_history TO service_role;

GRANT MAINTAIN ON TABLE public.work_orders TO anon;

GRANT REFERENCES ON TABLE public.work_orders TO anon;

GRANT DELETE ON TABLE public.work_orders TO authenticated;

GRANT INSERT ON TABLE public.work_orders TO authenticated;

GRANT MAINTAIN ON TABLE public.work_orders TO authenticated;

GRANT REFERENCES ON TABLE public.work_orders TO authenticated;

GRANT SELECT ON TABLE public.work_orders TO authenticated;

GRANT UPDATE ON TABLE public.work_orders TO authenticated;

GRANT DELETE ON TABLE public.work_orders TO service_role;

GRANT INSERT ON TABLE public.work_orders TO service_role;

GRANT MAINTAIN ON TABLE public.work_orders TO service_role;

GRANT REFERENCES ON TABLE public.work_orders TO service_role;

GRANT SELECT ON TABLE public.work_orders TO service_role;

GRANT TRIGGER ON TABLE public.work_orders TO service_role;

GRANT TRUNCATE ON TABLE public.work_orders TO service_role;

GRANT UPDATE ON TABLE public.work_orders TO service_role;


