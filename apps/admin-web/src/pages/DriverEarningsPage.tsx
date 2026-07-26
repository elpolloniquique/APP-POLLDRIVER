import { useEffect, useMemo, useState } from 'react';
import { listMyCompletedAssignments, type ActiveAssignmentRow } from '../lib/dispatch';

function clp(n: number) {
  return `$ ${Math.round(n).toLocaleString('es-CL')}`;
}

export function DriverEarningsPage() {
  const [rows, setRows] = useState<ActiveAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void listMyCompletedAssignments(100)
      .then((d) => {
        if (!cancelled) setRows(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const fees = rows.map((r) => r.job.deliveryFeeQuoted ?? 0);
    const sum = fees.reduce((a, b) => a + b, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaySum = rows
      .filter((r) => r.deliveredAt && new Date(r.deliveredAt) >= today)
      .reduce((a, r) => a + (r.job.deliveryFeeQuoted ?? 0), 0);
    const todayCount = rows.filter(
      (r) => r.deliveredAt && new Date(r.deliveredAt) >= today,
    ).length;
    return { sum, todaySum, todayCount, total: rows.length };
  }, [rows]);

  return (
    <div className="rx-page rx-driver-sub">
      <div className="rx-page__head">
        <div>
          <h1 className="rx-page__title">Ingresos</h1>
          <p className="rx-page__sub">Fees de delivery de tus entregas</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Cargando…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rx-card">
              <p className="text-[10px] font-bold uppercase text-gray-400">Hoy</p>
              <p className="mt-1 text-2xl font-extrabold text-[var(--pd-red)]">
                {clp(stats.todaySum)}
              </p>
              <p className="text-xs text-gray-500">{stats.todayCount} entregas</p>
            </div>
            <div className="rx-card">
              <p className="text-[10px] font-bold uppercase text-gray-400">Acumulado</p>
              <p className="mt-1 text-2xl font-extrabold">{clp(stats.sum)}</p>
              <p className="text-xs text-gray-500">{stats.total} entregas</p>
            </div>
            <div className="rx-card">
              <p className="text-[10px] font-bold uppercase text-gray-400">Promedio / entrega</p>
              <p className="mt-1 text-2xl font-extrabold">
                {stats.total ? clp(stats.sum / stats.total) : '—'}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Los montos usan el fee cotizado del pedido (`delivery_fee_quoted`). Si un pedido no tiene
            fee, no suma a ingresos.
          </p>
        </>
      )}
    </div>
  );
}
