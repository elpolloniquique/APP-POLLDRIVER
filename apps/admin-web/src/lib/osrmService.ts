import { z } from 'zod';
import type { RouteResult } from './routing';
import { fetchDrivingRoute, fetchMultiStopRoute, haversineMeters } from './routing';

const cache = new Map<
  string,
  {
    at: number;
    route: RouteResult & {
      legDurationsSeconds?: number[];
      legDistancesMeters?: number[];
    };
  }
>();
const CACHE_MS = 25_000;

function cacheKey(parts: number[]): string {
  return parts.map((n) => n.toFixed(5)).join('|');
}

export function getOsrmBaseUrl(): string {
  return (
    String(import.meta.env.VITE_OSRM_BASE_URL || '').trim() ||
    'https://router.project-osrm.org'
  );
}

export const DriverLocationPayloadSchema = z.object({
  driverProfileId: z.string().min(1),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
  accuracy: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
  capturedAt: z.string().optional(),
  sequenceNumber: z.number().optional(),
  driverName: z.string().optional(),
  operationalStatus: z.string().optional(),
  batteryLevel: z.number().nullable().optional(),
});

export type DriverLocationPayload = z.infer<typeof DriverLocationPayloadSchema>;

export async function osrmRoute(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  signal?: AbortSignal,
): Promise<RouteResult> {
  const key = cacheKey([fromLat, fromLng, toLat, toLng]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.route;

  void getOsrmBaseUrl();
  const route = await fetchDrivingRoute(fromLat, fromLng, toLat, toLng, signal);
  cache.set(key, { at: Date.now(), route });
  return route;
}

export async function osrmMultiStop(
  points: Array<{ lat: number; lng: number }>,
  signal?: AbortSignal,
): Promise<RouteResult & { legDurationsSeconds: number[]; legDistancesMeters: number[] }> {
  const flat = points.flatMap((p) => [p.lat, p.lng]);
  const key = `m|${cacheKey(flat)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return {
      ...hit.route,
      legDurationsSeconds: hit.route.legDurationsSeconds || [],
      legDistancesMeters: hit.route.legDistancesMeters || [],
    };
  }
  const route = await fetchMultiStopRoute(points, signal);
  cache.set(key, { at: Date.now(), route });
  return route;
}

export function shouldRecalcRoute(
  lastRouteAt: number,
  driverLat: number,
  driverLng: number,
  lastRouteDriverLat: number,
  lastRouteDriverLng: number,
  intervalMs = 25_000,
  deviateM = 120,
): boolean {
  if (Date.now() - lastRouteAt >= intervalMs) return true;
  const d = haversineMeters(driverLat, driverLng, lastRouteDriverLat, lastRouteDriverLng);
  return d >= deviateM;
}
