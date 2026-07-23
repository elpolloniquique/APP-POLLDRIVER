# Fase 10 — Producción (go-live)

## Objetivo

Dejar PollDriver listo para operar en producción: admin en Vercel, SQL completo, app móvil Expo/EAS, privacidad y checklist.

## Entregables

| Pieza | Estado |
|-------|--------|
| Admin web (Vercel) | ✅ `vercel.json` + repo GitHub |
| SQL 001→017 | Ejecutar en Supabase |
| App móvil Expo | ✅ `apps/driver-mobile` + `eas.json` (APK preview) |
| Privacidad | ✅ `/privacidad` pública |
| Tests | ✅ `pnpm test` (shared-types) |
| Checklist | ✅ `docs/GO_LIVE_CHECKLIST.md` |

## App móvil — build APK

```powershell
cd "c:\APP POLLON\polldriver"
pnpm install
cd apps\driver-mobile
copy .env.example .env
# editar EXPO_PUBLIC_SUPABASE_* y EXPO_PUBLIC_PRIVACY_URL
npx eas-cli login
npx eas init   # guarda projectId en app.json
pnpm eas:build:apk
```

Perfil `preview` genera **APK** instalable (distribución interna).  
Hasta tener APK, los repartidores pueden usar el panel web `/ofertas` + Compartir GPS.

## Privacidad

URL pública: `https://TU_DOMINIO_VERCEL/privacidad`  
Configura `EXPO_PUBLIC_PRIVACY_URL` en la app.

## Tests

```powershell
cd "c:\APP POLLON\polldriver"
pnpm test
```

## Rollback rápido

```sql
UPDATE public.branches SET polldriver_enabled = false;
```

Los pedidos siguen en El Pollón; dejan de generar ofertas nuevas.

## Criterio de aceptación

✅ Checklist go-live completado + admin en producción + SQL verificado (`017`).
