import { beforeEach, describe, expect, it } from 'vitest';
import {
  confirmGeofenceHit,
  detectBranchAndConfirm,
  detectCustomerAndConfirm,
  resetGeofenceState,
} from './geofenceService';

describe('geofence confirmation (2 hits)', () => {
  beforeEach(() => {
    resetGeofenceState();
  });

  it('does not confirm on first hit', () => {
    expect(confirmGeofenceHit('d1', 'a1', 'arrived_branch')).toBeNull();
  });

  it('confirms on second consecutive hit of same type', () => {
    expect(confirmGeofenceHit('d1', 'a1', 'arrived_branch')).toBeNull();
    expect(confirmGeofenceHit('d1', 'a1', 'arrived_branch')).toBe('arrived_branch');
  });

  it('does not re-fire after confirmed', () => {
    confirmGeofenceHit('d1', 'a1', 'arrived_branch');
    confirmGeofenceHit('d1', 'a1', 'arrived_branch');
    expect(confirmGeofenceHit('d1', 'a1', 'arrived_branch')).toBeNull();
  });

  it('resets counter when event type changes', () => {
    expect(confirmGeofenceHit('d1', 'a1', 'approaching_branch')).toBeNull();
    expect(confirmGeofenceHit('d1', 'a1', 'arrived_branch')).toBeNull();
    expect(confirmGeofenceHit('d1', 'a1', 'arrived_branch')).toBe('arrived_branch');
  });

  it('isolates drivers and assignments', () => {
    confirmGeofenceHit('d1', 'a1', 'arrived_branch');
    confirmGeofenceHit('d1', 'a1', 'arrived_branch');
    expect(confirmGeofenceHit('d2', 'a1', 'arrived_branch')).toBeNull();
    expect(confirmGeofenceHit('d1', 'a2', 'arrived_branch')).toBeNull();
  });

  it('detectBranchAndConfirm requires 2 GPS samples inside radius', () => {
    const input = {
      driverId: 'drv',
      assignmentId: 'asg',
      driverLat: -20.23,
      driverLng: -70.15,
      branchLat: -20.23005,
      branchLng: -70.15005,
      arriveRadiusM: 80,
    };
    expect(detectBranchAndConfirm(input)).toBeNull();
    expect(detectBranchAndConfirm(input)).toBe('arrived_branch');
  });

  it('detectCustomerAndConfirm requires 2 hits', () => {
    const input = {
      driverId: 'drv',
      assignmentId: 'asg',
      driverLat: -20.24,
      driverLng: -70.16,
      customerLat: -20.24002,
      customerLng: -70.16002,
    };
    expect(detectCustomerAndConfirm(input)).toBeNull();
    expect(detectCustomerAndConfirm(input)).toBe('arrived_customer');
  });
});
