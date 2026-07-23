import { Link, Navigate, Outlet } from 'react-router-dom';
import { Bell, MapPin, Package, Users, LogOut } from 'lucide-react';
import { isStaffRole, useAuth } from '../context/AuthContext';

const DRIVER_ROLES = new Set(['delivery', 'repartidor']);

export function AppShell() {
  const { loading, session, profile, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-gray-500">
        Cargando PollDriver…
      </div>
    );
  }

  if (!session || !profile || !isStaffRole(profile.role)) {
    return <Navigate to="/login" replace />;
  }

  const isDriver = DRIVER_ROLES.has(profile.role);

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-56 shrink-0 flex-col bg-[var(--pd-black)] text-white">
        <div className="border-b border-white/10 p-4">
          <p className="font-bold tracking-wide text-[var(--pd-red)]">POLLDRIVER</p>
          <p className="mt-1 truncate text-xs text-white/60">{profile.fullName || profile.email}</p>
          <p className="text-[10px] uppercase text-white/40">{profile.role}</p>
        </div>
        <nav className="flex-1 space-y-1 p-2 text-sm">
          {!isDriver && (
            <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/">
              <Package className="h-4 w-4" /> Despacho
            </Link>
          )}
          <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/ofertas">
            <Bell className="h-4 w-4" /> Mis ofertas
          </Link>
          {!isDriver && (
            <>
              <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/mapa">
                <MapPin className="h-4 w-4" /> Mapa en vivo
              </Link>
              <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/repartidores">
                <Users className="h-4 w-4" /> Repartidores
              </Link>
            </>
          )}
          {isDriver && (
            <Link className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-white/10" to="/">
              <Package className="h-4 w-4" /> Despacho
            </Link>
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
