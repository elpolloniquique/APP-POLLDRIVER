-- PollDriver 015 — Fase 8: tarifas / cotización (no toca branches.delivery_cost TEXT)

CREATE TABLE IF NOT EXISTS public.pd_pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'fixed'
    CHECK (mode IN ('fixed', 'per_km', 'tiers')),
  base_fee NUMERIC(12,0) NOT NULL DEFAULT 0,
  per_km_fee NUMERIC(12,0) NOT NULL DEFAULT 0,
  min_fee NUMERIC(12,0) NOT NULL DEFAULT 0,
  max_fee NUMERIC(12,0),
  free_above_order_total NUMERIC(12,0),
  max_distance_km NUMERIC(8,2) DEFAULT 12,
  -- tiers: [{ "up_to_km": 3, "fee": 2000 }, { "up_to_km": 6, "fee": 3500 }]
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  use_branch_text_fallback BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id)
);

CREATE INDEX IF NOT EXISTS idx_pd_pricing_branch ON public.pd_pricing_rules (branch_id) WHERE is_active;

ALTER TABLE public.pd_delivery_jobs
  ADD COLUMN IF NOT EXISTS delivery_fee_quoted NUMERIC(12,0),
  ADD COLUMN IF NOT EXISTS delivery_distance_km NUMERIC(8,3),
  ADD COLUMN IF NOT EXISTS delivery_fee_source TEXT DEFAULT '';

ALTER TABLE public.pd_pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pd_pricing_select ON public.pd_pricing_rules;
DROP POLICY IF EXISTS pd_pricing_write ON public.pd_pricing_rules;

CREATE POLICY pd_pricing_select ON public.pd_pricing_rules
  FOR SELECT USING (true);

CREATE POLICY pd_pricing_write ON public.pd_pricing_rules
  FOR ALL USING (
    public.pd_is_super()
    OR (
      public.auth_user_role() IN ('admin_sucursal', 'administrador')
      AND public.pd_can_see_branch(branch_id)
    )
  )
  WITH CHECK (
    public.pd_is_super()
    OR (
      public.auth_user_role() IN ('admin_sucursal', 'administrador')
      AND public.pd_can_see_branch(branch_id)
    )
  );

GRANT SELECT ON public.pd_pricing_rules TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pd_pricing_rules TO authenticated;

