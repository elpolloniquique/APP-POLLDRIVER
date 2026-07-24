import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from '../lib/supabase';
import {
  listLiveDriverLocations,
  type DriverLiveLocation,
} from '../lib/location';
import {
  shouldApplySequence,
  subscribeLiveTracking,
  type RealtimeConnStatus,
} from '../lib/realtimeTracking';

export function useRealtimeTracking() {
  const [locations, setLocations] = useState<DriverLiveLocation[]>([]);
  const [connStatus, setConnStatus] = useState<RealtimeConnStatus>('connecting');
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const seqRef = useRef<Map<string, number>>(new Map());

  const upsertLocal = useCallback((loc: DriverLiveLocation) => {
    const prev = seqRef.current.get(loc.driverProfileId);
    if (!shouldApplySequence(prev, loc.sequenceNumber)) return;
    if (loc.sequenceNumber) seqRef.current.set(loc.driverProfileId, loc.sequenceNumber);

    setLocations((list) => {
      const idx = list.findIndex((x) => x.driverProfileId === loc.driverProfileId);
      if (idx < 0) return [loc, ...list];
      const copy = [...list];
      copy[idx] = {
        ...copy[idx],
        ...loc,
        driverName: loc.driverName || copy[idx].driverName,
        operationalStatus: loc.operationalStatus || copy[idx].operationalStatus,
      };
      return copy;
    });
    setLiveAt(new Date().toLocaleTimeString('es-CL'));
  }, []);

  const reload = useCallback(async () => {
    setError('');
    try {
      const locs = await listLiveDriverLocations();
      setLocations(locs);
      for (const l of locs) {
        if (l.sequenceNumber) seqRef.current.set(l.driverProfileId, l.sequenceNumber);
      }
      setLiveAt(new Date().toLocaleTimeString('es-CL'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar GPS');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const sb = getSupabase();
    if (!sb) {
      setConnStatus('error');
      return undefined;
    }
    return subscribeLiveTracking(sb, {
      onDbChange: () => void reload(),
      onBroadcast: upsertLocal,
      onStatus: setConnStatus,
    });
  }, [reload, upsertLocal]);

  return {
    locations,
    setLocations,
    connStatus,
    liveAt,
    error,
    loading,
    reload,
  };
}
