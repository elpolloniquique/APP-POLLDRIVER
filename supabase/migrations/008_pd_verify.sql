-- PollDriver 008 — Verificación post-migración (solo lectura / checks)
-- Ejecutar al final. Debe devolver filas OK.

-- 1) Extensiones en branches
SELECT
  'branches.polldriver_enabled' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'polldriver_enabled'
  ) THEN 'OK' ELSE 'FAIL' END AS result;

SELECT
  'branches.lat/lng' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'lat'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'lng'
  ) THEN 'OK' ELSE 'FAIL' END AS result;

-- 2) Tablas pd_*
SELECT c.relname AS table_name, 'OK' AS result
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname LIKE 'pd_%'
ORDER BY 1;

-- 3) Funciones críticas
SELECT p.proname AS function_name, 'OK' AS result
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'pd_upsert_job_from_pedido',
    'pd_accept_delivery_offer',
    'pd_confirm_pickup',
    'pd_confirm_delivery',
    'pd_pedidos_sync_trigger',
    'pd_is_staff',
    'pd_my_driver_id'
  )
ORDER BY 1;

-- 4) Trigger en pedidos
SELECT tg.tgname AS trigger_name, 'OK' AS result
FROM pg_trigger tg
JOIN pg_class c ON c.oid = tg.tgrelid
WHERE c.relname = 'pedidos'
  AND tg.tgname = 'trg_pd_pedidos_sync'
  AND NOT tg.tgisinternal;

-- 5) Smoke: helpers El Pollón siguen existiendo
SELECT p.proname AS function_name, 'OK' AS result
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('auth_user_role', 'auth_user_profile_id', 'auth_user_branch_id')
ORDER BY 1;

-- 6) Contar pedidos (no debe fallar — El Pollón intacto)
SELECT 'pedidos_count' AS check_name, COUNT(*)::text AS result FROM public.pedidos;
