# Fase 7 — Pickup / entrega → El Pollón

## Objetivo

El repartidor (o staff) confirma:

1. **Retiro en local** → `pedidos.estado = en_delivery`
2. **Entrega al cliente** → `pedidos.estado = entregado` (+ `entregado_en`)

## SQL

Ejecutar después de `013`:

| # | Archivo |
|---|--------|
| 14 | `014_pd_pickup_delivery.sql` |

Funciones:

- `pd_confirm_pickup(assignment_id, lat?, lng?)`
- `pd_confirm_delivery(assignment_id, lat?, lng?)`
- `pd_mark_heading_to_branch(assignment_id)` — opcional “voy al local”

## UI

| Ruta | Acciones |
|------|----------|
| `/ofertas` (repartidor) | Voy al local · Retiré en local · Entregué al cliente |
| `/` Despacho (staff) | Confirmar retiro / Confirmar entrega |

## Flujo

```text
accept → assigned
  → (opcional) heading_to_branch
  → pickup → job picked_up + pedidos.en_delivery
  → deliver → job delivered + pedidos.entregado
```

## Prueba

1. Ejecutar `014` en Supabase.
2. Aceptar una oferta.
3. **Retiré en local** → en El Pollón el pedido debe verse `en_delivery`.
4. **Entregué al cliente** → `entregado`.

## Criterio de aceptación

✅ Pickup/entrega actualizan `pedidos.estado` en El Pollón vía funciones PollDriver.
