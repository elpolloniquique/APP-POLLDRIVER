-- PollDriver 017 — Verificación pre-producción (Fase 10)
-- Solo lectura / asserts. No destruye datos.

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
    'pd_pricing_rules',
    'pd_audit_logs'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      missing := array_append(missing, t);
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE NOTICE 'Faltan tablas: %', missing;
  ELSE
    RAISE NOTICE 'OK tablas pd_* core presentes';
  END IF;
END $$;

SELECT
  (SELECT COUNT(*) FROM public.branches WHERE COALESCE(polldriver_enabled, false)) AS branches_pd_enabled,
  (SELECT COUNT(*) FROM public.pd_driver_profiles WHERE admin_status = 'approved') AS drivers_approved,
  (SELECT COUNT(*) FROM public.pd_pricing_rules WHERE is_active) AS pricing_rules_active;

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
    'pd_dispatch_report'
  )
ORDER BY 1;
