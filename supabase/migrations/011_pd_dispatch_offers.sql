-- PollDriver 011 — Adapter despacho: búsqueda de repartidores + ofertas (Fase 4)
-- Depende de: 006 (upsert/accept), 007 (trigger pedidos), 010 (drivers)

-- Marcar disponibilidad del repartidor autenticado
CREATE OR REPLACE FUNCTION public.pd_set_my_operational_status(p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID;
BEGIN
  v_driver := public.pd_my_driver_id();
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'No eres repartidor PollDriver';
  END IF;

  IF p_status NOT IN (
    'offline', 'available', 'paused', 'location_unavailable', 'emergency'
  ) THEN
    RAISE EXCEPTION 'Estado operativo no permitido desde esta función';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pd_driver_profiles
    WHERE id = v_driver AND admin_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Tu cuenta de repartidor no está aprobada';
  END IF;

  UPDATE public.pd_driver_profiles
  SET operational_status = p_status, updated_at = now()
  WHERE id = v_driver;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_set_my_operational_status(TEXT) TO authenticated;

-- Expirar ofertas vencidas (job vuelve a ready si ninguna pending)
CREATE OR REPLACE FUNCTION public.pd_expire_stale_offers(p_job_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  r RECORD;
BEGIN
  UPDATE public.pd_delivery_offers
  SET status = 'expired', responded_at = COALESCE(responded_at, now())
  WHERE status = 'pending'
    AND expires_at < now()
    AND (p_job_id IS NULL OR job_id = p_job_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  FOR r IN
    SELECT j.id
    FROM public.pd_delivery_jobs j
    WHERE j.status IN ('searching_driver', 'offered')
      AND (p_job_id IS NULL OR j.id = p_job_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.pd_delivery_offers o
        WHERE o.job_id = j.id AND o.status = 'pending'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.pd_delivery_assignments a
        WHERE a.job_id = j.id AND a.status = 'active'
      )
  LOOP
    UPDATE public.pd_delivery_jobs
    SET status = 'ready_for_dispatch', updated_at = now()
    WHERE id = r.id;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_expire_stale_offers(UUID) TO authenticated;

-- Elegibles: aprobados, capacidad libre, misma sucursal (o sin preferencia)
CREATE OR REPLACE FUNCTION public.pd_eligible_driver_ids(p_branch_id UUID)
RETURNS TABLE (driver_profile_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id
  FROM public.pd_driver_profiles d
  WHERE d.admin_status = 'approved'
    AND d.operational_status IN ('available', 'offline', 'carrying_orders', 'paused')
    AND (d.preferred_branch_id IS NULL OR d.preferred_branch_id = p_branch_id OR p_branch_id IS NULL)
    AND (
      SELECT COUNT(*) FROM public.pd_delivery_assignments a
      WHERE a.driver_profile_id = d.id AND a.status = 'active'
    ) < COALESCE(d.max_orders, 2);
$$;

-- Iniciar / reiniciar búsqueda: crea ofertas pending
CREATE OR REPLACE FUNCTION public.pd_start_driver_search(
  p_job_id UUID,
  p_ttl_seconds INTEGER DEFAULT 90,
  p_auto BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.pd_delivery_jobs%ROWTYPE;
  v_ttl INTEGER;
  v_driver UUID;
  v_offers INTEGER := 0;
  v_expires TIMESTAMPTZ;
BEGIN
  -- Staff siempre; auto solo desde trigger/upsert interno (security definer)
  IF NOT p_auto AND NOT public.pd_is_staff() AND public.auth_user_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'No autorizado para despachar';
  END IF;

  PERFORM public.pd_expire_stale_offers(p_job_id);

  SELECT * INTO v_job FROM public.pd_delivery_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job no encontrado';
  END IF;

  IF v_job.status IN ('assigned', 'heading_to_branch', 'at_branch', 'picked_up', 'delivering', 'delivered', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'job_not_dispatchable', 'status', v_job.status);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.pd_delivery_assignments
    WHERE job_id = p_job_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_assigned');
  END IF;

  v_ttl := GREATEST(30, LEAST(COALESCE(p_ttl_seconds, 90), 600));
  v_expires := now() + make_interval(secs => v_ttl);

  -- Cerrar pendientes previas de este job
  UPDATE public.pd_delivery_offers
  SET status = 'expired', responded_at = COALESCE(responded_at, now())
  WHERE job_id = p_job_id AND status = 'pending';

  UPDATE public.pd_delivery_jobs
  SET status = 'searching_driver', updated_at = now(), last_error = NULL
  WHERE id = p_job_id;

  FOR v_driver IN
    SELECT e.driver_profile_id FROM public.pd_eligible_driver_ids(v_job.branch_id) e
  LOOP
    INSERT INTO public.pd_delivery_offers (job_id, driver_profile_id, status, expires_at)
    VALUES (p_job_id, v_driver, 'pending', v_expires)
    ON CONFLICT (job_id, driver_profile_id) DO UPDATE SET
      status = 'pending',
      expires_at = EXCLUDED.expires_at,
      responded_at = NULL,
      created_at = now();

    UPDATE public.pd_driver_profiles
    SET operational_status = CASE
      WHEN operational_status IN ('available', 'offline', 'paused') THEN 'offered'
      ELSE operational_status
    END,
    updated_at = now()
    WHERE id = v_driver;

    v_offers := v_offers + 1;
  END LOOP;

  IF v_offers = 0 THEN
    UPDATE public.pd_delivery_jobs
    SET
      status = 'ready_for_dispatch',
      last_error = 'Sin repartidores elegibles (aprobados con capacidad en la sucursal)',
      updated_at = now()
    WHERE id = p_job_id;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'no_eligible_drivers',
      'job_id', p_job_id,
      'offers', 0
    );
  END IF;

  UPDATE public.pd_delivery_jobs
  SET status = 'offered', updated_at = now()
  WHERE id = p_job_id;

  INSERT INTO public.pd_audit_logs (actor_profile_id, action, entity_type, entity_id, payload)
  VALUES (
    public.auth_user_profile_id(),
    CASE WHEN p_auto THEN 'auto_start_search' ELSE 'start_driver_search' END,
    'pd_delivery_job',
    p_job_id::text,
    jsonb_build_object('offers', v_offers, 'ttl_seconds', v_ttl, 'expires_at', v_expires)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', p_job_id,
    'offers', v_offers,
    'expires_at', v_expires,
    'status', 'offered'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_start_driver_search(UUID, INTEGER, BOOLEAN) TO authenticated;

-- Rechazar oferta (repartidor)
CREATE OR REPLACE FUNCTION public.pd_reject_delivery_offer(p_offer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.pd_delivery_offers%ROWTYPE;
  v_driver UUID;
  v_pending INTEGER;
BEGIN
  v_driver := public.pd_my_driver_id();
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'No eres repartidor';
  END IF;

  SELECT * INTO v_offer FROM public.pd_delivery_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Oferta no encontrada'; END IF;
  IF v_offer.driver_profile_id <> v_driver THEN RAISE EXCEPTION 'Oferta ajena'; END IF;
  IF v_offer.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'status', v_offer.status);
  END IF;

  UPDATE public.pd_delivery_offers
  SET status = 'rejected', responded_at = now()
  WHERE id = p_offer_id;

  UPDATE public.pd_driver_profiles
  SET operational_status = 'available', updated_at = now()
  WHERE id = v_driver AND operational_status = 'offered';

  SELECT COUNT(*) INTO v_pending
  FROM public.pd_delivery_offers
  WHERE job_id = v_offer.job_id AND status = 'pending';

  IF v_pending = 0 THEN
    UPDATE public.pd_delivery_jobs
    SET status = 'ready_for_dispatch', updated_at = now()
    WHERE id = v_offer.job_id
      AND status IN ('searching_driver', 'offered');
  END IF;

  RETURN jsonb_build_object('ok', true, 'job_id', v_offer.job_id, 'pending_left', v_pending);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_reject_delivery_offer(UUID) TO authenticated;

-- Extender upsert: al quedar ready_for_dispatch, auto-buscar repartidores
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
  v_prev TEXT;
BEGIN
  SELECT * INTO v_pedido FROM public.pedidos WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado: %', p_order_id;
  END IF;

  IF lower(COALESCE(v_pedido.tipo_entrega, '')) <> 'delivery' THEN
    RETURN NULL;
  END IF;

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

  SELECT status INTO v_prev
  FROM public.pd_delivery_jobs
  WHERE source_system = 'el_pollon_web' AND source_order_id = v_pedido.id;

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
    status = CASE
      WHEN j.status IN ('assigned', 'heading_to_branch', 'at_branch', 'picked_up', 'delivering', 'delivered')
           AND EXCLUDED.status IN ('pending_prep', 'ready_for_dispatch', 'searching_driver', 'offered')
        THEN j.status
      WHEN EXCLUDED.status = 'cancelled' THEN 'cancelled'
      WHEN EXCLUDED.status = 'delivered' THEN 'delivered'
      -- No pisar búsqueda/ofertas activas si el pedido sigue en preparando
      WHEN j.status IN ('searching_driver', 'offered')
           AND EXCLUDED.status = 'ready_for_dispatch'
        THEN j.status
      ELSE EXCLUDED.status
    END
  RETURNING id INTO v_job_id;

  IF v_status = 'cancelled' THEN
    UPDATE public.pd_delivery_offers
    SET status = 'expired', responded_at = COALESCE(responded_at, now())
    WHERE job_id = v_job_id AND status = 'pending';

    UPDATE public.pd_delivery_assignments
    SET status = 'cancelled'
    WHERE job_id = v_job_id AND status = 'active';
  END IF;

  -- Adapter: al entrar a ready_for_dispatch (nuevo o desde pending_prep), auto-ofertar
  IF v_status = 'ready_for_dispatch'
     AND COALESCE(v_prev, '') NOT IN ('ready_for_dispatch', 'searching_driver', 'offered', 'assigned', 'heading_to_branch', 'at_branch', 'picked_up', 'delivering', 'delivered')
  THEN
    PERFORM public.pd_start_driver_search(v_job_id, 90, true);
  END IF;

  RETURN v_job_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_upsert_job_from_pedido(TEXT) TO authenticated;

-- Realtime ofertas
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pd_delivery_offers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pd_delivery_assignments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMENT ON FUNCTION public.pd_start_driver_search(UUID, INTEGER, BOOLEAN) IS
  'PollDriver Fase 4: crea ofertas a repartidores elegibles de la sucursal';
