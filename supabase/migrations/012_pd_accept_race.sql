-- PollDriver 012 — Fase 5: accept concurrente (un solo ganador) + estado del repartidor
-- Endurece pd_accept_delivery_offer con lock de job + UNIQUE assignment + cleanup

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
  v_job_id UUID;
BEGIN
  v_driver_id := public.pd_my_driver_id();
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'No eres un repartidor registrado en PollDriver';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pd_driver_profiles
    WHERE id = v_driver_id AND admin_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Tu cuenta de repartidor no está aprobada';
  END IF;

  -- Resolver job_id sin lock aún
  SELECT job_id INTO v_job_id
  FROM public.pd_delivery_offers
  WHERE id = p_offer_id;

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'Oferta no encontrada';
  END IF;

  -- Lock de transacción por job (serializa aceptaciones del mismo pedido)
  PERFORM pg_advisory_xact_lock(hashtext(v_job_id::text));

  -- Lock fila del job primero (ganador único)
  SELECT * INTO v_job
  FROM public.pd_delivery_jobs
  WHERE id = v_job_id
  FOR UPDATE;

  IF v_job.status IN (
    'assigned', 'heading_to_branch', 'at_branch', 'picked_up',
    'delivering', 'delivered', 'cancelled'
  ) THEN
    UPDATE public.pd_delivery_offers
    SET status = 'taken_by_other', responded_at = COALESCE(responded_at, now())
    WHERE id = p_offer_id AND status = 'pending';
    RAISE EXCEPTION 'offer_already_taken';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pd_delivery_assignments
    WHERE job_id = v_job_id AND status = 'active'
  ) THEN
    UPDATE public.pd_delivery_offers
    SET status = 'taken_by_other', responded_at = COALESCE(responded_at, now())
    WHERE id = p_offer_id AND status = 'pending';
    RAISE EXCEPTION 'offer_already_taken';
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

  IF v_offer.status = 'taken_by_other' THEN
    RAISE EXCEPTION 'offer_already_taken';
  END IF;

  IF v_offer.status <> 'pending' THEN
    RAISE EXCEPTION 'La oferta ya no está disponible (% )', v_offer.status;
  END IF;

  IF v_offer.expires_at < now() THEN
    UPDATE public.pd_delivery_offers
    SET status = 'expired', responded_at = now()
    WHERE id = p_offer_id;
    RAISE EXCEPTION 'La oferta expiró';
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

  -- Marcar rivalidades
  UPDATE public.pd_delivery_offers
  SET status = 'taken_by_other', responded_at = now()
  WHERE job_id = v_job.id
    AND id <> p_offer_id
    AND status = 'pending';

  -- Liberar estado "offered" de los que perdieron
  UPDATE public.pd_driver_profiles d
  SET
    operational_status = CASE
      WHEN operational_status = 'offered' THEN 'available'
      ELSE operational_status
    END,
    updated_at = now()
  WHERE d.id IN (
    SELECT o.driver_profile_id
    FROM public.pd_delivery_offers o
    WHERE o.job_id = v_job.id
      AND o.id <> p_offer_id
      AND o.status = 'taken_by_other'
  )
  AND d.id <> v_driver_id;

  BEGIN
    INSERT INTO public.pd_delivery_assignments (job_id, driver_profile_id, offer_id, status)
    VALUES (v_job.id, v_driver_id, p_offer_id, 'active')
    RETURNING id INTO v_assignment_id;
  EXCEPTION
    WHEN unique_violation THEN
      UPDATE public.pd_delivery_offers
      SET status = 'taken_by_other', responded_at = now()
      WHERE id = p_offer_id;
      RAISE EXCEPTION 'offer_already_taken';
  END;

  UPDATE public.pd_delivery_jobs
  SET status = 'assigned', updated_at = now(), last_error = NULL
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
    jsonb_build_object(
      'job_id', v_job.id,
      'offer_id', p_offer_id,
      'order_id', v_job.source_order_id,
      'winner', true
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'assignment_id', v_assignment_id,
    'job_id', v_job.id,
    'order_id', v_job.source_order_id,
    'ticket_code', v_job.ticket_code,
    'status', 'assigned'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_accept_delivery_offer(UUID) TO authenticated;

-- Resumen del repartidor autenticado (capacidad + estado)
CREATE OR REPLACE FUNCTION public.pd_my_driver_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_d public.pd_driver_profiles%ROWTYPE;
  v_active INTEGER;
BEGIN
  SELECT * INTO v_d
  FROM public.pd_driver_profiles
  WHERE id = public.pd_my_driver_id();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_driver');
  END IF;

  SELECT COUNT(*) INTO v_active
  FROM public.pd_delivery_assignments
  WHERE driver_profile_id = v_d.id AND status = 'active';

  RETURN jsonb_build_object(
    'ok', true,
    'driver_profile_id', v_d.id,
    'admin_status', v_d.admin_status,
    'operational_status', v_d.operational_status,
    'max_orders', v_d.max_orders,
    'active_orders', v_active,
    'capacity_left', GREATEST(0, COALESCE(v_d.max_orders, 2) - v_active),
    'preferred_branch_id', v_d.preferred_branch_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_my_driver_summary() TO authenticated;

COMMENT ON FUNCTION public.pd_accept_delivery_offer(UUID) IS
  'PollDriver Fase 5: un solo ganador por job (advisory lock + UNIQUE assignment)';
