# Fase 2 — Migraciones + RLS (guía)

## Objetivo

Instalar el esquema PollDriver en el **mismo Supabase** de El Pollón, con:

- Tablas `pd_*`
- RLS scoped por rol/sucursal
- Funciones: upsert job, accept offer, pickup, delivery
- Trigger: pedidos `delivery` → `pd_delivery_jobs` (idempotente)

**Sin borrar** tablas ni policies de la tienda.

---

## Orden de ejecución (SQL Editor)

Copia y ejecuta **uno por uno**:

| # | Archivo |
|---|--------|
| 1 | `001_pd_branch_extensions.sql` |
| 2 | `002_pd_driver_core.sql` |
| 3 | `003_pd_delivery_jobs.sql` |
| 4 | `004_pd_location.sql` |
| 5 | `005_pd_rls.sql` |
| 6 | `006_pd_functions.sql` |
| 7 | `007_pd_sync_triggers.sql` |
| 8 | `008_pd_verify.sql` (solo comprueba) |
| 9 | `009_pd_enable_branch_example.sql` (opcional) |

Cada archivo debe terminar en **Success**.

---

## Qué hace el trigger

Cuando un pedido con `tipo_entrega = 'delivery'`:

- se **crea** o **actualiza** un `pd_delivery_jobs`
- solo si la sucursal tiene `polldriver_enabled = true`
- al **cancelar** → job `cancelled` + ofertas expiradas
- al pasar a **`preparando`** → job `ready_for_dispatch`

`retiro` / `reserva` **no** generan job.

---

## Activar una sucursal

```sql
UPDATE branches
SET polldriver_enabled = true,
    lat = -20.2307,  -- tu local
    lng = -70.1357
WHERE slug = 'iquique-vivar';
```

Hasta que no actives, el trigger no crea jobs (protección).

---

## Probar sync (manual)

1. En El Pollón admin, un pedido **delivery** → estado **preparando**
2. En SQL:

```sql
SELECT id, source_order_id, status, ticket_code, customer_name
FROM pd_delivery_jobs
ORDER BY created_at DESC
LIMIT 10;
```

Debe aparecer el job con `status = ready_for_dispatch`.

3. Cancelar el pedido en El Pollón → el job pasa a `cancelled`.

---

## Rollback seguro

```sql
UPDATE branches SET polldriver_enabled = false;
DROP TRIGGER IF EXISTS trg_pd_pedidos_sync ON pedidos;
-- Las tablas pd_* pueden quedar; no afectan la tienda
```

---

## Criterios Fase 2 ✅

- [ ] `008_pd_verify.sql` muestra OK en tablas/funciones/trigger
- [ ] Admin El Pollón sigue listando pedidos en vivo
- [ ] Cocina sigue avanzando estados
- [ ] Con `polldriver_enabled = true`, job aparece al ir a `preparando`

Siguiente: **Fase 3** — ver `docs/FASE3_DRIVERS.md` (+ migración `010`).
