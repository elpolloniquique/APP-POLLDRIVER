# Live Tracking — Plan de implementación (PollDriver)

**Fecha:** 2026-07-23  
**Estado:** Fase 1 (análisis) completada → implementación por fases  
**Regla:** No MapTiler / Mapbox / Google Maps. Stack: **MapLibre + OpenFreeMap Liberty + OSRM + Supabase Realtime**.  
**Framework panel:** Vite + React 19 (no Next.js). Conservar.

---

## 1. Arquitectura actual detectada

```text
APP POLLON/polldriver/
├── apps/admin-web/          Vite+React+TS · puerto 5174 · ruta /mapa
├── apps/driver-mobile/      Expo 52 · GPS vía RPC (sin broadcast aún)
├── packages/shared-types/
└── supabase/migrations/     001–017 (pd_*)
```

| Pieza | Estado |
|-------|--------|
| MapLibre GL | ✅ `maplibre-gl` |
| Estilo calles | ✅ OpenFreeMap Liberty (`VITE_MAP_STYLE_URL`) |
| GPS latest + events | ✅ `pd_driver_location_latest` / `pd_driver_location_events` |
| Upsert throttle 8s | ✅ `pd_upsert_driver_location` (013) |
| Realtime + Broadcast | ✅ Admin; mobile solo DB |
| OSRM | ✅ driver → sucursal más cercana |
| Voz | ✅ ETA ≤5 min al local |
| Capacidad 2 pedidos | ✅ schema + accept race |
| Geocercas runtime | ❌ solo `arrival_radius_m` en branches |
| Colores por driver | ❌ todos rojo |
| Ruta a cliente | ❌ sin lat/lng pedido |
| Tracking sessions | ❌ no formalizado |
| Zod / TanStack Query | ❌ no instalados |

**Conexión El Pollón:** intacta vía `pedidos` + jobs `pd_*`. No romper.

---

## 2. Archivos que se modificarán

- `apps/admin-web/src/pages/LiveMapPage.tsx` → pantalla **Despacho en vivo**
- `apps/admin-web/src/lib/location.ts`
- `apps/admin-web/src/lib/routing.ts` → servicio OSRM endurecido
- `apps/admin-web/src/lib/voiceAlert.ts` → `voiceNotificationService`
- `apps/admin-web/src/pages/AppShell.tsx` (nav label)
- `apps/admin-web/package.json` (zod, @tanstack/react-query)
- `.env.example`
- `README.md` / `docs/FASE11_*.md` (referencia cruzada)

## 3. Archivos nuevos

| Path | Propósito |
|------|-----------|
| `docs/LIVE_TRACKING_IMPLEMENTATION_PLAN.md` | Este documento |
| `supabase/migrations/018_pd_live_tracking.sql` | Sessions, geofence, status history, RPCs |
| `apps/admin-web/src/lib/driverColors.ts` | Color determinístico por ID |
| `apps/admin-web/src/lib/geofence.ts` | Radios / detección cliente |
| `apps/admin-web/src/lib/formatters.ts` | km, ETA, velocidad |
| `apps/admin-web/src/lib/voiceNotificationService.ts` | Cola de voz |
| `apps/admin-web/src/lib/osrmService.ts` | OSRM centralizado + caché |
| `apps/admin-web/src/lib/trackingTypes.ts` | Tipos + Zod |
| `apps/admin-web/src/hooks/useLiveDrivers.ts` | Suscripción live |
| `apps/admin-web/src/hooks/useVoiceAlerts.ts` | Preferencia voz |
| `apps/admin-web/src/components/live/*` | Sidebar, cards, legend, controls |
| Tests unitarios formatters/colors/geofence | vitest |

## 4. Tablas existentes a reutilizar (no renombrar)

| Tabla / función | Uso |
|-----------------|-----|
| `pd_driver_location_latest` | Última posición |
| `pd_driver_location_events` | Puntos clave |
| `pd_delivery_jobs` / `offers` / `assignments` | Pedidos y capacidad |
| `pd_driver_profiles` | Estado operativo, max_orders=2 |
| `branches` (lat/lng, arrival_radius_m) | Sucursal + radio |
| `pd_upsert_driver_location` | Escritura GPS segura |
| `pd_accept_delivery_offer` | Accept race-safe |

## 5. Tablas / objetos nuevos (prefijo `pd_`, aditivos)

