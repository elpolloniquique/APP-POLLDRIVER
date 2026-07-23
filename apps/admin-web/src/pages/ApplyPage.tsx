import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getSupabase, isSupabaseConfigured } from '../lib/supabase';
import {
  listBranches,
  registerAndApply,
  submitDriverApplication,
  type BranchOption,
  type SubmitApplicationInput,
} from '../lib/drivers';

const emptyForm = (): SubmitApplicationInput & { email: string; password: string } => ({
  email: '',
  password: '',
  preferredBranchId: '',
  rut: '',
  phone: '',
  fullName: '',
  vehicleType: 'motocicleta',
  vehicleBrand: '',
  vehicleModel: '',
  vehiclePlate: '',
  vehicleColor: '',
  notes: '',
  emergencyName: '',
  emergencyPhone: '',
});

export function ApplyPage() {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [mode, setMode] = useState<'register' | 'session'>('register');
  const [hasSession, setHasSession] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  useEffect(() => {
    void listBranches()
      .then(setBranches)
      .catch(() => setBranches([]));

    const sb = getSupabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => {
      const ok = Boolean(data.session);
      setHasSession(ok);
      if (ok) setMode('session');
    });
  }, []);

  const set =
    (key: keyof ReturnType<typeof emptyForm>) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const payload = (): SubmitApplicationInput => ({
    preferredBranchId: form.preferredBranchId,
    rut: form.rut,
    phone: form.phone,
    fullName: form.fullName,
    vehicleType: form.vehicleType,
    vehicleBrand: form.vehicleBrand,
    vehicleModel: form.vehicleModel,
    vehiclePlate: form.vehiclePlate,
    vehicleColor: form.vehicleColor,
    notes: form.notes,
    emergencyName: form.emergencyName,
    emergencyPhone: form.emergencyPhone,
  });

  const onLoginThenApply = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const sb = getSupabase();
      if (!sb) throw new Error('Supabase no configurado');
      const { error: err } = await sb.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (err) throw err;
      setHasSession(true);
      setMode('session');
      await submitDriverApplication(payload());
      setDone(true);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Error');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.preferredBranchId) {
      setError('Elige una sucursal');
      return;
    }
    if (!form.fullName.trim() || !form.phone.trim()) {
      setError('Nombre y teléfono son obligatorios');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'register' && !hasSession) {
        if (!form.email.trim() || form.password.length < 6) {
          throw new Error('Correo y contraseña (mín. 6) son obligatorios');
        }
        await registerAndApply(form.email, form.password, payload());
      } else {
        await submitDriverApplication(payload());
      }
      setDone(true);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo enviar la solicitud');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-8 text-center shadow-lg ring-1 ring-black/5">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--pd-red)]">PollDriver</p>
          <h1 className="mt-2 text-2xl font-bold">Solicitud enviada</h1>
          <p className="mt-3 text-sm text-gray-600">
            Un administrador revisará tu postulación. Cuando te aprueben, tu cuenta pasará a rol{' '}
            <code>delivery</code> y podrás usar la app de repartidor.
          </p>
          <Link to="/login" className="pd-btn mt-6 inline-flex">
            Ir al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--pd-cream)] px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[var(--pd-red)]">PollDriver</p>
            <h1 className="mt-1 text-3xl font-bold">Postular como repartidor</h1>
            <p className="mt-1 text-sm text-gray-500">El Pollón · misma cuenta Supabase del sitio</p>
          </div>
          <Link to="/login" className="text-sm font-bold text-gray-600 underline">
            Soy staff → login
          </Link>
        </div>

        {!isSupabaseConfigured() && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Falta configurar variables de entorno de Supabase.
          </p>
        )}

        {!hasSession && (
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                mode === 'register' ? 'bg-[var(--pd-red)] text-white' : 'bg-white ring-1 ring-black/10'
              }`}
              onClick={() => setMode('register')}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                mode === 'session' ? 'bg-[var(--pd-red)] text-white' : 'bg-white ring-1 ring-black/10'
              }`}
              onClick={() => setMode('session')}
            >
              Ya tengo cuenta
            </button>
          </div>
        )}

        {mode === 'session' && !hasSession ? (
          <form onSubmit={onLoginThenApply} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <p className="text-sm text-gray-600">
              Inicia sesión con tu cuenta y completa los datos del vehículo abajo al enviar.
            </p>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">Correo</label>
              <input
                className="pd-input mt-1"
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-gray-500">Contraseña</label>
              <input
                className="pd-input mt-1"
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
            <DriverFields form={form} set={set} branches={branches} />
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <button type="submit" className="pd-btn w-full" disabled={busy}>
              {busy ? 'Enviando…' : 'Entrar y postular'}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            {mode === 'register' && !hasSession && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold uppercase text-gray-500">Correo</label>
                  <input
                    className="pd-input mt-1"
                    type="email"
                    required
                    value={form.email}
                    onChange={set('email')}
                    autoComplete="email"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold uppercase text-gray-500">Contraseña</label>
                  <input
                    className="pd-input mt-1"
                    type="password"
                    required
                    minLength={6}
                    value={form.password}
                    onChange={set('password')}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            )}

            {hasSession && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Sesión activa — se enviará la solicitud con tu cuenta.
              </p>
            )}

            <DriverFields form={form} set={set} branches={branches} />

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            <button type="submit" className="pd-btn w-full" disabled={busy || !isSupabaseConfigured()}>
              {busy ? 'Enviando…' : 'Enviar postulación'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function DriverFields({
  form,
  set,
  branches,
}: {
  form: ReturnType<typeof emptyForm>;
  set: (
    key: keyof ReturnType<typeof emptyForm>,
  ) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  branches: BranchOption[];
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="text-xs font-bold uppercase text-gray-500">Nombre completo</label>
          <input className="pd-input mt-1" required value={form.fullName} onChange={set('fullName')} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-gray-500">Teléfono</label>
          <input className="pd-input mt-1" required value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-gray-500">RUT</label>
          <input className="pd-input mt-1" value={form.rut} onChange={set('rut')} placeholder="12.345.678-9" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-bold uppercase text-gray-500">Sucursal preferida</label>
          <select
            className="pd-input mt-1"
            required
            value={form.preferredBranchId}
            onChange={set('preferredBranchId')}
          >
            <option value="">— Elegir —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.city ? ` · ${b.city}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-gray-500">Tipo vehículo</label>
          <select className="pd-input mt-1" value={form.vehicleType} onChange={set('vehicleType')}>
            <option value="motocicleta">Motocicleta</option>
            <option value="automovil">Automóvil</option>
            <option value="bicicleta">Bicicleta</option>
            <option value="bicicleta_electrica">Bicicleta eléctrica</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-gray-500">Patente</label>
          <input className="pd-input mt-1" value={form.vehiclePlate} onChange={set('vehiclePlate')} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-gray-500">Marca</label>
          <input className="pd-input mt-1" value={form.vehicleBrand} onChange={set('vehicleBrand')} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-gray-500">Modelo</label>
          <input className="pd-input mt-1" value={form.vehicleModel} onChange={set('vehicleModel')} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-gray-500">Color</label>
          <input className="pd-input mt-1" value={form.vehicleColor} onChange={set('vehicleColor')} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-gray-500">Contacto emergencia</label>
          <input className="pd-input mt-1" value={form.emergencyName} onChange={set('emergencyName')} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-gray-500">Tel. emergencia</label>
          <input className="pd-input mt-1" value={form.emergencyPhone} onChange={set('emergencyPhone')} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-bold uppercase text-gray-500">Notas</label>
          <textarea className="pd-input mt-1 min-h-20" value={form.notes} onChange={set('notes')} />
        </div>
      </div>
    </>
  );
}
