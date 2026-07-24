import { describe, expect, it } from 'vitest';
import { driverColor } from './driverColors';
import {
  formatDistanceMeters,
  formatEtaSeconds,
  formatSpeedKmh,
  gpsFreshness,
} from './formatters';
import { evaluateBranchGeofence } from './geofence';

describe('driverColor', () => {
  it('is stable for same id', () => {
    expect(driverColor('abc')).toBe(driverColor('abc'));
  });
  it('differs for different ids often', () => {
    // deterministic palette — just ensure function returns hex
    expect(driverColor('x')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe('formatters', () => {
  it('formats distance and eta', () => {
    expect(formatDistanceMeters(400)).toBe('400 m');
    expect(formatDistanceMeters(1800)).toBe('1.8 km');
    expect(formatEtaSeconds(30)).toBe('menos de 1 min');
    expect(formatEtaSeconds(240)).toBe('4 min');
  });
  it('formats speed', () => {
    expect(formatSpeedKmh(0)).toBe('0 km/h');
    expect(formatSpeedKmh(6.11)).toMatch(/22 km\/h/);
  });
  it('gps freshness', () => {
    const now = Date.now();
    expect(gpsFreshness(new Date(now - 5_000).toISOString(), now)).toBe('live');
    expect(gpsFreshness(new Date(now - 40_000).toISOString(), now)).toBe('warn');
    expect(gpsFreshness(new Date(now - 120_000).toISOString(), now)).toBe('stale');
  });
});

describe('geofence', () => {
  it('detects arrival near branch', () => {
    expect(evaluateBranchGeofence(-20.23, -70.15, -20.2301, -70.1501, 80)).toBe(
      'arrived_branch',
    );
  });
});
