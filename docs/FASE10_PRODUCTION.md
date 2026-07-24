# Fase 10 — Producción (go-live)

## Objetivo

Dejar PollDriver operable en producción con el stack actual:

- Admin en **Vercel** (MapLibre + OpenFreeMap + OSRM)
- SQL **001→020** en el mismo Supabase que El Pollón
- App móvil Expo/EAS (APK preview)
- Privacidad pública `/privacidad`
- Checklist y verificación automatizable

## Estado de entregables

| Pieza | Estado |
|-------|--------|
| Admin web Vercel | ✅ `vercel.json` · repo `APP-POLLDRIVER` |
| SQL 001→017 | Checklist operativo |
| Live tracking 018→019 | ✅ geocercas + multi-stop (coords opcionales) |
| Verify 020 | ✅ NOTICE + funciones live |
| App móvil Expo | ✅ `apps/driver-mobile` + `eas.json` |
| Privacidad | ✅ `/privacidad` |
| Tests admin | ✅ `pnpm --filter admin-web test` |
| Checklist | ✅ `docs/GO_LIVE_CHECKLIST.md` |

## Orden SQL go-live

1. Si es proyecto nuevo: ejecutar **001 → 017** en orden.
2. Live tracking: **018**, luego **019**.
3. Verificación: **020** → leer `NOTICE` y la lista de `proname` (debe incluir `pd_list_live_assignments`, `pd_confirm_geofence_event`, etc.).

## Variables Vercel (Production)

```env
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...   # Legacy anon JWT completo
VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
# VITE_OSRM_BASE_URL=https://router.project-osrm.org
# VITE_EL_POLLON_URL=https://el-pollon.cl
```

**Importante:** no usar MapTiler en este módulo. Tras cambiar env → Redeploy.

## App móvil — APK preview

```powershell
cd "c:\APP POLLON\polldriver"
pnpm install --frozen-lockfile
cd apps\driver-mobile
copy .env.example .env
# editar EXPO_PUBLIC_SUPABASE_* y EXPO_PUBLIC_PRIVACY_URL
npx eas-cli login
npx eas init   # projectId real en app.json
pnpm eas:build:apk
```

Hasta tener APK: repartidores usan panel web `/ofertas` + compartir GPS.

## Privacidad

URL pública: `https://app-polldriver.vercel.app/privacidad`  
Móvil: `EXPO_PUBLIC_PRIVACY_URL` apuntando a esa URL.

## Verificación local

```powershell
cd "c:\APP POLLON\polldriver"
pnpm install --frozen-lockfile   # debe pasar (lockfile sincronizado)
pnpm build:admin
pnpm --filter admin-web test
pnpm check:supabase              # requiere .env.local admin
pnpm verify:golive               # checklist archivos + env plantilla
```

## Rollback rápido

```sql
UPDATE public.branches SET polldriver_enabled = false;
```

Los pedidos siguen en El Pollón; dejan de generar ofertas nuevas. Tablas `pd_*` pueden quedar vacías.

## Criterio de aceptación

✅ Vercel Production verde  
✅ SQL **018+019+020** aplicados (o NOTICE de 020 limpio)  
✅ Checklist go-live marcado para sucursal piloto  
✅ E2E: oferta → accept → GPS en `/mapa` → pickup → entrega  

## Relación con fases live tracking

Las fases 1–9 de *Despacho en vivo* ya están en código. Esta Fase 10 es el **cierre operativo** (deploy, SQL, piloto, móvil).
