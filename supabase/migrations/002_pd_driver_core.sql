-- PollDriver 002 — Núcleo repartidores
-- Depende de: public.profiles, public.branches

CREATE TABLE IF NOT EXISTS public.pd_driver_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  admin_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (admin_status IN ('pending', 'approved', 'rejected', 'suspended', 'blocked')),
  operational_status TEXT NOT NULL DEFAULT 'offline'
    CHECK (operational_status IN (
      'offline', 'available', 'offered', 'heading_to_branch', 'waiting_at_branch',
      'carrying_orders', 'delivering', 'paused', 'location_unavailable', 'emergency'
    )),
  connection_status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (connection_status IN ('connected', 'background', 'disconnected', 'stale')),
  preferred_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  max_orders INTEGER NOT NULL DEFAULT 2,
  rut TEXT DEFAULT '',
  birth_date DATE,
  emergency_contact_name TEXT DEFAULT '',
  emergency_contact_phone TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pd_driver_profiles_status
  ON public.pd_driver_profiles (admin_status, operational_status);

CREATE TABLE IF NOT EXISTS public.pd_driver_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id UUID NOT NULL REFERENCES public.pd_driver_profiles(id) ON DELETE CASCADE,
  vehicle_type TEXT NOT NULL DEFAULT 'motocicleta'
    CHECK (vehicle_type IN ('motocicleta', 'automovil', 'bicicleta', 'bicicleta_electrica', 'otro')),
  brand TEXT DEFAULT '',
  model TEXT DEFAULT '',
  year INTEGER,
  color TEXT DEFAULT '',
  plate TEXT DEFAULT '',
  capacity_estimate INTEGER DEFAULT 2,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pd_driver_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id UUID NOT NULL REFERENCES public.pd_driver_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft', 'submitted', 'under_review', 'needs_correction',
      'approved', 'rejected', 'suspended', 'expired_documents'
    )),
  preferred_branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  notes TEXT DEFAULT '',
  reviewer_note TEXT DEFAULT '',
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pd_driver_applications_status
  ON public.pd_driver_applications (status);
