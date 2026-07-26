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
  Settings,
  History,
  Wallet,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isDispatchRole, isDriverRole } from '../lib/roles';
import { getMyDriverSummary, listMyPendingOffers, type DriverSummary } from '../lib/dispatch';

type NavItem = { to: string; label: string; icon: typeof Package; end?: boolean };

export function AppShell() {
  const { loading, session, profile, signOut } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [online, setOnline] = useState(false);
  const [offerCount, setOfferCount] = useState(0);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const isDriver = Boolean(profile && isDriverRole(profile.role));

  useEffect(() => {
    if (!isDriver) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [s, offers] = await Promise.all([
          getMyDriverSummary().catch(() => ({ ok: false } as DriverSummary)),
          listMyPendingOffers().catch(() => []),
        ]);
        if (cancelled) return;
        const st = s.ok ? s.operationalStatus : '';
        setOnline(
          st === 'available' ||
            st === 'offered' ||
            st === 'heading_to_branch' ||
            st === 'waiting_at_branch' ||
            st === 'carrying_orders' ||
            st === 'delivering',
        );
        setOfferCount(offers.length);
      } catch {
        /* ignore */
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [isDriver, location.pathname]);

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
    { to: '/configuracion', label: 'Configuración', icon: Settings },
  ];

  const driverDrawerNav: NavItem[] = [
    { to: '/ofertas', label: 'Pedidos', icon: Package, end: true },
    { to: '/driver/mapa', label: 'Mapa', icon: MapPin },
    { to: '/driver/historial', label: 'Historial', icon: History },
    { to: '/driver/ingresos', label: 'Ingresos', icon: Wallet },
    { to: '/driver/perfil', label: 'Perfil', icon: UserRound },
  ];

  const driverTabs: NavItem[] = driverDrawerNav;
  const nav = isDriver ? driverDrawerNav : staffNav;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rx-navlink${isActive ? ' is-active' : ''}`;

  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `rx-dtab${isActive ? ' is-active' : ''}`;

  return (
    <div className={`rx-shell rx-shell--overlay${isDriver ? ' rx-shell--driver' : ''}`}>
      <header className="rx-topbar">
        <button
          type="button"
          className="rx-icon-btn"
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="rx-topbar__brand">
          <img src="/brand/rapidex-logo.png" alt="" className="rx-topbar__logo" />
          <div className="min-w-0">
            <p className="rx-topbar__title">
              Rapide<span>X</span>
            </p>
            <p className="rx-topbar__sub">
              {isDriver ? (
                <>
                  Repartidor
                  {profile.fullName ? ` · ${profile.fullName}` : ''}
                  <span className={`rx-online ${online ? 'is-on' : ''}`}>
                    <span className="rx-online__dot" />
                    {online ? 'En línea' : 'Offline'}
                  </span>
                </>
              ) : (
                <>
                  Central
                  {profile.fullName ? ` · ${profile.fullName}` : ''}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="rx-topbar__actions">
          {isDriver && (
            <NavLink to="/ofertas" className="rx-icon-btn rx-icon-btn--badge" aria-label="Pedidos">
              <Bell className="h-5 w-5" />
              {offerCount > 0 && <span className="rx-badge">{offerCount > 9 ? '9+' : offerCount}</span>}
            </NavLink>
          )}
          <button
            type="button"
            className="rx-icon-btn"
            aria-label="Salir"
            onClick={() => void signOut()}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="rx-drawer" role="dialog" aria-modal="true" aria-label="Menú RapideX">
          <aside className="rx-drawer__panel">
            <div className="rx-drawer__head">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src="/brand/rapidex-logo.png"
                  alt=""
                  className="h-11 w-11 rounded-full object-cover ring-2 ring-[var(--pd-red)]"
                />
                <div className="min-w-0">
                  <p className="rx-sidebar__name">
                    Rapide<span>X</span>
                  </p>
                  <p className="rx-sidebar__role">{isDriver ? 'Repartidor' : 'Central'}</p>
                </div>
              </div>
              <button
                type="button"
                className="rx-icon-btn"
                aria-label="Cerrar"
                onClick={() => setMenuOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rx-drawer__user">
              <p className="truncate font-semibold text-white/95">
                {profile.fullName || profile.email}
              </p>
              <p className="truncate text-[10px] uppercase tracking-wider text-white/40">
                {profile.role}
              </p>
            </div>

            <nav className="rx-drawer__nav">
              {nav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={linkClass}
                    onClick={() => setMenuOpen(false)}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <button
              type="button"
              className="rx-sidebar__out"
              onClick={() => void signOut()}
            >
              <LogOut className="h-4 w-4" /> Salir
            </button>
          </aside>
          <button
            type="button"
            className="rx-drawer__scrim"
            aria-label="Cerrar menú"
            onClick={() => setMenuOpen(false)}
          />
        </div>
      )}

      <div className="rx-main-wrap">
        <main className={`rx-main${isDriver ? ' rx-main--driver' : ''}`}>
          <Outlet />
        </main>
      </div>

      {isDriver && (
        <nav className="rx-driver-tabs" aria-label="Navegación repartidor">
          {driverTabs.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} end={item.end} className={tabClass}>
                <Icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
