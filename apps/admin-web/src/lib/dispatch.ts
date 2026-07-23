import { getSupabase } from './supabase';
import type { PdDeliveryJob, PdJobStatus } from '@polldriver/shared-types';

export interface JobOfferSummary {
  id: string;
  driverProfileId: string;
  status: string;
  expiresAt: string;
  driverName?: string;
}

export interface DispatchJob extends PdDeliveryJob {
  lastError?: string;
  updatedAt?: string;
  pendingOffers: number;
  offers: JobOfferSummary[];
}

function mapJob(row: Record<string, unknown>): PdDeliveryJob {
  return {
    id: String(row.id),
    sourceOrderId: String(row.source_order_id),
    branchId: row.branch_id ? String(row.branch_id) : null,
    status: row.status as PdJobStatus,
    customerName: String(row.customer_name || ''),
    customerPhone: String(row.customer_phone || ''),
    customerAddress: String(row.customer_address || ''),
    orderTotal: Number(row.order_total) || 0,
    ticketCode: String(row.ticket_code || ''),
    createdAt: String(row.created_at || ''),
  };
}

export async function listDispatchJobs(): Promise<DispatchJob[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('pd_delivery_jobs')
    .select(`
      *,
      pd_delivery_offers (
        id, driver_profile_id, status, expires_at,
        pd_driver_profiles ( profiles ( full_name ) )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) {
    if (/does not exist|schema cache|relationship/i.test(error.message)) {
      // fallback sin join
      const { data: plain, error: e2 } = await sb
        .from('pd_delivery_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40);
      if (e2) {
        if (/does not exist|schema cache/i.test(e2.message)) return [];
        throw e2;
      }
      return (plain || []).map((r) => ({
        ...mapJob(r as Record<string, unknown>),
        lastError: String((r as Record<string, unknown>).last_error || ''),
        updatedAt: String((r as Record<string, unknown>).updated_at || ''),
        pendingOffers: 0,
        offers: [],
      }));
    }
    throw error;
  }

  return (data || []).map((row) => {
    const raw = row as Record<string, unknown>;
    const offersRaw = (raw.pd_delivery_offers as unknown[]) || [];
    const offers: JobOfferSummary[] = offersRaw.map((o) => {
      const off = o as Record<string, unknown>;
      const dp = off.pd_driver_profiles as Record<string, unknown> | Record<string, unknown>[] | null;
      const driver = Array.isArray(dp) ? dp[0] : dp;
      const profRaw = driver?.profiles as Record<string, unknown> | Record<string, unknown>[] | null;
      const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;
      return {
        id: String(off.id),
        driverProfileId: String(off.driver_profile_id),
        status: String(off.status),
        expiresAt: String(off.expires_at || ''),
        driverName: String(prof?.full_name || ''),
      };
    });
    const pendingOffers = offers.filter((o) => o.status === 'pending').length;
    return {
      ...mapJob(raw),
      lastError: String(raw.last_error || ''),
      updatedAt: String(raw.updated_at || ''),
      pendingOffers,
      offers,
    };
  });
}

export async function startDriverSearch(jobId: string, ttlSeconds = 90) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { data, error } = await sb.rpc('pd_start_driver_search', {
    p_job_id: jobId,
    p_ttl_seconds: ttlSeconds,
    p_auto: false,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; offers?: number; reason?: string; status?: string };
}

export async function expireStaleOffers(jobId?: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { error } = await sb.rpc('pd_expire_stale_offers', {
    p_job_id: jobId ?? null,
  });
  if (error) throw new Error(error.message);
}

export interface MyOfferRow {
  id: string;
  status: string;
  expiresAt: string;
  job: {
    id: string;
    ticketCode: string;
    customerName: string;
    customerAddress: string;
    customerPhone: string;
    orderTotal: number;
    status: string;
  };
}

export async function listMyPendingOffers(): Promise<MyOfferRow[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('pd_delivery_offers')
    .select(`
      id, status, expires_at,
      pd_delivery_jobs (
        id, ticket_code, customer_name, customer_address, customer_phone, order_total, status
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw error;
  }

  return (data || []).map((row) => {
    const jRaw = row.pd_delivery_jobs as Record<string, unknown> | Record<string, unknown>[] | null;
    const j = Array.isArray(jRaw) ? jRaw[0] : jRaw;
    return {
      id: String(row.id),
      status: String(row.status),
      expiresAt: String(row.expires_at || ''),
      job: {
        id: String(j?.id || ''),
        ticketCode: String(j?.ticket_code || ''),
        customerName: String(j?.customer_name || ''),
        customerAddress: String(j?.customer_address || ''),
        customerPhone: String(j?.customer_phone || ''),
        orderTotal: Number(j?.order_total) || 0,
        status: String(j?.status || ''),
      },
    };
  });
}

export async function acceptOffer(offerId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { data, error } = await sb.rpc('pd_accept_delivery_offer', {
    p_offer_id: offerId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function rejectOffer(offerId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { data, error } = await sb.rpc('pd_reject_delivery_offer', {
    p_offer_id: offerId,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function setMyOperationalStatus(status: string) {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { error } = await sb.rpc('pd_set_my_operational_status', {
    p_status: status,
  });
  if (error) throw new Error(error.message);
}
