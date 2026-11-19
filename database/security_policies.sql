-- Explicitly enable RLS on all application tables
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.work_order_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pm_schedules ENABLE ROW LEVEL SECURITY;


-- Reset every policy on these tables
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname='public'
             AND tablename IN ('users','equipment','inventory','work_orders','pm_schedules','work_order_parts')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

ALTER TABLE public.work_order_parts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_user_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT role FROM public.users WHERE id = auth.uid() $$;
REVOKE ALL ON FUNCTION public.get_user_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;

-- users: nobody but admin can change a role (closes C2)
CREATE POLICY users_read ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY users_admin_all ON users FOR ALL TO authenticated
  USING (get_user_role() = 'admin') WITH CHECK (get_user_role() = 'admin');
CREATE POLICY users_self_update ON users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = get_user_role());

-- equipment
CREATE POLICY eq_read  ON equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY eq_write ON equipment FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin','superintendent','team_leader'));
CREATE POLICY eq_upd   ON equipment FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin','superintendent','team_leader'))
  WITH CHECK (get_user_role() IN ('admin','superintendent','team_leader'));
CREATE POLICY eq_del   ON equipment FOR DELETE TO authenticated USING (get_user_role() = 'admin');
-- Create or replace deduct_spare_part with strict role enforcement
CREATE OR REPLACE FUNCTION public.deduct_spare_part(
  p_part_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- 1. Require an authenticated user
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: authentication required';
  END IF;

  -- 2. Look up caller role
  SELECT role INTO v_role
  FROM public.users
  WHERE id = auth.uid();

  -- 3. Block manager (view-only) and any unrecognized role
  IF v_role IS NULL OR v_role = 'manager' THEN
    RAISE EXCEPTION 'Forbidden: role "%" is not allowed to deduct spare parts', COALESCE(v_role, 'none');
  END IF;

  -- 4. Validate quantity
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid quantity: must be greater than 0';
  END IF;

  -- 5. Deduct stock safely
  UPDATE public.inventory
  SET stock_quantity = stock_quantity - p_quantity
  WHERE id = p_part_id
    AND stock_quantity >= p_quantity;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient stock or part not found';
  END IF;
END;
$$;

-- Lock down function execution permissions
REVOKE ALL ON FUNCTION public.deduct_spare_part(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_spare_part(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.deduct_spare_part(uuid, integer) TO authenticated;
-- inventory (matches Permissions.canManageInventory)
CREATE POLICY inv_read ON inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY inv_ins  ON inventory FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin','stock_keeper','superintendent','team_leader'));
CREATE POLICY inv_upd  ON inventory FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin','stock_keeper','superintendent','team_leader'))
  WITH CHECK (get_user_role() IN ('admin','stock_keeper','superintendent','team_leader'));
CREATE POLICY inv_del  ON inventory FOR DELETE TO authenticated USING (get_user_role() = 'admin');

-- work_orders
CREATE POLICY wo_read ON work_orders FOR SELECT TO authenticated
  USING (get_user_role() NOT IN ('technician','shift_technician') OR assigned_to = auth.uid());
CREATE POLICY wo_ins  ON work_orders FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin','superintendent','team_leader','shift_technician'));
CREATE POLICY wo_upd  ON work_orders FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin','superintendent','team_leader')
         OR (get_user_role() IN ('technician','shift_technician') AND assigned_to = auth.uid()))
  WITH CHECK (get_user_role() IN ('admin','superintendent','team_leader')
         OR (get_user_role() IN ('technician','shift_technician') AND assigned_to = auth.uid()));
CREATE POLICY wo_del  ON work_orders FOR DELETE TO authenticated USING (get_user_role() = 'admin');

-- only TL and above may verify and close
CREATE OR REPLACE FUNCTION public.guard_wo_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'verified_closed'
     AND public.get_user_role() NOT IN ('admin','superintendent','team_leader') THEN
    RAISE EXCEPTION 'Only a Team Leader or above can close a work order';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_wo_status BEFORE UPDATE ON work_orders
  FOR EACH ROW EXECUTE FUNCTION guard_wo_status();

-- pm_schedules: TL can only create or hold pending items; Supt and Admin approve
CREATE POLICY pm_read ON pm_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY pm_ins  ON pm_schedules FOR INSERT TO authenticated
  WITH CHECK (get_user_role() IN ('admin','superintendent')
              OR (get_user_role() = 'team_leader' AND status = 'pending_approval'));
CREATE POLICY pm_upd  ON pm_schedules FOR UPDATE TO authenticated
  USING (get_user_role() IN ('admin','superintendent','team_leader'))
  WITH CHECK (get_user_role() IN ('admin','superintendent')
              OR (get_user_role() = 'team_leader' AND status IN ('pending_approval','completed')));
CREATE POLICY pm_del  ON pm_schedules FOR DELETE TO authenticated USING (get_user_role() = 'admin');

-- work_order_parts: read only; writes go through the RPC (no INSERT policy = denied)
CREATE POLICY wop_read ON work_order_parts FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.deduct_spare_part(p_part_id uuid, p_quantity int, p_work_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_user_role() IS NULL
     OR public.get_user_role() IN ('manager','stock_keeper') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN RAISE EXCEPTION 'Quantity must be at least 1'; END IF;
  UPDATE inventory SET stock_quantity = stock_quantity - p_quantity, updated_at = now()
   WHERE id = p_part_id AND stock_quantity >= p_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock'; END IF;
  INSERT INTO work_order_parts (work_order_id, part_id, quantity_used, logged_by)
  VALUES (p_work_order_id, p_part_id, p_quantity, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.adjust_stock(p_part_id uuid, p_delta int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.get_user_role() NOT IN ('admin','stock_keeper','superintendent','team_leader') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE inventory SET stock_quantity = GREATEST(0, stock_quantity + p_delta), updated_at = now()
   WHERE id = p_part_id;
END $$;

REVOKE ALL ON FUNCTION public.deduct_spare_part(uuid,int,uuid), public.adjust_stock(uuid,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.deduct_spare_part(uuid,int,uuid), public.adjust_stock(uuid,int) TO authenticated;

-- Adjust policy name if yours is named differently (e.g., "wo_insert")
drop policy if exists "wo_insert" on public.work_orders;

create policy "wo_insert"
on public.work_orders
for insert
to authenticated
with check (
  -- Roles that can assign work orders to any valid user
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role in ('admin', 'superintendent', 'team_leader')
  )
  or (
    -- Shift technicians can only create work orders assigned to themselves
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'shift_technician'
    )
    and assigned_to = auth.uid()
  )
);

alter table public.work_orders
  drop constraint if exists work_orders_title_not_blank;

alter table public.work_orders
  add constraint work_orders_title_not_blank
  check (char_length(btrim(title)) > 0);

  -- Example trigger function enforcing valid initial & transitioned statuses
create or replace function public.enforce_work_order_status_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role text;
begin
  select role into actor_role
  from public.users
  where id = auth.uid();

  if tg_op = 'INSERT' then
    -- New work orders must start as 'assigned' (unless an authorized supervisory role sets another valid initial state if needed)
    if new.status is distinct from 'assigned' then
      raise exception 'New work orders must be created with status ''assigned''';
    end if;

    return new;
  end if;

  -- Existing UPDATE transition / role checks stay here
  if tg_op = 'UPDATE' then
    if new.status = 'verified_closed'
       and coalesce(actor_role, '') not in ('admin', 'superintendent', 'team_leader') then
      raise exception 'Role ''%'' is not permitted to set status to ''verified_closed''', coalesce(actor_role, 'unknown');
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_work_order_status on public.work_orders;

create trigger trg_enforce_work_order_status
before insert or update on public.work_orders
for each row
execute function public.enforce_work_order_status_rules();



create or replace function public.enforce_work_order_status_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;


create or replace function public.log_work_order_part(
  p_work_order_id uuid,
  p_part_id uuid,
  p_quantity_used integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_wo_status text;
  v_current_stock integer;
begin
  if v_actor_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_quantity_used is null or p_quantity_used <= 0 then
    raise exception 'Quantity used must be greater than 0';
  end if;

  select role into v_actor_role
  from public.users
  where id = v_actor_id;

  if coalesce(v_actor_role, '') not in ('technician', 'shift_technician', 'team_leader', 'superintendent', 'admin') then
    raise exception 'Role ''%'' is not permitted to log spare parts', coalesce(v_actor_role, 'unknown');
  end if;

  select status into v_wo_status
  from public.work_orders
  where id = p_work_order_id;

  if not found then
    raise exception 'Work order not found';
  end if;

  if v_wo_status = 'verified_closed' then
    raise exception 'Cannot log parts on a verified_closed work order';
  end if;

  -- Lock the inventory row to prevent race conditions
  select stock_quantity into v_current_stock
  from public.inventory
  where id = p_part_id
  for update;

  if not found then
    raise exception 'Spare part not found';
  end if;

  if v_current_stock < p_quantity_used then
    raise exception 'Insufficient stock: available %, requested %', v_current_stock, p_quantity_used;
  end if;

  insert into public.work_order_parts (
    work_order_id,
    part_id,
    quantity_used,
    logged_by
  )
  values (
    p_work_order_id,
    p_part_id,
    p_quantity_used,
    v_actor_id
  );

  update public.inventory
  set stock_quantity = stock_quantity - p_quantity_used
  where id = p_part_id;
end;
$$;

grant execute on function public.log_work_order_part(uuid, uuid, integer) to authenticated;

create or replace function public.log_work_order_part(
  p_work_order_id uuid,
  p_part_id uuid,
  p_quantity_used integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_wo_status text;
  v_current_stock integer;
begin
  if v_actor_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_quantity_used is null or p_quantity_used <= 0 then
    raise exception 'Quantity used must be greater than 0';
  end if;

  select role into v_actor_role
  from public.users
  where id = v_actor_id;

  if coalesce(v_actor_role, '') not in ('technician', 'shift_technician', 'team_leader', 'superintendent', 'admin') then
    raise exception 'Role ''%'' is not permitted to log spare parts', coalesce(v_actor_role, 'unknown');
  end if;

  select status into v_wo_status
  from public.work_orders
  where id = p_work_order_id;

  if not found then
    raise exception 'Work order not found';
  end if;

  if v_wo_status = 'verified_closed' then
    raise exception 'Cannot log parts on a verified_closed work order';
  end if;

  -- Lock the inventory row and validate sufficient stock
  select stock_quantity into v_current_stock
  from public.inventory
  where id = p_part_id
  for update;

  if not found then
    raise exception 'Spare part not found';
  end if;

  if v_current_stock < p_quantity_used then
    raise exception 'Insufficient stock: available %, requested %', v_current_stock, p_quantity_used;
  end if;

  -- Insert row; the existing AFTER INSERT trigger on work_order_parts deducts stock once
  insert into public.work_order_parts (
    work_order_id,
    part_id,
    quantity_used,
    logged_by
  )
  values (
    p_work_order_id,
    p_part_id,
    p_quantity_used,
    v_actor_id
  );
end;
$$;