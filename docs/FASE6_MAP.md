# Fase 6 — GPS + mapa MapLibre en vivo

## Objetivo

Tras aceptar un pedido, el repartidor comparte GPS y el admin ve el **marcador en vivo** en `/mapa`.

## SQL

Ejecutar después de `012`:

| # | Archivo |
|---|--------|
| 13 | `013_pd_location_fn.sql` |

Funciones:

- `pd_upsert_driver_location` — última posición (throttle 8s)
- `pd_record_location_event` — eventos clave
- Realtime sobre `pd_driver_location_latest`

## UI

| Quién | Acción |
|-------|--------|
| Repartidor | `/ofertas` → **Compartir GPS** (navegador) |
| Admin | `/mapa` → MapLibre + marcadores live |

Transporte: upsert DB + **Realtime Broadcast** canal `pd-driver-locations`.

## Variables

```env
VITE_MAP_STYLE_URL=https://demotiles.maplibre.org/style.json
```

(Opcional MapTiler / estilo propio.) En Vercel puedes agregar la misma variable.

## Sucursales en mapa

Si `branches.lat` / `branches.lng` están cargadas, aparecen como marcadores negros.

```sql
UPDATE branches SET lat = -20.230, lng = -70.152 WHERE slug = 'tu-slug';
```

## Prueba

1. Ejecutar `013` en Supabase.
2. Login repartidor → Mis ofertas → **Compartir GPS** (permite ubicación).
3. Login admin → **Mapa en vivo** → ver punto rojo actualizándose.

## Criterio de aceptación

✅ Marcador live del repartidor visible en el mapa admin tras compartir GPS.
