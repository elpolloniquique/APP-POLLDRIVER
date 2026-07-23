-- PollDriver 005 — RLS completo (coexiste con El Pollón)
-- Requiere: auth_user_role(), auth_user_profile_id(), auth_user_branch_id()
-- Ejecutar DESPUÉS de 001–004

ALTER TABLE public.pd_driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pd_driver_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pd_driver_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pd_delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pd_delivery_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pd_delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pd_driver_location_latest ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pd_driver_location_events ENABLE ROW LEVEL SECURITY;

-- Helpers locales (si no existen todavía)
CREATE OR REPLACE FUNCTION public.pd_is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_role() IN (
    'super_admin', 'admin_sucursal', 'administrador', 'cajera', 'cajero', 'cocina', 'cocinero'
  );
$$;

CREATE OR REPLACE FUNCTION public.pd_is_super()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_user_role() = 'super_admin';
$$;

CREATE OR REPLACE FUNCTION public.pd_my_driver_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.pd_driver_profiles
  WHERE profile_id = public.auth_user_profile_id()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.pd_can_see_branch(p_branch UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.pd_is_super()
    OR p_branch IS NULL
    OR p_branch = public.auth_user_branch_id()
    OR public.auth_user_role() IN ('cajera', 'cajero', 'cocina', 'cocinero')
      AND (public.auth_user_branch_id() IS NULL OR p_branch = public.auth_user_branch_id());
$$;

-- ─── driver_profiles ───
DROP POLICY IF EXISTS pd_staff_all_driver_profiles ON public.pd_driver_profiles;
DROP POLICY IF EXISTS pd_driver_own_profile ON public.pd_driver_profiles;
DROP POLICY IF EXISTS pd_staff_select_drivers ON public.pd_driver_profiles;
DROP POLICY IF EXISTS pd_staff_write_drivers ON public.pd_driver_profiles;
DROP POLICY IF EXISTS pd_driver_update_own ON public.pd_driver_profiles;

CREATE POLICY pd_staff_select_drivers ON public.pd_driver_profiles
  FOR SELECT USING (
    public.pd_is_staff()
    OR profile_id = public.auth_user_profile_id()
  );

CREATE POLICY pd_staff_write_drivers ON public.pd_driver_profiles
  FOR ALL USING (
    public.pd_is_super()
    OR public.auth_user_role() IN ('admin_sucursal', 'administrador')
  )
  WITH CHECK (
    public.pd_is_super()
    OR public.auth_user_role() IN ('admin_sucursal', 'administrador')
  );

CREATE POLICY pd_driver_update_own ON public.pd_driver_profiles
  FOR UPDATE USING (profile_id = public.auth_user_profile_id())
  WITH CHECK (profile_id = public.auth_user_profile_id());

-- ─── vehicles ───
DROP POLICY IF EXISTS pd_vehicles_select ON public.pd_driver_vehicles;
DROP POLICY IF EXISTS pd_vehicles_write ON public.pd_driver_vehicles;

CREATE POLICY pd_vehicles_select ON public.pd_driver_vehicles
  FOR SELECT USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

CREATE POLICY pd_vehicles_write ON public.pd_driver_vehicles
  FOR ALL USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  )
  WITH CHECK (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

-- ─── applications ───
DROP POLICY IF EXISTS pd_apps_select ON public.pd_driver_applications;
DROP POLICY IF EXISTS pd_apps_write ON public.pd_driver_applications;

CREATE POLICY pd_apps_select ON public.pd_driver_applications
  FOR SELECT USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

CREATE POLICY pd_apps_write ON public.pd_driver_applications
  FOR ALL USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  )
  WITH CHECK (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

-- ─── jobs (scoped por sucursal) ───
DROP POLICY IF EXISTS pd_staff_jobs ON public.pd_delivery_jobs;
DROP POLICY IF EXISTS pd_jobs_select ON public.pd_delivery_jobs;
DROP POLICY IF EXISTS pd_jobs_write ON public.pd_delivery_jobs;

CREATE POLICY pd_jobs_select ON public.pd_delivery_jobs
  FOR SELECT USING (
    public.pd_is_super()
    OR (
      public.pd_is_staff()
      AND public.pd_can_see_branch(branch_id)
    )
    OR id IN (
      SELECT job_id FROM public.pd_delivery_assignments
      WHERE driver_profile_id = public.pd_my_driver_id()
    )
    OR id IN (
      SELECT job_id FROM public.pd_delivery_offers
      WHERE driver_profile_id = public.pd_my_driver_id()
    )
  );

CREATE POLICY pd_jobs_write ON public.pd_delivery_jobs
  FOR ALL USING (
    public.pd_is_super()
    OR (
      public.auth_user_role() IN ('admin_sucursal', 'administrador', 'cajera', 'cajero')
      AND public.pd_can_see_branch(branch_id)
    )
  )
  WITH CHECK (
    public.pd_is_super()
    OR (
      public.auth_user_role() IN ('admin_sucursal', 'administrador', 'cajera', 'cajero')
      AND public.pd_can_see_branch(branch_id)
    )
  );

-- ─── offers ───
DROP POLICY IF EXISTS pd_driver_own_offers ON public.pd_delivery_offers;
DROP POLICY IF EXISTS pd_staff_offers ON public.pd_delivery_offers;
DROP POLICY IF EXISTS pd_offers_select ON public.pd_delivery_offers;
DROP POLICY IF EXISTS pd_offers_write ON public.pd_delivery_offers;

CREATE POLICY pd_offers_select ON public.pd_delivery_offers
  FOR SELECT USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

CREATE POLICY pd_offers_write ON public.pd_delivery_offers
  FOR ALL USING (public.pd_is_staff() OR driver_profile_id = public.pd_my_driver_id())
  WITH CHECK (public.pd_is_staff() OR driver_profile_id = public.pd_my_driver_id());

-- ─── assignments ───
DROP POLICY IF EXISTS pd_staff_assignments ON public.pd_delivery_assignments;
DROP POLICY IF EXISTS pd_assignments_select ON public.pd_delivery_assignments;
DROP POLICY IF EXISTS pd_assignments_write ON public.pd_delivery_assignments;

CREATE POLICY pd_assignments_select ON public.pd_delivery_assignments
  FOR SELECT USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

CREATE POLICY pd_assignments_write ON public.pd_delivery_assignments
  FOR ALL USING (public.pd_is_staff())
  WITH CHECK (public.pd_is_staff());

-- ─── location ───
DROP POLICY IF EXISTS pd_staff_location ON public.pd_driver_location_latest;
DROP POLICY IF EXISTS pd_driver_upsert_own_location ON public.pd_driver_location_latest;
DROP POLICY IF EXISTS pd_location_select ON public.pd_driver_location_latest;
DROP POLICY IF EXISTS pd_location_write ON public.pd_driver_location_latest;
DROP POLICY IF EXISTS pd_location_events_select ON public.pd_driver_location_events;
DROP POLICY IF EXISTS pd_location_events_insert ON public.pd_driver_location_events;

CREATE POLICY pd_location_select ON public.pd_driver_location_latest
  FOR SELECT USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

CREATE POLICY pd_location_write ON public.pd_driver_location_latest
  FOR ALL USING (driver_profile_id = public.pd_my_driver_id() OR public.pd_is_staff())
  WITH CHECK (driver_profile_id = public.pd_my_driver_id() OR public.pd_is_staff());

CREATE POLICY pd_location_events_select ON public.pd_driver_location_events
  FOR SELECT USING (
    public.pd_is_staff()
    OR driver_profile_id = public.pd_my_driver_id()
  );

CREATE POLICY pd_location_events_insert ON public.pd_driver_location_events
  FOR INSERT WITH CHECK (
    driver_profile_id = public.pd_my_driver_id() OR public.pd_is_staff()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pd_driver_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pd_driver_vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pd_driver_applications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pd_delivery_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pd_delivery_offers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pd_delivery_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pd_driver_location_latest TO authenticated;
GRANT SELECT, INSERT ON public.pd_driver_location_events TO authenticated;
