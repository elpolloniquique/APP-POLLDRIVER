import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyDriverSummary, setMyOperationalStatus, type DriverSummary } from '../lib/dispatch';
import { useAuth } from '../context/AuthContext';
import { isAppInstalled } from '../lib/pwaInstall';

export function DriverProfilePage() {
  const { profile, signOut } = useAuth();
  const [summary, setSummary] = useState<DriverSummary>({ ok: false });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void getMyDriverSummary()
      .then(setSummary)
      .catch(() => setSummary({ ok: false }));
  }, []);

  const goOffline = async () => {
    try {
      await setMyOperationalStatus('offline');
      setMsg('Pasaste a offline');
      setSummary(await getMyDriverSummary());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <div className="rx-page rx-driver-sub">
      <div className="rx-page__head">
        <div>
          <h1 className="rx-page__title">Perfil</h1>
          <p className="rx-page__sub">Tu cuenta de repartidor RapideX</p>
        </div>
      </div>

      <div className="rx-card flex items-center gap-4">
        <img
          src="/brand/rapidex-logo.png"
          alt=""
          className="h-16 w-16 rounded-2xl object-cover ring-2 ring-[var(--pd-red)]"
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold">{profile?.fullName || 'Repartidor'}</p>
          <p className="truncate text-sm text-gray-500">{profile?.email}</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            {profile?.role}
          </p>
        </div>
      </div>

      {summary.ok && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rx-card">
            <p className="text-[10px] font-bold uppercase text-gray-400">Estado</p>
            <p className="mt-1 font-bold">{summary.operationalStatus || '—'}</p>
          </div>
          <div className="rx-card">
            <p className="text-[10px] font-bold uppercase text-gray-400">Capacidad</p>
            <p className="mt-1 font-bold">
              {summary.activeOrders ?? 0} / {summary.maxOrders ?? 2}
            </p>
          </div>
          <div className="rx-card">
            <p className="text-[10px] font-bold uppercase text-gray-400">App instalada</p>
            <p className="mt-1 font-bold">{isAppInstalled() ? 'Sí' : 'No'}</p>
          </div>
        </div>
      )}

      {msg && <p className="text-sm text-emerald-700">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold" onClick={() => void goOffline()}>
          Pasar a offline
        </button>
        <Link to="/privacidad" className="rounded-xl bg-white px-4 py-2 text-sm font-bold ring-1 ring-black/10">
          Privacidad
        </Link>
        <button
          type="button"
          className="rounded-xl bg-[var(--pd-red)] px-4 py-2 text-sm font-bold text-white"
          onClick={() => void signOut()}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
