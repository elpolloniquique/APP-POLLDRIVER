-- PollDriver 006 — Funciones críticas (upsert job, accept offer, pickup, deliver)
-- SECURITY DEFINER: actualizan pedidos de El Pollón de forma controlada

CREATE TABLE IF NOT EXISTS public.pd_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pd_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pd_audit_staff ON public.pd_audit_logs;
CREATE POLICY pd_audit_staff ON public.pd_audit_logs
  FOR SELECT USING (public.pd_is_staff());
GRANT SELECT, INSERT ON public.pd_audit_logs TO authenticated;

-- Upsert job desde un pedido El Pollón (idempotente)
CREATE OR REPLACE FUNCTION public.pd_upsert_job_from_pedido(p_order_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pedido public.pedidos%ROWTYPE;
  v_job_id UUID;
  v_status TEXT;
  v_key TEXT;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado: %', p_order_id;
  END IF;

  IF lower(COALESCE(v_pedido.tipo_entrega, '')) <> 'delivery' THEN
    RETURN NULL; -- retiro/reserva no generan job
  END IF;

  -- Sucursal debe tener PollDriver activo (si la columna existe y es false, salir)
  IF v_pedido.branch_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.branches b
      WHERE b.id = v_pedido.branch_id
        AND COALESCE(b.polldriver_enabled, false) = false
    ) THEN
      RETURN NULL;
    END IF;
  END IF;

  IF v_pedido.estado = 'cancelado' THEN
    v_status := 'cancelled';
  ELSIF v_pedido.estado = 'entregado' THEN
    v_status := 'delivered';
  ELSIF v_pedido.estado IN ('en_delivery', 'listo') THEN
    v_status := 'delivering';
  ELSIF v_pedido.estado = 'preparando' THEN
    v_status := 'ready_for_dispatch';
  ELSE
    v_status := 'pending_prep';
  END IF;

  v_key := 'el_pollon_web:' || v_pedido.id;

  INSERT INTO public.pd_delivery_jobs AS j (
    source_system, source_order_id, branch_id, status,
    customer_name, customer_phone, customer_address,
    order_total, payment_method, ticket_code, idempotency_key, updated_at
  ) VALUES (
    'el_pollon_web',
    v_pedido.id,
    v_pedido.branch_id,
    v_status,
    COALESCE(v_pedido.cliente_nombre, ''),
    COALESCE(v_pedido.cliente_telefono, ''),
    COALESCE(v_pedido.cliente_direccion, ''),
    COALESCE(v_pedido.total, 0),
    COALESCE(v_pedido.metodo_pago, ''),
    COALESCE(v_pedido.codigo_pedido, ''),
    v_key,
    now()
  )
  ON CONFLICT (source_system, source_order_id) DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    customer_name = EXCLUDED.customer_name,
    customer_phone = EXCLUDED.customer_phone,
    customer_address = EXCLUDED.customer_address,
    order_total = EXCLUDED.order_total,
    payment_method = EXCLUDED.payment_method,
    ticket_code = EXCLUDED.ticket_code,
    updated_at = now(),
    -- No degradar un job ya asignado/en ruta si el pedido solo sigue preparando
    status = CASE
      WHEN j.status IN ('assigned', 'heading_to_branch', 'at_branch', 'picked_up', 'delivering', 'delivered')
           AND EXCLUDED.status IN ('pending_prep', 'ready_for_dispatch', 'searching_driver', 'offered')
        THEN j.status
      WHEN EXCLUDED.status = 'cancelled' THEN 'cancelled'
      WHEN EXCLUDED.status = 'delivered' THEN 'delivered'
      ELSE EXCLUDED.status
    END
  RETURNING id INTO v_job_id;

  -- Si cancelaron, cerrar ofertas pendientes
  IF v_status = 'cancelled' THEN
    UPDATE public.pd_delivery_offers
    SET status = 'expired', responded_at = COALESCE(responded_at, now())
    WHERE job_id = v_job_id AND status = 'pending';

    UPDATE public.pd_delivery_assignments
    SET status = 'cancelled'
    WHERE job_id = v_job_id AND status = 'active';
  END IF;

  RETURN v_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_upsert_job_from_pedido(TEXT) TO authenticated;

