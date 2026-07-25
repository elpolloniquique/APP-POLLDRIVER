import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  listBranchSettings,
  updateBranchDispatchSettings,
  type BranchSettings,
} from '../lib/branchSettings';
import {
  loadAutoFollow,
  loadBasemapPref,
  loadPreferredBranchId,
  loadVoiceDefault,
  saveAutoFollow,
  saveBasemapPref,
  savePreferredBranchId,
  saveVoiceDefault,
  type MapBasemapPref,
} from '../lib/appPreferences';
import { buildStreetStyle, sharpMapOptions } from '../lib/mapStyles';
import { clearInstallDismiss, isAppInstalled } from '../lib/pwaInstall';
import { isDispatchRole } from '../lib/roles';
import { useAuth } from '../context/AuthContext';

type Tab = 'sucursal' | 'mapa' | 'preferencias';

export function SettingsPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('sucursal');
  const [branches, setBranches] = useState<BranchSettings[]>([]);
  const [branchId, setBranchId] = useState('');
  const [form, setForm] = useState({
    address: '',
    phone: '',
    whatsapp: '',
    openingHours: '',
    deliveryEta: '',
    lat: '',
    lng: '',
    arrivalRadiusM: '60',
    polldriverEnabled: false,
    deliveryEnabled: true,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [needSql, setNeedSql] = useState(false);

  const [basemapPref, setBasemapPref] = useState<MapBasemapPref>(() => loadBasemapPref());
  const [voiceDefault, setVoiceDefault] = useState(() => loadVoiceDefault());
  const [autoFollow, setAutoFollow] = useState(() => loadAutoFollow());

  const mapBoxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  const selected = branches.find((b) => b.id === branchId) || null;

  const applyBranch = useCallback((b: BranchSettings) => {
    setBranchId(b.id);
    setForm({
      address: b.address,
      phone: b.phone,
      whatsapp: b.whatsapp,
      openingHours: b.openingHours,
      deliveryEta: b.deliveryEta,
      lat: b.lat != null ? String(b.lat) : '',
      lng: b.lng != null ? String(b.lng) : '',
      arrivalRadiusM: String(b.arrivalRadiusM || 60),
      polldriverEnabled: b.polldriverEnabled,
      deliveryEnabled: b.deliveryEnabled,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listBranchSettings();
      setBranches(list);
      const pref = loadPreferredBranchId();
      const initial =
        list.find((b) => b.id === pref) ||
        list.find((b) => /iquique/i.test(b.name)) ||
        list[0];
      if (initial) applyBranch(initial);
      else setBranchId('');
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Error al cargar';
      setError(m);
      if (/does not exist|schema cache|function/i.test(m)) setNeedSql(true);
    } finally {
      setLoading(false);
    }
  }, [applyBranch]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mini mapa: clic = fijar ubicación del local
  useEffect(() => {
    if (tab !== 'mapa' || !mapBoxRef.current) return;
    if (mapRef.current) {
      mapRef.current.resize();
      return;
    }

    const lat = Number(form.lat) || -20.23;
    const lng = Number(form.lng) || -70.152;
    const map = new maplibregl.Map({
      container: mapBoxRef.current,
      style: buildStreetStyle(),
      center: [lng, lat],
      zoom: form.lat && form.lng ? 15 : 12,
      attributionControl: { compact: true },
      ...sharpMapOptions(),
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    const marker = new maplibregl.Marker({ color: '#e10600', draggable: true })
      .setLngLat([lng, lat])
      .addTo(map);

    const syncFromMarker = () => {
      const ll = marker.getLngLat();
      setForm((f) => ({
        ...f,
        lat: ll.lat.toFixed(6),
        lng: ll.lng.toFixed(6),
      }));
    };
    marker.on('dragend', syncFromMarker);
    map.on('click', (e) => {
      marker.setLngLat(e.lngLat);
      setForm((f) => ({
        ...f,
        lat: e.lngLat.lat.toFixed(6),
        lng: e.lngLat.lng.toFixed(6),
      }));
    });

    mapRef.current = map;
    markerRef.current = marker;
    window.setTimeout(() => map.resize(), 100);

    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // init once when opening mapa tab
  }, [tab]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    markerRef.current.setLngLat([lng, lat]);
  }, [form.lat, form.lng]);

  if (profile && !isDispatchRole(profile.role)) {
    return <Navigate to="/ofertas" replace />;
  }

  const onSelectBranch = (id: string) => {
    const b = branches.find((x) => x.id === id);
    if (!b) return;
    savePreferredBranchId(id);
    applyBranch(b);
    setMsg('');
  };

  const captureGps = () => {
    setError('');
    if (!navigator.geolocation) {
      setError('Este dispositivo no soporta GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        }));
        setMsg('Ubicación capturada desde el GPS del dispositivo');
        mapRef.current?.easeTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 16,
        });
      },
      (err) => setError(err.message || 'No se pudo leer GPS'),
      { enableHighAccuracy: true, timeout: 20000 },
    );
  };

  const onSaveBranch = async (e: FormEvent) => {
    e.preventDefault();
    if (!branchId) return;
    setBusy(true);
    setError('');
    setMsg('');
    try {
      const lat = form.lat.trim() === '' ? null : Number(form.lat);
      const lng = form.lng.trim() === '' ? null : Number(form.lng);
      if (lat != null && !Number.isFinite(lat)) throw new Error('Latitud inválida');
      if (lng != null && !Number.isFinite(lng)) throw new Error('Longitud inválida');
      const radius = Number(form.arrivalRadiusM) || 60;
      const updated = await updateBranchDispatchSettings({
        branchId,
        address: form.address.trim(),
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim(),
        openingHours: form.openingHours.trim(),
        deliveryEta: form.deliveryEta.trim(),
        lat,
        lng,
        arrivalRadiusM: radius,
        polldriverEnabled: form.polldriverEnabled,
        deliveryEnabled: form.deliveryEnabled,
      });
      setBranches((list) => list.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
      applyBranch({ ...selected!, ...updated });
      savePreferredBranchId(branchId);
      setMsg('Configuración de sucursal guardada');
    } catch (ex) {
      const m = ex instanceof Error ? ex.message : 'No se pudo guardar';
      setError(m);
      if (/does not exist|schema cache|function/i.test(m)) setNeedSql(true);
    } finally {
      setBusy(false);
    }
  };

  const savePrefs = () => {
    saveBasemapPref(basemapPref);
    saveVoiceDefault(voiceDefault);
    saveAutoFollow(autoFollow);
    if (branchId) savePreferredBranchId(branchId);
    setMsg('Preferencias del panel guardadas en este navegador');
  };

  return (
    <div className="rx-page">
      <div className="rx-page__head">
        <div>
          <h1 className="rx-page__title">Configuración</h1>
          <p className="rx-page__sub">
            Sucursal, ubicación del local, geocerca y preferencias del panel RapideX
          </p>
        </div>
        <button type="button" className="pd-btn" onClick={() => void load()} disabled={loading}>
          {loading ? 'Cargando…' : 'Recargar'}
        </button>
      </div>

      {needSql && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          Ejecuta en Supabase el SQL{' '}
          <code>021_pd_branch_settings_rpc.sql</code> para guardar configuración de sucursal.
        </div>
      )}

      <div className="rx-tabs">
        {(
          [
            ['sucursal', 'Sucursal / local'],
            ['mapa', 'Ubicación en mapa'],
            ['preferencias', 'Preferencias panel'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`rx-tabs__btn${tab === id ? ' is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {(error || msg) && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'
          }`}
        >
          {error || msg}
        </p>
      )}

      <label className="rx-label max-w-md">
        Sucursal a configurar
        <select
          className="rx-input"
          value={branchId}
          onChange={(e) => onSelectBranch(e.target.value)}
          disabled={!branches.length}
        >
          {!branches.length && <option value="">Sin sucursales</option>}
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
              {b.city ? ` · ${b.city}` : ''}
              {b.polldriverEnabled ? ' · RapideX ON' : ''}
            </option>
          ))}
        </select>
      </label>

      {tab === 'sucursal' && (
        <form className="rx-card space-y-4" onSubmit={onSaveBranch}>
          <div>
            <h2 className="font-bold text-[var(--rx-teal)]">Datos del local de despacho</h2>
            <p className="mt-1 text-xs text-gray-500">
              Dirección y contacto que usa Central para retiro y coordinación.
            </p>
          </div>

          <div className="rx-grid">
            <label className="rx-label sm:col-span-2">
              Dirección del local
              <input
                className="rx-input"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Ej. Av. Arturo Prat 1234, Iquique"
              />
            </label>
            <label className="rx-label">
              Teléfono
              <input
                className="rx-input"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="rx-label">
              WhatsApp
              <input
                className="rx-input"
                value={form.whatsapp}
                onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
              />
            </label>
            <label className="rx-label">
              Horario
              <input
                className="rx-input"
                value={form.openingHours}
                onChange={(e) => setForm((f) => ({ ...f, openingHours: e.target.value }))}
                placeholder="Lun-Dom 11:30–23:00"
              />
            </label>
            <label className="rx-label">
              ETA delivery (texto)
              <input
                className="rx-input"
                value={form.deliveryEta}
                onChange={(e) => setForm((f) => ({ ...f, deliveryEta: e.target.value }))}
                placeholder="30-45 min"
              />
            </label>
            <label className="rx-label">
              Radio geocerca llegada (m)
              <input
                className="rx-input"
                type="number"
                min={20}
                max={500}
                value={form.arrivalRadiusM}
                onChange={(e) => setForm((f) => ({ ...f, arrivalRadiusM: e.target.value }))}
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-gray-50 p-3 ring-1 ring-black/5">
            <label className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>Activar RapideX en esta sucursal</span>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={form.polldriverEnabled}
                onChange={(e) => setForm((f) => ({ ...f, polldriverEnabled: e.target.checked }))}
              />
            </label>
            <p className="text-xs text-gray-500">
              Si está ON, los pedidos delivery al pasar a <code>preparando</code> generan ofertas.
            </p>
            <label className="flex items-center justify-between gap-3 text-sm font-semibold">
              <span>Delivery habilitado (tienda)</span>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={form.deliveryEnabled}
                onChange={(e) => setForm((f) => ({ ...f, deliveryEnabled: e.target.checked }))}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="pd-btn" disabled={busy || !branchId}>
              {busy ? 'Guardando…' : 'Guardar sucursal'}
            </button>
            <Link to="/tarifas" className="rounded-xl bg-white px-4 py-2 text-sm font-bold ring-1 ring-black/10">
              Ir a Tarifas
            </Link>
            <Link to="/mapa" className="rounded-xl bg-white px-4 py-2 text-sm font-bold ring-1 ring-black/10">
              Ver en mapa en vivo
            </Link>
          </div>
        </form>
      )}

      {tab === 'mapa' && (
        <form className="rx-card space-y-4" onSubmit={onSaveBranch}>
          <div>
            <h2 className="font-bold text-[var(--rx-teal)]">Ubicación GPS del local</h2>
            <p className="mt-1 text-xs text-gray-500">
              Define dónde está el punto de retiro. El mapa en vivo y las geocercas usan estas
              coordenadas. Arrastra el pin o haz clic en el mapa.
            </p>
          </div>

          <div className="rx-grid">
            <label className="rx-label">
              Latitud
              <input
                className="rx-input"
                value={form.lat}
                onChange={(e) => setForm((f) => ({ ...f, lat: e.target.value }))}
                placeholder="-20.230000"
              />
            </label>
            <label className="rx-label">
              Longitud
              <input
                className="rx-input"
                value={form.lng}
                onChange={(e) => setForm((f) => ({ ...f, lng: e.target.value }))}
                placeholder="-70.152000"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="pd-btn" onClick={captureGps}>
              Usar mi GPS actual
            </button>
            <button type="submit" className="rounded-xl bg-[var(--rx-teal)] px-4 py-2 text-sm font-bold text-white" disabled={busy || !branchId}>
              {busy ? 'Guardando…' : 'Guardar ubicación'}
            </button>
          </div>

          <div
            ref={mapBoxRef}
            className="rx-settings-map h-[320px] w-full overflow-hidden rounded-xl ring-1 ring-black/10 sm:h-[420px]"
          />
          <p className="text-[11px] text-gray-500">
            Tip: párate frente al local, pulsa <strong>Usar mi GPS actual</strong> y guarda. Así el
            pin queda exacto para El Pollón Iquique u otra sucursal.
          </p>
        </form>
      )}

      {tab === 'preferencias' && (
        <div className="rx-card space-y-4">
          <div>
            <h2 className="font-bold text-[var(--rx-teal)]">Preferencias de este dispositivo</h2>
            <p className="mt-1 text-xs text-gray-500">
              No se suben a Supabase: solo afectan el panel en este navegador.
            </p>
          </div>

          <label className="rx-label max-w-sm">
            Mapa por defecto
            <select
              className="rx-input"
              value={basemapPref}
              onChange={(e) => setBasemapPref(e.target.value as MapBasemapPref)}
            >
              <option value="streets">Calles</option>
              <option value="satellite">Satélite</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>Voz activada al abrir Despacho en vivo</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={voiceDefault}
              onChange={(e) => setVoiceDefault(e.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>Seguir repartidor automáticamente al elegir “Seguir”</span>
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={autoFollow}
              onChange={(e) => setAutoFollow(e.target.checked)}
            />
          </label>

          <div className="rounded-xl bg-slate-50 p-3 text-sm">
            <p className="font-bold text-slate-800">Instalar RapideX en este dispositivo</p>
            <p className="mt-1 text-xs text-slate-600">
              {isAppInstalled()
                ? 'Ya tienes RapideX instalada (modo app). No verás el aviso de instalación.'
                : 'Si no está instalada, al entrar verás el mensaje “¿Deseas instalar esta aplicación?”. También puedes instalarla desde el menú del navegador.'}
            </p>
            {!isAppInstalled() && (
              <button
                type="button"
                className="mt-2 text-xs font-bold text-[var(--rx-teal)] underline"
                onClick={() => {
                  clearInstallDismiss();
                  window.location.reload();
                }}
              >
                Volver a mostrar el aviso de instalación
              </button>
            )}
          </div>

          <button type="button" className="pd-btn" onClick={savePrefs}>
            Guardar preferencias
          </button>

          <div className="rounded-xl border border-dashed border-gray-200 p-3 text-xs text-gray-600">
            <p className="font-bold text-gray-800">Más configuraciones útiles</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>
                <Link className="text-[var(--rx-teal)] font-semibold" to="/tarifas">
                  Tarifas delivery
                </Link>{' '}
                — reglas de cotización por km / mínimo.
              </li>
              <li>
                <Link className="text-[var(--rx-teal)] font-semibold" to="/repartidores">
                  Repartidores
                </Link>{' '}
                — aprobar, rechazar o suspender.
              </li>
              <li>
                <Link className="text-[var(--rx-teal)] font-semibold" to="/privacidad">
                  Privacidad
                </Link>{' '}
                — política pública del servicio.
              </li>
              <li>
                Rollback rápido: desactiva <strong>RapideX en esta sucursal</strong> arriba (deja de
                crear ofertas nuevas).
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
