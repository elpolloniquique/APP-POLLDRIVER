import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Bell,
  MapPin,
  Package,
  Users,
  LogOut,
  CircleDollarSign,
  BarChart3,
  Menu,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isDispatchRole, isDriverRole } from '../lib/roles';

type NavItem = { to: string; label: string; icon: typeof Package; end?: boolean };

export function AppShell() {
  const { loading, session, profile, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  if (loading) {
    return (
      <div className="rx-boot">
        <img src="/brand/rapidex-logo.png" alt="" className="rx-boot__logo" />
        <p>Cargando RapideX…</p>
      </div>
    );
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (!isDriverRole(profile.role) && !isDispatchRole(profile.role)) {
    return <Navigate to="/onboarding" replace />;
  }

  const isDriver = isDriverRole(profile.role);

  if (isDriver && location.pathname === '/') {
    return <Navigate to="/ofertas" replace />;
  }

  const staffNav: NavItem[] = [
    { to: '/', label: 'Despacho', icon: Package, end: true },
    { to: '/mapa', label: 'En vivo', icon: MapPin },
    { to: '/repartidores', label: 'Repartidores', icon: Users },
    { to: '/reportes', label: 'Reportes', icon: BarChart3 },
    { to: '/tarifas', label: 'Tarifas', icon: CircleDollarSign },
    { to: '/ofertas', label: 'Ofertas', icon: Bell },
  ];

  const driverNav: NavItem[] = [{ to: '/ofertas', label: 'Mis ofertas', icon: Bell, end: true }];

  const nav = isDriver ? driverNav : staffNav;
  const bottomNav = isDriver
    ? driverNav
    : [
        { to: '/', label: 'Despacho', icon: Package, end: true },
        { to: '/mapa', label: 'Mapa', icon: MapPin },
        { to: '/repartidores', label: 'Repart.', icon: Users },
        { to: '/ofertas', label: 'Ofertas', icon: Bell },
      ];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rx-navlink${isActive ? ' is-active' : ''}`;

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <>
      {nav.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={linkClass}
            onClick={onNavigate}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </>
  );

  return (
    <div className="rx-shell">
      {/* Desktop sidebar */}
      <aside className="rx-sidebar">
        <div className="rx-sidebar__brand">
          <img src="/brand/rapidex-logo.png" alt="RapideX" className="rx-sidebar__avatar" />
          <div className="min-w-0">
            <p className="rx-sidebar__name">
              Rapide<span>X</span>
            </p>
            <p className="rx-sidebar__role">{isDriver ? 'Repartidor' : 'Central'}</p>
          </div>
        </div>
        <div className="rx-sidebar__user">
          <p className="truncate font-semibold text-white/90">
            {profile.fullName || profile.email}
          </p>
          <p className="truncate text-[10px] uppercase tracking-wide text-white/40">
            {profile.role}
          </p>
        </div>
        <nav className="rx-sidebar__nav">
          <NavLinks />
        </nav>
        <button type="button" className="rx-sidebar__out" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" /> Salir
        </button>
      </aside>

      {/* Mobile top bar */}
      <header className="rx-topbar">
        <button
          type="button"
          className="rx-icon-btn"
          aria-label="Abrir menú"
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <img src="/brand/rapidex-logo.png" alt="" className="h-8 w-8 rounded-full object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-extrabold tracking-tight">
              Rapide<span className="text-[var(--pd-red)]">X</span>
            </p>
            <p className="truncate text-[10px] text-white/50">
              {profile.fullName || profile.email}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="rx-icon-btn"
          aria-label="Salir"
          onClick={() => void signOut()}
        >
          <LogOut className="h-5 w-5" />
        </button>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="rx-drawer" role="dialog" aria-modal="true">
          <button
            type="button"
            className="rx-drawer__scrim"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
          <div className="rx-drawer__panel">
            <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <p className="font-extrabold">
                Rapide<span className="text-[var(--pd-red)]">X</span>
              </p>
              <button
                type="button"
                className="rx-icon-btn"
                aria-label="Cerrar"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
              <NavLinks onNavigate={() => setMenuOpen(false)} />
            </nav>
            <button
              type="button"
              className="rx-sidebar__out"
              onClick={() => void signOut()}
            >
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </div>
        </div>
      )}

      <div className="rx-main-wrap">
        <main className="rx-main">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="rx-bottomnav" aria-label="Navegación principal">
        {bottomNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `rx-bottomnav__item${isActive ? ' is-active' : ''}`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
