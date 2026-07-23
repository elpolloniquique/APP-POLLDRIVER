# Integración PollDriver ↔ El Pollón

## Fuente de verdad

| Entidad | Tabla |
|---------|-------|
| Pedido | `public.pedidos` |
| Sucursal | `public.branches` |
| Usuario/rol | `public.profiles` |
| Historial | `public.order_status_history` |

## Filtro de despacho

```sql
tipo_entrega = 'delivery'
AND estado IN ('preparando', 'en_delivery')
-- jobs se crean al entrar a preparando (idempotente)
```

## Sync de estado hacia El Pollón

Solo funciones autorizadas PollDriver deben ejecutar:

```sql
UPDATE pedidos SET estado = 'en_delivery' WHERE id = $1;
UPDATE pedidos SET estado = 'entregado', entregado_en = now() WHERE id = $1;
```

El panel El Pollón y la cuenta cliente lo verán por Realtime existente.

## Qué no tocar en el-pollon

- Checkout, menú, cocina UI, claim ticket, impresión térmica, PWA.

## Cambios mínimos futuros permitidos en el-pollon

- Badge “Repartidor asignado” leyendo `pd_delivery_assignments`.
- Botón opcional “Forzar despacho” (Opción B).
