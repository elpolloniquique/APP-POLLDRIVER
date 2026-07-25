import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_ZOOM,
  listBranchMapPoints,
  type BranchMapPoint,
} from '../lib/location';
import { useRealtimeTracking } from '../hooks/useRealtimeTracking';
import { driverColor } from '../lib/driverColors';
import {
  formatAgeSeconds,
  formatDistanceMeters,
  formatEtaSeconds,
  formatSpeedKmh,
  gpsFreshness,
} from '../lib/formatters';
import {
  announceGeofence,
  detectBranchAndConfirm,
  detectCustomerAndConfirm,
  persistGeofenceEvent,
} from '../lib/geofenceService';
import { osrmMultiStop, osrmRoute } from '../lib/osrmService';
import type { RouteResult } from '../lib/routing';
import { haversineMeters, pickNearestBranch } from '../lib/routing';
import {
  capacityLabel,
  groupAssignmentsByDriver,
  isAtCapacity,
  listLiveAssignments,
  type LiveAssignment,
} from '../lib/liveDispatch';
import {
  animateMarkerTo,
  styleForBasemap,
  type BasemapMode,
} from '../lib/mapStyles';
import {
  clearVoiceDedupe,
  loadVoicePreference,
  setVoiceEnabled,
  speakTrackingEvent,
  unlockVoice,
} from '../lib/voiceNotificationService';
import type { RealtimeConnStatus } from '../lib/realtimeTracking';

const ROUTE_SOURCE = 'pd-live-routes';
const ROUTE_LAYER = 'pd-live-routes-line';

interface DriverRouteState {
  route: RouteResult;
  branchName: string;
  at: number;
  fromLat: number;
  fromLng: number;
  stopLabel?: string;
  legEtas?: string[];
  tickets?: string[];
}

function statusLabel(s?: string): string {
  const map: Record<string, string> = {
    offline: 'Offline',
    available: 'Disponible',
    offered: 'Oferta recibida',
    heading_to_branch: 'Camino a sucursal',
    near_branch: 'Cerca de sucursal',
    arrived_branch: 'En sucursal',
    waiting_pickup: 'Esperando pedido',
    carrying_orders: 'Transportando',
    heading_to_customer: 'Camino al cliente',
    near_customer: 'Cerca del cliente',
    arrived_customer: 'En cliente',
    delivering: 'Entregando',
    paused: 'Pausado',
    location_stale: 'GPS desactualizado',
  };
  return map[s || ''] || s || '—';
}

function connBadge(status: RealtimeConnStatus): { label: string; className: string } {
  switch (status) {
    case 'subscribed':
      return { label: 'Realtime OK', className: 'bg-emerald-100 text-emerald-800' };
    case 'connecting':
      return { label: 'Conectando…', className: 'bg-sky-100 text-sky-800' };
    case 'reconnecting':
      return { label: 'Reconectando…', className: 'bg-amber-100 text-amber-900' };
    case 'error':
      return { label: 'Realtime error', className: 'bg-red-100 text-red-800' };
    default:
      return { label: 'Realtime OFF', className: 'bg-gray-200 text-gray-700' };
  }
}

