# Fase 11 — Ruta en vivo, km/ETA y aviso por voz

## Objetivo

Que el despacho / super admin vea al repartidor en el mapa con **ruta**, **kilometraje** y **ETA**, y reciba un **aviso por voz** cuando esté a ~5 minutos del local.

## Qué incluye

| Pieza | Detalle |
|-------|---------|
| GPS automático | Al **aceptar** oferta se pide permiso y empieza a compartir ubicación |
| Mapa | MapLibre + estilo MapTiler (`VITE_MAP_STYLE_URL`) |
| Ruta | OSRM público (gratis) → polilínea al local más cercano |
| Fallback | Si OSRM falla → línea recta (haversine) + ETA estimada |
| Panel | km + ETA por repartidor en `/mapa` |
| Voz | `speechSynthesis` es-CL: *“El repartidor Juan llega en aproximadamente N minutos…”* |
| Toggle | Botón **Voz ON/OFF** en el mapa |

## Requisitos

1. SQL `013` (ubicación) ejecutado.
2. `branches.lat` / `branches.lng` cargados (ej. El Pollón Iquique).
3. MapTiler en `.env.local` / Vercel (`VITE_MAP_STYLE_URL`).
4. Navegador con permiso de ubicación (repartidor) y con audio desbloqueado (admin, al menos un clic en la página).

## Flujo

```text
Aceptar oferta
  → GPS watch (~8s) + Broadcast
  → Admin /mapa: puntito + ruta roja
  → OSRM: distance + duration
  → si ETA ≤ 5 min → voz + banner
```

## Variables

Sin key nueva para routing (OSRM demo). Solo MapTiler para el estilo:

```env
VITE_MAP_STYLE_URL=https://api.maptiler.com/maps/streets-v2/style.json?key=TU_KEY
```

## Prueba

1. Super admin: `/mapa` (Voz ON).
2. Repartidor: aceptar un delivery → permitir ubicación.
3. Ver ruta, km y ETA; acercarse (o simular) hasta ETA ≤ 5 min → escuchar aviso.

## Criterio de aceptación

✅ GPS al aceptar · ruta visible · km/ETA · voz a ~5 min (con Voz ON).

## Notas

- OSRM demo es gratuito y tiene rate-limit; en producción alta se puede cambiar a MapTiler Directions.
- La ruta es **repartidor → sucursal más cercana** (retiro en local). Ruta al cliente = mejora futura (requiere lat/lng del pedido).
