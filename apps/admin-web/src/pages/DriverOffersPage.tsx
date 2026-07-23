import { useCallback, useEffect, useRef, useState } from 'react';
import {
  acceptOffer,
  friendlyOfferError,
  getMyDriverSummary,
  listMyActiveAssignments,
  listMyPendingOffers,
  rejectOffer,
  setMyOperationalStatus,
  type ActiveAssignmentRow,
  type DriverSummary,
  type MyOfferRow,
} from '../lib/dispatch';
import { getSupabase } from '../lib/supabase';
import {
  startBrowserGpsTracking,
  stopDriverBroadcast,
  upsertMyLocation,
} from '../lib/location';

function useNowTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function formatRemain(expiresAt: string, now: number): { label: string; urgent: boolean; expired: boolean } {
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return { label: '—', urgent: false, expired: false };
  const sec = Math.max(0, Math.floor((end - now) / 1000));
  if (sec <= 0) return { label: 'Expirada', urgent: true, expired: true };
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return {
    label: `${m}:${String(s).padStart(2, '0')}`,
    urgent: sec <= 20,
    expired: false,
  };
}

export function DriverOffersPage() {
  const now = useNowTick(1000);
  const [offers, setOffers] = useState<MyOfferRow[]>([]);
  const [active, setActive] = useState<ActiveAssignmentRow[]>([]);
  const [summary, setSummary] = useState<DriverSummary>({ ok: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState(false);
  const [sharingGps, setSharingGps] = useState(false);
  const [lastGps, setLastGps] = useState<string | null>(null);
  const stopGpsRef = useRef<(() => void) | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const [o, a, s] = await Promise.all([
        listMyPendingOffers(),
        listMyActiveAssignments(),
        getMyDriverSummary().catch(() => ({ ok: false } as DriverSummary)),
      ]);
      setOffers((prev) => {
        if (o.length > prev.length) {
          setFlash(true);
          window.setTimeout(() => setFlash(false), 1500);
        }
        return o;
      });
      setActive(a);
      setSummary(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const sb = getSupabase();
    if (!sb) return undefined;
    const ch = sb
      .channel('pd-my-offers-f5')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_delivery_offers' },
        () => void load(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_delivery_assignments' },
        () => void load(true),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
      stopGpsRef.current?.();
      stopGpsRef.current = null;
      stopDriverBroadcast();
    };
  }, [load]);

  const toggleGps = (on: boolean) => {
    setError('');
    stopGpsRef.current?.();
    stopGpsRef.current = null;
    if (!on) {
      setSharingGps(false);
      stopDriverBroadcast();
      setMsg('GPS detenido');
      return;
    }
    const assignmentId = active[0]?.id ?? null;
    stopGpsRef.current = startBrowserGpsTracking(
      (coords) => {
        void upsertMyLocation({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          heading: coords.heading,
          speed: coords.speed,
          assignmentId: activeRef.current[0]?.id ?? assignmentId,
        })
          .then((r) => {
            if (!r.skipped) {
              setLastGps(new Date().toLocaleTimeString('es-CL'));
              setSharingGps(true);
            }
          })
          .catch((e) => {
            setError(e instanceof Error ? e.message : 'Error GPS');
          });
      },
      (msgErr) => {
        setError(msgErr);
        setSharingGps(false);
      },
    );
    setSharingGps(true);
    setMsg('Compartiendo GPS (cada ~8s). Visible en Mapa en vivo.');
  };

  const isOnline =
    summary.operationalStatus === 'available' ||
    summary.operationalStatus === 'offered' ||
    summary.operationalStatus === 'heading_to_branch' ||
    summary.operationalStatus === 'carrying_orders' ||
    summary.operationalStatus === 'delivering';

  const goOnline = async (on: boolean) => {
    setError('');
    try {
      await setMyOperationalStatus(on ? 'available' : 'offline');
      setMsg(on ? 'Estás disponible para ofertas' : 'Modo offline');
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar estado');
    }
  };

  const onAccept = async (id: string) => {
    setBusyId(id);
    setError('');
    setMsg('');
    try {
      await acceptOffer(id);
      setMsg('¡Ganaste la oferta! Pedido asignado.');
      await load(true);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'No se pudo aceptar';
      setError(friendlyOfferError(raw));
      await load(true);
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id: string) => {
    setBusyId(id);
    try {
      await rejectOffer(id);
      setMsg('Oferta rechazada');
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? friendlyOfferError(e.message) : 'No se pudo rechazar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mis ofertas</h1>
          <p className="mt-1 text-sm text-gray-500">
            Un solo ganador por pedido · si otro acepta primero, verás el aviso al instante
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              sharingGps ? 'bg-sky-600 text-white' : 'bg-white ring-1 ring-black/10'
            }`}
            onClick={() => toggleGps(!sharingGps)}
          >
            {sharingGps ? `GPS on${lastGps ? ` · ${lastGps}` : ''}` : 'Compartir GPS'}
          </button>
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
              isOnline ? 'bg-emerald-600 text-white' : 'bg-white ring-1 ring-black/10'
            } ${flash ? 'ring-2 ring-emerald-400' : ''}`}
            onClick={() => void goOnline(!isOnline)}
          >
            {isOnline ? 'Disponible' : 'Ponerme disponible'}
          </button>
          <button type="button" className="pd-btn" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
      </div>

      {summary.ok && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-[10px] font-bold uppercase text-gray-400">Estado</p>
            <p className="mt-1 font-bold">{summary.operationalStatus || '—'}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-[10px] font-bold uppercase text-gray-400">Capacidad</p>
            <p className="mt-1 font-bold">
              {summary.activeOrders ?? 0} / {summary.maxOrders ?? 2}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <p className="text-[10px] font-bold uppercase text-gray-400">Cupos libres</p>
            <p className="mt-1 font-bold text-[var(--pd-red)]">{summary.capacityLeft ?? 0}</p>
          </div>
        </div>
      )}

      {msg && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{msg}</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          Ofertas entrantes {flash ? '· nueva' : ''}
        </h2>
        {loading && !offers.length ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : !offers.length ? (
          <div className="rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm ring-1 ring-black/5">
            Sin ofertas pendientes. Activa <strong>Disponible</strong> y espera a que cocina pase un
            delivery a <strong>preparando</strong>.
          </div>
        ) : (
          <ul className="space-y-3">
            {offers.map((o) => {
              const t = formatRemain(o.expiresAt, now);
              return (
                <li
                  key={o.id}
                  className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 ${
                    t.urgent ? 'ring-2 ring-amber-400' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold">
                        #{o.job.ticketCode || o.job.id.slice(0, 8)}
                      </p>
                      <p className="text-sm text-gray-600">
                        {o.job.customerName} · {o.job.customerAddress}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        ${Math.round(o.job.orderTotal).toLocaleString('es-CL')}
                        {o.job.customerPhone ? ` · ${o.job.customerPhone}` : ''}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                        t.expired
                          ? 'bg-gray-200 text-gray-600'
                          : t.urgent
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-sky-100 text-sky-900'
                      }`}
                    >
                      {t.label}
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="pd-btn min-w-28"
                      disabled={busyId === o.id || t.expired}
                      onClick={() => void onAccept(o.id)}
                    >
                      {busyId === o.id ? '…' : 'Aceptar'}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold"
                      disabled={busyId === o.id}
                      onClick={() => void onReject(o.id)}
                    >
                      Rechazar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">
          Pedidos activos
        </h2>
        {!active.length ? (
          <p className="text-sm text-gray-400">Ninguno asignado todavía.</p>
        ) : (
          <ul className="space-y-2">
            {active.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl bg-white px-5 py-4 text-sm shadow-sm ring-1 ring-black/5"
              >
                <p className="font-bold">#{a.job.ticketCode || a.job.id.slice(0, 8)}</p>
                <p className="text-xs text-gray-500">
                  {a.job.customerAddress} · {a.job.status}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
