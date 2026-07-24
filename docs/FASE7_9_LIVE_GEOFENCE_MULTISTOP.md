# Fases 7–9 — Geocercas, multi-stop y cierre live tracking

**Módulo:** Despacho en vivo (`/mapa`)  
**Stack:** MapLibre + OpenFreeMap Liberty + OSRM + Supabase Realtime  
**Sin MapTiler / Mapbox / Google Maps**

---

## Fase 7 — Geocercas + voz ampliada

| Pieza | Detalle |
|-------|---------|
| Detección cliente | `geofence.ts` radios approach/arrive |
| Confirmación 2 hits | `geofenceService.confirmGeofenceHit` — evita falsos positivos GPS |
| Persistencia | RPC `pd_confirm_geofence_event` (migración **018**) |
| Voz | cerca/llegó sucursal y cliente vía `voiceNotificationService` |
| Distancia server | `pd_distance_meters` (migración **019**) |

**Criterio OK:** dos muestras GPS consecutivas del mismo evento → una sola voz + un evento en `pd_geofence_events`.

---

## Fase 8 — Multi-stop (capacidad 2)

| Pieza | Detalle |
|-------|---------|
| Coords dropoff | `pd_delivery_jobs.customer_lat/lng` + `delivery_sequence` (**019**) |
| Lista live | RPC `pd_list_live_assignments()` (staff) |
| Ruta | `osrmMultiStop` / `fetchMultiStopRoute` driver → cliente1 → cliente2 |
| Fallback | haversine encadenado si OSRM falla |
| UI | Capacidad `N de M`, tickets, ETA por tramo, markers 📦 |

**Nota:** sin `customer_lat/lng` el mapa sigue mostrando ruta a sucursal (comportamiento seguro).

---

## Fase 9 — Tests, seguridad y checklist

### Tests (vitest admin-web)

- `geofenceService.test.ts` — 2 hits, aislamiento driver/assignment
- `liveDispatch.test.ts` — `capacityLabel`, `isAtCapacity`, secuencias, `enrichActiveOrders`
- `routing.test.ts` — multi-stop OSRM + fallback haversine

### Seguridad

- [x] RPC live solo staff / super_admin (`pd_is_staff`)
- [x] Identidad geofence vía `auth.uid()` en 018
- [x] Sin `service_role` en cliente
- [x] Migraciones aditivas `pd_*` (no tocan `pedidos`)
- [x] Sin MapTiler en este módulo

### Checklist aceptación operativa

1. Ejecutar en Supabase SQL Editor: **018** y **019** (si aún no).
2. Vercel / `.env.local`: `VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty`
3. Staff abre `/mapa` → Realtime OK, markers por color.
4. Repartidor con 1 pedido sin coords cliente → ruta a sucursal + geocerca local.
5. Con `customer_lat/lng` en job(s) recogidos → markers 📦 + multi-stop.
6. Capacidad visible `1 de 2` / `2 de 2`.
7. Activar voz → avisos cerca/llegó (tras 2 hits).
8. OSRM caído → markers y línea recta siguen visibles.

### Comandos

```bash
cd polldriver
pnpm --filter admin-web test
pnpm --filter admin-web exec tsc --noEmit
pnpm --filter admin-web build
```

---

## Archivos clave

| Path | Rol |
|------|-----|
| `supabase/migrations/018_pd_live_tracking.sql` | Sessions, geofence events, RPC confirm |
| `supabase/migrations/019_pd_live_geofence_multistop.sql` | Coords, lista live, distancia |
| `apps/admin-web/src/lib/geofenceService.ts` | 2-hit + voz + persist |
| `apps/admin-web/src/lib/liveDispatch.ts` | Assignments + capacidad |
| `apps/admin-web/src/lib/osrmService.ts` | Multi-stop cacheado |
| `apps/admin-web/src/pages/LiveMapPage.tsx` | UI Despacho en vivo |

## Fuera de alcance (post 7–9)

- Geocode automático dirección → lat/lng
- Background GPS nativo Android (TaskManager)
- Canales Realtime privados por sucursal
