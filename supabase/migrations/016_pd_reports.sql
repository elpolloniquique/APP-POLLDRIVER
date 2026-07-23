-- PollDriver 016 — Fase 9: reportes / dashboard despacho

CREATE OR REPLACE FUNCTION public.pd_dispatch_report(
  p_from TIMESTAMPTZ DEFAULT (now() - interval '7 days'),
  p_to TIMESTAMPTZ DEFAULT now(),
  p_branch_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_branch UUID;
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
  v_jobs_total INTEGER;
  v_delivered INTEGER;
  v_cancelled INTEGER;
  v_in_progress INTEGER;
  v_ready INTEGER;
  v_fee_sum NUMERIC;
  v_offers_total INTEGER;
  v_offers_accepted INTEGER;
  v_avg_accept NUMERIC;
  v_avg_pickup NUMERIC;
  v_avg_deliver NUMERIC;
  v_by_status JSONB;
  v_by_day JSONB;
  v_top_drivers JSONB;
BEGIN
  v_role := public.auth_user_role();
  IF v_role NOT IN (
    'super_admin', 'admin_sucursal', 'administrador', 'cajera', 'cajero', 'cocina', 'cocinero'
  ) THEN
    RAISE EXCEPTION 'No autorizado para reportes';
  END IF;

  v_from := COALESCE(p_from, now() - interval '7 days');
  v_to := COALESCE(p_to, now());
  v_branch := p_branch_id;

  -- Admin sucursal: forzar su branch si no es super
  IF v_role IN ('admin_sucursal', 'administrador', 'cajera', 'cajero', 'cocina', 'cocinero')
     AND public.auth_user_branch_id() IS NOT NULL THEN
    IF v_branch IS NULL OR v_branch <> public.auth_user_branch_id() THEN
      -- cajera/cocina con branch: scope
      IF v_role <> 'super_admin' THEN
        v_branch := COALESCE(v_branch, public.auth_user_branch_id());
      END IF;
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_jobs_total
  FROM public.pd_delivery_jobs j
  WHERE j.created_at >= v_from AND j.created_at <= v_to
    AND (v_branch IS NULL OR j.branch_id = v_branch);

  SELECT
    COUNT(*) FILTER (WHERE j.status = 'delivered'),
    COUNT(*) FILTER (WHERE j.status = 'cancelled'),
    COUNT(*) FILTER (WHERE j.status IN (
      'assigned', 'heading_to_branch', 'at_branch', 'picked_up', 'delivering'
    )),
    COUNT(*) FILTER (WHERE j.status IN (
      'ready_for_dispatch', 'searching_driver', 'offered', 'pending_prep'
    )),
    COALESCE(SUM(j.delivery_fee_quoted) FILTER (WHERE j.status = 'delivered'), 0)
  INTO v_delivered, v_cancelled, v_in_progress, v_ready, v_fee_sum
  FROM public.pd_delivery_jobs j
  WHERE j.created_at >= v_from AND j.created_at <= v_to
    AND (v_branch IS NULL OR j.branch_id = v_branch);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE o.status = 'accepted')
  INTO v_offers_total, v_offers_accepted
  FROM public.pd_delivery_offers o
  JOIN public.pd_delivery_jobs j ON j.id = o.job_id
  WHERE o.created_at >= v_from AND o.created_at <= v_to
    AND (v_branch IS NULL OR j.branch_id = v_branch);

  -- Tiempos promedio (minutos)
  SELECT
    AVG(EXTRACT(EPOCH FROM (a.assigned_at - j.created_at)) / 60.0),
    AVG(EXTRACT(EPOCH FROM (a.picked_up_at - a.assigned_at)) / 60.0)
      FILTER (WHERE a.picked_up_at IS NOT NULL),
    AVG(EXTRACT(EPOCH FROM (a.delivered_at - a.picked_up_at)) / 60.0)
      FILTER (WHERE a.delivered_at IS NOT NULL AND a.picked_up_at IS NOT NULL)
  INTO v_avg_accept, v_avg_pickup, v_avg_deliver
  FROM public.pd_delivery_assignments a
  JOIN public.pd_delivery_jobs j ON j.id = a.job_id
  WHERE a.assigned_at >= v_from AND a.assigned_at <= v_to
    AND (v_branch IS NULL OR j.branch_id = v_branch);

  SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb)
  INTO v_by_status
  FROM (
    SELECT j.status, COUNT(*)::int AS cnt
    FROM public.pd_delivery_jobs j
    WHERE j.created_at >= v_from AND j.created_at <= v_to
      AND (v_branch IS NULL OR j.branch_id = v_branch)
    GROUP BY j.status
  ) s;

  SELECT COALESCE(jsonb_agg(day_row ORDER BY day), '[]'::jsonb)
  INTO v_by_day
  FROM (
    SELECT
      to_char(date_trunc('day', j.created_at), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS created,
      COUNT(*) FILTER (WHERE j.status = 'delivered')::int AS delivered,
      COUNT(*) FILTER (WHERE j.status = 'cancelled')::int AS cancelled
    FROM public.pd_delivery_jobs j
    WHERE j.created_at >= v_from AND j.created_at <= v_to
      AND (v_branch IS NULL OR j.branch_id = v_branch)
    GROUP BY date_trunc('day', j.created_at)
  ) day_row;

  SELECT COALESCE(jsonb_agg(d ORDER BY deliveries DESC), '[]'::jsonb)
  INTO v_top_drivers
  FROM (
    SELECT
      a.driver_profile_id,
      COALESCE(p.full_name, '') AS full_name,
      COUNT(*) FILTER (WHERE a.status = 'completed')::int AS deliveries,
      COUNT(*) FILTER (WHERE a.status = 'active')::int AS active_now,
      COALESCE(AVG(EXTRACT(EPOCH FROM (a.delivered_at - a.assigned_at)) / 60.0)
        FILTER (WHERE a.delivered_at IS NOT NULL), 0) AS avg_cycle_min
    FROM public.pd_delivery_assignments a
    JOIN public.pd_delivery_jobs j ON j.id = a.job_id
    JOIN public.pd_driver_profiles dp ON dp.id = a.driver_profile_id
    LEFT JOIN public.profiles p ON p.id = dp.profile_id
    WHERE a.assigned_at >= v_from AND a.assigned_at <= v_to
      AND (v_branch IS NULL OR j.branch_id = v_branch)
    GROUP BY a.driver_profile_id, p.full_name
    ORDER BY deliveries DESC
    LIMIT 10
  ) d;

  RETURN jsonb_build_object(
    'ok', true,
    'from', v_from,
    'to', v_to,
    'branch_id', v_branch,
    'kpis', jsonb_build_object(
      'jobs_total', v_jobs_total,
      'delivered', v_delivered,
      'cancelled', v_cancelled,
      'in_progress', v_in_progress,
      'ready_queue', v_ready,
      'delivery_fee_sum', trunc(COALESCE(v_fee_sum, 0)),
      'offers_total', v_offers_total,
      'offers_accepted', v_offers_accepted,
      'accept_rate', CASE
        WHEN COALESCE(v_offers_total, 0) = 0 THEN NULL
        ELSE round((v_offers_accepted::numeric / v_offers_total) * 100, 1)
      END,
      'avg_minutes_to_assign', CASE WHEN v_avg_accept IS NULL THEN NULL ELSE round(v_avg_accept, 1) END,
      'avg_minutes_to_pickup', CASE WHEN v_avg_pickup IS NULL THEN NULL ELSE round(v_avg_pickup, 1) END,
      'avg_minutes_to_deliver', CASE WHEN v_avg_deliver IS NULL THEN NULL ELSE round(v_avg_deliver, 1) END
    ),
    'by_status', v_by_status,
    'by_day', v_by_day,
    'top_drivers', v_top_drivers
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_dispatch_report(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

COMMENT ON FUNCTION public.pd_dispatch_report IS
  'PollDriver Fase 9: KPIs de despacho por rango de fechas / sucursal';
