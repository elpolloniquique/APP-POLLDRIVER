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

function isStale(capturedAt: string): boolean {
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return true;
  return Date.now() - t > 90_000;
}

export function LiveMapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Map<string, Marker>>(new Map());
  const branchMarkersRef = useRef<Marker[]>([]);

  const [locations, setLocations] = useState<DriverLiveLocation[]>([]);
  const [branches, setBranches] = useState<BranchMapPoint[]>([]);
  const [error, setError] = useState('');
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: DEFAULT_MAP_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
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

  const fresh = locations.filter((l) => !isStale(l.capturedAt)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mapa en vivo</h1>
          <p className="mt-1 text-sm text-gray-500">
            MapLibre · GPS de repartidores (`pd_driver_location_latest` + Broadcast)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-gray-600 ring-1 ring-black/10">
            {fresh} en vivo · {locations.length} total
            {liveAt ? ` · ${liveAt}` : ''}
          </span>
          <button type="button" className="pd-btn" onClick={() => void load()}>
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
          {/does not exist|pd_upsert/i.test(error)
            ? ' — ejecuta migrations 004 + 013 en Supabase.'
            : ''}
        </p>
      )}

      {loading && (
        <p className="text-sm text-gray-400">Cargando posiciones…</p>
      )}

      <div
        ref={containerRef}
        className="h-[min(70vh,640px)] w-full overflow-hidden rounded-2xl ring-1 ring-black/10"
      />

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((l) => (
          <li
            key={l.driverProfileId}
            className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm ring-1 ring-black/5"
          >
            <p className="font-bold">{l.driverName || l.driverProfileId.slice(0, 8)}</p>
            <p className="text-gray-500">
              {l.lat.toFixed(5)}, {l.lng.toFixed(5)}
              {isStale(l.capturedAt) ? ' · stale' : ' · live'}
            </p>
          </li>
        ))}
        {!locations.length && !loading && (
          <li className="text-sm text-gray-500 sm:col-span-2">
            Sin posiciones. El repartidor debe activar <strong>Compartir GPS</strong> en Mis ofertas.
          </li>
        )}
      </ul>

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
