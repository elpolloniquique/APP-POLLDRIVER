import { useCallback, useEffect, useState } from 'react';
import {
  isDispatchableOrderType,
  isReadyForDispatchEstado,
  type PdDeliveryJob,
} from '@polldriver/shared-types';
import { useAuth } from '../context/AuthContext';
import {
  confirmDelivery,
  confirmPickup,
  expireStaleOffers,
  friendlyOfferError,
  listDispatchJobs,
  listMyActiveAssignments,
  startDriverSearch,
  type ActiveAssignmentRow,
  type DispatchJob,
} from '../lib/dispatch';
import { applyQuoteToJob, formatClp } from '../lib/pricing';
import { countJobsByStatus } from '../lib/jobs';
import { getSupabase } from '../lib/supabase';

const READY: PdDeliveryJob['status'][] = ['ready_for_dispatch', 'searching_driver', 'offered'];
const EN_ROUTE: PdDeliveryJob['status'][] = [
  'assigned',
  'heading_to_branch',
  'at_branch',
  'picked_up',
  'delivering',
];

const STATUS_LABEL: Record<string, string> = {
  pending_prep: 'En prep.',
  ready_for_dispatch: 'Listo',
  searching_driver: 'Buscando',
  offered: 'Ofertado',
  assigned: 'Asignado',
  heading_to_branch: 'A local',
  at_branch: 'En local',
  picked_up: 'Retirado',
  delivering: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

function statusClass(s: string) {
  if (s === 'ready_for_dispatch') return 'bg-amber-100 text-amber-900';
  if (s === 'searching_driver' || s === 'offered') return 'bg-sky-100 text-sky-900';
  if (s === 'assigned' || s === 'heading_to_branch' || s === 'at_branch')
    return 'bg-indigo-100 text-indigo-900';
  if (s === 'picked_up' || s === 'delivering') return 'bg-emerald-100 text-emerald-800';
  if (s === 'delivered') return 'bg-gray-200 text-gray-700';
  if (s === 'cancelled') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-700';
}

export function DispatchHomePage() {
  const { profile } = useAuth();
  const [readyCount, setReadyCount] = useState(0);
  const [routeCount, setRouteCount] = useState(0);
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [assignments, setAssignments] = useState<ActiveAssignmentRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [schemaReady, setSchemaReady] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [livePulse, setLivePulse] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      await expireStaleOffers().catch(() => undefined);
      const [counts, list, asg] = await Promise.all([
        countJobsByStatus(),
        listDispatchJobs(),
        listMyActiveAssignments().catch(() => [] as ActiveAssignmentRow[]),
      ]);
      setReadyCount(READY.reduce((n, s) => n + (counts[s] || 0), 0));
      setRouteCount(EN_ROUTE.reduce((n, s) => n + (counts[s] || 0), 0));
      setJobs(list.slice(0, 25));
      setAssignments(asg);
      setSchemaReady(true);
    } catch (e) {
      const msgErr = e instanceof Error ? e.message : 'Error al cargar jobs';
      setError(msgErr);
      if (/does not exist|schema cache/i.test(msgErr)) setSchemaReady(false);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const sb = getSupabase();
    if (!sb) return undefined;

    const flash = () => {
      setLivePulse(true);
      setLastEventAt(new Date().toLocaleTimeString('es-CL'));
      window.setTimeout(() => setLivePulse(false), 1200);
      void load(true);
    };

    const channel = sb
      .channel('pd-dispatch-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_delivery_jobs' },
        flash,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_delivery_offers' },
        flash,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_delivery_assignments' },
        flash,
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [load]);

  const onOffer = async (job: DispatchJob) => {
    setBusyId(job.id);
    setError('');
    try {
      const res = await startDriverSearch(job.id, 90);
      if (!res.ok) {
        setError(
          res.reason === 'no_eligible_drivers'
            ? 'Sin repartidores elegibles. Aprueba repartidores y asígnales la sucursal.'
            : res.reason || 'No se pudo ofertar',
        );
      }
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al ofertar');
    } finally {
      setBusyId(null);
    }
  };

  const assignmentForJob = (jobId: string) => assignments.find((a) => a.job.id === jobId);

  const onStaffPickup = async (assignmentId: string) => {
    setBusyId(assignmentId);
    setMsg('');
    try {
      await confirmPickup(assignmentId);
      setMsg('Retiro confirmado → pedidos.estado = en_delivery');
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? friendlyOfferError(e.message) : 'Error retiro');
    } finally {
      setBusyId(null);
    }
  };

  const onStaffDeliver = async (assignmentId: string) => {
    setBusyId(assignmentId);
    setMsg('');
    try {
      await confirmDelivery(assignmentId);
      setMsg('Entrega confirmada → pedidos.estado = entregado');
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? friendlyOfferError(e.message) : 'Error entrega');
    } finally {
      setBusyId(null);
    }
  };

  const onQuoteJob = async (jobId: string) => {
    setBusyId(jobId);
    setMsg('');
    try {
      const q = await applyQuoteToJob(jobId);
      if (q.ok === false) {
        setError(String(q.message || 'Fuera de cobertura'));
      } else {
        setMsg(`Cotización: ${formatClp(Number(q.fee))} (${String(q.source || '')})`);
      }
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cotización');
    } finally {
      setBusyId(null);
    }
  };

  const canOffer = (s: string) =>
    ['ready_for_dispatch', 'searching_driver', 'offered', 'pending_prep'].includes(s);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Centro de despacho</h1>
          <p className="mt-1 text-sm text-gray-500">
            Adapter Realtime · pedido <code>delivery</code> → <code>preparando</code> → job + ofertas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
              livePulse ? 'bg-emerald-500 text-white' : 'bg-white text-gray-500 ring-1 ring-black/10'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${livePulse ? 'bg-white' : 'bg-emerald-500'}`}
            />
            Live{lastEventAt ? ` · ${lastEventAt}` : ''}
          </span>
          <button type="button" className="pd-btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {!schemaReady && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Faltan tablas o funciones. Ejecuta migraciones hasta{' '}
          <code>011_pd_dispatch_offers.sql</code> (ver <code>docs/FASE4_DISPATCH.md</code>).
        </div>
      )}

      {error && schemaReady && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
      {msg && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{msg}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <p className="text-xs font-bold uppercase text-gray-400">Cola / ofertas</p>
          <p className="mt-2 text-3xl font-bold text-[var(--pd-red)]">{readyCount}</p>
          <p className="mt-1 text-xs text-gray-500">
            ready / searching / offered · {String(isReadyForDispatchEstado('preparando'))}
          </p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <p className="text-xs font-bold uppercase text-gray-400">En ruta / asignados</p>
          <p className="mt-2 text-3xl font-bold">{routeCount}</p>
          <p className="mt-1 text-xs text-gray-500">Tras accept</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <p className="text-xs font-bold uppercase text-gray-400">Tu rol</p>
          <p className="mt-2 text-lg font-bold">{profile?.role}</p>
          <p className="mt-1 text-xs text-gray-500">
            Solo {String(isDispatchableOrderType('delivery')) ? 'delivery' : '—'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Jobs en vivo</h2>
        {loading && !jobs.length ? (
          <p className="mt-4 text-sm text-gray-400">Cargando…</p>
        ) : !jobs.length ? (
          <p className="mt-4 text-sm text-gray-500">
            Sin jobs. Activa <code>polldriver_enabled</code> y pasa un pedido delivery a{' '}
            <strong>preparando</strong> en El Pollón — el adapter crea el job y ofrece
            automáticamente.
          </p>
        ) : (
          <ul className="mt-3 divide-y">
            {jobs.map((j) => {
              const asg = assignmentForJob(j.id);
              const picked =
                Boolean(asg?.pickedUpAt) ||
                ['picked_up', 'delivering'].includes(j.status);
              return (
              <li key={j.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">#{j.ticketCode || j.sourceOrderId.slice(-6)}</p>
                    <p className="text-xs text-gray-500">
                      {j.customerName} · {j.customerAddress || 'Sin dirección'}
                      {j.orderTotal ? ` · $${Math.round(j.orderTotal).toLocaleString('es-CL')}` : ''}
                    </p>
                    {j.pendingOffers > 0 && (
                      <p className="mt-1 text-xs font-medium text-sky-700">
                        {j.pendingOffers} oferta{j.pendingOffers === 1 ? '' : 's'} pendiente
                        {j.pendingOffers === 1 ? '' : 's'}
                        {j.offers
                          .filter((o) => o.status === 'pending')
                          .map((o) => o.driverName)
                          .filter(Boolean)
                          .length
                          ? ` → ${j.offers
                              .filter((o) => o.status === 'pending')
                              .map((o) => o.driverName)
                              .join(', ')}`
                          : ''}
                      </p>
                    )}
                    {j.lastError && (
                      <p className="mt-1 text-xs text-amber-700">{j.lastError}</p>
                    )}
                    {(j.deliveryFeeQuoted != null || j.deliveryFeeSource) && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Tarifa {formatClp(j.deliveryFeeQuoted)}
                        {j.deliveryDistanceKm != null ? ` · ${j.deliveryDistanceKm} km` : ''}
                        {j.deliveryFeeSource ? ` · ${j.deliveryFeeSource}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${statusClass(j.status)}`}
                    >
                      {STATUS_LABEL[j.status] || j.status}
                    </span>
                    {j.branchId && (
                      <button
                        type="button"
                        className="rounded-xl bg-white px-3 py-1.5 text-xs font-bold ring-1 ring-black/10"
                        disabled={busyId === j.id}
                        onClick={() => void onQuoteJob(j.id)}
                      >
                        Cotizar
                      </button>
                    )}
                    {canOffer(j.status) && (
                      <button
                        type="button"
                        className="rounded-xl bg-[var(--pd-red)] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        disabled={busyId === j.id}
                        onClick={() => void onOffer(j)}
                      >
                        {busyId === j.id
                          ? '…'
                          : j.status === 'offered' || j.status === 'searching_driver'
                            ? 'Re-ofertar'
                            : 'Buscar repartidor'}
                      </button>
                    )}
                    {asg && !picked && (
                      <button
                        type="button"
                        className="rounded-xl bg-indigo-100 px-3 py-1.5 text-xs font-bold text-indigo-900"
                        disabled={busyId === asg.id}
                        onClick={() => void onStaffPickup(asg.id)}
                      >
                        Confirmar retiro
                      </button>
                    )}
                    {asg && picked && (
                      <button
                        type="button"
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"
                        disabled={busyId === asg.id}
                        onClick={() => void onStaffDeliver(asg.id)}
                      >
                        Confirmar entrega
                      </button>
                    )}
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
