import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Check,
  Clock3,
  Crosshair,
  Navigation,
  Package,
  Route,
  Share2,
  ShoppingBag,
  UserRound,
  Wallet,
  X,
} from 'lucide-react';
import {
  acceptOffer,
  confirmDelivery,
  confirmPickup,
  friendlyOfferError,
  getMyDriverSummary,
  listMyActiveAssignments,
  listMyPendingOffers,
  markHeadingToBranch,
  rejectOffer,
  setMyOperationalStatus,
  type ActiveAssignmentRow,
  type DriverSummary,
  type MyOfferRow,
} from '../lib/dispatch';
import {
  DEFAULT_MAP_CENTER,
  listBranchMapPoints,
  startBrowserGpsTracking,
  stopDriverBroadcast,
  upsertMyLocation,
  type BranchMapPoint,
} from '../lib/location';
import { formatDistanceMeters, formatEtaSeconds } from '../lib/formatters';
import { osrmRoute } from '../lib/osrmService';
import { sharpMapOptions, styleForBasemap } from '../lib/mapStyles';
import { getSupabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const ROUTE_SOURCE = 'rx-driver-route';
const ROUTE_LAYER = 'rx-driver-route-line';

function useNowTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function formatRemain(expiresAt: string, now: number) {
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return { label: '—', urgent: false, expired: false };
  const sec = Math.max(0, Math.floor((end - now) / 1000));
  if (sec <= 0) return { label: 'Expirada', urgent: true, expired: true };
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return {
    label: `${m}:${String(s).padStart(2, '0')}`,
    urgent: sec <= 20,
    expired: false,
  };
}

function clp(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$ ${Math.round(n).toLocaleString('es-CL')}`;
}

function firstName(full: string) {
  const p = full.trim().split(/\s+/)[0];
  return p || 'Tú';
}

function el(html: string) {
  const d = document.createElement('div');
  d.innerHTML = html.trim();
  return d.firstElementChild as HTMLElement;
}

function makeBranchMarker() {
  return el(`
    <div class="rx-dm-pin rx-dm-pin--store">
      <div class="rx-dm-pin__icon" aria-hidden>🏠</div>
      <span class="rx-dm-pin__label">El Pollón</span>
    </div>
  `);
}

function makeDriverMarker(name: string) {
  return el(`
    <div class="rx-dm-pin rx-dm-pin--driver">
      <div class="rx-dm-pin__bubble">${name.replace(/[<>&]/g, '')}</div>
      <div class="rx-dm-pin__scooter" aria-hidden>🛵</div>
    </div>
  `);
}

function makeCustomerMarker() {
  return el(`
    <div class="rx-dm-pin rx-dm-pin--customer">
      <div class="rx-dm-pin__drop"></div>
    </div>
  `);
}

function openExternalNav(lat: number, lng: number, label: string) {
  const q = encodeURIComponent(label || `${lat},${lng}`);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=&travelmode=driving&dir_action=navigate`;
  const geo = `geo:${lat},${lng}?q=${lat},${lng}(${q})`;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  window.open(isIos ? `maps://?daddr=${lat},${lng}&dirflg=d` : url, '_blank', 'noopener');
  // fallback soft
  void geo;
}

type TripPhase = 'idle' | 'to_store' | 'to_customer';

export function DriverHomePage() {
  const { profile } = useAuth();
  const now = useNowTick(1000);
  const mapBoxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const driverMarkerRef = useRef<Marker | null>(null);
  const branchMarkerRef = useRef<Marker | null>(null);
  const customerMarkerRef = useRef<Marker | null>(null);
  const stopGpsRef = useRef<(() => void) | null>(null);
  const userStoppedGpsRef = useRef(false);
  const routeAbortRef = useRef<AbortController | null>(null);
  const gpsRef = useRef<{ lat: number; lng: number } | null>(null);

  const [offers, setOffers] = useState<MyOfferRow[]>([]);
  const [active, setActive] = useState<ActiveAssignmentRow[]>([]);
  const [summary, setSummary] = useState<DriverSummary>({ ok: false });
  const [branches, setBranches] = useState<BranchMapPoint[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState(false);
  const [sharingGps, setSharingGps] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [routeMeta, setRouteMeta] = useState<{ meters: number; seconds: number } | null>(null);
  const [offerDismissed, setOfferDismissed] = useState<string | null>(null);

  const trip = active[0] ?? null;
  const offer = offers.find((o) => o.id !== offerDismissed) ?? offers[0] ?? null;

  const isOnline =
    summary.operationalStatus === 'available' ||
    summary.operationalStatus === 'offered' ||
    summary.operationalStatus === 'heading_to_branch' ||
    summary.operationalStatus === 'waiting_at_branch' ||
    summary.operationalStatus === 'carrying_orders' ||
    summary.operationalStatus === 'delivering';

  const picked =
    Boolean(trip?.pickedUpAt) ||
    ['picked_up', 'delivering'].includes(trip?.job.status || '');

  const phase: TripPhase = !trip ? 'idle' : picked ? 'to_customer' : 'to_store';

  const branchPoint = useMemo(() => {
    const fallback: BranchMapPoint = {
      id: 'fallback',
      name: 'El Pollón',
      lat: DEFAULT_MAP_CENTER[1],
      lng: DEFAULT_MAP_CENTER[0],
    };
    if (!trip) return null;
    if (!trip.job.branchId) return branches[0] ?? fallback;
    return branches.find((b) => b.id === trip.job.branchId) ?? branches[0] ?? fallback;
  }, [branches, trip]);

  const routeFitKeyRef = useRef('');

  const load = useCallback(async (silent = false) => {
    setError('');
    try {
      const [o, a, s] = await Promise.all([
        listMyPendingOffers(),
        listMyActiveAssignments(),
        getMyDriverSummary().catch(() => ({ ok: false } as DriverSummary)),
      ]);
      setOffers((prev) => {
        if (o.length > prev.length) {
          setFlash(true);
          window.setTimeout(() => setFlash(false), 1600);
        }
        return o;
      });
      setActive(a);
      setSummary(s);
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Error al cargar');
    }
  }, []);

  useEffect(() => {
    void load();
    void listBranchMapPoints().then(setBranches);
    const sb = getSupabase();
    if (!sb) return undefined;
    const ch = sb
      .channel('pd-driver-home')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_delivery_offers' },
        () => void load(true),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pd_delivery_assignments' },
        () => void load(true),
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
      stopGpsRef.current?.();
      stopGpsRef.current = null;
      stopDriverBroadcast();
      routeAbortRef.current?.abort();
    };
  }, [load]);

  // Mapa
  useEffect(() => {
    if (!mapBoxRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: mapBoxRef.current,
      style: styleForBasemap('streets'),
      center: DEFAULT_MAP_CENTER,
      zoom: 14,
      attributionControl: { compact: true },
      ...sharpMapOptions(),
    });
    mapRef.current = map;
    map.on('load', () => {
      if (!map.getSource(ROUTE_SOURCE)) {
        map.addSource(ROUTE_SOURCE, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }
      if (!map.getLayer(ROUTE_LAYER)) {
        map.addLayer({
          id: ROUTE_LAYER,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#E10600',
            'line-width': 5.5,
            'line-opacity': 0.95,
          },
        });
      }
      map.resize();
      setMapReady(true);
    });
    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      driverMarkerRef.current?.remove();
      branchMarkerRef.current?.remove();
      customerMarkerRef.current?.remove();
      driverMarkerRef.current = null;
      branchMarkerRef.current = null;
      customerMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  const clearRoute = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    src?.setData({ type: 'FeatureCollection', features: [] });
    setRouteMeta(null);
    routeFitKeyRef.current = '';
  }, []);

  const setRouteCoords = useCallback(
    (coords: [number, number][], meters: number, seconds: number, fitKey: string) => {
      const map = mapRef.current;
      if (!map) return;
      const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
      if (!src) return;
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          },
        ],
      });
      setRouteMeta({ meters, seconds });
      if (coords.length >= 2 && routeFitKeyRef.current !== fitKey) {
        routeFitKeyRef.current = fitKey;
        const bounds = coords.reduce(
          (b, c) => b.extend(c as [number, number]),
          new maplibregl.LngLatBounds(coords[0], coords[0]),
        );
        map.fitBounds(bounds, {
          padding: { top: 120, bottom: 220, left: 48, right: 48 },
          maxZoom: 16,
          duration: 600,
        });
      }
    },
    [],
  );

  // Markers + ruta según fase
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const driverName = firstName(profile?.fullName || 'Repartidor');

    // Driver marker
    if (gps) {
      if (!driverMarkerRef.current) {
        driverMarkerRef.current = new maplibregl.Marker({
          element: makeDriverMarker(driverName),
          anchor: 'bottom',
        })
          .setLngLat([gps.lng, gps.lat])
          .addTo(map);
      } else {
        driverMarkerRef.current.setLngLat([gps.lng, gps.lat]);
      }
    }

    // Branch marker (visible en viaje)
    if (phase !== 'idle' && branchPoint) {
      if (!branchMarkerRef.current) {
        branchMarkerRef.current = new maplibregl.Marker({
          element: makeBranchMarker(),
          anchor: 'bottom',
        })
          .setLngLat([branchPoint.lng, branchPoint.lat])
          .addTo(map);
      } else {
        branchMarkerRef.current.setLngLat([branchPoint.lng, branchPoint.lat]);
      }
    } else {
      branchMarkerRef.current?.remove();
      branchMarkerRef.current = null;
    }

    // Customer pin visible durante el viaje si hay coords
    const cLat = trip?.job.customerLat;
    const cLng = trip?.job.customerLng;
    if (phase !== 'idle' && cLat != null && cLng != null) {
      if (!customerMarkerRef.current) {
        customerMarkerRef.current = new maplibregl.Marker({
          element: makeCustomerMarker(),
          anchor: 'bottom',
        })
          .setLngLat([cLng, cLat])
          .addTo(map);
      } else {
        customerMarkerRef.current.setLngLat([cLng, cLat]);
      }
    } else {
      customerMarkerRef.current?.remove();
      customerMarkerRef.current = null;
    }

    // Ruta
    routeAbortRef.current?.abort();
    if (phase === 'idle' || !gps) {
      clearRoute();
      return;
    }

    const fromLat = gps.lat;
    const fromLng = gps.lng;
    let toLat: number | null = null;
    let toLng: number | null = null;

    if (phase === 'to_store' && branchPoint) {
      toLat = branchPoint.lat;
      toLng = branchPoint.lng;
    } else if (phase === 'to_customer') {
      if (cLat != null && cLng != null) {
        toLat = cLat;
        toLng = cLng;
      }
    }

    if (toLat == null || toLng == null) {
      clearRoute();
      return;
    }

    const fitKey = `${phase}:${trip?.id || ''}:${toLat.toFixed(4)},${toLng.toFixed(4)}`;
    const ac = new AbortController();
    routeAbortRef.current = ac;
    void osrmRoute(fromLat, fromLng, toLat, toLng, ac.signal)
      .then((r) => {
        if (ac.signal.aborted) return;
        setRouteCoords(
          r.coordinates as [number, number][],
          r.distanceMeters,
          r.durationSeconds,
          fitKey,
        );
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setRouteCoords(
          [
            [fromLng, fromLat],
            [toLng, toLat],
          ],
          0,
          0,
          fitKey,
        );
      });
  }, [mapReady, gps, phase, branchPoint, trip, profile?.fullName, clearRoute, setRouteCoords]);

  const toggleGps = useCallback((on: boolean, reason?: string) => {
    setError('');
    stopGpsRef.current?.();
    stopGpsRef.current = null;
    if (!on) {
      userStoppedGpsRef.current = true;
      setSharingGps(false);
      stopDriverBroadcast();
      setMsg('GPS detenido');
      return;
    }
    userStoppedGpsRef.current = false;
    stopGpsRef.current = startBrowserGpsTracking(
      (coords) => {
        const next = { lat: coords.latitude, lng: coords.longitude };
        gpsRef.current = next;
        setGps(next);
        void upsertMyLocation({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          heading: coords.heading,
          speed: coords.speed,
          assignmentId: active[0]?.id ?? null,
        })
          .then((r) => {
            if (!r.skipped) setSharingGps(true);
          })
          .catch((e) => setError(e instanceof Error ? e.message : 'Error GPS'));
      },
      (msgErr) => {
        setError(msgErr);
        setSharingGps(false);
      },
    );
    setSharingGps(true);
    setMsg(reason || 'Compartiendo GPS en vivo');
  }, [active]);

  // Auto GPS si disponible o con pedido
  useEffect(() => {
    if ((isOnline || active.length > 0) && !sharingGps && !stopGpsRef.current && !userStoppedGpsRef.current) {
      toggleGps(true, 'GPS activo para pedidos en vivo');
    }
  }, [isOnline, active.length, sharingGps, toggleGps]);

  const goOnline = async (on: boolean) => {
    setError('');
    try {
      await setMyOperationalStatus(on ? 'available' : 'offline');
      setMsg(on ? 'Disponible para nuevos pedidos' : 'Modo no disponible');
      await load(true);
      if (on) toggleGps(true, 'GPS activado al ponerte disponible');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar estado');
    }
  };

  const onAccept = async (id: string) => {
    setBusyId(id);
    setError('');
    try {
      await acceptOffer(id);
      setMsg('Pedido aceptado · ruta al local');
      await load(true);
      toggleGps(true, 'GPS automático al aceptar');
      // Asegura estado en camino al local
      const assigns = await listMyActiveAssignments();
      const a = assigns[0];
      if (a && a.job.status === 'assigned') {
        try {
          await markHeadingToBranch(a.id);
          await load(true);
        } catch {
          /* opcional */
        }
      }
    } catch (e) {
      setError(friendlyOfferError(e instanceof Error ? e.message : 'No se pudo aceptar'));
      await load(true);
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id: string) => {
    setBusyId(id);
    try {
      await rejectOffer(id);
      setOfferDismissed(id);
      setMsg('Pedido rechazado');
      await load(true);
    } catch (e) {
      setError(friendlyOfferError(e instanceof Error ? e.message : 'No se pudo rechazar'));
    } finally {
      setBusyId(null);
    }
  };

  const onPickup = async () => {
    if (!trip) return;
    setBusyId(trip.id);
    setError('');
    try {
      await confirmPickup(trip.id);
      setMsg('Recogido · ahora hacia el cliente');
      await load(true);
    } catch (e) {
      setError(friendlyOfferError(e instanceof Error ? e.message : 'No se pudo marcar recogido'));
    } finally {
      setBusyId(null);
    }
  };

  const onDeliver = async () => {
    if (!trip) return;
    setBusyId(trip.id);
    setError('');
    try {
      await confirmDelivery(trip.id);
      setMsg('Entregado · mapa listo para el próximo pedido');
      clearRoute();
      customerMarkerRef.current?.remove();
      customerMarkerRef.current = null;
      branchMarkerRef.current?.remove();
      branchMarkerRef.current = null;
      await load(true);
    } catch (e) {
      setError(friendlyOfferError(e instanceof Error ? e.message : 'No se pudo marcar entregado'));
    } finally {
      setBusyId(null);
    }
  };

  const centerOnMe = () => {
    const map = mapRef.current;
    const g = gpsRef.current || gps;
    if (!map || !g) return;
    map.easeTo({ center: [g.lng, g.lat], zoom: Math.max(map.getZoom(), 15), duration: 500 });
  };

  const navTarget = (() => {
    if (phase === 'to_store' && branchPoint) {
      return { lat: branchPoint.lat, lng: branchPoint.lng, label: branchPoint.name || 'El Pollón' };
    }
    if (phase === 'to_customer' && trip?.job.customerLat != null && trip.job.customerLng != null) {
      return {
        lat: trip.job.customerLat,
        lng: trip.job.customerLng,
        label: trip.job.customerAddress || trip.job.customerName,
      };
    }
    return null;
  })();

  const showOfferCard = Boolean(offer && phase === 'idle' && isOnline);
  const remain = offer ? formatRemain(offer.expiresAt, now) : null;
  const fee = offer?.job.deliveryFeeQuoted ?? trip?.job.deliveryFeeQuoted ?? null;
  const orderTotal = offer?.job.orderTotal ?? trip?.job.orderTotal ?? 0;

  return (
    <div className={`rx-driver ${flash ? 'rx-driver--flash' : ''}`}>
      <div ref={mapBoxRef} className="rx-driver__map" aria-label="Mapa del repartidor" />

      <div className="rx-driver__top-actions">
        <button
          type="button"
          className={`rx-driver__pill ${sharingGps ? 'is-on is-sky' : ''}`}
          onClick={() => toggleGps(!sharingGps)}
        >
          <Share2 size={14} aria-hidden />
          {sharingGps ? 'GPS activo' : 'Compartir GPS'}
        </button>
        <button
          type="button"
          className={`rx-driver__pill ${isOnline ? 'is-on is-green' : ''}`}
          onClick={() => void goOnline(!isOnline)}
        >
          <span className={`rx-driver__dot ${isOnline ? 'is-live' : ''}`} />
          {isOnline ? 'Disponible' : 'No disponible'}
        </button>
      </div>

      <button type="button" className="rx-driver__locate" onClick={centerOnMe} aria-label="Centrar en mí">
        <Crosshair size={18} />
      </button>

      {(error || msg) && (
        <div className={`rx-driver__toast ${error ? 'is-err' : ''}`}>
          {error || msg}
        </div>
      )}

      {showOfferCard && offer && remain && (
        <article className="rx-driver__offer" aria-live="polite">
          <div className="rx-driver__offer-badge">
            Nuevo pedido
            <span className={`rx-driver__timer ${remain.urgent ? 'is-urgent' : ''}`}>{remain.label}</span>
          </div>
          <div className="rx-driver__offer-user">
            <div className="rx-driver__avatar" aria-hidden>
              <UserRound size={22} />
            </div>
            <div className="min-w-0">
              <p className="rx-driver__offer-name">{offer.job.customerName || 'Cliente'}</p>
              <p className="rx-driver__offer-addr">{offer.job.customerAddress || 'Sin dirección'}</p>
            </div>
          </div>
          <div className="rx-driver__money">
            <div>
              <ShoppingBag size={16} aria-hidden />
              <span>Monto pedido</span>
              <strong>{clp(orderTotal)}</strong>
            </div>
            <div>
              <Package size={16} aria-hidden />
              <span>Delivery</span>
              <strong>{clp(fee)}</strong>
            </div>
            <div>
              <Wallet size={16} aria-hidden />
              <span>Total a cobrar</span>
              <strong>{clp(fee ?? orderTotal)}</strong>
            </div>
          </div>
          <div className="rx-driver__offer-actions">
            <button
              type="button"
              className="rx-driver__btn rx-driver__btn--reject"
              disabled={busyId === offer.id}
              onClick={() => void onReject(offer.id)}
            >
              <X size={18} /> Rechazar
            </button>
            <button
              type="button"
              className="rx-driver__btn rx-driver__btn--accept"
              disabled={busyId === offer.id || remain.expired}
              onClick={() => void onAccept(offer.id)}
            >
              <Check size={18} /> {busyId === offer.id ? '…' : 'Aceptar'}
            </button>
          </div>
        </article>
      )}

      {trip && (
        <section className="rx-driver__trip">
          <div className="rx-driver__trip-stats">
            <div>
              <Clock3 size={16} aria-hidden />
              <strong>{routeMeta ? formatEtaSeconds(routeMeta.seconds).replace('menos de ', '<') : '—'}</strong>
              <span>Tiempo estimado</span>
            </div>
            <div>
              <Route size={16} aria-hidden />
              <strong>
                {routeMeta && routeMeta.meters > 0
                  ? formatDistanceMeters(routeMeta.meters)
                  : trip.job.deliveryDistanceKm != null
                    ? `${trip.job.deliveryDistanceKm.toFixed(1)} km`
                    : '—'}
              </strong>
              <span>Distancia</span>
            </div>
          </div>

          <p className="rx-driver__trip-phase">
            {phase === 'to_store'
              ? 'En camino a El Pollón a recoger el pedido'
              : `Entrega · ${trip.job.customerName}`}
          </p>
          <p className="rx-driver__trip-addr">
            {phase === 'to_store'
              ? branchPoint?.name || 'El Pollón'
              : trip.job.customerAddress}
          </p>

          <div className="rx-driver__trip-actions">
            {navTarget && (
              <button
                type="button"
                className="rx-driver__btn rx-driver__btn--nav"
                onClick={() => openExternalNav(navTarget.lat, navTarget.lng, navTarget.label)}
              >
                <Navigation size={18} /> Navegar
              </button>
            )}
            {phase === 'to_store' ? (
              <button
                type="button"
                className="rx-driver__btn rx-driver__btn--primary"
                disabled={busyId === trip.id}
                onClick={() => void onPickup()}
              >
                {busyId === trip.id ? '…' : 'Marcar Recogido'}
              </button>
            ) : (
              <button
                type="button"
                className="rx-driver__btn rx-driver__btn--primary"
                disabled={busyId === trip.id}
                onClick={() => void onDeliver()}
              >
                {busyId === trip.id ? '…' : 'Entregado'}
              </button>
            )}
          </div>
          <p className="rx-driver__trip-detail">
            #{trip.job.ticketCode || trip.job.id.slice(0, 8)} · {clp(trip.job.orderTotal)}
            {fee != null ? ` · Delivery ${clp(fee)}` : ''}
          </p>
        </section>
      )}

      {!trip && !showOfferCard && (
        <div className="rx-driver__idle">
          <p>
            {isOnline
              ? 'Esperando nuevo pedido… Mantente disponible.'
              : 'Activa Disponible para recibir pedidos.'}
          </p>
        </div>
      )}
    </div>
  );
}
