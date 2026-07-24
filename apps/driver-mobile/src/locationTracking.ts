/**
 * GPS adaptativo + broadcast Realtime + cola offline (móvil Expo).
 */
import * as Location from 'expo-location';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from './supabase';

const BROADCAST_CHANNEL = 'pd-driver-locations';

export type GpsMode = 'idle' | 'available' | 'active' | 'near';

export function intervalForMode(mode: GpsMode): number {
  switch (mode) {
    case 'near':
      return 4000;
    case 'active':
      return 7000;
    case 'available':
      return 30000;
    default:
      return 40000;
  }
}

export interface TrackPoint {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  assignmentId: string | null;
  capturedAt: string;
  sequence: number;
  appState: 'foreground' | 'background';
}

type QueueItem = TrackPoint;

let sequence = 0;
let broadcastCh: RealtimeChannel | null = null;
const offlineQueue: QueueItem[] = [];
const MAX_QUEUE = 40;

async function ensureBroadcast(): Promise<RealtimeChannel | null> {
  const sb = getSupabase();
  if (!sb) return null;
  if (broadcastCh) return broadcastCh;
  broadcastCh = sb.channel(BROADCAST_CHANNEL, {
    config: { broadcast: { self: false } },
  });
  await new Promise<void>((resolve) => {
    const t = setTimeout(() => resolve(), 2500);
    broadcastCh!.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(t);
        resolve();
      }
    });
  });
  return broadcastCh;
}

export function stopMobileBroadcast(): void {
  const sb = getSupabase();
  if (sb && broadcastCh) void sb.removeChannel(broadcastCh);
  broadcastCh = null;
}

async function flushQueue(): Promise<void> {
  if (!offlineQueue.length) return;
  const copy = [...offlineQueue];
  offlineQueue.length = 0;
  for (const item of copy) {
    try {
      await pushPoint(item);
    } catch {
      offlineQueue.push(item);
      break;
    }
  }
}

async function pushPoint(point: TrackPoint): Promise<{ ok: boolean; skipped?: boolean }> {
  const sb = getSupabase();
  if (!sb) throw new Error('Sin Supabase');

  const { data, error } = await sb.rpc('pd_upsert_driver_location', {
    p_lat: point.lat,
    p_lng: point.lng,
    p_accuracy: point.accuracy,
    p_heading: point.heading,
    p_speed: point.speed,
    p_assignment_id: point.assignmentId,
    p_app_state: point.appState,
    p_sequence: point.sequence,
  });
  if (error) throw new Error(error.message);
  const row = data as { ok?: boolean; skipped?: boolean; driver_profile_id?: string };

  if (row?.ok && !row.skipped && row.driver_profile_id) {
    try {
      const ch = await ensureBroadcast();
      await ch?.send({
        type: 'broadcast',
        event: 'location',
        payload: {
          driverProfileId: row.driver_profile_id,
          lat: point.lat,
          lng: point.lng,
          accuracy: point.accuracy,
          heading: point.heading,
          speed: point.speed,
          capturedAt: point.capturedAt,
          sequenceNumber: point.sequence,
        },
      });
    } catch {
      /* broadcast opcional */
    }
  }

  return { ok: row?.ok === true, skipped: row?.skipped === true };
}

export async function sendLocationNow(opts: {
  assignmentId?: string | null;
  appState?: 'foreground' | 'background';
}): Promise<{ ok: boolean; skipped?: boolean; permissionDenied?: boolean }> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    return { ok: false, permissionDenied: true };
  }

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  sequence += 1;
  const point: TrackPoint = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy ?? null,
    heading: pos.coords.heading ?? null,
    speed: pos.coords.speed ?? null,
    assignmentId: opts.assignmentId ?? null,
    capturedAt: new Date().toISOString(),
    sequence,
    appState: opts.appState || 'foreground',
  };

  try {
    await flushQueue();
    return await pushPoint(point);
  } catch {
    if (offlineQueue.length >= MAX_QUEUE) offlineQueue.shift();
    offlineQueue.push(point);
    return { ok: false, skipped: true };
  }
}

export async function startTrackingSession(assignmentId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.rpc('pd_start_tracking_session', { p_assignment_id: assignmentId });
  } catch {
    /* migración 018 puede no estar aún */
  }
}

export async function endTrackingSession(assignmentId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.rpc('pd_end_tracking_session', { p_assignment_id: assignmentId });
  } catch {
    /* ignore */
  }
}

/**
 * Bucle adaptativo de GPS. Devuelve stop().
 */
export function startAdaptiveGpsLoop(opts: {
  getMode: () => GpsMode;
  getAssignmentId: () => string | null;
  onTick?: (info: { ok: boolean; mode: GpsMode; queued: number }) => void;
  onError?: (msg: string) => void;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    if (stopped) return;
    const mode = opts.getMode();
    const ms = intervalForMode(mode);
    try {
      const res = await sendLocationNow({
        assignmentId: opts.getAssignmentId(),
        appState: 'foreground',
      });
      if (res.permissionDenied) {
        opts.onError?.('Permiso de ubicación denegado');
      } else {
        opts.onTick?.({ ok: res.ok, mode, queued: offlineQueue.length });
      }
    } catch (e) {
      opts.onError?.(e instanceof Error ? e.message : 'Error GPS');
    }
    if (!stopped) {
      timer = setTimeout(() => void tick(), ms);
    }
  };

  void tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    stopMobileBroadcast();
  };
}

export function offlineQueueSize(): number {
  return offlineQueue.length;
}
