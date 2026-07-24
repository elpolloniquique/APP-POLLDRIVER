-- =============================================================================
-- 018_pd_live_tracking.sql
-- Live tracking: sesiones, geocercas, historial de estado.
-- ADITIVO — reutiliza pd_driver_location_* existentes. No MapTiler.
-- =============================================================================

-- PostGIS opcional (Supabase lo tiene en la mayoría de proyectos)
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'postgis no disponible — se usará haversine';
END $$;

-- ---------------------------------------------------------------------------
-- Sesiones de rastreo (1 por assignment activa)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pd_tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id uuid NOT NULL REFERENCES public.pd_driver_profiles(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.pd_delivery_assignments(id) ON DELETE SET NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'ended', 'stale')),
  last_sequence bigint NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pd_tracking_sessions_driver_idx
  ON public.pd_tracking_sessions (driver_profile_id, status);
CREATE INDEX IF NOT EXISTS pd_tracking_sessions_assignment_idx
  ON public.pd_tracking_sessions (assignment_id);

-- ---------------------------------------------------------------------------
-- Eventos de geocerca confirmados
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pd_geofence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id uuid NOT NULL REFERENCES public.pd_driver_profiles(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.pd_delivery_assignments(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.pd_delivery_jobs(id) ON DELETE SET NULL,
  geofence_type text NOT NULL
    CHECK (geofence_type IN ('branch', 'customer')),
  event_type text NOT NULL
    CHECK (event_type IN (
      'approaching_branch', 'arrived_branch', 'left_branch',
      'approaching_customer', 'arrived_customer', 'left_customer'
    )),
  distance_meters double precision,
  lat double precision,
  lng double precision,
  accuracy double precision,
  detected_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pd_geofence_events_driver_idx
  ON public.pd_geofence_events (driver_profile_id, detected_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pd_geofence_events_dedupe_idx
  ON public.pd_geofence_events (driver_profile_id, assignment_id, event_type)
  WHERE confirmed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Historial de estado operativo
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pd_driver_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id uuid NOT NULL REFERENCES public.pd_driver_profiles(id) ON DELETE CASCADE,
  previous_status text,
  new_status text NOT NULL,
  assignment_id uuid REFERENCES public.pd_delivery_assignments(id) ON DELETE SET NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS pd_driver_status_history_driver_idx
  ON public.pd_driver_status_history (driver_profile_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- Extensiones suaves en location_latest (battery / connection)
-- ---------------------------------------------------------------------------
ALTER TABLE public.pd_driver_location_latest
  ADD COLUMN IF NOT EXISTS battery_level smallint,
  ADD COLUMN IF NOT EXISTS connection_state text DEFAULT 'online',
  ADD COLUMN IF NOT EXISTS is_mocked boolean DEFAULT false;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.pd_tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pd_geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pd_driver_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pd_tracking_sessions_select ON public.pd_tracking_sessions;
CREATE POLICY pd_tracking_sessions_select ON public.pd_tracking_sessions
  FOR SELECT TO authenticated
  USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

DROP POLICY IF EXISTS pd_tracking_sessions_write ON public.pd_tracking_sessions;
CREATE POLICY pd_tracking_sessions_write ON public.pd_tracking_sessions
  FOR ALL TO authenticated
  USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  )
  WITH CHECK (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

DROP POLICY IF EXISTS pd_geofence_events_select ON public.pd_geofence_events;
CREATE POLICY pd_geofence_events_select ON public.pd_geofence_events
  FOR SELECT TO authenticated
  USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

DROP POLICY IF EXISTS pd_geofence_events_insert ON public.pd_geofence_events;
CREATE POLICY pd_geofence_events_insert ON public.pd_geofence_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

DROP POLICY IF EXISTS pd_driver_status_history_select ON public.pd_driver_status_history;
CREATE POLICY pd_driver_status_history_select ON public.pd_driver_status_history
  FOR SELECT TO authenticated
  USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

-- ---------------------------------------------------------------------------
-- Iniciar / cerrar sesión de tracking
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pd_start_tracking_session(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver uuid;
  v_branch uuid;
  v_id uuid;
BEGIN
  v_driver := public.pd_my_driver_id();
  IF v_driver IS NULL AND NOT public.pd_is_staff() THEN
    RAISE EXCEPTION 'not a driver';
  END IF;

  SELECT a.driver_profile_id, j.branch_id
    INTO v_driver, v_branch
  FROM public.pd_delivery_assignments a
  JOIN public.pd_delivery_jobs j ON j.id = a.job_id
  WHERE a.id = p_assignment_id
    AND a.status IN ('active', 'picked_up', 'delivering')
  LIMIT 1;

  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'assignment not found or inactive';
  END IF;

  IF public.pd_my_driver_id() IS NOT NULL AND public.pd_my_driver_id() <> v_driver THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Cerrar otras activas del mismo assignment
  UPDATE public.pd_tracking_sessions
  SET status = 'ended', ended_at = now(), updated_at = now()
  WHERE assignment_id = p_assignment_id AND status = 'active';

  INSERT INTO public.pd_tracking_sessions (
    driver_profile_id, assignment_id, branch_id, status
  ) VALUES (v_driver, p_assignment_id, v_branch, 'active')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'session_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pd_end_tracking_session(p_assignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pd_tracking_sessions
  SET status = 'ended', ended_at = now(), updated_at = now()
  WHERE assignment_id = p_assignment_id AND status = 'active';
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- Registrar geocerca (dedupe por unique parcial)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pd_confirm_geofence_event(
  p_assignment_id uuid,
  p_geofence_type text,
  p_event_type text,
  p_lat double precision,
  p_lng double precision,
  p_distance_meters double precision DEFAULT NULL,
  p_accuracy double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver uuid;
  v_job uuid;
  v_id uuid;
BEGIN
  v_driver := public.pd_my_driver_id();
  IF v_driver IS NULL AND NOT public.pd_is_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT a.driver_profile_id, a.job_id INTO v_driver, v_job
  FROM public.pd_delivery_assignments a
  WHERE a.id = p_assignment_id
  LIMIT 1;

  IF v_driver IS NULL THEN
    RAISE EXCEPTION 'assignment not found';
  END IF;

  IF public.pd_my_driver_id() IS NOT NULL AND public.pd_my_driver_id() <> v_driver THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Dedupe: no reinsertar el mismo event_type confirmado
  IF EXISTS (
    SELECT 1 FROM public.pd_geofence_events
    WHERE driver_profile_id = v_driver
      AND assignment_id IS NOT DISTINCT FROM p_assignment_id
      AND event_type = p_event_type
      AND confirmed_at IS NOT NULL
  ) THEN
    SELECT id INTO v_id FROM public.pd_geofence_events
    WHERE driver_profile_id = v_driver
      AND assignment_id IS NOT DISTINCT FROM p_assignment_id
      AND event_type = p_event_type
      AND confirmed_at IS NOT NULL
    LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'event_id', v_id);
  END IF;

  INSERT INTO public.pd_geofence_events (
    driver_profile_id, assignment_id, job_id,
    geofence_type, event_type, distance_meters,
    lat, lng, accuracy, confirmed_at
  ) VALUES (
    v_driver, p_assignment_id, v_job,
    p_geofence_type, p_event_type, p_distance_meters,
    p_lat, p_lng, p_accuracy, now()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'event_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_start_tracking_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pd_end_tracking_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pd_confirm_geofence_event(uuid, text, text, double precision, double precision, double precision, double precision) TO authenticated;

NOTIFY pgrst, 'reload schema';
