-- =============================================================================
-- 019_pd_live_geofence_multistop.sql
-- Dropoff coords opcionales + vista live de assignments para el mapa.
-- ADITIVO. Sin MapTiler.
-- =============================================================================

ALTER TABLE public.pd_delivery_jobs
  ADD COLUMN IF NOT EXISTS customer_lat double precision,
  ADD COLUMN IF NOT EXISTS customer_lng double precision,
  ADD COLUMN IF NOT EXISTS delivery_sequence smallint DEFAULT 1;

COMMENT ON COLUMN public.pd_delivery_jobs.customer_lat IS
  'Latitud dropoff opcional (geocode futuro). Si NULL, mapa usa solo sucursal.';
COMMENT ON COLUMN public.pd_delivery_jobs.customer_lng IS
  'Longitud dropoff opcional.';

-- ---------------------------------------------------------------------------
-- Assignments activos enriquecidos (staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pd_list_live_assignments()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF NOT public.pd_is_staff() AND public.auth_user_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.assigned_at), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT
      a.id AS assignment_id,
      a.driver_profile_id,
      a.assigned_at,
      a.picked_up_at,
      a.status AS assignment_status,
      j.id AS job_id,
      j.ticket_code,
      j.customer_name,
      j.customer_address,
      j.customer_phone,
      j.status AS job_status,
      j.branch_id,
      j.customer_lat,
      j.customer_lng,
      j.delivery_sequence,
      j.order_total,
      dp.operational_status,
      dp.max_orders,
      p.full_name AS driver_name,
      (
        SELECT count(*)::int
        FROM public.pd_delivery_assignments a2
        WHERE a2.driver_profile_id = a.driver_profile_id
          AND a2.status = 'active'
      ) AS active_orders
    FROM public.pd_delivery_assignments a
    JOIN public.pd_delivery_jobs j ON j.id = a.job_id
    JOIN public.pd_driver_profiles dp ON dp.id = a.driver_profile_id
    LEFT JOIN public.profiles p ON p.id = dp.profile_id
    WHERE a.status = 'active'
      AND (
        public.auth_user_role() = 'super_admin'
        OR j.branch_id IS NULL
        OR j.branch_id = (
          SELECT pr.branch_id FROM public.profiles pr
          WHERE pr.auth_user_id = auth.uid()
          LIMIT 1
        )
        OR public.pd_is_staff()
      )
  ) t;

  RETURN jsonb_build_object('ok', true, 'assignments', v_out);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_list_live_assignments() TO authenticated;

-- Evaluar geocerca branch (haversine) server-side opcional
CREATE OR REPLACE FUNCTION public.pd_distance_meters(
  p_lat1 double precision,
  p_lng1 double precision,
  p_lat2 double precision,
  p_lng2 double precision
)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 2 * 6371000 * asin(least(1::double precision, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
    cos(radians(p_lat1)) * cos(radians(p_lat2)) *
    power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  )));
$$;

GRANT EXECUTE ON FUNCTION public.pd_distance_meters(double precision, double precision, double precision, double precision)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
