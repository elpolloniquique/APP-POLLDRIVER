-- PollDriver 007 — Triggers de sync desde pedidos (El Pollón)
-- Crea/actualiza jobs al cambiar estado; no rompe INSERT/UPDATE del sitio

CREATE OR REPLACE FUNCTION public.pd_pedidos_sync_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(COALESCE(NEW.tipo_entrega, '')) <> 'delivery' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT'
     OR OLD.estado IS DISTINCT FROM NEW.estado
     OR OLD.cliente_direccion IS DISTINCT FROM NEW.cliente_direccion
     OR OLD.cliente_telefono IS DISTINCT FROM NEW.cliente_telefono
     OR OLD.cliente_nombre IS DISTINCT FROM NEW.cliente_nombre
  THEN
    PERFORM public.pd_upsert_job_from_pedido(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pd_pedidos_sync ON public.pedidos;
CREATE TRIGGER trg_pd_pedidos_sync
  AFTER INSERT OR UPDATE OF estado, tipo_entrega, cliente_nombre, cliente_telefono, cliente_direccion, branch_id
  ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.pd_pedidos_sync_trigger();

COMMENT ON FUNCTION public.pd_pedidos_sync_trigger() IS
  'PollDriver: espejo idempotente pedidos.delivery → pd_delivery_jobs';

-- Realtime para el panel PollDriver
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pd_delivery_jobs;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pd_driver_location_latest;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;
