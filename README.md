# PollDriver

Sistema de **despacho y seguimiento GPS** de repartidores para **Pollería El Pollón**.

> No reemplaza `el-pollon/`. Vive al lado y usa el **mismo Supabase**.

## Estructura

```text
APP POLLON/
├── el-pollon/      ← tienda + admin existente
└── polldriver/     ← este monorepo
    ├── apps/admin-web
    ├── apps/driver-mobile
    └── packages/shared-types
```

## Documentación

- [Plan](./docs/POLLDRIVER_IMPLEMENTATION_PLAN.md)
- [Despliegue GitHub + Vercel](./docs/DEPLOY_GITHUB_VERCEL.md)
- [Checklist go-live](./docs/GO_LIVE_CHECKLIST.md)
- [Fase 10 Producción](./docs/FASE10_PRODUCTION.md)
- [Fase 11 Ruta / ETA / voz](./docs/FASE11_LIVE_ROUTE_VOICE.md)
- Fases: `docs/FASE2_*.md` … `docs/FASE11_*.md`

## Arranque admin

```powershell
cd "c:\APP POLLON\polldriver"
pnpm install
copy .env.example apps\admin-web\.env.local
pnpm dev:admin
```

http://localhost:5174 · Privacidad: `/privacidad`

## Móvil

Ver `apps/driver-mobile/README.md` y `docs/FASE10_PRODUCTION.md`.

## Tests

```powershell
pnpm test
```

## SQL

Ejecutar `supabase/migrations/001` → `017` en Supabase SQL Editor.  
Guía: [FASE2](./docs/FASE2_MIGRATIONS.md) + checklist go-live.

## Fases

| Fase | Estado |
|------|--------|
| 0–9 | ✅ |
| 10 Producción | ✅ scaffold EAS + privacidad + tests + checklist |

## Rollback

`UPDATE branches SET polldriver_enabled = false;`