export function LiveMapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const branchMarkersRef = useRef<Marker[]>([]);
  const customerMarkersRef = useRef<Marker[]>([]);
  const popupsRef = useRef<Map<string, Popup>>(new Map());
  const routeStateRef = useRef<Map<string, DriverRouteState>>(new Map());
  const followIdRef = useRef<string | null>(null);
  const userMovedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const {
    locations,
    connStatus,
    liveAt,
    error: rtError,
    loading,
    reload,
  } = useRealtimeTracking();

  const [branches, setBranches] = useState<BranchMapPoint[]>([]);
  const [assignments, setAssignments] = useState<LiveAssignment[]>([]);
  const [routes, setRoutes] = useState<Map<string, DriverRouteState>>(new Map());
  const [error, setError] = useState('');
  const [mapError, setMapError] = useState('');
  const [voiceOn, setVoiceOn] = useState(() => loadVoicePreference());
  const [voiceUnlocked, setVoiceUnlocked] = useState(false);
  const [followId, setFollowId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [tick, setTick] = useState(0);
  const [lastVoice, setLastVoice] = useState<string | null>(null);
  const [inRouteCount, setInRouteCount] = useState(0);
  const [basemap, setBasemap] = useState<BasemapMode>('streets');
  const [mapReady, setMapReady] = useState(false);

  followIdRef.current = followId;

  const byDriver = useMemo(() => groupAssignmentsByDriver(assignments), [assignments]);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const refreshAssignments = useCallback(async () => {
    try {
      const rows = await listLiveAssignments();
      setAssignments(rows);
      setInRouteCount(rows.length);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void listBranchMapPoints()
      .then(setBranches)
      .catch((e) => setError(e instanceof Error ? e.message : 'Error sucursales'));
    void refreshAssignments();
    const t = window.setInterval(() => void refreshAssignments(), 15000);
    return () => window.clearInterval(t);
  }, [refreshAssignments]);

  useEffect(() => {
    if (rtError) setError(rtError);
  }, [rtError]);

  const load = () => {
    void reload();
    void refreshAssignments();
  };

  // Init map (calles/satélite raster estables — sin MapTiler)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let resizeObs: ResizeObserver | null = null;

    const ensureRoutes = (m: MapLibreMap) => {
      if (!m.getSource(ROUTE_SOURCE)) {
        m.addSource(ROUTE_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!m.getLayer(ROUTE_LAYER)) {
        m.addLayer({
          id: ROUTE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ['get', 'color'],
            'line-width': 5,
            'line-opacity': 0.92,
          },
        });
      }
    };

    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: styleForBasemap('streets'),
        center: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
        attributionControl: { compact: true },
      });
    } catch {
      setMapError('No se pudo iniciar el mapa. Recarga la página.');
      return;
    }

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120 }), 'bottom-right');

    const onReady = () => {
      if (!map || cancelled) return;
      ensureRoutes(map);
      map.resize();
      setMapReady(true);
      setMapError('');
    };

    map.on('load', onReady);
    map.on('dragstart', () => {
      userMovedRef.current = true;
      setFollowId(null);
    });
    map.on('error', (e) => {
      const msg = (e as { error?: { message?: string } })?.error?.message || '';
      if (msg) setMapError(`Mapa: ${msg.slice(0, 120)}`);
    });

    resizeObs = new ResizeObserver(() => {
      map?.resize();
    });
    resizeObs.observe(containerRef.current);

    // Resize diferido (layout flex / Vercel)
    window.setTimeout(() => map?.resize(), 120);
    window.setTimeout(() => map?.resize(), 500);

    mapRef.current = map;

    return () => {
      cancelled = true;
      setMapReady(false);
      abortRef.current?.abort();
      resizeObs?.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      branchMarkersRef.current.forEach((m) => m.remove());
      branchMarkersRef.current = [];
      customerMarkersRef.current.forEach((m) => m.remove());
      customerMarkersRef.current = [];
      popupsRef.current.forEach((p) => p.remove());
      popupsRef.current.clear();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Cambiar Calles ↔ Satélite (omite el primer render: ya inició en calles)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!(map as unknown as { __rxBasemapBoot?: boolean }).__rxBasemapBoot) {
      (map as unknown as { __rxBasemapBoot?: boolean }).__rxBasemapBoot = true;
      if (basemap === 'streets') return;
    }
    setMapError('');
    map.setStyle(styleForBasemap(basemap));
    map.once('style.load', () => {
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
            'line-color': ['get', 'color'],
            'line-width': 5,
            'line-opacity': 0.92,
          },
        });
      }
      const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (src) {
        const features = [...routeStateRef.current.entries()].map(([id, rs]) => ({
          type: 'Feature' as const,
          properties: { color: driverColor(id) },
          geometry: { type: 'LineString' as const, coordinates: rs.route.coordinates },
        }));
        src.setData({ type: 'FeatureCollection', features });
      }
      map.resize();
    });
  }, [basemap, mapReady]);

  // Branch markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    branchMarkersRef.current.forEach((m) => m.remove());
    branchMarkersRef.current = [];
    for (const b of branches) {
      if (branchFilter !== 'all' && b.id !== branchFilter) continue;
      const el = document.createElement('div');
      el.className = 'pd-live-branch';
      el.title = b.name;
      el.innerHTML = `<span>🏪</span>`;
      branchMarkersRef.current.push(
        new maplibregl.Marker({ element: el }).setLngLat([b.lng, b.lat]).addTo(map),
      );
    }
  }, [branches, branchFilter, mapReady, basemap]);

  const filtered = useMemo(() => {
    return locations.filter((l) => {
      if (statusFilter !== 'all' && (l.operationalStatus || '') !== statusFilter) return false;
      return true;
    });
  }, [locations, statusFilter, tick]);

  // Routes OSRM (sucursal y/o multi-stop clientes) + geocercas confirmadas
  useEffect(() => {
    if (!branches.length) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    void (async () => {
      const next = new Map(routeStateRef.current);
      for (const loc of filtered) {
        if (gpsFreshness(loc.capturedAt) === 'stale') continue;
        const branch = pickNearestBranch(loc.lat, loc.lng, branches);
        if (!branch) continue;
        if (branchFilter !== 'all' && branch.id !== branchFilter) continue;

        const driverJobs = byDriver.get(loc.driverProfileId) || [];
        const picked = driverJobs.filter((j) => Boolean(j.pickedUpAt));
        const dropoffs = picked.filter(
          (j) => j.customerLat != null && j.customerLng != null && Number.isFinite(j.customerLat),
        );

        const prev = next.get(loc.driverProfileId);
        const need =
          !prev ||
          Date.now() - prev.at > 25_000 ||
          Math.hypot(loc.lat - prev.fromLat, loc.lng - prev.fromLng) > 0.001;

        if (need) {
          try {
            if (dropoffs.length >= 1) {
              const points = [
                { lat: loc.lat, lng: loc.lng },
                ...dropoffs.map((d) => ({ lat: d.customerLat!, lng: d.customerLng! })),
              ];
              const multi = await osrmMultiStop(points, ac.signal);
              next.set(loc.driverProfileId, {
                route: multi,
                branchName: branch.name,
                at: Date.now(),
                fromLat: loc.lat,
                fromLng: loc.lng,
                stopLabel: `Cliente(s) ×${dropoffs.length}`,
                tickets: dropoffs.map((d) => d.ticketCode || d.jobId.slice(0, 6)),
                legEtas: multi.legDurationsSeconds.map((s) => formatEtaSeconds(s)),
              });
            } else {
              const route = await osrmRoute(loc.lat, loc.lng, branch.lat, branch.lng, ac.signal);
              next.set(loc.driverProfileId, {
                route,
                branchName: branch.name,
                at: Date.now(),
                fromLat: loc.lat,
                fromLng: loc.lng,
                stopLabel: 'Sucursal',
                tickets: driverJobs.map((d) => d.ticketCode || d.jobId.slice(0, 6)),
              });
            }
          } catch {
            /* keep prev */
          }
        }

        const rs = next.get(loc.driverProfileId);
        const asgId = driverJobs[0]?.assignmentId || null;
        const ticket = driverJobs[0]?.ticketCode;

        if (rs && voiceOn) {
          const etaMin = rs.route.durationSeconds / 60;
          if (etaMin <= 5 && etaMin > 0 && !dropoffs.length) {
            speakTrackingEvent('eta_5', {
              driverName: loc.driverName || 'Repartidor',
              etaMin: Math.round(etaMin),
              ticket,
            });
            setLastVoice(`${loc.driverName || 'Repartidor'} · ETA ~${Math.round(etaMin)} min`);
          }
        }

        // Geocerca sucursal (2 hits)
        if (!picked.length) {
          const hit = detectBranchAndConfirm({
            driverId: loc.driverProfileId,
            assignmentId: asgId,
            driverLat: loc.lat,
            driverLng: loc.lng,
            branchLat: branch.lat,
            branchLng: branch.lng,
          });
          if (hit && voiceOn) {
            announceGeofence(hit, loc.driverName || 'Repartidor', ticket);
            setLastVoice(`${loc.driverName || 'Repartidor'} · ${hit}`);
            if (asgId) {
              void persistGeofenceEvent({
                assignmentId: asgId,
                geofenceType: 'branch',
                eventType: hit,
                lat: loc.lat,
                lng: loc.lng,
                distanceMeters: haversineMeters(loc.lat, loc.lng, branch.lat, branch.lng),
                accuracy: loc.accuracy,
              });
            }
          }
        }

        // Geocerca cliente (primer dropoff con coords)
        const firstDrop = dropoffs[0];
        if (firstDrop) {
          const hit = detectCustomerAndConfirm({
            driverId: loc.driverProfileId,
            assignmentId: firstDrop.assignmentId,
            driverLat: loc.lat,
            driverLng: loc.lng,
            customerLat: firstDrop.customerLat!,
            customerLng: firstDrop.customerLng!,
          });
          if (hit && voiceOn) {
            announceGeofence(hit, loc.driverName || 'Repartidor', firstDrop.ticketCode);
            setLastVoice(`${loc.driverName || 'Repartidor'} · ${hit}`);
            void persistGeofenceEvent({
              assignmentId: firstDrop.assignmentId,
              geofenceType: 'customer',
              eventType: hit,
              lat: loc.lat,
              lng: loc.lng,
              distanceMeters: haversineMeters(
                loc.lat,
                loc.lng,
                firstDrop.customerLat!,
                firstDrop.customerLng!,
              ),
              accuracy: loc.accuracy,
            });
          }
        }

        if (gpsFreshness(loc.capturedAt) === 'stale' && voiceOn) {
          speakTrackingEvent('stale', { driverName: loc.driverName || 'Repartidor' });
        }
      }
      routeStateRef.current = next;
      if (!ac.signal.aborted) setRoutes(new Map(next));
    })();

    return () => ac.abort();
  }, [filtered, branches, branchFilter, voiceOn, byDriver]);

  // Customer markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    customerMarkersRef.current.forEach((m) => m.remove());
    customerMarkersRef.current = [];
    for (const a of assignments) {
      if (a.customerLat == null || a.customerLng == null) continue;
      if (!a.pickedUpAt) continue;
      const el = document.createElement('div');
      el.className = 'pd-live-customer';
      el.title = `#${a.ticketCode} ${a.customerName}`;
      el.innerHTML = `<span>📦</span>`;
      customerMarkersRef.current.push(
        new maplibregl.Marker({ element: el })
          .setLngLat([a.customerLng, a.customerLat])
          .addTo(map),
      );
    }
  }, [assignments, mapReady, basemap]);

  // Draw routes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const src = map.getSource(ROUTE_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (!src) return;
      const features = [...routes.entries()].map(([id, rs]) => ({
        type: 'Feature' as const,
        properties: { color: driverColor(id) },
        geometry: { type: 'LineString' as const, coordinates: rs.route.coordinates },
      }));
      src.setData({ type: 'FeatureCollection', features });
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [routes]);

  // Driver markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();

    for (const loc of filtered) {
      seen.add(loc.driverProfileId);
      const color = driverColor(loc.driverProfileId);
      const fresh = gpsFreshness(loc.capturedAt);
      const rs = routes.get(loc.driverProfileId);
      let marker = markersRef.current.get(loc.driverProfileId);
      if (!marker) {
        const el = document.createElement('div');
        el.className = 'pd-live-driver';
        el.innerHTML = `
          <div class="pd-live-driver__bike" style="background:${color}">🛵</div>
          <div class="pd-live-driver__label">
            <strong></strong>
            <span class="pd-live-driver__meta"></span>
          </div>`;
        marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([loc.lng, loc.lat])
          .addTo(map);
        markersRef.current.set(loc.driverProfileId, marker);
        el.addEventListener('click', () => {
          setFollowId(loc.driverProfileId);
          userMovedRef.current = false;
          map.easeTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 14) });
        });
      } else {
        animateMarkerTo(marker, loc.lng, loc.lat, 750);
      }

      const el = marker.getElement();
      el.classList.toggle('is-stale', fresh === 'stale');
      el.classList.toggle('is-warn', fresh === 'warn');
      const bike = el.querySelector('.pd-live-driver__bike') as HTMLElement | null;
      if (bike) {
        bike.style.background = color;
        if (loc.heading != null && Number.isFinite(loc.heading)) {
          bike.style.transform = `rotate(${loc.heading}deg)`;
        }
      }
      const nameEl = el.querySelector('strong');
      const metaEl = el.querySelector('.pd-live-driver__meta');
      if (nameEl) nameEl.textContent = loc.driverName || loc.driverProfileId.slice(0, 6);
      if (metaEl && rs) {
        metaEl.textContent = `${formatDistanceMeters(rs.route.distanceMeters)} · ${formatEtaSeconds(rs.route.durationSeconds)}`;
      } else if (metaEl) {
        metaEl.textContent = statusLabel(loc.operationalStatus);
      }

      if (followIdRef.current === loc.driverProfileId && !userMovedRef.current) {
        map.easeTo({
          center: [loc.lng, loc.lat],
          zoom: Math.max(map.getZoom(), 16),
          duration: 650,
        });
      }
    }

    for (const [id, m] of [...markersRef.current.entries()]) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
  }, [filtered, routes]);

  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    userMovedRef.current = false;
    setFollowId(null);
    const bounds = new maplibregl.LngLatBounds();
    let n = 0;
    filtered.forEach((l) => {
      bounds.extend([l.lng, l.lat]);
      n += 1;
    });
    branches.forEach((b) => {
      if (branchFilter === 'all' || b.id === branchFilter) {
        bounds.extend([b.lng, b.lat]);
        n += 1;
      }
    });
    if (n) map.fitBounds(bounds, { padding: 70, maxZoom: 14 });
  };

  const liveCount = filtered.filter((l) => gpsFreshness(l.capturedAt) === 'live').length;

  const enableVoice = () => {
    unlockVoice();
    setVoiceUnlocked(true);
    setVoiceEnabled(true);
    setVoiceOn(true);
  };

  return (
    <div className="flex min-h-[calc(100dvh-5rem)] flex-col gap-4 lg:flex-row">
      {/* Sidebar */}
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-80">
        <div>
          <h1 className="text-2xl font-bold">Despacho en vivo</h1>
          <p className="mt-1 text-xs text-gray-500">
            Seguimiento tipo delivery · calles / satélite · OSRM · Realtime
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-white p-3 ring-1 ring-black/5">
            <p className="text-[10px] font-bold uppercase text-gray-400">En vivo</p>
            <p className="text-xl font-bold text-[var(--pd-red)]">{liveCount}</p>
          </div>
          <div className="rounded-xl bg-white p-3 ring-1 ring-black/5">
            <p className="text-[10px] font-bold uppercase text-gray-400">GPS</p>
            <p className="text-xl font-bold">{filtered.length}</p>
          </div>
          <div className="rounded-xl bg-white p-3 ring-1 ring-black/5">
            <p className="text-[10px] font-bold uppercase text-gray-400">En ruta</p>
            <p className="text-xl font-bold">{inRouteCount}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${connBadge(connStatus).className}`}
          >
            {connBadge(connStatus).label}
          </span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-gray-600 ring-1 ring-black/10">
            Sync {liveAt || '—'}
          </span>
          {(connStatus === 'error' || connStatus === 'reconnecting' || connStatus === 'closed') && (
            <button
              type="button"
              className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold ring-1 ring-black/10"
              onClick={load}
            >
              Reconectar
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {!voiceUnlocked || !voiceOn ? (
            <button type="button" className="pd-btn text-xs" onClick={enableVoice}>
              Activar avisos por voz
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-white"
              onClick={() => {
                setVoiceEnabled(false);
                setVoiceOn(false);
                clearVoiceDedupe();
              }}
            >
              Voz ON · silenciar
            </button>
          )}
          <button type="button" className="rounded-xl bg-white px-3 py-2 text-xs font-bold ring-1 ring-black/10" onClick={fitAll}>
            Centrar todos
          </button>
          <button type="button" className="pd-btn text-xs" onClick={() => void load()}>
            Actualizar
          </button>
        </div>

        <div className="grid gap-2">
          <label className="text-[10px] font-bold uppercase text-gray-400">Sucursal</label>
          <select
            className="pd-input text-sm"
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
          >
            <option value="all">Todas</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <label className="text-[10px] font-bold uppercase text-gray-400">Estado</label>
          <select
            className="pd-input text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="available">Disponible</option>
            <option value="heading_to_branch">Camino a sucursal</option>
            <option value="carrying_orders">Transportando</option>
            <option value="delivering">Entregando</option>
          </select>
        </div>

        {lastVoice && voiceOn && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-950 ring-1 ring-amber-200">
            Voz: {lastVoice}
          </p>
        )}

        <ul className="max-h-[50vh] space-y-2 overflow-y-auto lg:max-h-none lg:flex-1">
          {filtered.map((l) => {
            const color = driverColor(l.driverProfileId);
            const rs = routes.get(l.driverProfileId);
            const fresh = gpsFreshness(l.capturedAt);
            const following = followId === l.driverProfileId;
            const jobs = byDriver.get(l.driverProfileId) || [];
            const maxOrders = jobs[0]?.maxOrders || 2;
            const cap = capacityLabel(jobs.length, maxOrders);
            const full = isAtCapacity(jobs.length, maxOrders);
            const tickets =
              rs?.tickets?.length
                ? rs.tickets
                : jobs.map((j) => j.ticketCode || j.jobId.slice(0, 6));
            return (
              <li
                key={l.driverProfileId}
                className={`rounded-2xl bg-white p-3 text-xs shadow-sm ring-1 ${
                  following ? 'ring-2 ring-[var(--pd-red)]' : 'ring-black/5'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm text-white"
                    style={{ background: color }}
                  >
                    🛵
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-bold">{l.driverName || 'Repartidor'}</p>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                          full
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {cap}
                      </span>
                    </div>
                    <p className="text-gray-500">{statusLabel(l.operationalStatus)}</p>
                    {tickets.length > 0 && (
                      <p className="mt-1 truncate text-[10px] font-semibold text-gray-700">
                        Tickets: {tickets.join(' · ')}
                      </p>
                    )}
                    <p className="mt-1 tabular-nums text-gray-600">
                      {formatSpeedKmh(l.speed)} · GPS {formatAgeSeconds(l.capturedAt)}
                      {l.accuracy != null ? ` · ±${Math.round(l.accuracy)} m` : ''}
                    </p>
                    {rs ? (
                      <>
                        <p className="mt-1 font-semibold" style={{ color }}>
                          → {rs.stopLabel || rs.branchName}:{' '}
                          {formatDistanceMeters(rs.route.distanceMeters)} · ETA{' '}
                          {formatEtaSeconds(rs.route.durationSeconds)}
                        </p>
                        {rs.legEtas && rs.legEtas.length > 1 && (
                          <p className="mt-0.5 text-[10px] text-gray-500">
                            Tramos: {rs.legEtas.map((e, i) => `#${i + 1} ${e}`).join(' · ')}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-gray-400">Calculando ruta…</p>
                    )}
                    <p
                      className={`mt-1 text-[10px] font-bold uppercase ${
                        fresh === 'live'
                          ? 'text-emerald-600'
                          : fresh === 'warn'
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
                      {fresh === 'live' ? 'Live' : fresh === 'warn' ? 'GPS retrasado' : 'GPS stale'}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-bold"
                    onClick={() => {
                      const map = mapRef.current;
                      if (!map) return;
                      userMovedRef.current = false;
                      map.easeTo({ center: [l.lng, l.lat], zoom: 15 });
                    }}
                  >
                    Ver en mapa
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                      following ? 'bg-[var(--pd-red)] text-white' : 'bg-gray-100'
                    }`}
                    onClick={() => {
                      if (following) {
                        setFollowId(null);
                      } else {
                        userMovedRef.current = false;
                        setFollowId(l.driverProfileId);
                        mapRef.current?.easeTo({ center: [l.lng, l.lat], zoom: 15 });
                      }
                    }}
                  >
                    {following ? 'Siguiendo…' : 'Seguir'}
                  </button>
                </div>
              </li>
            );
          })}
          {!filtered.length && !loading && (
            <li className="rounded-2xl bg-white p-4 text-sm text-gray-500 ring-1 ring-black/5">
              No hay repartidores activos con GPS. Al aceptar un pedido el GPS se activa solo.
            </li>
          )}
        </ul>
      </aside>

      {/* Map */}
      <section className="relative min-h-[520px] flex-1 overflow-hidden rounded-2xl ring-1 ring-black/10 lg:min-h-[calc(100dvh-5rem)]">
        {(error || mapError) && (
          <p className="absolute left-3 top-3 z-10 max-w-sm rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 shadow">
            {error || mapError}
          </p>
        )}
        <div className="absolute right-3 top-3 z-10 flex gap-1 rounded-xl bg-white/95 p-1 shadow ring-1 ring-black/10">
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${
              basemap === 'streets' ? 'bg-[var(--pd-red)] text-white' : 'text-gray-700'
            }`}
            onClick={() => setBasemap('streets')}
          >
            Calles
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${
              basemap === 'satellite' ? 'bg-[var(--pd-red)] text-white' : 'text-gray-700'
            }`}
            onClick={() => setBasemap('satellite')}
          >
            Satélite
          </button>
        </div>
        <div ref={containerRef} className="absolute inset-0 h-full w-full bg-[#e8eef2]" />
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/95 px-3 py-2 text-[10px] shadow ring-1 ring-black/5">
          <p className="font-bold uppercase text-gray-500">Leyenda</p>
          <p>🏪 Sucursal · 🛵 Repartidor · 📦 Cliente · línea = ruta</p>
          <p className="text-gray-400">
            {basemap === 'satellite' ? 'Satélite Esri + calles' : 'Calles CARTO/OSM'} · Seguir = zoom en vivo
          </p>
        </div>
      </section>

      <style>{`
        .pd-live-branch {
          width: 32px; height: 32px; border-radius: 10px;
          background: #111827; display: grid; place-items: center;
          box-shadow: 0 2px 10px rgb(0 0 0 / 0.35); font-size: 14px;
        }
        .pd-live-customer {
          width: 30px; height: 30px; border-radius: 10px;
          background: #0f766e; display: grid; place-items: center;
          box-shadow: 0 2px 10px rgb(0 0 0 / 0.35); font-size: 13px;
          border: 2px solid #fff;
        }
        .pd-live-driver {
          display: flex; flex-direction: column; align-items: center; gap: 2px;
        }
        .pd-live-driver__bike {
          width: 34px; height: 34px; border-radius: 999px;
          display: grid; place-items: center; font-size: 16px;
          border: 2px solid #fff; box-shadow: 0 2px 10px rgb(0 0 0 / 0.35);
          transition: transform 0.4s ease;
        }
        .pd-live-driver.is-stale .pd-live-driver__bike { filter: grayscale(1); opacity: 0.7; }
        .pd-live-driver.is-warn .pd-live-driver__bike { box-shadow: 0 0 0 3px rgb(245 158 11 / 0.5); }
        .pd-live-driver__label {
          background: #fff; border-radius: 8px; padding: 2px 8px;
          box-shadow: 0 1px 6px rgb(0 0 0 / 0.2); text-align: center;
          max-width: 140px;
        }
        .pd-live-driver__label strong {
          display: block; font-size: 11px; font-weight: 800; color: #111;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .pd-live-driver__meta {
          display: block; font-size: 9px; font-weight: 700; color: #666;
        }
      `}</style>
    </div>
  );
}
