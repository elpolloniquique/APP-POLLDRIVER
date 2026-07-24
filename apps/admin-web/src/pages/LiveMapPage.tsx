import { useCallback, useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  getMapStyleUrl,
  listBranchMapPoints,
  listLiveDriverLocations,
  subscribeLiveLocations,
  type BranchMapPoint,
  type DriverLiveLocation,
} from '../lib/location';
import {
  fetchDrivingRoute,
  formatEtaMinutes,
  formatKm,
  pickNearestBranch,
  type RouteResult,
} from '../lib/routing';
import { resetVoiceAlerts, speakArrivalAlert } from '../lib/voiceAlert';

const ROUTE_SOURCE = 'pd-driver-routes';
const ROUTE_LAYER = 'pd-driver-routes-line';
const ETA_VOICE_MINUTES = 5;

function isStale(capturedAt: string): boolean {
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > 90_000;
}

interface DriverRouteInfo {
  driverProfileId: string;
  driverName: string;
  branchName: string;
  route: RouteResult;
  updatedAt: number;
}

export function LiveMapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const branchMarkersRef = useRef<Marker[]>([]);
  const routeCacheRef = useRef<Map<string, DriverRouteInfo>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const voiceEnabledRef = useRef(true);

  const [locations, setLocations] = useState<DriverLiveLocation[]>([]);
  const [branches, setBranches] = useState<BranchMapPoint[]>([]);
  const [routes, setRoutes] = useState<DriverRouteInfo[]>([]);
  const [error, setError] = useState('');
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [voiceOn, setVoiceOn] = useState(true);
  const [lastVoice, setLastVoice] = useState<string | null>(null);

  voiceEnabledRef.current = voiceOn;

  const upsertLocal = useCallback((partial: Partial<DriverLiveLocation>) => {
    if (!partial.driverProfileId || partial.lat == null || partial.lng == null) return;
    const id = partial.driverProfileId;
    const lat = partial.lat;
    const lng = partial.lng;
    setLocations((prev) => {
      const idx = prev.findIndex((p) => p.driverProfileId === id);
      const next: DriverLiveLocation = {
        driverProfileId: id,
        lat,
        lng,
        accuracy: partial.accuracy ?? null,
        heading: partial.heading ?? null,
        speed: partial.speed ?? null,
        capturedAt: partial.capturedAt || new Date().toISOString(),
        sequenceNumber: partial.sequenceNumber || 0,
        driverName: partial.driverName,
        operationalStatus: partial.operationalStatus,
      };
      if (idx < 0) return [next, ...prev];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...next, driverName: next.driverName || copy[idx].driverName };
      return copy;
    });
    setLiveAt(new Date().toLocaleTimeString('es-CL'));
  }, []);

  const load = useCallback(async () => {
    setError('');
    try {
      const [locs, br] = await Promise.all([listLiveDriverLocations(), listBranchMapPoints()]);
      setLocations(locs);
      setBranches(br);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar mapa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeLiveLocations({
      onDbChange: () => {
        void load();
        setLiveAt(new Date().toLocaleTimeString('es-CL'));
      },
      onBroadcast: (p) => upsertLocal(p),
    });
  }, [load, upsertLocal]);

  // Init map + capa de rutas
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      if (!map.getSource(ROUTE_SOURCE)) {
        map.addSource(ROUTE_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getLayer(ROUTE_LAYER)) {
        map.addLayer({
          id: ROUTE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#c00000',
            'line-width': 4,
            'line-opacity': 0.85,
          },
        });
      }
    });

    mapRef.current = map;

    return () => {
      abortRef.current?.abort();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      branchMarkersRef.current.forEach((m) => m.remove());
      branchMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Branch markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    branchMarkersRef.current.forEach((m) => m.remove());
    branchMarkersRef.current = [];

    for (const b of branches) {
      const el = document.createElement('div');
      el.className = 'pd-map-branch';
      el.title = b.name;
      el.innerHTML = `<span>${b.name.slice(0, 1)}</span>`;
      const marker = new maplibregl.Marker({ element: el }).setLngLat([b.lng, b.lat]).addTo(map);
      branchMarkersRef.current.push(marker);
    }

    if (branches.length === 1) {
      map.easeTo({ center: [branches[0].lng, branches[0].lat], zoom: 13 });
    } else if (branches.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      branches.forEach((b) => bounds.extend([b.lng, b.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 13 });
    }
  }, [branches]);

  // Driver markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const loc of locations) {
      if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
      seen.add(loc.driverProfileId);
      const stale = isStale(loc.capturedAt);
      let marker = markersRef.current.get(loc.driverProfileId);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'pd-map-driver';
        el.innerHTML = `<span class="pd-map-driver__dot"></span><span class="pd-map-driver__label"></span>`;
        const created = new maplibregl.Marker({ element: el, anchor: 'center' });
        created.setLngLat([loc.lng, loc.lat]);
        created.addTo(map);
        markersRef.current.set(loc.driverProfileId, created);
        marker = created;
      } else {
        marker.setLngLat([loc.lng, loc.lat]);
      }
      const el = marker.getElement();
      el.classList.toggle('is-stale', stale);
      const label = el.querySelector('.pd-map-driver__label');
      if (label) {
        label.textContent = loc.driverName || loc.driverProfileId.slice(0, 6);
      }
      el.title = `${loc.driverName || 'Repartidor'}\n${loc.operationalStatus || ''}\n${loc.capturedAt}`;
    }

    for (const [id, m] of [...markersRef.current.entries()]) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
  }, [locations]);

  // Rutas OSRM + ETA + voz (throttle ~20s por repartidor)
  useEffect(() => {
    if (!branches.length) {
      setRoutes([]);
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const run = async () => {
      const next: DriverRouteInfo[] = [];
      const now = Date.now();

      for (const loc of locations) {
        if (isStale(loc.capturedAt)) continue;
        if (!Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) continue;
        const branch = pickNearestBranch(loc.lat, loc.lng, branches);
        if (!branch) continue;

        const cached = routeCacheRef.current.get(loc.driverProfileId);
        const freshEnough = cached && now - cached.updatedAt < 20_000;
        let info = freshEnough ? cached! : null;

        if (!info) {
          try {
            const route = await fetchDrivingRoute(
              loc.lat,
              loc.lng,
              branch.lat,
              branch.lng,
              ac.signal,
            );
            info = {
              driverProfileId: loc.driverProfileId,
              driverName: loc.driverName || 'Repartidor',
              branchName: branch.name,
              route,
              updatedAt: now,
            };
            routeCacheRef.current.set(loc.driverProfileId, info);
          } catch {
            continue;
          }
        } else {
          info = {
            ...info,
            driverName: loc.driverName || info.driverName,
          };
        }

        next.push(info);

        const etaMin = info.route.durationSeconds / 60;
        if (voiceEnabledRef.current && etaMin <= ETA_VOICE_MINUTES && etaMin > 0) {
          speakArrivalAlert(info.driverName, etaMin);
          setLastVoice(
            `${info.driverName} · ~${formatEtaMinutes(info.route.durationSeconds)} a ${info.branchName}`,
          );
        }
      }

      // limpiar cache de repartidores que ya no están
      const ids = new Set(next.map((r) => r.driverProfileId));
      for (const id of [...routeCacheRef.current.keys()]) {
        if (!ids.has(id)) routeCacheRef.current.delete(id);
      }

      if (!ac.signal.aborted) setRoutes(next);
    };

    void run();
    return () => ac.abort();
  }, [locations, branches]);

  // Pintar polilíneas en el mapa
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const source = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: 'FeatureCollection',
        features: routes.map((r) => ({
          type: 'Feature',
          properties: {
            driverProfileId: r.driverProfileId,
            name: r.driverName,
          },
          geometry: {
            type: 'LineString',
            coordinates: r.route.coordinates,
          },
        })),
      });
    };

    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [routes]);

  const fresh = locations.filter((l) => !isStale(l.capturedAt)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mapa en vivo</h1>
          <p className="mt-1 text-sm text-gray-500">
            MapLibre + MapTiler · ruta OSRM (km / ETA) · aviso por voz a ~{ETA_VOICE_MINUTES} min
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-gray-600 ring-1 ring-black/10">
            {fresh} en vivo · {locations.length} total
            {liveAt ? ` · ${liveAt}` : ''}
          </span>
          <button
            type="button"
            className={`rounded-xl px-3 py-2 text-xs font-bold ${
              voiceOn ? 'bg-amber-500 text-white' : 'bg-white ring-1 ring-black/10'
            }`}
            onClick={() => {
              const next = !voiceOn;
              setVoiceOn(next);
              if (!next) {
                resetVoiceAlerts();
                window.speechSynthesis?.cancel();
              }
            }}
          >
            {voiceOn ? 'Voz ON' : 'Voz OFF'}
          </button>
          <button type="button" className="pd-btn" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
      </div>

      {lastVoice && voiceOn && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-950 ring-1 ring-amber-200">
          Último aviso: {lastVoice}
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
          {/does not exist|pd_upsert/i.test(error)
            ? ' — ejecuta migrations 004 + 013 en Supabase.'
            : ''}
        </p>
      )}

      {loading && <p className="text-sm text-gray-400">Cargando posiciones…</p>}

      <div
        ref={containerRef}
        className="h-[min(70vh,640px)] w-full overflow-hidden rounded-2xl ring-1 ring-black/10"
      />

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((l) => {
          const r = routes.find((x) => x.driverProfileId === l.driverProfileId);
          return (
            <li
              key={l.driverProfileId}
              className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-black/5"
            >
              <p className="font-bold">{l.driverName || l.driverProfileId.slice(0, 8)}</p>
              <p className="text-gray-500">
                {l.lat.toFixed(5)}, {l.lng.toFixed(5)}
                {isStale(l.capturedAt) ? ' · stale' : ' · live'}
              </p>
              {r && (
                <p className="mt-1 font-semibold text-[var(--pd-red)]">
                  → {r.branchName}: {formatKm(r.route.distanceMeters)} · ETA{' '}
                  {formatEtaMinutes(r.route.durationSeconds)}
                  <span className="ml-1 font-normal text-gray-400">({r.route.source})</span>
                </p>
              )}
            </li>
          );
        })}
        {!locations.length && !loading && (
          <li className="text-sm text-gray-500 sm:col-span-2">
            Sin posiciones. Al aceptar un pedido el GPS se activa solo; también pueden usar{' '}
            <strong>Compartir GPS</strong>.
          </li>
        )}
      </ul>

      {!branches.length && !loading && (
        <p className="text-xs text-amber-800">
          Carga <code>lat</code>/<code>lng</code> en <code>branches</code> para dibujar la ruta al
          local y calcular ETA.
        </p>
      )}

      <style>{`
        .pd-map-branch {
          width: 28px; height: 28px; border-radius: 8px;
          background: #111827; color: #fff; display: grid; place-items: center;
          font-size: 12px; font-weight: 800; box-shadow: 0 2px 8px rgb(0 0 0 / 0.3);
        }
        .pd-map-driver {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
        }
        .pd-map-driver__dot {
          width: 16px; height: 16px; border-radius: 999px;
          background: #c00000; border: 2px solid #fff;
          box-shadow: 0 0 0 4px rgb(192 0 0 / 0.25);
        }
        .pd-map-driver.is-stale .pd-map-driver__dot {
          background: #9ca3af; box-shadow: none;
        }
        .pd-map-driver__label {
          font-size: 10px; font-weight: 700; color: #111827;
          background: #fff; padding: 1px 6px; border-radius: 999px;
          box-shadow: 0 1px 4px rgb(0 0 0 / 0.15); white-space: nowrap;
        }
      `}</style>
    </div>
  );
}
