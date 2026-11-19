
-- ============================================================
-- MAINTFLOW PHASE 1 DATABASE HOTFIX
-- Apply AFTER security_policies.sql
-- ============================================================

BEGIN;
-- Remove legacy trigger that causes duplicate inventory deductions.
DROP TRIGGER IF EXISTS trg_deduct_inventory
ON public.work_order_parts;
-- ============================================================
-- 1. WORK ORDER INSERT POLICY
-- Remove overlapping permissive policies.
-- Shift Technicians can only assign work orders to themselves.
-- ============================================================

DROP POLICY IF EXISTS wo_ins ON public.work_orders;
DROP POLICY IF EXISTS wo_insert ON public.work_orders;

CREATE POLICY wo_insert
ON public.work_orders
FOR INSERT
TO authenticated
WITH CHECK (
  public.get_user_role() IN (
    'admin',
    'superintendent',
    'team_leader'
  )
  OR (
    public.get_user_role() = 'shift_technician'
    AND assigned_to = auth.uid()
  )
);


-- ============================================================
-- 2. PREVENTIVE MAINTENANCE UPDATE POLICY
-- ============================================================

DROP POLICY IF EXISTS pm_upd ON public.pm_schedules;

CREATE POLICY pm_upd
ON public.pm_schedules
FOR UPDATE
TO authenticated
USING (
    public.get_user_role() IN ('admin', 'superintendent')
    OR (
        public.get_user_role() = 'team_leader'
        AND status = 'active'
    )
)
WITH CHECK (
    public.get_user_role() IN ('admin', 'superintendent')
    OR (
        public.get_user_role() = 'team_leader'
        AND status = 'active'
    )
);


-- ============================================================
-- 3. REMOVE OLD DUPLICATE WORK ORDER STATUS TRIGGER
-- Keep trg_enforce_work_order_status as the main guard.
-- ============================================================

DROP TRIGGER IF EXISTS trg_guard_wo_status
ON public.work_orders;

DROP FUNCTION IF EXISTS public.guard_wo_status();


-- ============================================================
-- 4. REMOVE OBSOLETE INVENTORY DEDUCTION FUNCTIONS
-- All spare-part consumption must use log_work_order_part.
-- ============================================================

DROP FUNCTION IF EXISTS
public.deduct_spare_part(uuid, integer);

DROP FUNCTION IF EXISTS
public.deduct_spare_part(uuid, integer, uuid);


-- ============================================================
-- 5. ATOMIC INVENTORY ADJUSTMENT FUNCTION
-- Positive delta = restock.
-- Negative delta = deduction/adjustment.
-- Never permits negative inventory.
-- ============================================================

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_part_id uuid,
  p_delta integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public

AS $$

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
$$;


REVOKE ALL ON FUNCTION
public.adjust_stock(uuid, integer)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.adjust_stock(uuid, integer)
TO authenticated;


-- ============================================================
-- 6. ATOMIC WORK ORDER PART LOGGING
-- Records spare-part usage AND deducts inventory.
-- Both operations succeed together or fail together.
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_work_order_part(
  p_work_order_id uuid,
  p_part_id uuid,
  p_quantity_used integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public

AS $$

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
$$;


-- Restrict direct execution to authenticated users.
REVOKE ALL ON FUNCTION
public.log_work_order_part(uuid, uuid, integer)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
public.log_work_order_part(uuid, uuid, integer)
TO authenticated;


COMMIT;

-- ============================================================
-- PHASE 1 HOTFIX COMPLETED
-- ============================================================
