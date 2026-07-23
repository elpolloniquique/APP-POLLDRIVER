import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listBranches,
  listDriverApplications,
  reviewApplication,
  setDriverAdminStatus,
  type BranchOption,
  type DriverApplicationRow,
} from '../lib/drivers';
import { getSupabase } from '../lib/supabase';

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Enviada',
  under_review: 'En revisión',
  needs_correction: 'Corrección',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  draft: 'Borrador',
};

function statusClass(s: string) {
  if (s === 'approved') return 'bg-emerald-100 text-emerald-800';
  if (s === 'rejected') return 'bg-red-100 text-red-800';
  if (s === 'needs_correction') return 'bg-amber-100 text-amber-900';
  return 'bg-gray-100 text-gray-700';
}

export function DriversPage() {
  const [filter, setFilter] = useState('submitted');
  const [apps, setApps] = useState<DriverApplicationRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schemaReady, setSchemaReady] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [branchById, setBranchById] = useState<Record<string, string>>({});
  const [maxById, setMaxById] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, br] = await Promise.all([
        listDriverApplications(
          filter === 'pending' || filter === 'all' ? undefined : filter,
        ),
        listBranches(),
      ]);
      const filtered =
        filter === 'pending'
          ? list.filter((a) =>
              ['submitted', 'under_review', 'needs_correction'].includes(a.status),
            )
          : list;
      setApps(filtered);
      setBranches(br);
      setSchemaReady(true);
      setBranchById((prev) => {
        const next = { ...prev };
        for (const a of filtered) {
          if (!next[a.id] && a.preferredBranchId) next[a.id] = a.preferredBranchId;
        }
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al cargar';
      setError(msg);
      if (/does not exist|schema cache|relationship/i.test(msg)) setSchemaReady(false);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
    const sb = getSupabase();
    if (!sb) return undefined;
    const channel = sb
      .channel('pd-apps-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_driver_applications' },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [load]);

  const onReview = async (
    app: DriverApplicationRow,
    decision: 'approved' | 'rejected' | 'needs_correction',
  ) => {
    setBusyId(app.id);
    setError('');
    try {
      await reviewApplication(
        app.id,
        decision,
        noteById[app.id] || '',
        branchById[app.id] || app.preferredBranchId,
        maxById[app.id] ?? 2,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo revisar');
    } finally {
      setBusyId(null);
    }
  };

  const onSuspend = async (driverProfileId: string, status: 'suspended' | 'approved') => {
    setBusyId(driverProfileId);
    try {
      await setDriverAdminStatus(driverProfileId, status);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar estado');
    } finally {
      setBusyId(null);
    }
  };

  const branchName = (id: string | null) =>
    branches.find((b) => b.id === id)?.name || (id ? id.slice(0, 8) : '—');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Repartidores</h1>
          <p className="mt-1 text-sm text-gray-500">
            Solicitudes y aprobación → rol <code>delivery</code> en El Pollón
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/postular" className="rounded-xl bg-white px-4 py-2 text-sm font-bold ring-1 ring-black/10 hover:bg-gray-50">
            Formulario postulación
          </Link>
          <button type="button" className="pd-btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </div>

      {!schemaReady && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Falta el esquema o las funciones de Fase 3. Ejecuta migraciones hasta{' '}
          <code>010_pd_driver_applications_fn.sql</code> (ver <code>docs/FASE3_DRIVERS.md</code>).
        </div>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['pending', 'Pendientes'],
            ['submitted', 'Enviadas'],
            ['approved', 'Aprobadas'],
            ['rejected', 'Rechazadas'],
            ['all', 'Todas'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              filter === key ? 'bg-[var(--pd-red)] text-white' : 'bg-white text-gray-600 ring-1 ring-black/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {loading && !apps.length ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : !apps.length ? (
          <div className="rounded-2xl bg-white p-6 text-sm text-gray-500 shadow-sm ring-1 ring-black/5">
            Sin solicitudes en este filtro. Comparte el enlace{' '}
            <Link className="font-bold text-[var(--pd-red)]" to="/postular">
              /postular
            </Link>{' '}
            para que se registren.
          </div>
        ) : (
          apps.map((app) => {
            const vehicle = String(app.payload.vehicle_type || '—');
            const plate = String(app.payload.vehicle_plate || '');
            const canReview = ['submitted', 'under_review', 'needs_correction'].includes(app.status);
            return (
              <article
                key={app.id}
                className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{app.driver.fullName || 'Sin nombre'}</p>
                    <p className="text-sm text-gray-500">
                      {app.driver.email} · {app.driver.phone || 'sin teléfono'}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      RUT {app.driver.rut || '—'} · Sucursal preferida:{' '}
                      {branchName(app.preferredBranchId)} · {vehicle}
                      {plate ? ` · ${plate}` : ''}
                    </p>
                    {app.notes && (
                      <p className="mt-2 text-sm text-gray-600">Notas: {app.notes}</p>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${statusClass(app.status)}`}
                  >
                    {STATUS_LABEL[app.status] || app.status}
                  </span>
                </div>

                {canReview && (
                  <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 sm:grid-cols-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-gray-400">
                        Sucursal a asignar
                      </label>
                      <select
                        className="pd-input mt-1"
                        value={branchById[app.id] || app.preferredBranchId || ''}
                        onChange={(e) =>
                          setBranchById((m) => ({ ...m, [app.id]: e.target.value }))
                        }
                      >
                        <option value="">— Elegir —</option>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} {b.polldriverEnabled ? '' : '(PD off)'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-gray-400">
                        Máx. pedidos
                      </label>
                      <input
                        className="pd-input mt-1"
                        type="number"
                        min={1}
                        max={5}
                        value={maxById[app.id] ?? 2}
                        onChange={(e) =>
                          setMaxById((m) => ({ ...m, [app.id]: Number(e.target.value) || 2 }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase text-gray-400">
                        Nota al repartidor
                      </label>
                      <input
                        className="pd-input mt-1"
                        value={noteById[app.id] || ''}
                        onChange={(e) =>
                          setNoteById((m) => ({ ...m, [app.id]: e.target.value }))
                        }
                        placeholder="Opcional"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 sm:col-span-3">
                      <button
                        type="button"
                        className="pd-btn"
                        disabled={busyId === app.id}
                        onClick={() => void onReview(app, 'approved')}
                      >
                        Aprobar
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-bold text-amber-900"
                        disabled={busyId === app.id}
                        onClick={() => void onReview(app, 'needs_correction')}
                      >
                        Pedir corrección
                      </button>
                      <button
                        type="button"
                        className="rounded-xl bg-red-100 px-4 py-2 text-sm font-bold text-red-800"
                        disabled={busyId === app.id}
                        onClick={() => void onReview(app, 'rejected')}
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                )}

                {app.status === 'approved' && app.driver.id && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                    <p className="w-full text-xs text-gray-500">
                      Admin: {app.driver.adminStatus} · Operativo: {app.driver.operationalStatus}
                    </p>
                    {app.driver.adminStatus === 'approved' ? (
                      <button
                        type="button"
                        className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-bold"
                        disabled={busyId === app.driver.id}
                        onClick={() => void onSuspend(app.driver.id, 'suspended')}
                      >
                        Suspender
                      </button>
                    ) : app.driver.adminStatus === 'suspended' ? (
                      <button
                        type="button"
                        className="rounded-xl bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-800"
                        disabled={busyId === app.driver.id}
                        onClick={() => void onSuspend(app.driver.id, 'approved')}
                      >
                        Reactivar
                      </button>
                    ) : null}
                  </div>
                )}

                {app.reviewerNote && (
                  <p className="mt-2 text-xs text-gray-500">Nota revisión: {app.reviewerNote}</p>
                )}
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
