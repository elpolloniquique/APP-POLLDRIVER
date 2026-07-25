import { useEffect, useState, type ReactNode, createContext, useContext, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import type { ElPollonRole } from '@polldriver/shared-types';
import { canLoginToApp } from '../lib/roles';

export interface PdProfile {
  id: string;
  authUserId: string;
  fullName: string;
  email: string;
  phone: string;
  role: ElPollonRole;
  branchId: string | null;
}

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: PdProfile | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<PdProfile>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<PdProfile | null>;
}

const AuthContext = createContext<AuthState | null>(null);

function mapProfile(row: Record<string, unknown>): PdProfile {
  return {
    id: String(row.id),
    authUserId: String(row.auth_user_id || ''),
    fullName: String(row.full_name || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    role: (row.role as ElPollonRole) || 'cliente',
    branchId: row.branch_id ? String(row.branch_id) : null,
  };
}

/** @deprecated usar isDispatchRole / isDriverRole de lib/roles */
export const STAFF_ROLES = new Set([
  'super_admin',
  'admin_sucursal',
  'administrador',
  'despachador',
  'cajera',
  'cajero',
  'delivery',
  'repartidor',
]);

export function isStaffRole(role: string | null | undefined): boolean {
  return Boolean(role && STAFF_ROLES.has(role));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PdProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async (uid: string) => {
    const sb = getSupabase();
    if (!sb) return null;
    const { data, error: err } = await sb
      .from('profiles')
      .select('*')
      .eq('auth_user_id', uid)
      .maybeSingle();
    if (err) throw err;
    return data ? mapProfile(data) : null;
  }, []);

  const refreshProfile = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return null;
    const { data } = await sb.auth.getUser();
    if (!data.user) {
      setProfile(null);
      return null;
    }
    const p = await loadProfile(data.user.id);
    setProfile(p);
    return p;
  }, [loadProfile]);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      setLoading(false);
      return;
    }

    sb.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        try {
          setProfile(await loadProfile(data.session.user.id));
        } catch {
          setProfile(null);
        }
      }
      setLoading(false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
      if (next?.user) {
        void loadProfile(next.user.id).then(setProfile).catch(() => setProfile(null));
      } else {
        setProfile(null);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const signIn = async (email: string, password: string) => {
    setError(null);
    const sb = getSupabase();
    if (!sb) throw new Error('Supabase no configurado. Revisa .env.local');
    const { data, error: err } = await sb.auth.signInWithPassword({ email, password });
    if (err) throw err;
    const p = data.user ? await loadProfile(data.user.id) : null;
    if (!p || !canLoginToApp(p.role)) {
      await sb.auth.signOut();
      throw new Error(
        'Esta cuenta no tiene acceso a RapideX. Usa una cuenta de repartidor, administrador o despacho.',
      );
    }
    setProfile(p);
    setSession(data.session);
    setUser(data.user);
    return p;
  };

  const signOut = async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ loading, session, user, profile, error, signIn, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fuera de AuthProvider');
  return ctx;
}

export { isSupabaseConfigured };
