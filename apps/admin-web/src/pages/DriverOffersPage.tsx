import { useCallback, useEffect, useState } from 'react';
import {
  acceptOffer,
  listMyPendingOffers,
  rejectOffer,
  setMyOperationalStatus,
  type MyOfferRow,
} from '../lib/dispatch';
import { getSupabase } from '../lib/supabase';

export function DriverOffersPage() {
  const [offers, setOffers] = useState<MyOfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOffers(await listMyPendingOffers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const sb = getSupabase();
    if (!sb) return undefined;
    const ch = sb
      .channel('pd-my-offers')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_delivery_offers' },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [load]);

  const goOnline = async (on: boolean) => {
    setError('');
    try {
      await setMyOperationalStatus(on ? 'available' : 'offline');
      setOnline(on);
      setMsg(on ? 'Estás disponible para ofertas' : 'Modo offline');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar estado');
    }
  };

  const onAccept = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      await acceptOffer(id);
      setMsg('Oferta aceptada — job asignado');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aceptar');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id: string) => {
    setBusyId(id);
    try {
      await rejectOffer(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo rechazar');
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
            Inbox temporal (web) · la app móvil llega en fases siguientes
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={`rounded-xl px-4 py-2 text-sm font-bold ${
              online ? 'bg-emerald-600 text-white' : 'bg-white ring-1 ring-black/10'
            }`}
            onClick={() => void goOnline(!online)}
          >
            {online ? 'Disponible' : 'Ponerme disponible'}
          </button>
          <button type="button" className="pd-btn" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
      </div>

      {msg && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{msg}</p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {loading && !offers.length ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : !offers.length ? (
        <div className="rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm ring-1 ring-black/5">
          Sin ofertas pendientes. Cuando cocina pase un delivery a <strong>preparando</strong>,
          aparecerán aquí (si estás aprobado y con capacidad).
        </div>
      ) : (
        <ul className="space-y-3">
          {offers.map((o) => (
            <li key={o.id} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <p className="text-lg font-bold">#{o.job.ticketCode || o.job.id.slice(0, 8)}</p>
              <p className="text-sm text-gray-600">
                {o.job.customerName} · {o.job.customerAddress}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Expira {o.expiresAt ? new Date(o.expiresAt).toLocaleTimeString('es-CL') : '—'} · $
                {Math.round(o.job.orderTotal).toLocaleString('es-CL')}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="pd-btn"
                  disabled={busyId === o.id}
                  onClick={() => void onAccept(o.id)}
                >
                  Aceptar
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
          ))}
        </ul>
      )}
    </div>
  );
}
