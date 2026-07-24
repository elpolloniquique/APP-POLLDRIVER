import { describe, expect, it, vi } from 'vitest';
import { fetchMultiStopRoute, formatEtaMinutes, formatKm, haversineMeters } from './routing';

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

describe('fetchMultiStopRoute', () => {
  it('returns empty legs for single point', async () => {
    const r = await fetchMultiStopRoute([{ lat: -20.23, lng: -70.15 }]);
    expect(r.legDurationsSeconds).toEqual([]);
    expect(r.coordinates).toHaveLength(1);
  });

  it('falls back to haversine chain when OSRM fails', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));
    const r = await fetchMultiStopRoute([
      { lat: -20.23, lng: -70.15 },
      { lat: -20.24, lng: -70.16 },
      { lat: -20.25, lng: -70.17 },
    ]);
    expect(r.source).toBe('haversine');
    expect(r.legDistancesMeters).toHaveLength(2);
    expect(r.legDurationsSeconds).toHaveLength(2);
    expect(r.distanceMeters).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('uses OSRM legs when response is Ok', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'Ok',
        routes: [
          {
            distance: 1200,
            duration: 300,
            legs: [
              { distance: 500, duration: 120 },
              { distance: 700, duration: 180 },
            ],
            geometry: {
              coordinates: [
                [-70.15, -20.23],
                [-70.16, -20.24],
                [-70.17, -20.25],
              ],
            },
          },
        ],
      }),
    } as Response);
    const r = await fetchMultiStopRoute([
      { lat: -20.23, lng: -70.15 },
      { lat: -20.24, lng: -70.16 },
      { lat: -20.25, lng: -70.17 },
    ]);
    expect(r.source).toBe('osrm');
    expect(r.legDurationsSeconds).toEqual([120, 180]);
    expect(r.distanceMeters).toBe(1200);
    spy.mockRestore();
  });
});
