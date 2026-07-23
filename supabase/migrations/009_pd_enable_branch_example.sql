-- PollDriver — ACTIVAR por sucursal (opcional, después de migraciones)
-- Cambia el slug por tu sucursal real

-- Ver sucursales:
-- SELECT id, slug, name, polldriver_enabled, lat, lng FROM branches ORDER BY display_order;

UPDATE public.branches
SET
  polldriver_enabled = true
  -- lat = -20.2307,   -- descomenta y pon coordenadas reales
  -- lng = -70.1357
WHERE slug = 'iquique-vivar';

-- Activar todas las activas (solo si quieres producción inmediata):
-- UPDATE public.branches SET polldriver_enabled = true WHERE is_active = true;