-- Aceptación concurrente segura
CREATE OR REPLACE FUNCTION public.pd_accept_delivery_offer(p_offer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.pd_delivery_offers%ROWTYPE;
  v_job public.pd_delivery_jobs%ROWTYPE;
  v_driver_id UUID;
  v_assignment_id UUID;
  v_active_count INTEGER;
  v_max INTEGER;
BEGIN
  v_driver_id := public.pd_my_driver_id();
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'No eres un repartidor registrado en PollDriver';
  END IF;

  SELECT * INTO v_offer
  FROM public.pd_delivery_offers
  WHERE id = p_offer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Oferta no encontrada';
  END IF;

  IF v_offer.driver_profile_id <> v_driver_id THEN
    RAISE EXCEPTION 'Esta oferta no te pertenece';
  END IF;

  IF v_offer.status <> 'pending' THEN
    RAISE EXCEPTION 'La oferta ya no está disponible (% )', v_offer.status;
  END IF;

  IF v_offer.expires_at < now() THEN
    UPDATE public.pd_delivery_offers SET status = 'expired', responded_at = now() WHERE id = p_offer_id;
    RAISE EXCEPTION 'La oferta expiró';
  END IF;

  SELECT * INTO v_job FROM public.pd_delivery_jobs WHERE id = v_offer.job_id FOR UPDATE;
  IF v_job.status IN ('assigned', 'heading_to_branch', 'at_branch', 'picked_up', 'delivering', 'delivered', 'cancelled') THEN
    UPDATE public.pd_delivery_offers SET status = 'taken_by_other', responded_at = now() WHERE id = p_offer_id;
    RAISE EXCEPTION 'offer_already_taken';
  END IF;

  SELECT COALESCE(max_orders, 2) INTO v_max
  FROM public.pd_driver_profiles WHERE id = v_driver_id;

  SELECT COUNT(*) INTO v_active_count
  FROM public.pd_delivery_assignments
  WHERE driver_profile_id = v_driver_id AND status = 'active';

  IF v_active_count >= v_max THEN
    RAISE EXCEPTION 'Capacidad completa (% / %)', v_active_count, v_max;
  END IF;

  UPDATE public.pd_delivery_offers
  SET status = 'accepted', responded_at = now()
  WHERE id = p_offer_id;

  UPDATE public.pd_delivery_offers
  SET status = 'taken_by_other', responded_at = now()
  WHERE job_id = v_job.id AND id <> p_offer_id AND status = 'pending';

  INSERT INTO public.pd_delivery_assignments (job_id, driver_profile_id, offer_id, status)
  VALUES (v_job.id, v_driver_id, p_offer_id, 'active')
  RETURNING id INTO v_assignment_id;

  UPDATE public.pd_delivery_jobs
  SET status = 'assigned', updated_at = now()
  WHERE id = v_job.id;

  UPDATE public.pd_driver_profiles
  SET operational_status = 'heading_to_branch', updated_at = now()
  WHERE id = v_driver_id;

  INSERT INTO public.pd_audit_logs (actor_profile_id, action, entity_type, entity_id, payload)
  VALUES (
    public.auth_user_profile_id(),
    'accept_offer',
    'pd_delivery_assignment',
    v_assignment_id::text,
    jsonb_build_object('job_id', v_job.id, 'offer_id', p_offer_id, 'order_id', v_job.source_order_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'job_id', v_job.id,
    'order_id', v_job.source_order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_accept_delivery_offer(UUID) TO authenticated;

-- Recogida → pedidos.estado = en_delivery
CREATE OR REPLACE FUNCTION public.pd_confirm_pickup(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.pd_delivery_assignments%ROWTYPE;
  v_job public.pd_delivery_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM public.pd_delivery_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asignación no encontrada'; END IF;

  IF NOT public.pd_is_staff() AND v_a.driver_profile_id <> public.pd_my_driver_id() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_job FROM public.pd_delivery_jobs WHERE id = v_a.job_id;

  UPDATE public.pd_delivery_assignments
  SET picked_up_at = now()
  WHERE id = p_assignment_id;

  UPDATE public.pd_delivery_jobs
  SET status = 'picked_up', updated_at = now()
  WHERE id = v_job.id;

  UPDATE public.pedidos
  SET estado = 'en_delivery'
  WHERE id = v_job.source_order_id
    AND estado NOT IN ('entregado', 'cancelado');

  UPDATE public.pd_driver_profiles
  SET operational_status = 'delivering', updated_at = now()
  WHERE id = v_a.driver_profile_id;

  RETURN jsonb_build_object('ok', true, 'order_id', v_job.source_order_id, 'estado', 'en_delivery');
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_confirm_pickup(UUID) TO authenticated;

-- Entrega → pedidos.estado = entregado
CREATE OR REPLACE FUNCTION public.pd_confirm_delivery(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_a public.pd_delivery_assignments%ROWTYPE;
  v_job public.pd_delivery_jobs%ROWTYPE;
  v_active INTEGER;
BEGIN
  SELECT * INTO v_a FROM public.pd_delivery_assignments WHERE id = p_assignment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asignación no encontrada'; END IF;

  IF NOT public.pd_is_staff() AND v_a.driver_profile_id <> public.pd_my_driver_id() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_job FROM public.pd_delivery_jobs WHERE id = v_a.job_id;

  UPDATE public.pd_delivery_assignments
  SET delivered_at = now(), status = 'completed'
  WHERE id = p_assignment_id;

  UPDATE public.pd_delivery_jobs
  SET status = 'delivered', updated_at = now()
  WHERE id = v_job.id;

  UPDATE public.pedidos
  SET estado = 'entregado', entregado_en = now()
  WHERE id = v_job.source_order_id
    AND estado <> 'cancelado';

  SELECT COUNT(*) INTO v_active
  FROM public.pd_delivery_assignments
  WHERE driver_profile_id = v_a.driver_profile_id AND status = 'active';

  UPDATE public.pd_driver_profiles
  SET operational_status = CASE WHEN v_active > 0 THEN 'carrying_orders' ELSE 'available' END,
      updated_at = now()
  WHERE id = v_a.driver_profile_id;

  RETURN jsonb_build_object('ok', true, 'order_id', v_job.source_order_id, 'estado', 'entregado');
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_confirm_delivery(UUID) TO authenticated;
