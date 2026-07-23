-- PollDriver 001 — Extensiones seguras en branches (El Pollón)
-- Aditivo. No destruye datos.

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS polldriver_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_orders_per_driver INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS avg_prep_minutes INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS arrival_radius_m INTEGER DEFAULT 60;

COMMENT ON COLUMN public.branches.polldriver_enabled IS 'Si true, pedidos delivery de esta sucursal generan jobs PollDriver';
COMMENT ON COLUMN public.branches.lat IS 'Latitud del local para mapa y geocercas';
COMMENT ON COLUMN public.branches.lng IS 'Longitud del local para mapa y geocercas';
