import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, isSupabaseConfigured } from '../context/AuthContext';
import { registerDriverAccount } from '../lib/drivers';
import { homePathForRole, isDispatchRole, isDriverRole } from '../lib/roles';

export function RegisterPage() {
  const { session, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!loading && session && profile) {
    if (isDriverRole(profile.role) || isDispatchRole(profile.role)) {
      return <Navigate to={homePathForRole(profile.role)} replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (password.length < 6) {
      setErr('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== password2) {
      setErr('Las contraseñas no coinciden');
      return;
    }
    setBusy(true);
    try {
      await registerDriverAccount(email.trim(), password, fullName.trim());
      await refreshProfile();
      navigate('/onboarding', { replace: true });
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'No se pudo crear la cuenta');
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
        width={140}
        height={140}
      />

      <div className="rx-auth__card">
        <h1 className="rx-auth__brand">
          Rapide<span>X</span>
        </h1>
        <p className="rx-auth__sub">Crear cuenta de repartidor</p>
        <p className="rx-auth__hint" style={{ marginTop: 0 }}>
          Primero creas tu cuenta. Después completarás tus datos personales y de movilidad para
          solicitar aprobación.
        </p>

        {!isSupabaseConfigured() && (
          <p className="rx-auth__warn">Configura Supabase en <code>.env.local</code>.</p>
        )}

        <form onSubmit={onSubmit} className="rx-auth__form">
          <label className="rx-label">
            Nombre completo
            <input
              className="rx-input"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
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
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="rx-label">
            Confirmar contraseña
            <input
              className="rx-input"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
            />
          </label>

          {err && <p className="rx-auth__err">{err}</p>}

          <button type="submit" className="rx-btn-primary" disabled={busy}>
            {busy ? 'Creando…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="rx-auth__footer">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="rx-link">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
