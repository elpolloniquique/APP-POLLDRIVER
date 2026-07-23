import { getSupabase } from '../lib/supabase';
import type { PdDeliveryJob, PdJobStatus } from '@polldriver/shared-types';

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

export async function listDeliveryJobs(statuses?: PdJobStatus[]): Promise<PdDeliveryJob[]> {
  const sb = getSupabase();
  if (!sb) return [];

  let q = sb
    .from('pd_delivery_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (statuses?.length) {
    q = q.in('status', statuses);
  }

  const { data, error } = await q;
  if (error) {
    // Tabla aún no migrada
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      return [];
    }
    throw error;
  }
  return (data || []).map((r) => mapJob(r as Record<string, unknown>));
}

export async function countJobsByStatus(): Promise<Record<string, number>> {
  const jobs = await listDeliveryJobs();
  const counts: Record<string, number> = {};
  for (const j of jobs) {
    counts[j.status] = (counts[j.status] || 0) + 1;
  }
  return counts;
}
