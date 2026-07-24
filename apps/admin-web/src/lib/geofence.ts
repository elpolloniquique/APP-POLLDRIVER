import { haversineMeters } from './routing';

/** Radios configurables (metros). */
export const GEOFENCE = {
  approachBranchM: 500,
  arriveBranchM: 60,
  approachCustomerM: 300,
  arriveCustomerM: 50,
} as const;

export type GeofenceHit =
  | 'approaching_branch'
  | 'arrived_branch'
  | 'approaching_customer'
  | 'arrived_customer'
  | null;

export function evaluateBranchGeofence(
  driverLat: number,
  driverLng: number,
  branchLat: number,
  branchLng: number,
  radiusArriveM: number = GEOFENCE.arriveBranchM,
): GeofenceHit {
  const d = haversineMeters(driverLat, driverLng, branchLat, branchLng);
  if (d <= radiusArriveM) return 'arrived_branch';
  if (d <= GEOFENCE.approachBranchM) return 'approaching_branch';
  return null;
}

export function evaluateCustomerGeofence(
  driverLat: number,
  driverLng: number,
  customerLat: number,
  customerLng: number,
): GeofenceHit {
  const d = haversineMeters(driverLat, driverLng, customerLat, customerLng);
  if (d <= GEOFENCE.arriveCustomerM) return 'arrived_customer';
  if (d <= GEOFENCE.approachCustomerM) return 'approaching_customer';
  return null;
}
