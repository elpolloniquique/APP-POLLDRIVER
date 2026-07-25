import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, isSupabaseConfigured } from '../context/AuthContext';
import { getSupabase } from '../lib/supabase';
import { homePathForRole } from '../lib/roles';

export function LoginPage() {
  const { signIn, session, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  if (!loading && session && profile) {
    return <Navigate to={homePathForRole(profile.role)} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    setInfo('');
    setBusy(true);
    try {
      const p = await signIn(email.trim(), password);
      navigate(homePathForRole(p.role), { replace: true });
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : 'No se pudo iniciar sesión';
      setErr(
        /invalid api key/i.test(msg)
          ? 'API key inválida. En local usa VITE_SUPABASE_ANON_KEY = Legacy anon (eyJ...). En Vercel actualiza esa var y Redeploy.'
          : /failed to fetch|networkerror|load failed/i.test(msg)
            ? 'No hay conexión con Supabase. Revisa URL y anon key.'
            : msg,
      );
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async () => {
    setErr('');
    setInfo('');
    if (!email.trim()) {
      setErr('Escribe tu correo arriba para recuperar la contraseña');
      return;
    }
    const sb = getSupabase();
    if (!sb) {
      setErr('Supabase no configurado');
      return;
    }
    setBusy(true);
    try {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setInfo('Te enviamos un enlace de recuperación si el correo existe.');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo enviar el correo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rx-auth">
      <div className="rx-auth__glow" aria-hidden />
      <img
        className="rx-auth__hero"
        src="/brand/rapidex-logo.png"
        alt="RapideX"
        width={168}
        height={168}
      />

      <div className="rx-auth__card">
        <h1 className="rx-auth__brand">
          Rapide<span>X</span>
        </h1>
        <p className="rx-auth__sub">App del repartidor</p>

        {!isSupabaseConfigured() && (
          <p className="rx-auth__warn">
            Configura <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en{' '}
            <code>.env.local</code>.
          </p>
        )}

        <form onSubmit={onSubmit} className="rx-auth__form">
          <label className="rx-label">
            Correo
            <input
              className="rx-input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="rx-label">
            Contraseña
            <input
              className="rx-input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button type="button" className="rx-link" onClick={() => void onForgot()} disabled={busy}>
            ¿Olvidaste tu contraseña?
          </button>

          {err && <p className="rx-auth__err">{err}</p>}
          {info && <p className="rx-auth__ok">{info}</p>}

          <button type="submit" className="rx-btn-primary" disabled={busy || loading}>
            {busy ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="rx-auth__footer">
          ¿No tienes cuenta?{' '}
          <Link to="/registro" className="rx-link">
            Regístrate
          </Link>
        </p>
        <p className="rx-auth__hint">
          Administradores y despacho: inicia sesión con la cuenta creada en Supabase. Serás llevado a
          tu panel según tu rol.
        </p>
      </div>
    </div>
  );
}
