import { describe, expect, it } from 'vitest';
import { formatEtaMinutes, formatKm, haversineMeters } from './routing';

describe('routing helpers', () => {
  it('haversine Iquique short distance', () => {
    const m = haversineMeters(-20.23, -70.152, -20.231, -70.153);
    expect(m).toBeGreaterThan(50);
    expect(m).toBeLessThan(500);
  });

  it('formats km and eta', () => {
    expect(formatKm(500)).toBe('500 m');
    expect(formatKm(2500)).toBe('2.5 km');
    expect(formatEtaMinutes(90)).toBe('2 min');
  });
});
