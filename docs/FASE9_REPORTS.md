# Fase 9 — Reportes / dashboard despacho

## Objetivo

Ver KPIs de operación PollDriver: jobs, entregas, tiempos, tarifas y ranking de repartidores.

## SQL

| # | Archivo |
|---|--------|
| 16 | `016_pd_reports.sql` |

Función: `pd_dispatch_report(p_from, p_to, p_branch_id)` → JSONB

## UI

Ruta **`/reportes`** (solo staff):

- Filtros: Hoy / 7 días / 30 días + sucursal
- KPIs: jobs, entregados, en ruta, cola, tarifas, tasa accept, minutos promedio
- Barras por día (creados vs entregados)
- Distribución por estado
- Top repartidores

## Prueba

1. Ejecutar `016` en Supabase.
2. Abrir `/reportes` con cuenta admin.
3. Generar algo de actividad (ofertas/entregas) y refrescar.

## Criterio de aceptación

✅ Dashboard usable con métricas reales del período.
