# Fase 4 — Adapter Realtime + inicio de ofertas

## Objetivo

Cuando un pedido `delivery` de El Pollón pasa a **`preparando`**:

1. Se crea/actualiza `pd_delivery_jobs` (`ready_for_dispatch`)
2. El adapter **auto-oferta** a repartidores elegibles (`pd_start_driver_search`)
3. El panel PollDriver se actualiza por **Realtime**

## SQL

Ejecutar después de `010`:

| # | Archivo |
|---|--------|
| 11 | `011_pd_dispatch_offers.sql` |

Funciones nuevas/actualizadas:

- `pd_set_my_operational_status` — disponible / offline
- `pd_eligible_driver_ids` — aprobados con capacidad y sucursal
- `pd_start_driver_search(job, ttl, auto)` — crea `pd_delivery_offers`
- `pd_expire_stale_offers` — TTL
- `pd_reject_delivery_offer`
- `pd_upsert_job_from_pedido` — al entrar a `ready_for_dispatch`, auto-search

Realtime publication: `pd_delivery_offers`, `pd_delivery_assignments` (jobs ya en 007).

## UI

| Ruta | Uso |
|------|-----|
| `/` Despacho | Jobs live + botón Buscar / Re-ofertar |
| `/ofertas` | Inbox web del repartidor (aceptar / rechazar) |

## Flujo de prueba

1. Ejecutar `011` en SQL Editor.
2. Tener al menos 1 repartidor **aprobado** (Fase 3) con sucursal.
3. En El Pollón: pedido delivery → estado **preparando**.
4. En PollDriver Despacho: aparece job (`offered` o `ready` si no hay elegibles).
5. Con cuenta `delivery`: `/ofertas` → **Aceptar** → job `assigned`.

Si no hay elegibles: el job queda `ready_for_dispatch` con `last_error` y puedes pulsar **Buscar repartidor** tras aprobar a alguien.

## Criterio de aceptación

✅ Pedido → `preparando` → job visible en vivo en PollDriver (y ofertas si hay repartidores).

## Siguiente

**Fase 5:** endurecer accept concurrente + UX móvil (un solo ganador bajo carga).
