-- =============================================================================
-- 021_pd_branch_settings_rpc.sql
-- Configuración de despacho por sucursal (RapideX → Configuración)
-- ADITIVO. Solo staff / admin de sucursal.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.pd_is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_role() IN (
    'super_admin', 'admin_sucursal', 'administrador', 'despachador',
    'cajera', 'cajero', 'cocina', 'cocinero'
  );
$$;

CREATE OR REPLACE FUNCTION public.pd_get_branch_settings(p_branch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.auth_user_role();
  v_my_branch uuid := public.auth_user_branch_id();
  v_out jsonb;
BEGIN
  IF NOT public.pd_is_staff() AND v_role <> 'super_admin' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.display_order, t.name), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT
      b.id,
      b.slug,
      b.name,
      b.city,
      b.address,
      b.phone,
      b.whatsapp,
      b.opening_hours,
      b.delivery_eta,
      b.delivery_enabled,
      b.is_active,
      b.display_order,
      b.lat,
      b.lng,
      b.polldriver_enabled,
      b.arrival_radius_m
    FROM public.branches b
    WHERE b.is_active = true
      AND (
        v_role = 'super_admin'
        OR v_my_branch IS NULL
        OR b.id = v_my_branch
        OR public.pd_is_staff()
      )
      AND (p_branch_id IS NULL OR b.id = p_branch_id)
  ) t;

  RETURN jsonb_build_object('ok', true, 'branches', v_out);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_get_branch_settings(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pd_update_branch_dispatch_settings(
  p_branch_id uuid,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_whatsapp text DEFAULT NULL,
  p_opening_hours text DEFAULT NULL,
  p_delivery_eta text DEFAULT NULL,
  p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL,
  p_arrival_radius_m integer DEFAULT NULL,
  p_polldriver_enabled boolean DEFAULT NULL,
  p_delivery_enabled boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public.auth_user_role();
  v_my_branch uuid := public.auth_user_branch_id();
  v_row public.branches%ROWTYPE;
BEGIN
  IF v_role NOT IN ('super_admin', 'admin_sucursal', 'administrador', 'despachador') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_role <> 'super_admin' AND v_my_branch IS NOT NULL AND p_branch_id <> v_my_branch THEN
    RAISE EXCEPTION 'Solo puedes configurar tu sucursal';
  END IF;

  SELECT * INTO v_row FROM public.branches WHERE id = p_branch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sucursal no encontrada';
  END IF;

  IF p_lat IS NOT NULL AND (p_lat < -90 OR p_lat > 90) THEN
    RAISE EXCEPTION 'lat inválida';
  END IF;
  IF p_lng IS NOT NULL AND (p_lng < -180 OR p_lng > 180) THEN
    RAISE EXCEPTION 'lng inválida';
  END IF;
  IF p_arrival_radius_m IS NOT NULL AND (p_arrival_radius_m < 20 OR p_arrival_radius_m > 500) THEN
    RAISE EXCEPTION 'Radio de llegada debe estar entre 20 y 500 m';
  END IF;

  UPDATE public.branches SET
    address = COALESCE(p_address, address),
    phone = COALESCE(p_phone, phone),
    whatsapp = COALESCE(p_whatsapp, whatsapp),
    opening_hours = COALESCE(p_opening_hours, opening_hours),
    delivery_eta = COALESCE(p_delivery_eta, delivery_eta),
    lat = COALESCE(p_lat, lat),
    lng = COALESCE(p_lng, lng),
    arrival_radius_m = COALESCE(p_arrival_radius_m, arrival_radius_m),
    polldriver_enabled = COALESCE(p_polldriver_enabled, polldriver_enabled),
    delivery_enabled = COALESCE(p_delivery_enabled, delivery_enabled),
    updated_at = now()
  WHERE id = p_branch_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'ok', true,
    'branch', jsonb_build_object(
      'id', v_row.id,
      'name', v_row.name,
      'address', v_row.address,
      'phone', v_row.phone,
      'whatsapp', v_row.whatsapp,
      'opening_hours', v_row.opening_hours,
      'delivery_eta', v_row.delivery_eta,
      'lat', v_row.lat,
      'lng', v_row.lng,
      'arrival_radius_m', v_row.arrival_radius_m,
      'polldriver_enabled', v_row.polldriver_enabled,
      'delivery_enabled', v_row.delivery_enabled
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_update_branch_dispatch_settings(
  uuid, text, text, text, text, text, double precision, double precision, integer, boolean, boolean
) TO authenticated;

NOTIFY pgrst, 'reload schema';
