import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, isSupabaseConfigured } from '../context/AuthContext';

export function LoginPage() {
  const { signIn, session, profile, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!loading && session && profile) {
    return <Navigate to="/" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg ring-1 ring-black/5">
        <p className="text-xs font-bold uppercase tracking-widest text-[var(--pd-red)]">PollDriver</p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--pd-black)]">Despacho El Pollón</h1>
        <p className="mt-1 text-sm text-gray-500">
          Panel de repartidores y mapa en vivo · mismo login Supabase del sitio
        </p>

        {!isSupabaseConfigured() && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200">
            Configura <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en{' '}
            <code>apps/admin-web/.env.local</code> (copia desde el-pollon/.env).
          </p>
        )}

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Correo</label>
            <input
              className="pd-input mt-1"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-gray-500">Contraseña</label>
            <input
              className="pd-input mt-1"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {err && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{err}</p>
          )}
          <button type="submit" className="pd-btn w-full" disabled={busy || !isSupabaseConfigured()}>
            {busy ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  );
}
