-- PollDriver 013 — Fase 6: upsert GPS + eventos + realtime location
-- Depende de: 004 (tablas), 005 (RLS), 007 (publication location_latest)

CREATE OR REPLACE FUNCTION public.pd_upsert_driver_location(
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_accuracy DOUBLE PRECISION DEFAULT NULL,
  p_heading DOUBLE PRECISION DEFAULT NULL,
  p_speed DOUBLE PRECISION DEFAULT NULL,
  p_assignment_id UUID DEFAULT NULL,
  p_app_state TEXT DEFAULT 'foreground',
  p_sequence BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID;
  v_seq BIGINT;
  v_prev TIMESTAMPTZ;
  v_min_interval INTERVAL := interval '8 seconds';
BEGIN
  v_driver := public.pd_my_driver_id();
  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'No eres repartidor PollDriver';
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL
     OR p_lat < -90 OR p_lat > 90
     OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'Coordenadas inválidas';
  END IF;

  SELECT captured_at, sequence_number
    INTO v_prev, v_seq
  FROM public.pd_driver_location_latest
  WHERE driver_profile_id = v_driver;

  -- Anti-spam: mínimo 8s entre updates (salvo primer punto)
  IF v_prev IS NOT NULL AND v_prev > now() - v_min_interval THEN
    RETURN jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'throttle',
      'next_after_seconds', 8
    );
  END IF;

  v_seq := COALESCE(p_sequence, COALESCE(v_seq, 0) + 1);

  INSERT INTO public.pd_driver_location_latest AS loc (
    driver_profile_id, lat, lng, accuracy, heading, speed,
    captured_at, received_at, assignment_id, app_state, sequence_number
  ) VALUES (
    v_driver, p_lat, p_lng, p_accuracy, p_heading, p_speed,
    now(), now(), p_assignment_id, COALESCE(p_app_state, 'foreground'), v_seq
  )
  ON CONFLICT (driver_profile_id) DO UPDATE SET
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    accuracy = EXCLUDED.accuracy,
    heading = EXCLUDED.heading,
    speed = EXCLUDED.speed,
    captured_at = EXCLUDED.captured_at,
    received_at = now(),
    assignment_id = COALESCE(EXCLUDED.assignment_id, loc.assignment_id),
    app_state = EXCLUDED.app_state,
    sequence_number = EXCLUDED.sequence_number;

  -- Marcar connection_status del driver
  UPDATE public.pd_driver_profiles
  SET connection_status = 'connected', updated_at = now()
  WHERE id = v_driver;

  RETURN jsonb_build_object(
    'ok', true,
    'skipped', false,
    'driver_profile_id', v_driver,
    'lat', p_lat,
    'lng', p_lng,
    'sequence_number', v_seq,
    'captured_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_upsert_driver_location(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  DOUBLE PRECISION, UUID, TEXT, BIGINT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.pd_record_location_event(
  p_event_type TEXT,
  p_lat DOUBLE PRECISION,
  p_lng DOUBLE PRECISION,
  p_assignment_id UUID DEFAULT NULL,
  p_accuracy DOUBLE PRECISION DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver UUID;
  v_id UUID;
BEGIN
  v_driver := public.pd_my_driver_id();
  IF v_driver IS NULL AND NOT public.pd_is_staff() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF v_driver IS NULL THEN
    -- staff: necesita assignment para inferir driver
    SELECT driver_profile_id INTO v_driver
    FROM public.pd_delivery_assignments
    WHERE id = p_assignment_id;
  END IF;

  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'Repartidor no determinado';
  END IF;

  INSERT INTO public.pd_driver_location_events (
    driver_profile_id, assignment_id, event_type, lat, lng, accuracy, captured_at
  ) VALUES (
    v_driver, p_assignment_id, p_event_type, p_lat, p_lng, p_accuracy, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_record_location_event(
  TEXT, DOUBLE PRECISION, DOUBLE PRECISION, UUID, DOUBLE PRECISION
) TO authenticated;

-- Realtime (por si 007 no lo agregó)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pd_driver_location_latest;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

COMMENT ON FUNCTION public.pd_upsert_driver_location IS
  'PollDriver Fase 6: actualiza última posición (throttle 8s)';
