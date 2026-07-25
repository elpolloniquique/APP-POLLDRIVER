import type { StyleSpecification } from 'maplibre-gl';

export type BasemapMode = 'streets' | 'satellite';

/**
 * Calles reales (raster CARTO Voyager) — sin API key, muy estable en Vercel.
 * Evita mapa en blanco si OpenFreeMap vector falla por red/CDN.
 */
export const STREET_STYLE: StyleSpecification = {
  version: 8,
  name: 'RapideX Streets',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    streets: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap © CARTO',
      maxzoom: 20,
    },
  },
  layers: [
    {
      id: 'streets',
      type: 'raster',
      source: 'streets',
    },
  ],
};

/**
 * Satélite (Esri World Imagery) + etiquetas de calles — estilo tipo apps de delivery.
 * Sin MapTiler / Mapbox / Google.
 */
export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  name: 'RapideX Satellite',
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
        'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      maxzoom: 20,
    },
  },
  layers: [
    { id: 'satellite', type: 'raster', source: 'satellite' },
    {
      id: 'road-labels',
      type: 'raster',
      source: 'labels',
      paint: { 'raster-opacity': 0.95 },
    },
  ],
};

export function styleForBasemap(mode: BasemapMode): StyleSpecification {
  return mode === 'satellite' ? SATELLITE_STYLE : STREET_STYLE;
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
