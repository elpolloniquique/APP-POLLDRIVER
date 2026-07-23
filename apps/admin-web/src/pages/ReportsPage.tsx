import { useCallback, useEffect, useMemo, useState } from 'react';
import { listBranches, type BranchOption } from '../lib/drivers';
import { formatClp } from '../lib/pricing';
import {
  daysAgoIso,
  endOfTodayIso,
  fetchDispatchReport,
  type DispatchReport,
} from '../lib/reports';

const PRESETS = [
  { label: 'Hoy', days: 0 },
  { label: '7 días', days: 7 },
  { label: '30 días', days: 30 },
] as const;

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--pd-black)]">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function DayBars({ days }: { days: DispatchReport['byDay'] }) {
  const max = Math.max(1, ...days.map((d) => Math.max(d.created, d.delivered)));
  if (!days.length) {
    return <p className="text-sm text-gray-400">Sin datos en el período.</p>;
  }
  return (
    <div className="flex h-40 items-end gap-1.5">
      {days.map((d) => (
        <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div className="flex h-28 w-full items-end justify-center gap-0.5">
            <div
              className="w-1/2 rounded-t bg-[var(--pd-red)]/80"
              style={{ height: `${(d.created / max) * 100}%`, minHeight: d.created ? 4 : 0 }}
              title={`Creados ${d.created}`}
            />
            <div
              className="w-1/2 rounded-t bg-emerald-500/80"
              style={{ height: `${(d.delivered / max) * 100}%`, minHeight: d.delivered ? 4 : 0 }}
              title={`Entregados ${d.delivered}`}
            />
          </div>
          <span className="truncate text-[9px] text-gray-400">
            {d.day.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ReportsPage() {
  const [preset, setPreset] = useState<0 | 7 | 30>(7);
  const [branchId, setBranchId] = useState('');
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [report, setReport] = useState<DispatchReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schemaReady, setSchemaReady] = useState(true);

  const range = useMemo(() => {
    if (preset === 0) {
      return { from: daysAgoIso(0), to: endOfTodayIso() };
    }
    return { from: daysAgoIso(preset), to: endOfTodayIso() };
  }, [preset]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [br, rep] = await Promise.all([
        listBranches(),
        fetchDispatchReport({
          fromIso: range.from,
          toIso: range.to,
          branchId: branchId || null,
        }),
      ]);
      setBranches(br);
      setReport(rep);
      setSchemaReady(rep.ok);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar reportes';
      setError(msg);
      if (/does not exist|schema cache|No autorizado/i.test(msg)) {
        setSchemaReady(!/does not exist|schema cache/i.test(msg));
      }
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, branchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const k = report?.kpis;
  const statusEntries = Object.entries(report?.byStatus || {}).sort((a, b) => b[1] - a[1]);
  const statusMax = Math.max(1, ...statusEntries.map(([, n]) => n));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reportes de despacho</h1>
          <p className="mt-1 text-sm text-gray-500">
            KPIs PollDriver · jobs, tiempos, tarifas cotizadas y ranking de repartidores
          </p>
        </div>
        <button type="button" className="pd-btn" onClick={() => void load()} disabled={loading}>
          {loading ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.days}
            type="button"
            onClick={() => setPreset(p.days as 0 | 7 | 30)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              preset === p.days
                ? 'bg-[var(--pd-red)] text-white'
                : 'bg-white text-gray-600 ring-1 ring-black/10'
            }`}
          >
            {p.label}
          </button>
        ))}
        <select
          className="rounded-full bg-white px-3 py-1 text-xs font-bold ring-1 ring-black/10"
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
        >
          <option value="">Todas las sucursales</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {!schemaReady && !loading && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Ejecuta <code>016_pd_reports.sql</code> en Supabase (ver <code>docs/FASE9_REPORTS.md</code>).
        </div>
      )}

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Jobs" value={String(k?.jobsTotal ?? 0)} hint="Creados en el período" />
        <KpiCard label="Entregados" value={String(k?.delivered ?? 0)} hint="status delivered" />
        <KpiCard label="En ruta" value={String(k?.inProgress ?? 0)} />
        <KpiCard label="Cola / oferta" value={String(k?.readyQueue ?? 0)} />
        <KpiCard
          label="Tarifas cotizadas"
          value={formatClp(k?.deliveryFeeSum ?? 0)}
          hint="Suma fee en entregados"
        />
        <KpiCard
          label="Tasa accept"
          value={k?.acceptRate != null ? `${k.acceptRate}%` : '—'}
          hint={`${k?.offersAccepted ?? 0} / ${k?.offersTotal ?? 0} ofertas`}
        />
        <KpiCard
          label="Min → asignar"
          value={k?.avgMinutesToAssign != null ? `${k.avgMinutesToAssign}` : '—'}
          hint="Promedio creación → accept"
        />
        <KpiCard
          label="Min pickup / entrega"
          value={
            k?.avgMinutesToPickup != null || k?.avgMinutesToDeliver != null
              ? `${k?.avgMinutesToPickup ?? '—'} / ${k?.avgMinutesToDeliver ?? '—'}`
              : '—'
          }
          hint="Asignar→retiro / retiro→cliente"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="text-sm font-bold uppercase text-gray-500">Por día</h2>
          <p className="mt-1 text-xs text-gray-400">Rojo = creados · Verde = entregados</p>
          <div className="mt-4">
            <DayBars days={report?.byDay || []} />
          </div>
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="text-sm font-bold uppercase text-gray-500">Por estado</h2>
          <ul className="mt-4 space-y-2">
            {statusEntries.length === 0 && (
              <li className="text-sm text-gray-400">Sin jobs en el período.</li>
            )}
            {statusEntries.map(([status, n]) => (
              <li key={status} className="text-sm">
                <div className="mb-1 flex justify-between gap-2">
                  <span className="font-medium text-gray-700">{status}</span>
                  <span className="tabular-nums text-gray-500">{n}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-[var(--pd-red)]"
                    style={{ width: `${(n / statusMax) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-sm font-bold uppercase text-gray-500">Top repartidores</h2>
        {!report?.topDrivers.length ? (
          <p className="mt-3 text-sm text-gray-400">Sin asignaciones en el período.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-gray-400">
                  <th className="py-2 pr-3 font-bold">Repartidor</th>
                  <th className="py-2 pr-3 font-bold">Entregas</th>
                  <th className="py-2 pr-3 font-bold">Activos</th>
                  <th className="py-2 font-bold">Ciclo prom. (min)</th>
                </tr>
              </thead>
              <tbody>
                {report.topDrivers.map((d) => (
                  <tr key={d.driverProfileId} className="border-b border-gray-50">
                    <td className="py-2.5 pr-3 font-bold">{d.fullName}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{d.deliveries}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{d.activeNow}</td>
                    <td className="py-2.5 tabular-nums">{d.avgCycleMin.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