-- Haversine km
CREATE OR REPLACE FUNCTION public.pd_haversine_km(
  p_lat1 DOUBLE PRECISION,
  p_lng1 DOUBLE PRECISION,
  p_lat2 DOUBLE PRECISION,
  p_lng2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_lat1 IS NULL OR p_lng1 IS NULL OR p_lat2 IS NULL OR p_lng2 IS NULL THEN NULL
    ELSE (
      6371.0 * 2 * asin(sqrt(
        power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
        cos(radians(p_lat1)) * cos(radians(p_lat2)) *
        power(sin(radians(p_lng2 - p_lng1) / 2), 2)
      ))
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_haversine_km(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION)
  TO anon, authenticated;

-- Extrae número CLP desde branches.delivery_cost TEXT (sin alterar la columna)
CREATE OR REPLACE FUNCTION public.pd_parse_branch_delivery_cost(p_branch_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw TEXT;
  v_num NUMERIC;
BEGIN
  SELECT delivery_cost::text INTO v_raw FROM public.branches WHERE id = p_branch_id;
  IF v_raw IS NULL OR trim(v_raw) = '' THEN
    RETURN NULL;
  END IF;
  -- Solo dígitos / punto / coma
  v_raw := regexp_replace(trim(v_raw), '[^0-9.,]', '', 'g');
  v_raw := replace(v_raw, ',', '.');
  IF v_raw = '' OR v_raw !~ '^[0-9]+(\.[0-9]+)?$' THEN
    RETURN NULL;
  END IF;
  v_num := v_raw::NUMERIC;
  RETURN trunc(v_num);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_parse_branch_delivery_cost(UUID) TO anon, authenticated;

-- Cotización principal
CREATE OR REPLACE FUNCTION public.pd_quote_delivery(
  p_branch_id UUID,
  p_dest_lat DOUBLE PRECISION DEFAULT NULL,
  p_dest_lng DOUBLE PRECISION DEFAULT NULL,
  p_order_total NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.pd_pricing_rules%ROWTYPE;
  v_branch_lat DOUBLE PRECISION;
  v_branch_lng DOUBLE PRECISION;
  v_km DOUBLE PRECISION;
  v_fee NUMERIC := 0;
  v_source TEXT := 'none';
  v_tier JSONB;
  v_fallback NUMERIC;
  v_max_km NUMERIC;
BEGIN
  SELECT lat, lng INTO v_branch_lat, v_branch_lng
  FROM public.branches WHERE id = p_branch_id;

  SELECT * INTO v_rule
  FROM public.pd_pricing_rules
  WHERE branch_id = p_branch_id AND is_active = true
  LIMIT 1;

  -- Sin regla → fallback texto de sucursal
  IF NOT FOUND THEN
    v_fallback := public.pd_parse_branch_delivery_cost(p_branch_id);
    RETURN jsonb_build_object(
      'ok', true,
      'fee', COALESCE(v_fallback, 0),
      'distance_km', NULL,
      'mode', 'branch_delivery_cost_text',
      'source', CASE WHEN v_fallback IS NULL THEN 'none' ELSE 'branch_delivery_cost' END,
      'message', CASE
        WHEN v_fallback IS NULL THEN 'Sin regla PollDriver ni monto numérico en delivery_cost'
        ELSE 'Usando branches.delivery_cost (solo lectura, no se modifica)'
      END
    );
  END IF;

  v_max_km := COALESCE(v_rule.max_distance_km, 12);

  IF p_dest_lat IS NOT NULL AND p_dest_lng IS NOT NULL
     AND v_branch_lat IS NOT NULL AND v_branch_lng IS NOT NULL THEN
    v_km := public.pd_haversine_km(v_branch_lat, v_branch_lng, p_dest_lat, p_dest_lng);
  END IF;

  IF v_km IS NOT NULL AND v_km > v_max_km THEN
    RETURN jsonb_build_object(
      'ok', false,
      'fee', NULL,
      'distance_km', round(v_km::numeric, 3),
      'mode', v_rule.mode,
      'source', 'out_of_range',
      'message', format('Fuera de cobertura (%.1f km > %s km)', v_km, v_max_km)
    );
  END IF;

  -- Free shipping por monto
  IF v_rule.free_above_order_total IS NOT NULL
     AND COALESCE(p_order_total, 0) >= v_rule.free_above_order_total THEN
    RETURN jsonb_build_object(
      'ok', true,
      'fee', 0,
      'distance_km', CASE WHEN v_km IS NULL THEN NULL ELSE round(v_km::numeric, 3) END,
      'mode', v_rule.mode,
      'source', 'free_above_order',
      'message', 'Delivery gratis por monto de pedido'
    );
  END IF;

  IF v_rule.mode = 'fixed' THEN
    v_fee := v_rule.base_fee;
    v_source := 'rule_fixed';

  ELSIF v_rule.mode = 'per_km' THEN
    IF v_km IS NULL THEN
      -- sin geo: base o fallback texto
      IF v_rule.use_branch_text_fallback THEN
        v_fallback := public.pd_parse_branch_delivery_cost(p_branch_id);
        IF v_fallback IS NOT NULL THEN
          RETURN jsonb_build_object(
            'ok', true,
            'fee', v_fallback,
            'distance_km', NULL,
            'mode', 'per_km',
            'source', 'branch_delivery_cost_fallback',
            'message', 'Sin coordenadas: usando delivery_cost de la sucursal'
          );
        END IF;
      END IF;
      v_fee := v_rule.base_fee;
      v_source := 'rule_per_km_base_only';
    ELSE
      v_fee := v_rule.base_fee + ceil(v_km) * v_rule.per_km_fee;
      v_source := 'rule_per_km';
    END IF;

  ELSIF v_rule.mode = 'tiers' THEN
    IF v_km IS NULL THEN
      v_fee := v_rule.base_fee;
      v_source := 'rule_tiers_base_only';
    ELSE
      v_fee := v_rule.base_fee;
      v_source := 'rule_tiers';
      FOR v_tier IN
        SELECT value FROM jsonb_array_elements(COALESCE(v_rule.tiers, '[]'::jsonb))
        ORDER BY (value->>'up_to_km')::NUMERIC
      LOOP
        IF v_km <= (v_tier->>'up_to_km')::NUMERIC THEN
          v_fee := COALESCE((v_tier->>'fee')::NUMERIC, v_fee);
          EXIT;
        END IF;
        v_fee := COALESCE((v_tier->>'fee')::NUMERIC, v_fee);
      END LOOP;
    END IF;
  END IF;

  v_fee := GREATEST(COALESCE(v_rule.min_fee, 0), COALESCE(v_fee, 0));
  IF v_rule.max_fee IS NOT NULL THEN
    v_fee := LEAST(v_rule.max_fee, v_fee);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'fee', trunc(v_fee),
    'distance_km', CASE WHEN v_km IS NULL THEN NULL ELSE round(v_km::numeric, 3) END,
    'mode', v_rule.mode,
    'source', v_source,
    'branch_lat', v_branch_lat,
    'branch_lng', v_branch_lng,
    'message', 'Cotización PollDriver (branches.delivery_cost no se modifica)'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_quote_delivery(UUID, DOUBLE PRECISION, DOUBLE PRECISION, NUMERIC)
  TO anon, authenticated;

-- Aplicar cotización a un job (staff)
CREATE OR REPLACE FUNCTION public.pd_apply_quote_to_job(
  p_job_id UUID,
  p_dest_lat DOUBLE PRECISION DEFAULT NULL,
  p_dest_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job public.pd_delivery_jobs%ROWTYPE;
  v_quote JSONB;
BEGIN
  IF NOT public.pd_is_staff() AND public.auth_user_role() <> 'super_admin' THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT * INTO v_job FROM public.pd_delivery_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job no encontrado'; END IF;
  IF v_job.branch_id IS NULL THEN RAISE EXCEPTION 'Job sin sucursal'; END IF;

  v_quote := public.pd_quote_delivery(
    v_job.branch_id,
    p_dest_lat,
    p_dest_lng,
    COALESCE(v_job.order_total, 0)
  );

  UPDATE public.pd_delivery_jobs
  SET
    delivery_fee_quoted = CASE WHEN (v_quote->>'ok')::boolean THEN (v_quote->>'fee')::NUMERIC ELSE delivery_fee_quoted END,
    delivery_distance_km = CASE WHEN v_quote ? 'distance_km' AND v_quote->>'distance_km' IS NOT NULL
      THEN (v_quote->>'distance_km')::NUMERIC ELSE delivery_distance_km END,
    delivery_fee_source = COALESCE(v_quote->>'source', ''),
    updated_at = now()
  WHERE id = p_job_id;

  RETURN v_quote || jsonb_build_object('job_id', p_job_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_apply_quote_to_job(UUID, DOUBLE PRECISION, DOUBLE PRECISION)
  TO authenticated;

-- Upsert regla (staff)
CREATE OR REPLACE FUNCTION public.pd_upsert_pricing_rule(
  p_branch_id UUID,
  p_mode TEXT DEFAULT 'fixed',
  p_base_fee NUMERIC DEFAULT 0,
  p_per_km_fee NUMERIC DEFAULT 0,
  p_min_fee NUMERIC DEFAULT 0,
  p_max_fee NUMERIC DEFAULT NULL,
  p_free_above NUMERIC DEFAULT NULL,
  p_max_distance_km NUMERIC DEFAULT 12,
  p_tiers JSONB DEFAULT '[]'::jsonb,
  p_use_branch_fallback BOOLEAN DEFAULT true,
  p_is_active BOOLEAN DEFAULT true,
  p_notes TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF public.auth_user_role() NOT IN ('super_admin', 'admin_sucursal', 'administrador') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_mode NOT IN ('fixed', 'per_km', 'tiers') THEN
    RAISE EXCEPTION 'Modo inválido';
  END IF;

  INSERT INTO public.pd_pricing_rules AS r (
    branch_id, mode, base_fee, per_km_fee, min_fee, max_fee,
    free_above_order_total, max_distance_km, tiers,
    use_branch_text_fallback, is_active, notes, updated_at
  ) VALUES (
    p_branch_id, p_mode, COALESCE(p_base_fee, 0), COALESCE(p_per_km_fee, 0),
    COALESCE(p_min_fee, 0), p_max_fee, p_free_above, COALESCE(p_max_distance_km, 12),
    COALESCE(p_tiers, '[]'::jsonb), COALESCE(p_use_branch_fallback, true),
    COALESCE(p_is_active, true), COALESCE(p_notes, ''), now()
  )
  ON CONFLICT (branch_id) DO UPDATE SET
    mode = EXCLUDED.mode,
    base_fee = EXCLUDED.base_fee,
    per_km_fee = EXCLUDED.per_km_fee,
    min_fee = EXCLUDED.min_fee,
    max_fee = EXCLUDED.max_fee,
    free_above_order_total = EXCLUDED.free_above_order_total,
    max_distance_km = EXCLUDED.max_distance_km,
    tiers = EXCLUDED.tiers,
    use_branch_text_fallback = EXCLUDED.use_branch_text_fallback,
    is_active = EXCLUDED.is_active,
    notes = EXCLUDED.notes,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pd_upsert_pricing_rule(
  UUID, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, JSONB, BOOLEAN, BOOLEAN, TEXT
) TO authenticated;

COMMENT ON TABLE public.pd_pricing_rules IS
  'PollDriver Fase 8: tarifas por sucursal. No modifica branches.delivery_cost TEXT.';
