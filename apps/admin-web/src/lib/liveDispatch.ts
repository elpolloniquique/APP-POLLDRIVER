import { getSupabase } from './supabase';

export interface LiveAssignment {
  assignmentId: string;
  driverProfileId: string;
  driverName: string;
  operationalStatus: string;
  maxOrders: number;
  activeOrders: number;
  assignedAt: string;
  pickedUpAt: string | null;
  jobId: string;
  ticketCode: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  jobStatus: string;
  branchId: string | null;
  customerLat: number | null;
  customerLng: number | null;
  deliverySequence: number;
  orderTotal: number;
}

export function capacityLabel(active: number, max: number): string {
  const m = max > 0 ? max : 2;
  return `${active} de ${m}`;
}

export function isAtCapacity(active: number, max: number): boolean {
  const m = max > 0 ? max : 2;
  return active >= m;
}

/** Agrupa assignments por driver (máx 2 pedidos). */
export function groupAssignmentsByDriver(
  rows: LiveAssignment[],
): Map<string, LiveAssignment[]> {
  const map = new Map<string, LiveAssignment[]>();
  for (const r of rows) {
    const list = map.get(r.driverProfileId) || [];
    list.push(r);
    map.set(r.driverProfileId, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => {
      const sa = a.deliverySequence || 1;
      const sb = b.deliverySequence || 1;
      if (sa !== sb) return sa - sb;
      return a.assignedAt.localeCompare(b.assignedAt);
    });
  }
  return map;
}

export async function listLiveAssignments(): Promise<LiveAssignment[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb.rpc('pd_list_live_assignments');
  if (!error && data) {
    const row = data as { ok?: boolean; assignments?: unknown };
    const arr = Array.isArray(row.assignments) ? row.assignments : [];
    return enrichActiveOrders(arr.map((x) => mapRow(x as Record<string, unknown>)));
  }

  // Fallback sin RPC 019: query directa
  const { data: plain, error: e2 } = await sb
    .from('pd_delivery_assignments')
    .select(`
      id, driver_profile_id, assigned_at, picked_up_at, status,
      pd_delivery_jobs (
        id, ticket_code, customer_name, customer_address, customer_phone,
        status, branch_id, order_total, customer_lat, customer_lng, delivery_sequence
      ),
      pd_driver_profiles (
        operational_status, max_orders,
        profiles ( full_name )
      )
    `)
    .eq('status', 'active')
    .order('assigned_at', { ascending: true });

  if (e2) {
    if (/does not exist|schema cache|column/i.test(e2.message)) {
      // Sin columnas nuevas
      const { data: basic } = await sb
        .from('pd_delivery_assignments')
        .select(`
          id, driver_profile_id, assigned_at, picked_up_at, status,
          pd_delivery_jobs (
            id, ticket_code, customer_name, customer_address, customer_phone,
            status, branch_id, order_total
          ),
          pd_driver_profiles (
            operational_status, max_orders,
            profiles ( full_name )
          )
        `)
        .eq('status', 'active');
      return enrichActiveOrders((basic || []).map((r) => mapJoined(r as Record<string, unknown>)));
    }
    return [];
  }

  return enrichActiveOrders((plain || []).map((r) => mapJoined(r as Record<string, unknown>)));
}

/** Recalcula activeOrders por driver a partir de las filas listadas. */
export function enrichActiveOrders(rows: LiveAssignment[]): LiveAssignment[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.driverProfileId, (counts.get(r.driverProfileId) || 0) + 1);
  }
  return rows.map((r) => ({
    ...r,
    activeOrders: counts.get(r.driverProfileId) || r.activeOrders,
  }));
}

function mapRow(r: Record<string, unknown>): LiveAssignment {
  return {
    assignmentId: String(r.assignment_id || r.id || ''),
    driverProfileId: String(r.driver_profile_id || ''),
    driverName: String(r.driver_name || ''),
    operationalStatus: String(r.operational_status || ''),
    maxOrders: Number(r.max_orders) || 2,
    activeOrders: Number(r.active_orders) || 1,
    assignedAt: String(r.assigned_at || ''),
    pickedUpAt: r.picked_up_at ? String(r.picked_up_at) : null,
    jobId: String(r.job_id || ''),
    ticketCode: String(r.ticket_code || ''),
    customerName: String(r.customer_name || ''),
    customerAddress: String(r.customer_address || ''),
    customerPhone: String(r.customer_phone || ''),
    jobStatus: String(r.job_status || r.status || ''),
    branchId: r.branch_id ? String(r.branch_id) : null,
    customerLat: r.customer_lat != null ? Number(r.customer_lat) : null,
    customerLng: r.customer_lng != null ? Number(r.customer_lng) : null,
    deliverySequence: Number(r.delivery_sequence) || 1,
    orderTotal: Number(r.order_total) || 0,
  };
}

function mapJoined(r: Record<string, unknown>): LiveAssignment {
  const jRaw = r.pd_delivery_jobs as Record<string, unknown> | Record<string, unknown>[] | null;
  const j = Array.isArray(jRaw) ? jRaw[0] : jRaw;
  const dpRaw = r.pd_driver_profiles as Record<string, unknown> | Record<string, unknown>[] | null;
  const dp = Array.isArray(dpRaw) ? dpRaw[0] : dpRaw;
  const pRaw = dp?.profiles as Record<string, unknown> | Record<string, unknown>[] | null;
  const p = Array.isArray(pRaw) ? pRaw[0] : pRaw;
  return mapRow({
    assignment_id: r.id,
    driver_profile_id: r.driver_profile_id,
    assigned_at: r.assigned_at,
    picked_up_at: r.picked_up_at,
    job_id: j?.id,
    ticket_code: j?.ticket_code,
    customer_name: j?.customer_name,
    customer_address: j?.customer_address,
    customer_phone: j?.customer_phone,
    job_status: j?.status,
    branch_id: j?.branch_id,
    customer_lat: j?.customer_lat,
    customer_lng: j?.customer_lng,
    delivery_sequence: j?.delivery_sequence,
    order_total: j?.order_total,
    operational_status: dp?.operational_status,
    max_orders: dp?.max_orders,
    driver_name: p?.full_name,
    active_orders: 1,
  });
}
