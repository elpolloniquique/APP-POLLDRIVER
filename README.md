# PollDriver

Sistema de **despacho y seguimiento GPS** de repartidores para **Pollería El Pollón**.

> No reemplaza `el-pollon/`. Vive al lado y usa el **mismo Supabase**.

## Estructura

```text
APP POLLON/
├── el-pollon/      ← tienda + admin existente
└── polldriver/     ← este monorepo
```

## Documentación

- [Plan de implementación (Fase 0)](./docs/POLLDRIVER_IMPLEMENTATION_PLAN.md)
- [Integración El Pollón](./docs/integrations-el-pollon.md)
- [Despliegue GitHub + Vercel](./docs/DEPLOY_GITHUB_VERCEL.md)
- [Fase 2 SQL](./docs/FASE2_MIGRATIONS.md)
- [Fase 3 Repartidores](./docs/FASE3_DRIVERS.md)
- [Fase 4 Despacho](./docs/FASE4_DISPATCH.md)

## Requisitos

- Node.js 20+
- [pnpm](https://pnpm.io/) 9+
- Mismas credenciales Supabase que El Pollón (`.env` del sitio)

## Arranque rápido (Admin)

```powershell
cd "c:\APP POLLON\polldriver"
pnpm install
copy .env.example apps\admin-web\.env.local
# Edita apps\admin-web\.env.local con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
pnpm dev:admin
```

Abre http://localhost:5174

## SQL (obligatorio antes de despacho real)

En Supabase SQL Editor, ejecuta en orden:

1. `supabase/migrations/001_pd_branch_extensions.sql`
2. `supabase/migrations/002_pd_driver_core.sql`
3. `supabase/migrations/003_pd_delivery_jobs.sql`
4. `supabase/migrations/004_pd_location.sql`
5. `supabase/migrations/005_pd_rls.sql`

## Fases

| Fase | Estado |
|------|--------|
| 0 Plan | ✅ |
| 1 Monorepo + admin shell | ✅ |
| 2 Migraciones + RLS + sync | ✅ |
| 3 Registro/aprobación repartidor | ✅ |
| 4 Adapter Realtime + ofertas | ✅ |
| 5 Accept concurrente | ✅ |
| 6 GPS + mapa MapLibre | ✅ |
| 7 Pickup / entrega | ✅ |
| 8 Tarifas / cotización | ✅ |
| 9 Reportes dashboard | ✅ |
| 10 | Pendiente |

Guía SQL: [docs/FASE2_MIGRATIONS.md](./docs/FASE2_MIGRATIONS.md)

## GPS

Celular → Supabase Realtime Broadcast → MapLibre en admin.  
Detalle en el plan §2.
