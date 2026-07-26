import { useEffect, useState } from 'react';
import { listMyCompletedAssignments, type ActiveAssignmentRow } from '../lib/dispatch';

function clp(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`;
}

export function DriverHistoryPage() {
  const [rows, setRows] = useState<ActiveAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await listMyCompletedAssignments(50);
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rx-page rx-driver-sub">
      <div className="rx-page__head">
        <div>
          <h1 className="rx-page__title">Historial</h1>
          <p className="rx-page__sub">Tus entregas completadas</p>
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : !rows.length ? (
        <div className="rx-card text-sm text-gray-500">Aún no hay entregas completadas.</div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rx-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">#{r.job.ticketCode || r.job.id.slice(0, 8)}</p>
                  <p className="text-sm text-gray-600">{r.job.customerName}</p>
                  <p className="text-xs text-gray-500">{r.job.customerAddress}</p>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <p className="font-bold text-emerald-700">Entregado</p>
                  <p>
                    {r.deliveredAt
                      ? new Date(r.deliveredAt).toLocaleString('es-CL', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm font-semibold">
                {clp(r.job.orderTotal)}
                {r.job.deliveryFeeQuoted != null ? (
                  <span className="ml-2 text-xs font-medium text-[var(--rx-teal)]">
                    Delivery {clp(r.job.deliveryFeeQuoted)}
                  </span>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
