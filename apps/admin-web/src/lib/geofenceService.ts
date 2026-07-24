/**
 * Geocercas con confirmación (2 lecturas) + RPC opcional + voz.
 */
import { getSupabase } from './supabase';
import {
  evaluateBranchGeofence,
  evaluateCustomerGeofence,
  type GeofenceHit,
  GEOFENCE,
} from './geofence';
import { speakTrackingEvent } from './voiceNotificationService';

const hitCounts = new Map<string, number>();
const confirmed = new Set<string>();
const REQUIRED_HITS = 2;

export function resetGeofenceState(): void {
  hitCounts.clear();
  confirmed.clear();
}

function key(driverId: string, assignmentId: string | null, hit: string): string {
  return `${driverId}|${assignmentId || '-'}|${hit}`;
}

/** Devuelve el evento solo cuando se confirma (2 hits seguidos del mismo tipo). */
export function confirmGeofenceHit(
  driverId: string,
  assignmentId: string | null,
  hit: GeofenceHit,
): GeofenceHit {
  if (!hit) return null;
  const k = key(driverId, assignmentId, hit);
  if (confirmed.has(k)) return null;

  // Reset contadores de otros eventos del mismo driver/assignment
  for (const existing of [...hitCounts.keys()]) {
    if (existing.startsWith(`${driverId}|${assignmentId || '-'}|`) && existing !== k) {
      hitCounts.delete(existing);
    }
  }

  const n = (hitCounts.get(k) || 0) + 1;
  hitCounts.set(k, n);
  if (n < REQUIRED_HITS) return null;
  confirmed.add(k);
  return hit;
}

export async function persistGeofenceEvent(input: {
  assignmentId: string;
  geofenceType: 'branch' | 'customer';
  eventType: NonNullable<GeofenceHit>;
  lat: number;
  lng: number;
  distanceMeters?: number;
  accuracy?: number | null;
}): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.rpc('pd_confirm_geofence_event', {
      p_assignment_id: input.assignmentId,
      p_geofence_type: input.geofenceType,
      p_event_type: input.eventType,
      p_lat: input.lat,
      p_lng: input.lng,
      p_distance_meters: input.distanceMeters ?? null,
      p_accuracy: input.accuracy ?? null,
    });
  } catch {
    /* 018 puede no estar aplicado */
  }
}

export function announceGeofence(
  hit: NonNullable<GeofenceHit>,
  driverName: string,
  ticket?: string,
): void {
  const name = driverName || 'Repartidor';
  switch (hit) {
    case 'approaching_branch':
      speakTrackingEvent('near_branch', { driverName: name, ticket });
      break;
    case 'arrived_branch':
      speakTrackingEvent('arrived_branch', { driverName: name, ticket });
      break;
    case 'approaching_customer':
      speakTrackingEvent('near_customer', { driverName: name, ticket });
      break;
    case 'arrived_customer':
      speakTrackingEvent('arrived_customer', { driverName: name, ticket });
      break;
    default:
      break;
  }
}

export function detectBranchAndConfirm(input: {
  driverId: string;
  assignmentId: string | null;
  driverLat: number;
  driverLng: number;
  branchLat: number;
  branchLng: number;
  arriveRadiusM?: number;
}): GeofenceHit {
  const raw = evaluateBranchGeofence(
    input.driverLat,
    input.driverLng,
    input.branchLat,
    input.branchLng,
    input.arriveRadiusM ?? GEOFENCE.arriveBranchM,
  );
  return confirmGeofenceHit(input.driverId, input.assignmentId, raw);
}

export function detectCustomerAndConfirm(input: {
  driverId: string;
  assignmentId: string | null;
  driverLat: number;
  driverLng: number;
  customerLat: number;
  customerLng: number;
}): GeofenceHit {
  const raw = evaluateCustomerGeofence(
    input.driverLat,
    input.driverLng,
    input.customerLat,
    input.customerLng,
  );
  return confirmGeofenceHit(input.driverId, input.assignmentId, raw);
}

export { GEOFENCE };
