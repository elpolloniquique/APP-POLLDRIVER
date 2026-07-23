# Fase 5 — Ofertas + accept (un solo ganador)

## Objetivo

Cuando varios repartidores reciben la misma oferta, **solo uno** gana el job. Los demás ven `offer_already_taken` de forma clara.

## SQL

Ejecutar después de `011`:

| # | Archivo |
|---|--------|
| 12 | `012_pd_accept_race.sql` |

Cambios:

- `pd_accept_delivery_offer` con `pg_advisory_xact_lock` por job + `FOR UPDATE` + manejo de `UNIQUE` en assignments
- Rivales → `taken_by_other` y vuelven a `available`
- `pd_my_driver_summary()` — capacidad y estado operativo

## UI `/ofertas`

- Countdown de expiración
- Mensaje amigable si otro ganó
- Capacidad activa / máx
- Lista de pedidos activos
- Repartidor: al entrar a `/` redirige a `/ofertas`

## Prueba de carrera

1. Ejecutar `012` en SQL Editor.
2. Dos cuentas `delivery` aprobadas, disponibles.
3. Un pedido → `preparando` → ambas ven la oferta.
4. Ambas pulsan **Aceptar** casi a la vez.
5. Una ve “¡Ganaste…”; la otra “Otro repartidor llegó primero…”.
6. En Despacho el job queda `assigned` una sola vez.

## Criterio de aceptación

✅ Un solo assignment activo por job bajo carrera concurrente.