| Objeto | Motivo |
|--------|--------|
| `pd_tracking_sessions` | Sesión de rastreo por assignment |
| `pd_geofence_events` | Llegada/cercanía confirmada |
| `pd_driver_status_history` | Auditoría de estados |
| `pd_detect_geofences(...)` | RPC haversine (PostGIS opcional) |
| `pd_start_tracking_session` / `pd_end_tracking_session` | Ciclo de vida |

**PostGIS:** se intenta `CREATE EXTENSION IF NOT EXISTS postgis`. Si no está disponible en el proyecto, las distancias usan `pd_haversine_km` ya existente (015). No bloquear el go-live.

## 6. Flujo GPS

```text
Repartidor acepta → GPS ON (web/móvil)
  → pd_upsert_driver_location (throttle adaptativo)
  → Broadcast pd-driver-locations (baja latencia)
  → postgres_changes latest (respaldo)
  → Panel /mapa: marker interpolado + ruta OSRM
  → Geocerca → events + voz
  → Entrega(s) completa(s) → end session + stop GPS
```

Frecuencias objetivo (productivo):

| Contexto | Intervalo |
|----------|-----------|
| Disponible sin pedido | 20–40 s |
| Con assignment en movimiento | 5–8 s (hoy 8 s) |
| Cerca destino | 3–5 s (fase posterior mobile) |
| Detenido | reducir |

## 7. Flujo Supabase Realtime

- Canal broadcast existente: `pd-driver-locations` (extender payload con Zod).
- postgres_changes: `pd_driver_location_latest`.
- Futuro (fase Realtime endurecida): `branch:{id}:drivers` privado si Realtime Authorization lo permite; mientras tanto RLS + auth session.

## 8. Flujo OSRM

- Base: `VITE_OSRM_BASE_URL` (default `https://router.project-osrm.org`).
- Recalcular: accept, pickup, desvío, cada 20–30 s, o botón admin.
- Entre recalculos: distancia haversine local.
- Fallback: línea recta + ETA estimada (nunca ocultar marker).

## 9. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Rate-limit OSRM público | Caché + throttle + variable propia |
| OpenFreeMap caída | Mensaje error + reintentar; marker GPS sigue |
| Batería mobile | Throttle; no 1 s en prod |
| Duplicar accept | Ya cubierto 012 |
| Romper El Pollón | Solo migraciones aditivas `pd_*` |
| PostGIS no habilitado | Fallback haversine |

## 10. Estrategia de seguridad

- Identidad solo desde `auth.uid()` en RPC.
- RLS staff / propio driver.
- No `service_role` en cliente.
- Rastreo solo con assignment activo o disponible autorizado.
- Admin sucursal: filtrar por `branch_id` (super_admin: todo).
- Retención: events muestreados, no GPS cada segundo forever.

## 11. Plan por etapas

| Fase | Entregable | Criterio |
|------|------------|----------|
| **1** | Este documento | ✅ |
| **2** | SQL 018 sessions/geofence/history + RPCs | Migración ejecutable |
| **3** | osrmService, formatters, colors, geofence, voice, zod | Tests verdes |
| **4** | UI Despacho en vivo profesional `/mapa` | Calles, multi-driver, colores, sidebar |
| **5** | Realtime payload validado + reconnect UI | ✅ Zod + backoff + badge |
| **6** | Mobile: broadcast + GPS adaptativo | ✅ cola offline + auto GPS |
| **7** | Geocercas + voz ampliada | Eventos cerca/llegó (parcial en UI) |
| **8** | Dos pedidos: multi-stop OSRM | Capacidad 2/2 en mapa |
| **9** | Tests E2E/seguridad + docs | Checklist aceptación |

## 12. Estrategia de reversión

1. `polldriver_enabled = false` en branches.
2. Quitar/ocultar nav mapa (feature flag opcional).
3. Tablas `pd_*` nuevas pueden quedar vacías.
4. No tocar `pedidos` de El Pollón.

## 13. Cambios mínimos seguros (inmediato)

1. No crear tablas duplicadas `driver_location_latest` — extender `pd_*`.
2. Conservar ruta `/mapa` (alias conceptual “Despacho en vivo”).
3. OpenFreeMap fijo; eliminar dependencia MapTiler del módulo.
4. Instalar `zod` (+ TanStack Query para hooks live).
5. Reconstruir UI sobre APIs existentes primero; SQL 018 en paralelo.

---

**Siguiente:** Fase 2 (migración 018) + Fase 3–4 (servicios + UI Despacho en vivo).
