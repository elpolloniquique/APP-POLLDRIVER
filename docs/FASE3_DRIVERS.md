# Fase 3 — Registro y aprobación de repartidores

## Objetivo

Que un candidato se postule, un admin lo apruebe, y su `profiles.role` pase a **`delivery`**.

## SQL a ejecutar

Después de Fase 2 (001→009), ejecuta:

| # | Archivo |
|---|--------|
| 10 | `010_pd_driver_applications_fn.sql` |

Funciones:

- `pd_ensure_driver_profile()`
- `pd_submit_driver_application(...)`
- `pd_review_driver_application(...)` — approved / rejected / needs_correction
- `pd_set_driver_admin_status(...)` — suspender / reactivar

Al **aprobar**: `pd_driver_profiles.admin_status = approved` y `profiles.role = 'delivery'`.

## UI (admin-web)

| Ruta | Quién | Qué |
|------|-------|-----|
| `/postular` | Público | Crear cuenta + postular, o login + postular |
| `/repartidores` | Staff | Listar, filtrar, aprobar / rechazar / corrección |
| `/login` | Staff | Panel (clientes pendientes no entran al shell) |

Dev: `pnpm dev:admin` → http://localhost:5174/postular

## Flujo de prueba

1. Ejecutar `010` en SQL Editor.
2. Abrir `/postular`, crear cuenta (Confirm email OFF recomendado) y enviar.
3. Con admin: `/login` → **Repartidores** → **Aprobar** (elige sucursal).
4. En Supabase: `select role from profiles where email = '...'` → `delivery`.
5. El repartidor ya puede entrar a PollDriver (rol staff permitido).

## Notas

- Hasta aprobar, el usuario queda como `cliente` (no ve el panel de despacho).
- Si Confirm email está ON y no hay sesión tras el signup, usa “Ya tengo cuenta” después de confirmar.
- Suspender no quita el rol `delivery`; solo `admin_status = suspended` (no recibirá ofertas en fases siguientes).

## Criterio de aceptación

✅ Postulación visible en admin → Aprobar → `role = delivery`.

Siguiente: **Fase 4** — `docs/FASE4_DISPATCH.md` (+ migración `011`).
