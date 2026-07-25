import type { StyleSpecification } from 'maplibre-gl';

export type BasemapMode = 'streets' | 'satellite';

/** DPR alto = tiles más nítidos en pantallas Retina/HiDPI. */
export function mapPixelRatio(): number {
  if (typeof window === 'undefined') return 2;
  const dpr = window.devicePixelRatio || 1;
  return Math.min(Math.max(dpr, 2), 3);
}

function useRetinaTiles(): boolean {
  if (typeof window === 'undefined') return true;
  return (window.devicePixelRatio || 1) >= 1.25;
}

/**
 * Calles nítidas: CARTO Voyager @2x (512px) en pantallas HD.
 * Sin MapTiler / Mapbox / Google.
 */
export function buildStreetStyle(): StyleSpecification {
  const retina = useRetinaTiles();
  const file = retina ? '{z}/{x}/{y}@2x.png' : '{z}/{x}/{y}.png';
  const tileSize = retina ? 512 : 256;
  return {
    version: 8,
    name: 'RapideX Streets HD',
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      streets: {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/rastertiles/voyager/${file}`,
          `https://b.basemaps.cartocdn.com/rastertiles/voyager/${file}`,
          `https://c.basemaps.cartocdn.com/rastertiles/voyager/${file}`,
        ],
        tileSize,
        attribution: '© OpenStreetMap © CARTO',
        maxzoom: 20,
      },
    },
    layers: [
      {
        id: 'streets',
        type: 'raster',
        source: 'streets',
        paint: {
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
          'raster-opacity': 1,
        },
      },
    ],
  };
}

/**
 * Satélite Esri + etiquetas HD (@2x).
 */
export function buildSatelliteStyle(): StyleSpecification {
  const retina = useRetinaTiles();
  const labelFile = retina ? '{z}/{x}/{y}@2x.png' : '{z}/{x}/{y}.png';
  const labelSize = retina ? 512 : 256;
  return {
    version: 8,
    name: 'RapideX Satellite HD',
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      satellite: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Esri · Maxar · Earthstar Geographics',
        maxzoom: 19,
      },
      labels: {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/${labelFile}`,
          `https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/${labelFile}`,
          `https://c.basemaps.cartocdn.com/rastertiles/voyager_only_labels/${labelFile}`,
        ],
        tileSize: labelSize,
        maxzoom: 20,
      },
    },
    layers: [
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        paint: {
          'raster-fade-duration': 0,
          'raster-resampling': 'linear',
          'raster-saturation': 0.05,
          'raster-contrast': 0.08,
        },
      },
      {
        id: 'road-labels',
        type: 'raster',
        source: 'labels',
        paint: {
          'raster-opacity': 1,
          'raster-fade-duration': 0,
        },
      },
    ],
  };
}

/** @deprecated usar buildStreetStyle() — se regenera por DPR */
export const STREET_STYLE: StyleSpecification = buildStreetStyle();

/** @deprecated usar buildSatelliteStyle() */
export const SATELLITE_STYLE: StyleSpecification = buildSatelliteStyle();

export function styleForBasemap(mode: BasemapMode): StyleSpecification {
  return mode === 'satellite' ? buildSatelliteStyle() : buildStreetStyle();
}

/** Opciones MapLibre para máxima nitidez. */
export function sharpMapOptions() {
  return {
    pixelRatio: mapPixelRatio(),
    antialias: true,
    fadeDuration: 0,
    maxTileCacheSize: 150,
  } as const;
}

/** Interpola marker hacia nueva posición (sensación inDriver). */
export function animateMarkerTo(
  marker: { getLngLat: () => { lng: number; lat: number }; setLngLat: (ll: [number, number]) => unknown },
  toLng: number,
  toLat: number,
  durationMs = 700,
): void {
  const from = marker.getLngLat();
  const dLng = toLng - from.lng;
  const dLat = toLat - from.lat;
  if (Math.abs(dLng) < 1e-7 && Math.abs(dLat) < 1e-7) {
    marker.setLngLat([toLng, toLat]);
    return;
  }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const e = t * (2 - t);
    marker.setLngLat([from.lng + dLng * e, from.lat + dLat * e]);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
