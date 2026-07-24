/** Routing gratuito (OSRM público) + fallback haversine. Sin API key. */

export interface RouteResult {
  distanceMeters: number;
  durationSeconds: number;
  /** Coordenadas [lng, lat] para MapLibre */
  coordinates: [number, number][];
  source: 'osrm' | 'haversine';
}

export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function haversineRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
): RouteResult {
  const distanceMeters = haversineMeters(fromLat, fromLng, toLat, toLng);
  // ~25 km/h ciudad → m/s
  const durationSeconds = Math.max(60, Math.round(distanceMeters / 6.9));
  return {
    distanceMeters,
    durationSeconds,
    coordinates: [
      [fromLng, fromLat],
      [toLng, toLat],
    ],
    source: 'haversine',
  };
}

/**
 * Ruta en auto driver → destino (local).
 * Usa OSRM demo; si falla, línea recta + ETA estimada.
 */
export async function fetchDrivingRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const fallback = () => haversineRoute(fromLat, fromLng, toLat, toLng);
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${fromLng},${fromLat};${toLng},${toLat}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal });
    if (!res.ok) return fallback();
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry?: { coordinates?: [number, number][] };
      }>;
    };
    const route = json.routes?.[0];
    if (!route || json.code !== 'Ok') return fallback();
    const coordinates = route.geometry?.coordinates;
    if (!coordinates?.length) return fallback();
    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      coordinates,
      source: 'osrm',
    };
  } catch {
    return fallback();
  }
}

/**
 * Ruta multi-parada (driver → stop1 → stop2…).
 * OSRM demo; fallback haversine encadenado.
 */
export async function fetchMultiStopRoute(
  points: Array<{ lat: number; lng: number }>,
  signal?: AbortSignal,
): Promise<RouteResult & { legDurationsSeconds: number[]; legDistancesMeters: number[] }> {
  if (points.length < 2) {
    return {
      distanceMeters: 0,
      durationSeconds: 0,
      coordinates: points.map((p) => [p.lng, p.lat] as [number, number]),
      source: 'haversine',
      legDurationsSeconds: [],
      legDistancesMeters: [],
    };
  }

  const fallback = () => {
    let distanceMeters = 0;
    let durationSeconds = 0;
    const coordinates: [number, number][] = [];
    const legDurationsSeconds: number[] = [];
    const legDistancesMeters: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      coordinates.push([points[i].lng, points[i].lat]);
      if (i === 0) continue;
      const d = haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
      const t = Math.max(60, Math.round(d / 6.9));
      distanceMeters += d;
      durationSeconds += t;
      legDistancesMeters.push(d);
      legDurationsSeconds.push(t);
    }
    return {
      distanceMeters,
      durationSeconds,
      coordinates,
      source: 'haversine' as const,
      legDurationsSeconds,
      legDistancesMeters,
    };
  };

  try {
    const path = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const base =
      String(import.meta.env.VITE_OSRM_BASE_URL || '').trim() ||
      'https://router.project-osrm.org';
    const url = `${base}/route/v1/driving/${path}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url, { signal });
    if (!res.ok) return fallback();
    const json = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        legs?: Array<{ distance: number; duration: number }>;
        geometry?: { coordinates?: [number, number][] };
      }>;
    };
    const route = json.routes?.[0];
    if (!route || json.code !== 'Ok' || !route.geometry?.coordinates?.length) return fallback();
    return {
      distanceMeters: route.distance,
      durationSeconds: route.duration,
      coordinates: route.geometry.coordinates,
      source: 'osrm',
      legDurationsSeconds: (route.legs || []).map((l) => l.duration),
      legDistancesMeters: (route.legs || []).map((l) => l.distance),
    };
  } catch {
    return fallback();
  }
}

export function formatKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatEtaMinutes(seconds: number): string {
  const m = Math.max(1, Math.round(seconds / 60));
  return m === 1 ? '1 min' : `${m} min`;
}

export function pickNearestBranch<T extends { lat: number; lng: number }>(
  lat: number,
  lng: number,
  branches: T[],
): T | null {
  if (!branches.length) return null;
  let best = branches[0];
  let bestD = Infinity;
  for (const b of branches) {
    const d = haversineMeters(lat, lng, b.lat, b.lng);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}
