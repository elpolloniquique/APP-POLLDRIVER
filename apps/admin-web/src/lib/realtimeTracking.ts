import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { DriverLocationPayloadSchema, type DriverLocationPayload } from './osrmService';
import type { DriverLiveLocation } from './location';

export type RealtimeConnStatus =
  | 'connecting'
  | 'subscribed'
  | 'reconnecting'
  | 'error'
  | 'closed';

export const LIVE_BROADCAST_CHANNEL = 'pd-driver-locations';
export const LIVE_MAP_CHANNEL = 'pd-map-live';

export function parseLocationBroadcast(raw: unknown): DriverLiveLocation | null {
  const parsed = DriverLocationPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  return {
    driverProfileId: p.driverProfileId,
    lat: p.lat,
    lng: p.lng,
    accuracy: p.accuracy ?? null,
    heading: p.heading ?? null,
    speed: p.speed ?? null,
    capturedAt: p.capturedAt || new Date().toISOString(),
    sequenceNumber: p.sequenceNumber || 0,
    driverName: p.driverName,
    operationalStatus: p.operationalStatus,
  };
}

/** Ignora puntos con secuencia menor o igual a la ya vista (anti-duplicado / reorder). */
export function shouldApplySequence(
  prevSeq: number | undefined,
  nextSeq: number | undefined,
): boolean {
  if (nextSeq == null || nextSeq === 0) return true;
  if (prevSeq == null || prevSeq === 0) return true;
  return nextSeq > prevSeq;
}

export function subscribeLiveTracking(
  sb: SupabaseClient,
  handlers: {
    onDbChange: () => void;
    onBroadcast: (loc: DriverLiveLocation) => void;
    onStatus: (status: RealtimeConnStatus) => void;
  },
): () => void {
  let closed = false;
  let bc: RealtimeChannel | null = null;
  let pg: RealtimeChannel | null = null;
  let retryMs = 1500;
  let retryTimer: number | null = null;

  const clearRetry = () => {
    if (retryTimer != null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const handlePayload = (payload: unknown) => {
    const loc = parseLocationBroadcast(payload);
    if (loc) handlers.onBroadcast(loc);
  };

  const attach = () => {
    if (closed) return;
    clearRetry();
    handlers.onStatus('connecting');

    pg = sb
      .channel(`${LIVE_MAP_CHANNEL}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_driver_location_latest' },
        () => handlers.onDbChange(),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          handlers.onStatus('subscribed');
          retryMs = 1500;
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          handlers.onStatus('error');
          scheduleReconnect();
        } else if (status === 'CLOSED') {
          handlers.onStatus('closed');
        }
      });

    bc = sb
      .channel(LIVE_BROADCAST_CHANNEL)
      .on('broadcast', { event: 'location' }, ({ payload }) => handlePayload(payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          handlers.onStatus('subscribed');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          handlers.onStatus('reconnecting');
          scheduleReconnect();
        }
      });
  };

  const teardownChannels = () => {
    if (pg) void sb.removeChannel(pg);
    if (bc) void sb.removeChannel(bc);
    pg = null;
    bc = null;
  };

  const scheduleReconnect = () => {
    if (closed) return;
    clearRetry();
    handlers.onStatus('reconnecting');
    retryTimer = window.setTimeout(() => {
      teardownChannels();
      retryMs = Math.min(retryMs * 1.6, 15000);
      attach();
    }, retryMs);
  };

  attach();

  return () => {
    closed = true;
    clearRetry();
    teardownChannels();
    handlers.onStatus('closed');
  };
}

export type { DriverLocationPayload };
