import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getMyDriverStatus,
  listBranches,
  submitDriverApplication,
  type BranchOption,
  type MyDriverStatus,
  type SubmitApplicationInput,
} from '../lib/drivers';
import { homePathForRole, isDispatchRole, isDriverRole } from '../lib/roles';

const empty = (): SubmitApplicationInput => ({
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

export function DriverOnboardingPage() {
  const { loading, session, profile, signOut, refreshProfile } = useAuth();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [form, setForm] = useState(empty);
  const [status, setStatus] = useState<MyDriverStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    void listBranches()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (!session) return;
    void getMyDriverStatus()
      .then((s) => {
        setStatus(s);
        if (
          s.applicationStatus === 'submitted' ||
          s.applicationStatus === 'under_review' ||
          s.applicationStatus === 'pending'
        ) {
          setDone(true);
        }
        if (s.adminStatus === 'approved') {
          void refreshProfile();
        }
      })
      .catch(() => setStatus(null));
  }, [session, refreshProfile]);

  useEffect(() => {
    if (profile?.fullName && !form.fullName) {
      setForm((f) => ({ ...f, fullName: profile.fullName, phone: profile.phone || f.phone }));
    }
  }, [profile, form.fullName]);

  if (loading) {
    return (
      <div className="rx-auth">
        <p className="text-sm text-gray-500">Cargando…</p>
      </div>
    );
  }

  if (!session || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (isDriverRole(profile.role)) {
    return <Navigate to="/ofertas" replace />;
  }

  if (isDispatchRole(profile.role)) {
    return <Navigate to={homePathForRole(profile.role)} replace />;
  }

  const set =
    (key: keyof SubmitApplicationInput) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

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
    if (!form.vehiclePlate.trim()) {
      setError('Indica la patente o identificador de tu movilidad');
      return;
    }
    setBusy(true);
    try {
      await submitDriverApplication(form);
      const s = await getMyDriverStatus();
      setStatus(s);
      setDone(true);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'No se pudo enviar la solicitud');
    } finally {
      setBusy(false);
    }
  };

  const rejected =
    status?.applicationStatus === 'rejected' || status?.adminStatus === 'rejected';

  return (
    <div className="rx-auth rx-auth--wide">
      <div className="rx-auth__glow" aria-hidden />
      <div className="rx-auth__card rx-auth__card--wide">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="rx-auth__eyebrow">RapideX</p>
            <h1 className="rx-auth__title">Datos para aprobación</h1>
            <p className="rx-auth__hint" style={{ marginTop: 8 }}>
              Cuenta: <strong>{profile.email}</strong>. Completa tus datos personales y de
              movilidad. El super admin revisará tu solicitud en Central.
            </p>
          </div>
          <button type="button" className="rx-link" onClick={() => void signOut()}>
            Salir
          </button>
        </div>

        {(done ||
          status?.applicationStatus === 'submitted' ||
          status?.applicationStatus === 'under_review') &&
        !rejected ? (
          <div className="rx-pending">
            <h2>Solicitud enviada a Central</h2>
            <p>
              Tu postulación está en revisión. Cuando el administrador la apruebe, podrás recibir
              pedidos desde Mis ofertas.
            </p>
            {status?.reviewerNote ? (
              <p className="text-sm text-gray-600">Nota: {status.reviewerNote}</p>
            ) : null}
            <Link to="/login" className="rx-btn-primary" style={{ marginTop: 16, display: 'inline-flex' }}>
              Volver al inicio
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rx-onboard">
            {rejected && (
              <p className="rx-auth__err">
                Tu solicitud anterior fue rechazada
                {status?.reviewerNote ? `: ${status.reviewerNote}` : '.'} Puedes corregir datos y
                volver a solicitar aprobación.
              </p>
            )}

            <fieldset>
              <legend>Datos personales</legend>
              <div className="rx-grid">
                <label className="rx-label">
                  Nombre completo
                  <input className="rx-input" required value={form.fullName} onChange={set('fullName')} />
                </label>
                <label className="rx-label">
                  Teléfono
                  <input className="rx-input" required value={form.phone} onChange={set('phone')} />
                </label>
                <label className="rx-label">
                  RUT
                  <input className="rx-input" value={form.rut} onChange={set('rut')} placeholder="12.345.678-9" />
                </label>
                <label className="rx-label">
                  Sucursal preferida
                  <select
                    className="rx-input"
                    required
                    value={form.preferredBranchId}
                    onChange={set('preferredBranchId')}
                  >
                    <option value="">Selecciona…</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.city ? ` · ${b.city}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rx-label">
                  Contacto emergencia
                  <input
                    className="rx-input"
                    value={form.emergencyName}
                    onChange={set('emergencyName')}
                  />
                </label>
                <label className="rx-label">
                  Tel. emergencia
                  <input
                    className="rx-input"
                    value={form.emergencyPhone}
                    onChange={set('emergencyPhone')}
                  />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Datos de movilidad</legend>
              <div className="rx-grid">
                <label className="rx-label">
                  Tipo
                  <select className="rx-input" value={form.vehicleType} onChange={set('vehicleType')}>
                    <option value="motocicleta">Motocicleta</option>
                    <option value="bicicleta">Bicicleta</option>
                    <option value="auto">Auto</option>
                    <option value="otro">Otro</option>
                  </select>
                </label>
                <label className="rx-label">
                  Patente / ID
                  <input
                    className="rx-input"
                    required
                    value={form.vehiclePlate}
                    onChange={set('vehiclePlate')}
                  />
                </label>
                <label className="rx-label">
                  Marca
                  <input className="rx-input" value={form.vehicleBrand} onChange={set('vehicleBrand')} />
                </label>
                <label className="rx-label">
                  Modelo
                  <input className="rx-input" value={form.vehicleModel} onChange={set('vehicleModel')} />
                </label>
                <label className="rx-label">
                  Color
                  <input className="rx-input" value={form.vehicleColor} onChange={set('vehicleColor')} />
                </label>
              </div>
              <label className="rx-label" style={{ marginTop: 12 }}>
                Notas
                <textarea className="rx-input" rows={3} value={form.notes} onChange={set('notes')} />
              </label>
            </fieldset>

            {error && <p className="rx-auth__err">{error}</p>}

            <button type="submit" className="rx-btn-primary" disabled={busy}>
              {busy ? 'Enviando…' : 'Solicitar aprobación'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
