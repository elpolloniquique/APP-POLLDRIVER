import { getSupabase } from './supabase';

export type PricingMode = 'fixed' | 'per_km' | 'tiers';

export interface PricingTier {
  up_to_km: number;
  fee: number;
}

export interface PricingRule {
  id: string;
  branchId: string;
  mode: PricingMode;
  baseFee: number;
  perKmFee: number;
  minFee: number;
  maxFee: number | null;
  freeAboveOrderTotal: number | null;
  maxDistanceKm: number;
  tiers: PricingTier[];
  useBranchTextFallback: boolean;
  isActive: boolean;
  notes: string;
}

export interface DeliveryQuote {
  ok: boolean;
  fee: number | null;
  distanceKm: number | null;
  mode: string;
  source: string;
  message: string;
}

export async function listPricingRules(): Promise<PricingRule[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('pd_pricing_rules')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }
  return (data || []).map(mapRule);
}

function mapRule(row: Record<string, unknown>): PricingRule {
  const tiersRaw = (row.tiers as PricingTier[]) || [];
  return {
    id: String(row.id),
    branchId: String(row.branch_id),
    mode: (row.mode as PricingMode) || 'fixed',
    baseFee: Number(row.base_fee) || 0,
    perKmFee: Number(row.per_km_fee) || 0,
    minFee: Number(row.min_fee) || 0,
    maxFee: row.max_fee != null ? Number(row.max_fee) : null,
    freeAboveOrderTotal:
      row.free_above_order_total != null ? Number(row.free_above_order_total) : null,
    maxDistanceKm: Number(row.max_distance_km) || 12,
    tiers: Array.isArray(tiersRaw)
      ? tiersRaw.map((t) => ({
          up_to_km: Number((t as PricingTier).up_to_km) || 0,
          fee: Number((t as PricingTier).fee) || 0,
        }))
      : [],
    useBranchTextFallback: row.use_branch_text_fallback !== false,
    isActive: row.is_active !== false,
    notes: String(row.notes || ''),
  };
}

export async function upsertPricingRule(input: {
  branchId: string;
  mode: PricingMode;
  baseFee: number;
  perKmFee: number;
  minFee: number;
  maxFee: number | null;
  freeAbove: number | null;
  maxDistanceKm: number;
  tiers: PricingTier[];
  useBranchFallback: boolean;
  isActive: boolean;
  notes: string;
}): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { data, error } = await sb.rpc('pd_upsert_pricing_rule', {
    p_branch_id: input.branchId,
    p_mode: input.mode,
    p_base_fee: input.baseFee,
    p_per_km_fee: input.perKmFee,
    p_min_fee: input.minFee,
    p_max_fee: input.maxFee,
    p_free_above: input.freeAbove,
    p_max_distance_km: input.maxDistanceKm,
    p_tiers: input.tiers,
    p_use_branch_fallback: input.useBranchFallback,
    p_is_active: input.isActive,
    p_notes: input.notes,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function quoteDelivery(input: {
  branchId: string;
  destLat?: number | null;
  destLng?: number | null;
  orderTotal?: number;
}): Promise<DeliveryQuote> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { data, error } = await sb.rpc('pd_quote_delivery', {
    p_branch_id: input.branchId,
    p_dest_lat: input.destLat ?? null,
    p_dest_lng: input.destLng ?? null,
    p_order_total: input.orderTotal ?? 0,
  });
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown>;
  return {
    ok: row.ok === true,
    fee: row.fee != null ? Number(row.fee) : null,
    distanceKm: row.distance_km != null ? Number(row.distance_km) : null,
    mode: String(row.mode || ''),
    source: String(row.source || ''),
    message: String(row.message || ''),
  };
}

export async function applyQuoteToJob(
  jobId: string,
  destLat?: number | null,
  destLng?: number | null,
) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { data, error } = await sb.rpc('pd_apply_quote_to_job', {
    p_job_id: jobId,
    p_dest_lat: destLat ?? null,
    p_dest_lng: destLng ?? null,
  });
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

export function formatClp(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${Math.round(n).toLocaleString('es-CL')}`;
}
