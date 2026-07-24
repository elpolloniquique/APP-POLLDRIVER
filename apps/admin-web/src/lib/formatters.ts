/** Formateo profesional distancia / ETA / velocidad. */

export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${km.toFixed(0)} km`;
}

export function formatEtaSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return 'menos de 1 min';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} h ${rm} min` : `${h} h`;
}

export function formatSpeedKmh(speedMs: number | null | undefined): string {
  if (speedMs == null || !Number.isFinite(speedMs) || speedMs < 0) return '0 km/h';
  const kmh = speedMs * 3.6;
  if (kmh < 0.8) return '0 km/h';
  if (kmh > 120) return '—'; // GPS basura
  return `${Math.round(kmh)} km/h`;
}

export function formatAgeSeconds(capturedAt: string, now = Date.now()): string {
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return 'sin dato';
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 5) return 'ahora';
  if (sec < 60) return `hace ${sec} s`;
  const m = Math.floor(sec / 60);
  return `hace ${m} min`;
}

export type GpsFreshness = 'live' | 'warn' | 'stale';

export function gpsFreshness(capturedAt: string, now = Date.now()): GpsFreshness {
  const t = new Date(capturedAt).getTime();
  if (!Number.isFinite(t)) return 'stale';
  const sec = (now - t) / 1000;
  if (sec <= 20) return 'live';
  if (sec <= 90) return 'warn';
  return 'stale';
}
