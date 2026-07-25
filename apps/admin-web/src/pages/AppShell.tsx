import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Bell, MapPin, Package, Users, LogOut, CircleDollarSign, BarChart3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isDispatchRole, isDriverRole } from '../lib/roles';

export function AppShell() {
  const { loading, session, profile, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-gray-500">
        Cargando RapideX…
      </div>
    );
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />;
  }

  // Candidato sin rol delivery → onboarding
  if (!isDriverRole(profile.role) && !isDispatchRole(profile.role)) {
    return <Navigate to="/onboarding" replace />;
  }

  const isDriver = isDriverRole(profile.role);

  if (isDriver && location.pathname === '/') {
    return <Navigate to="/ofertas" replace />;
  }

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-56 shrink-0 flex-col bg-[var(--pd-black)] text-white">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <img
              src="/brand/rapidex-logo.png"
              alt=""
              className="h-9 w-9 rounded-full object-cover ring-2 ring-[var(--pd-red)]"
            />
            <div>
              <p className="font-bold tracking-wide">
                <span className="text-white">Rapide</span>
                <span className="text-[var(--pd-red)]">X</span>
              </p>
              <p className="text-[10px] uppercase text-white/40">
                {isDriver ? 'Repartidor' : 'Central'}
              </p>
            </div>
          </div>
          <p className="mt-2 truncate text-xs text-white/60">{profile.fullName || profile.email}</p>
          <p className="text-[10px] uppercase text-white/40">{profile.role}</p>
        </div>
        <nav className="flex-1 space-y-1 p-2 text-sm">
          {!isDriver && (
            <>
              <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/">
                <Package className="h-4 w-4" /> Despacho
              </Link>
              <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/reportes">
                <BarChart3 className="h-4 w-4" /> Reportes
              </Link>
              <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/tarifas">
                <CircleDollarSign className="h-4 w-4" /> Tarifas
              </Link>
            </>
          )}
          <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/ofertas">
            <Bell className="h-4 w-4" /> Mis ofertas
          </Link>
          {!isDriver && (
            <>
              <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/mapa">
                <MapPin className="h-4 w-4" /> Despacho en vivo
              </Link>
              <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/repartidores">
                <Users className="h-4 w-4" /> Repartidores
              </Link>
            </>
          )}
        </nav>
        <button
          type="button"
          onClick={() => void signOut()}
          className="m-2 flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10"
        >
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </aside>
      <main className="min-w-0 flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
