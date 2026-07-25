import { getSupabase } from './supabase';

export interface BranchSettings {
  id: string;
  slug: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  whatsapp: string;
  openingHours: string;
  deliveryEta: string;
  deliveryEnabled: boolean;
  isActive: boolean;
  displayOrder: number;
  lat: number | null;
  lng: number | null;
  polldriverEnabled: boolean;
  arrivalRadiusM: number;
}

function mapBranch(r: Record<string, unknown>): BranchSettings {
  return {
    id: String(r.id),
    slug: String(r.slug || ''),
    name: String(r.name || ''),
    city: String(r.city || ''),
    address: String(r.address || ''),
    phone: String(r.phone || ''),
    whatsapp: String(r.whatsapp || ''),
    openingHours: String(r.opening_hours || ''),
    deliveryEta: String(r.delivery_eta || ''),
    deliveryEnabled: r.delivery_enabled !== false,
    isActive: r.is_active !== false,
    displayOrder: Number(r.display_order) || 0,
    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,
    polldriverEnabled: r.polldriver_enabled === true,
    arrivalRadiusM: Number(r.arrival_radius_m) || 60,
  };
}

export async function listBranchSettings(): Promise<BranchSettings[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb.rpc('pd_get_branch_settings', { p_branch_id: null });
  if (!error && data) {
    const row = data as { ok?: boolean; branches?: unknown };
    const arr = Array.isArray(row.branches) ? row.branches : [];
    return arr.map((x) => mapBranch(x as Record<string, unknown>));
  }

  // Fallback lectura directa
  const { data: plain, error: e2 } = await sb
    .from('branches')
    .select(
      'id, slug, name, city, address, phone, whatsapp, opening_hours, delivery_eta, delivery_enabled, is_active, display_order, lat, lng, polldriver_enabled, arrival_radius_m',
    )
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (e2) throw new Error(e2.message);
  return (plain || []).map((r) => mapBranch(r as Record<string, unknown>));
}

export async function updateBranchDispatchSettings(input: {
  branchId: string;
  address: string;
  phone: string;
  whatsapp: string;
  openingHours: string;
  deliveryEta: string;
  lat: number | null;
  lng: number | null;
  arrivalRadiusM: number;
  polldriverEnabled: boolean;
  deliveryEnabled: boolean;
}): Promise<BranchSettings> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');

  const { data, error } = await sb.rpc('pd_update_branch_dispatch_settings', {
    p_branch_id: input.branchId,
    p_address: input.address,
    p_phone: input.phone,
    p_whatsapp: input.whatsapp,
    p_opening_hours: input.openingHours,
    p_delivery_eta: input.deliveryEta,
    p_lat: input.lat,
    p_lng: input.lng,
    p_arrival_radius_m: input.arrivalRadiusM,
    p_polldriver_enabled: input.polldriverEnabled,
    p_delivery_enabled: input.deliveryEnabled,
  });

  if (error) throw new Error(error.message);
  const row = data as { ok?: boolean; branch?: Record<string, unknown> };
  if (!row?.branch) throw new Error('No se pudo guardar');
  return mapBranch(row.branch);
}
