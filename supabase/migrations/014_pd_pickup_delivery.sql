-- PollDriver 014 — Fase 7: pickup / entrega → pedidos.estado (El Pollón)

DROP FUNCTION IF EXISTS public.pd_confirm_pickup(UUID);
DROP FUNCTION IF EXISTS public.pd_confirm_pickup(UUID, DOUBLE PRECISION, DOUBLE PRECISION);
DROP FUNCTION IF EXISTS public.pd_confirm_delivery(UUID);
DROP FUNCTION IF EXISTS public.pd_confirm_delivery(UUID, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.pd_confirm_pickup(
  p_assignment_id UUID,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL
)
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

  IF v_a.status <> 'active' THEN
    RAISE EXCEPTION 'La asignación no está activa';
  END IF;

  IF NOT public.pd_is_staff() AND v_a.driver_profile_id <> public.pd_my_driver_id() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v_a.picked_up_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'order_id', (SELECT source_order_id FROM public.pd_delivery_jobs WHERE id = v_a.job_id),
      'estado', 'en_delivery'
    );
  END IF;

  SELECT * INTO v_job FROM public.pd_delivery_jobs WHERE id = v_a.job_id FOR UPDATE;

  IF v_job.status NOT IN ('assigned', 'heading_to_branch', 'at_branch') THEN
    RAISE EXCEPTION 'El job no está listo para retiro (% )', v_job.status;
  END IF;

  UPDATE public.pd_delivery_assignments
  SET picked_up_at = now()
  WHERE id = p_assignment_id;

  UPDATE public.pd_delivery_jobs
  SET status = 'picked_up', updated_at = now(), last_error = NULL
  WHERE id = v_job.id;

  UPDATE public.pedidos
  SET estado = 'en_delivery'
  WHERE id = v_job.source_order_id
    AND estado NOT IN ('entregado', 'cancelado');

  UPDATE public.pd_driver_profiles
  SET operational_status = 'delivering', updated_at = now()
  WHERE id = v_a.driver_profile_id;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    INSERT INTO public.pd_driver_location_events (
      driver_profile_id, assignment_id, event_type, lat, lng, captured_at
    ) VALUES (
      v_a.driver_profile_id, p_assignment_id, 'picked_up', p_lat, p_lng, now()
    );
  END IF;

  INSERT INTO public.pd_audit_logs (actor_profile_id, action, entity_type, entity_id, payload)
  VALUES (
    public.auth_user_profile_id(),
    'confirm_pickup',
    'pd_delivery_assignment',
    p_assignment_id::text,
    jsonb_build_object(
      'job_id', v_job.id,
      'order_id', v_job.source_order_id,
      'pedido_estado', 'en_delivery'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_job.source_order_id,
    'ticket_code', v_job.ticket_code,
    'estado', 'en_delivery',
    'job_status', 'picked_up'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.pd_confirm_delivery(
  p_assignment_id UUID,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL
)
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

  SELECT * INTO v_job FROM public.pd_delivery_jobs WHERE id = v_a.job_id FOR UPDATE;

  IF v_a.status = 'completed' OR v_job.status = 'delivered' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'order_id', v_job.source_order_id,
      'estado', 'entregado'
    );
  END IF;

  IF v_a.status <> 'active' THEN
    RAISE EXCEPTION 'La asignación no está activa';
  END IF;

  IF v_a.picked_up_at IS NULL AND v_job.status NOT IN ('picked_up', 'delivering') THEN
    RAISE EXCEPTION 'Debes confirmar el retiro en el local antes de entregar';
  END IF;

  IF v_job.status NOT IN ('picked_up', 'delivering', 'assigned', 'heading_to_branch', 'at_branch') THEN
    RAISE EXCEPTION 'El job no se puede marcar entregado (% )', v_job.status;
  END IF;

  UPDATE public.pd_delivery_assignments
  SET
    delivered_at = now(),
    status = 'completed',
    picked_up_at = COALESCE(picked_up_at, now())
  WHERE id = p_assignment_id;

  UPDATE public.pd_delivery_jobs
  SET status = 'delivered', updated_at = now(), last_error = NULL
  WHERE id = v_job.id;

  UPDATE public.pedidos
  SET estado = 'entregado', entregado_en = now()
  WHERE id = v_job.source_order_id
    AND estado <> 'cancelado';

  SELECT COUNT(*) INTO v_active
  FROM public.pd_delivery_assignments
  WHERE driver_profile_id = v_a.driver_profile_id AND status = 'active';

  UPDATE public.pd_driver_profiles
  SET
    operational_status = CASE WHEN v_active > 0 THEN 'carrying_orders' ELSE 'available' END,
    updated_at = now()
  WHERE id = v_a.driver_profile_id;

  IF p_lat IS NOT NULL AND p_lng IS NOT NULL THEN
    INSERT INTO public.pd_driver_location_events (
      driver_profile_id, assignment_id, event_type, lat, lng, captured_at
    ) VALUES (
      v_a.driver_profile_id, p_assignment_id, 'delivered', p_lat, p_lng, now()
    );
  END IF;

  INSERT INTO public.pd_audit_logs (actor_profile_id, action, entity_type, entity_id, payload)
  VALUES (
    public.auth_user_profile_id(),
    'confirm_delivery',
    'pd_delivery_assignment',
    p_assignment_id::text,
    jsonb_build_object(
      'job_id', v_job.id,
      'order_id', v_job.source_order_id,
      'pedido_estado', 'entregado'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_job.source_order_id,
    'ticket_code', v_job.ticket_code,
    'estado', 'entregado',
    'job_status', 'delivered'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_confirm_pickup(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pd_confirm_delivery(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;

CREATE OR REPLACE FUNCTION public.pd_mark_heading_to_branch(p_assignment_id UUID)
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
  IF v_a.status <> 'active' THEN RAISE EXCEPTION 'Asignación inactiva'; END IF;

  SELECT * INTO v_job FROM public.pd_delivery_jobs WHERE id = v_a.job_id FOR UPDATE;
  IF v_job.status NOT IN ('assigned', 'heading_to_branch') THEN
    RETURN jsonb_build_object('ok', true, 'status', v_job.status, 'skipped', true);
  END IF;

  UPDATE public.pd_delivery_jobs
  SET status = 'heading_to_branch', updated_at = now()
  WHERE id = v_job.id;

  UPDATE public.pd_driver_profiles
  SET operational_status = 'heading_to_branch', updated_at = now()
  WHERE id = v_a.driver_profile_id;

  RETURN jsonb_build_object('ok', true, 'job_status', 'heading_to_branch');
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_mark_heading_to_branch(UUID) TO authenticated;

COMMENT ON FUNCTION public.pd_confirm_pickup(UUID, DOUBLE PRECISION, DOUBLE PRECISION) IS
  'PollDriver Fase 7: retiro → pedidos.estado = en_delivery';
COMMENT ON FUNCTION public.pd_confirm_delivery(UUID, DOUBLE PRECISION, DOUBLE PRECISION) IS
  'PollDriver Fase 7: entrega → pedidos.estado = entregado';
