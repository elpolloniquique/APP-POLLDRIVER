import { getSupabase } from './supabase';

export interface ReportKpis {
  jobsTotal: number;
  delivered: number;
  cancelled: number;
  inProgress: number;
  readyQueue: number;
  deliveryFeeSum: number;
  offersTotal: number;
  offersAccepted: number;
  acceptRate: number | null;
  avgMinutesToAssign: number | null;
  avgMinutesToPickup: number | null;
  avgMinutesToDeliver: number | null;
}

export interface ReportDayRow {
  day: string;
  created: number;
  delivered: number;
  cancelled: number;
}

export interface ReportDriverRow {
  driverProfileId: string;
  fullName: string;
  deliveries: number;
  activeNow: number;
  avgCycleMin: number;
}

export interface DispatchReport {
  ok: boolean;
  from: string;
  to: string;
  branchId: string | null;
  kpis: ReportKpis;
  byStatus: Record<string, number>;
  byDay: ReportDayRow[];
  topDrivers: ReportDriverRow[];
}

function emptyReport(): DispatchReport {
  return {
    ok: false,
    from: '',
    to: '',
    branchId: null,
    kpis: {
      jobsTotal: 0,
      delivered: 0,
      cancelled: 0,
      inProgress: 0,
      readyQueue: 0,
      deliveryFeeSum: 0,
      offersTotal: 0,
      offersAccepted: 0,
      acceptRate: null,
      avgMinutesToAssign: null,
      avgMinutesToPickup: null,
      avgMinutesToDeliver: null,
    },
    byStatus: {},
    byDay: [],
    topDrivers: [],
  };
}

export async function fetchDispatchReport(input: {
  fromIso: string;
  toIso: string;
  branchId?: string | null;
}): Promise<DispatchReport> {
  const sb = getSupabase();
  if (!sb) return emptyReport();

  const { data, error } = await sb.rpc('pd_dispatch_report', {
    p_from: input.fromIso,
    p_to: input.toIso,
    p_branch_id: input.branchId || null,
  });

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      return emptyReport();
    }
    throw new Error(error.message);
  }

  const row = data as Record<string, unknown>;
  const k = (row.kpis as Record<string, unknown>) || {};
  const byDayRaw = (row.by_day as Record<string, unknown>[]) || [];
  const topRaw = (row.top_drivers as Record<string, unknown>[]) || [];

  return {
    ok: row.ok === true,
    from: String(row.from || ''),
    to: String(row.to || ''),
    branchId: row.branch_id ? String(row.branch_id) : null,
    kpis: {
      jobsTotal: Number(k.jobs_total) || 0,
      delivered: Number(k.delivered) || 0,
      cancelled: Number(k.cancelled) || 0,
      inProgress: Number(k.in_progress) || 0,
      readyQueue: Number(k.ready_queue) || 0,
      deliveryFeeSum: Number(k.delivery_fee_sum) || 0,
      offersTotal: Number(k.offers_total) || 0,
      offersAccepted: Number(k.offers_accepted) || 0,
      acceptRate: k.accept_rate != null ? Number(k.accept_rate) : null,
      avgMinutesToAssign:
        k.avg_minutes_to_assign != null ? Number(k.avg_minutes_to_assign) : null,
      avgMinutesToPickup:
        k.avg_minutes_to_pickup != null ? Number(k.avg_minutes_to_pickup) : null,
      avgMinutesToDeliver:
        k.avg_minutes_to_deliver != null ? Number(k.avg_minutes_to_deliver) : null,
    },
    byStatus: (row.by_status as Record<string, number>) || {},
    byDay: byDayRaw.map((d) => ({
      day: String(d.day || ''),
      created: Number(d.created) || 0,
      delivered: Number(d.delivered) || 0,
      cancelled: Number(d.cancelled) || 0,
    })),
    topDrivers: topRaw.map((d) => ({
      driverProfileId: String(d.driver_profile_id || ''),
      fullName: String(d.full_name || 'Sin nombre'),
      deliveries: Number(d.deliveries) || 0,
      activeNow: Number(d.active_now) || 0,
      avgCycleMin: Number(d.avg_cycle_min) || 0,
    })),
  };
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export function endOfTodayIso(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}
