# Fases 5–6 — Realtime endurecido + GPS móvil

## Fase 5 (admin `/mapa`)

| Pieza | Detalle |
|-------|---------|
| Validación | Zod en payloads broadcast |
| Secuencia | Ignora puntos con `sequence` ≤ anterior |
| Reconnect | Backoff al fallar canal Realtime |
| UI | Badge: Conectando / OK / Reconectando / Error + botón Reconectar |
| Hook | `useRealtimeTracking` |

Archivos: `realtimeTracking.ts`, `hooks/useRealtimeTracking.ts`, `LiveMapPage.tsx`.

## Fase 6 (driver-mobile)

| Pieza | Detalle |
|-------|---------|
| Broadcast | Tras `pd_upsert_driver_location` → canal `pd-driver-locations` |
| GPS adaptativo | idle 40s · available 30s · active 7s · near 4s |
| Cola offline | Hasta 40 puntos si no hay red; flush al recuperar |
| Auto GPS | Al aceptar oferta / pedido activo |
| Sesión | `pd_start_tracking_session` / `pd_end_tracking_session` (SQL 018) |
| UX | Chip “GPS {mode}” + aviso “Compartiendo ubicación” |

Archivos: `locationTracking.ts`, `App.tsx`, `api.ts`.

## Prueba

1. Ejecutar SQL `018` si falta.
2. Admin: `/mapa` → badge Realtime OK.
3. Mobile o web `/ofertas`: aceptar pedido → permitir GPS.
4. Ver puntito moverse en admin (broadcast, no solo poll DB).

## Nota segundo plano nativo

Background TaskManager (Android notification) queda para una sub-fase; hoy el loop adaptativo cubre foreground + cola offline.
