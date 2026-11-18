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