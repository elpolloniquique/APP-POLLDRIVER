-- =============================================================================
-- 020_pd_production_verify.sql
-- Verificación go-live post live tracking (Fase 10). Solo lectura / NOTICE.
-- Ejecutar DESPUÉS de 001→019. No modifica datos.
-- =============================================================================

DO $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pd_driver_profiles',
    'pd_delivery_jobs',
    'pd_delivery_offers',
    'pd_delivery_assignments',
    'pd_driver_location_latest',
    'pd_driver_location_events',
    'pd_pricing_rules',
    'pd_audit_logs',
    'pd_tracking_sessions',
    'pd_geofence_events',
    'pd_driver_status_history'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      missing := array_append(missing, t);
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE NOTICE 'Faltan tablas: %', missing;
  ELSE
    RAISE NOTICE 'OK tablas pd_* core + live tracking presentes';
  END IF;
END $$;

-- Columnas multi-stop (019)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pd_delivery_jobs' AND column_name = 'customer_lat'
  ) THEN
    RAISE NOTICE 'FALTA columna pd_delivery_jobs.customer_lat (ejecutar 019)';
  ELSE
    RAISE NOTICE 'OK customer_lat/lng/delivery_sequence (019)';
  END IF;
END $$;

SELECT
  (SELECT COUNT(*) FROM public.branches WHERE COALESCE(polldriver_enabled, false)) AS branches_pd_enabled,
  (SELECT COUNT(*) FROM public.branches WHERE lat IS NOT NULL AND lng IS NOT NULL) AS branches_with_coords,
  (SELECT COUNT(*) FROM public.pd_driver_profiles WHERE admin_status = 'approved') AS drivers_approved,
  (SELECT COUNT(*) FROM public.pd_pricing_rules WHERE is_active) AS pricing_rules_active,
  (SELECT COUNT(*) FROM public.pd_delivery_assignments WHERE status = 'active') AS assignments_active,
  (SELECT COUNT(*) FROM public.pd_geofence_events) AS geofence_events_total;

SELECT p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'pd_upsert_job_from_pedido',
    'pd_start_driver_search',
    'pd_accept_delivery_offer',
    'pd_confirm_pickup',
    'pd_confirm_delivery',
    'pd_upsert_driver_location',
    'pd_quote_delivery',
    'pd_dispatch_report',
    'pd_confirm_geofence_event',
    'pd_list_live_assignments',
    'pd_distance_meters',
    'pd_start_tracking_session',
    'pd_end_tracking_session'
  )
ORDER BY 1;

NOTIFY pgrst, 'reload schema';
