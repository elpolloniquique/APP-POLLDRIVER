# Fase 8 — Tarifas / cotización delivery

## Objetivo

Calcular tarifa de delivery por sucursal **sin modificar** `branches.delivery_cost` (TEXT informativo de El Pollón).

## SQL

| # | Archivo |
|---|--------|
| 15 | `015_pd_pricing.sql` |

Incluye:

- Tabla `pd_pricing_rules` (1 regla activa por sucursal)
- `pd_quote_delivery(branch, lat?, lng?, order_total)`
- `pd_apply_quote_to_job(job_id, lat?, lng?)`
- `pd_upsert_pricing_rule(...)`
- Columnas en job: `delivery_fee_quoted`, `delivery_distance_km`, `delivery_fee_source`

### Modos

| mode | Cálculo |
|------|---------|
| `fixed` | `base_fee` |
| `per_km` | `base_fee + ceil(km) * per_km_fee` |
| `tiers` | JSON `[{up_to_km, fee}, ...]` |

Si no hay regla o faltan coordenadas: puede usar el monto **numérico** parseado de `delivery_cost` (solo lectura).

## UI

| Ruta | Uso |
|------|-----|
| `/tarifas` | Crear/editar regla + probar cotización |
| `/` Despacho | Botón **Cotizar** en cada job |

## Importante

- **No** escribe en `branches.delivery_cost`.
- El checkout de El Pollón sigue igual; integrar la cotización en tienda es opcional (futuro).

## Prueba

1. Ejecutar `015` en Supabase.
2. Cargar `lat/lng` de la sucursal en `branches`.
3. `/tarifas` → guardar regla `per_km` o `fixed`.
4. Probar cotización con lat/lng.
5. En Despacho → **Cotizar** en un job.

## Criterio de aceptación

✅ Cotización usable en PollDriver sin romper el TEXT de delivery de El Pollón.
