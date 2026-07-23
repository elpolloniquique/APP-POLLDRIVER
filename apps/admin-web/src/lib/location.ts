import { getSupabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface DriverLiveLocation {
  driverProfileId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  capturedAt: string;
  sequenceNumber: number;
  driverName?: string;
  operationalStatus?: string;
}

export interface BranchMapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

const BROADCAST_CHANNEL = 'pd-driver-locations';

let driverBroadcast: RealtimeChannel | null = null;

async function ensureDriverBroadcast(): Promise<RealtimeChannel | null> {
  const sb = getSupabase();
  if (!sb) return null;
  if (driverBroadcast) return driverBroadcast;
  driverBroadcast = sb.channel(BROADCAST_CHANNEL, {
    config: { broadcast: { self: false } },
  });
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(() => resolve(), 2500);
    driverBroadcast!.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        window.clearTimeout(t);
        resolve();
      }
    });
  });
  return driverBroadcast;
}

export function stopDriverBroadcast() {
  const sb = getSupabase();
  if (sb && driverBroadcast) {
    void sb.removeChannel(driverBroadcast);
  }
  driverBroadcast = null;
}

export async function listLiveDriverLocations(): Promise<DriverLiveLocation[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const { data, error } = await sb
    .from('pd_driver_location_latest')
    .select(`
      driver_profile_id, lat, lng, accuracy, heading, speed, captured_at, sequence_number,
      pd_driver_profiles (
        operational_status,
        profiles ( full_name )
      )
    `)
    .order('captured_at', { ascending: false });

  if (error) {
    if (/does not exist|schema cache|relationship/i.test(error.message)) {
      const { data: plain, error: e2 } = await sb
        .from('pd_driver_location_latest')
        .select('*')
        .order('captured_at', { ascending: false });
      if (e2) {
        if (/does not exist|schema cache/i.test(e2.message)) return [];
        throw e2;
      }
      return (plain || []).map((r) => mapPlain(r as Record<string, unknown>));
    }
    throw error;
  }

  return (data || []).map((row) => {
    const r = row as Record<string, unknown>;
    const dp = r.pd_driver_profiles as Record<string, unknown> | Record<string, unknown>[] | null;
    const driver = Array.isArray(dp) ? dp[0] : dp;
    const profRaw = driver?.profiles as Record<string, unknown> | Record<string, unknown>[] | null;
    const prof = Array.isArray(profRaw) ? profRaw[0] : profRaw;
    return {
      ...mapPlain(r),
      driverName: String(prof?.full_name || ''),
      operationalStatus: String(driver?.operational_status || ''),
    };
  });
}

function mapPlain(r: Record<string, unknown>): DriverLiveLocation {
  return {
    driverProfileId: String(r.driver_profile_id),
    lat: Number(r.lat),
    lng: Number(r.lng),
    accuracy: r.accuracy != null ? Number(r.accuracy) : null,
    heading: r.heading != null ? Number(r.heading) : null,
    speed: r.speed != null ? Number(r.speed) : null,
    capturedAt: String(r.captured_at || ''),
    sequenceNumber: Number(r.sequence_number) || 0,
  };
}

export async function listBranchMapPoints(): Promise<BranchMapPoint[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from('branches')
    .select('id, name, lat, lng, is_active')
    .eq('is_active', true);
  if (error) return [];
  return (data || [])
    .filter((b) => b.lat != null && b.lng != null)
    .map((b) => ({
      id: String(b.id),
      name: String(b.name),
      lat: Number(b.lat),
      lng: Number(b.lng),
    }));
}

