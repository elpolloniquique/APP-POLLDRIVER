import { describe, expect, it } from 'vitest';
import { parseLocationBroadcast, shouldApplySequence } from './realtimeTracking';

describe('realtimeTracking', () => {
  it('rejects invalid broadcast payloads', () => {
    expect(parseLocationBroadcast({})).toBeNull();
    expect(parseLocationBroadcast({ driverProfileId: 'x', lat: 99, lng: 0 })).toBeNull();
  });

  it('parses valid payload', () => {
    const loc = parseLocationBroadcast({
      driverProfileId: 'drv-1',
      lat: -20.23,
      lng: -70.15,
      speed: 5,
      sequenceNumber: 3,
    });
    expect(loc?.driverProfileId).toBe('drv-1');
    expect(loc?.sequenceNumber).toBe(3);
  });

  it('applies sequence monotonically', () => {
    expect(shouldApplySequence(1, 2)).toBe(true);
    expect(shouldApplySequence(5, 5)).toBe(false);
    expect(shouldApplySequence(5, 4)).toBe(false);
    expect(shouldApplySequence(undefined, 1)).toBe(true);
  });
});
