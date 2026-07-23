-- PollDriver 004 — Ubicación GPS

CREATE TABLE IF NOT EXISTS public.pd_driver_location_latest (
  driver_profile_id UUID PRIMARY KEY REFERENCES public.pd_driver_profiles(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  battery_level NUMERIC,
  captured_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  assignment_id UUID REFERENCES public.pd_delivery_assignments(id) ON DELETE SET NULL,
  app_state TEXT DEFAULT 'foreground',
  sequence_number BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.pd_driver_location_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id UUID NOT NULL REFERENCES public.pd_driver_profiles(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES public.pd_delivery_assignments(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'accepted', 'route_start', 'arrived_branch', 'picked_up',
      'near_customer', 'arrived_customer', 'delivered', 'incident', 'stale'
    )),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pd_location_events_driver_time
  ON public.pd_driver_location_events (driver_profile_id, created_at DESC);
