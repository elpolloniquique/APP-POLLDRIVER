-- PollDriver 003 — Jobs de delivery ligados a pedidos El Pollón

CREATE TABLE IF NOT EXISTS public.pd_delivery_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system TEXT NOT NULL DEFAULT 'el_pollon_web',
  source_order_id TEXT NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_prep'
    CHECK (status IN (
      'pending_prep', 'ready_for_dispatch', 'searching_driver', 'offered',
      'assigned', 'heading_to_branch', 'at_branch', 'picked_up',
      'delivering', 'delivered', 'delivery_failed', 'cancelled'
    )),
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  customer_address TEXT DEFAULT '',
  order_total NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT '',
  ticket_code TEXT DEFAULT '',
  idempotency_key TEXT NOT NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_system, source_order_id),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_pd_delivery_jobs_status ON public.pd_delivery_jobs (status);
CREATE INDEX IF NOT EXISTS idx_pd_delivery_jobs_branch ON public.pd_delivery_jobs (branch_id);

CREATE TABLE IF NOT EXISTS public.pd_delivery_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.pd_delivery_jobs(id) ON DELETE CASCADE,
  driver_profile_id UUID NOT NULL REFERENCES public.pd_driver_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'expired', 'taken_by_other')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (job_id, driver_profile_id)
);

CREATE TABLE IF NOT EXISTS public.pd_delivery_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL UNIQUE REFERENCES public.pd_delivery_jobs(id) ON DELETE CASCADE,
  driver_profile_id UUID NOT NULL REFERENCES public.pd_driver_profiles(id) ON DELETE CASCADE,
  offer_id UUID REFERENCES public.pd_delivery_offers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pd_assignments_driver
  ON public.pd_delivery_assignments (driver_profile_id, status);