export async function upsertMyLocation(input: {
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  assignmentId?: string | null;
}): Promise<{ ok: boolean; skipped?: boolean }> {
  const sb = getSupabase();
  if (!sb) throw new Error('Supabase no configurado');
  const { data, error } = await sb.rpc('pd_upsert_driver_location', {
    p_lat: input.lat,
    p_lng: input.lng,
    p_accuracy: input.accuracy ?? null,
    p_heading: input.heading ?? null,
    p_speed: input.speed ?? null,
    p_assignment_id: input.assignmentId ?? null,
    p_app_state: 'foreground',
    p_sequence: null,
  });
  if (error) throw new Error(error.message);
  const row = data as { ok?: boolean; skipped?: boolean; driver_profile_id?: string };

  // Broadcast baja latencia para el mapa admin
  if (row?.ok && !row.skipped) {
    try {
      const ch = await ensureDriverBroadcast();
      await ch?.send({
        type: 'broadcast',
        event: 'location',
        payload: {
          driverProfileId: row.driver_profile_id,
          lat: input.lat,
          lng: input.lng,
          accuracy: input.accuracy,
          heading: input.heading,
          speed: input.speed,
          capturedAt: new Date().toISOString(),
        },
      });
    } catch {
      /* broadcast opcional */
    }
  }

  return { ok: row?.ok === true, skipped: row?.skipped === true };
}

export function subscribeLiveLocations(handlers: {
  onDbChange: () => void;
  onBroadcast: (payload: Partial<DriverLiveLocation>) => void;
}): () => void {
  const sb = getSupabase();
  if (!sb) return () => undefined;

  const channel: RealtimeChannel = sb
    .channel('pd-map-live')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pd_driver_location_latest' },
      () => handlers.onDbChange(),
    )
    .on('broadcast', { event: 'location' }, ({ payload }) => {
      const p = payload as Record<string, unknown>;
      handlers.onBroadcast({
        driverProfileId: String(p.driverProfileId || ''),
        lat: Number(p.lat),
        lng: Number(p.lng),
        accuracy: p.accuracy != null ? Number(p.accuracy) : null,
        heading: p.heading != null ? Number(p.heading) : null,
        speed: p.speed != null ? Number(p.speed) : null,
        capturedAt: String(p.capturedAt || new Date().toISOString()),
        sequenceNumber: 0,
      });
    })
    .subscribe();

  // También escuchar el canal de broadcast dedicado
  const bc = sb.channel(BROADCAST_CHANNEL).on('broadcast', { event: 'location' }, ({ payload }) => {
    const p = payload as Record<string, unknown>;
    handlers.onBroadcast({
      driverProfileId: String(p.driverProfileId || ''),
      lat: Number(p.lat),
      lng: Number(p.lng),
      accuracy: p.accuracy != null ? Number(p.accuracy) : null,
      heading: p.heading != null ? Number(p.heading) : null,
      speed: p.speed != null ? Number(p.speed) : null,
      capturedAt: String(p.capturedAt || new Date().toISOString()),
      sequenceNumber: 0,
    });
  }).subscribe();

  return () => {
    void sb.removeChannel(channel);
    void sb.removeChannel(bc);
  };
}

/** Tracking GPS del navegador (web) con intervalo adaptativo */
export function startBrowserGpsTracking(
  onPoint: (coords: GeolocationCoordinates) => void,
  onError: (msg: string) => void,
): () => void {
  if (!navigator.geolocation) {
    onError('Este navegador no soporta GPS');
    return () => undefined;
  }

  let lastSent = 0;
  const minMs = 8000;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const now = Date.now();
      if (now - lastSent < minMs) return;
      lastSent = now;
      onPoint(pos.coords);
    },
    (err) => {
      onError(err.message || 'No se pudo leer GPS');
    },
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 20000,
    },
  );

  return () => navigator.geolocation.clearWatch(watchId);
}

export function getMapStyleUrl(): string {
  return (
    import.meta.env.VITE_MAP_STYLE_URL ||
    'https://demotiles.maplibre.org/style.json'
  );
}

/** Centro por defecto: Iquique (El Pollón) */
export const DEFAULT_MAP_CENTER: [number, number] = [-70.152, -20.230];
export const DEFAULT_MAP_ZOOM = 12;
