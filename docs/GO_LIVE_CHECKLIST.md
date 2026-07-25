# Checklist go-live PollDriver

Marca cada ítem antes de activar en una sucursal real.

## Infra

- [ ] Repo GitHub `APP-POLLDRIVER` en `main` actualizado
- [ ] Vercel Production en verde (`https://app-polldriver.vercel.app`)
- [ ] Env Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] Env Vercel: `VITE_MAP_STYLE_URL=https://tiles.openfreemap.org/styles/liberty` (sin MapTiler)
- [ ] Auth Supabase: Confirm email OFF (recomendado) o SMTP propio
- [ ] Redirect URLs Auth incluyen dominio Vercel

## Base de datos

Ejecutar en orden en SQL Editor (`polldriver/supabase/migrations/`):

### Núcleo (001→017)

- [ ] 001 … 016 (core, despacho, GPS, tarifas, reportes)
- [ ] 017 production verify (NOTICE / counts)

### Live tracking (018→021)

- [ ] **018** sessions / geofence events / status history / RPCs
- [ ] **019** customer_lat/lng + `pd_list_live_assignments` + distancia
- [ ] **020** verify go-live → revisar NOTICE y lista de funciones
- [ ] **021** configuración sucursal (`pd_update_branch_dispatch_settings`)

## Sucursal piloto

- [ ] `lat` / `lng` cargados en `branches`
- [ ] `polldriver_enabled = true` **solo** en la sucursal piloto
- [ ] Al menos 1 repartidor aprobado (`role=delivery`)
- [ ] Regla de tarifa en `/tarifas` (opcional pero recomendado)

## Prueba end-to-end

- [ ] Pedido delivery → `preparando` → aparece job + ofertas
- [ ] Repartidor acepta (web `/ofertas` o app Expo)
- [ ] GPS visible en `/mapa` (Despacho en vivo)
- [ ] Capacidad `N de 2` visible con 1–2 pedidos
- [ ] Retiro → `pedidos.estado = en_delivery` en El Pollón
- [ ] Entrega → `entregado`
- [ ] Voz ON → aviso cerca/llegó (geocerca 2 hits) o ETA ≤5 min a sucursal
- [ ] `/reportes` muestra actividad

## Móvil (opcional día 1)

- [ ] `eas.json` perfil `preview` → APK interno
- [ ] `.env` con `EXPO_PUBLIC_SUPABASE_*` + `EXPO_PUBLIC_PRIVACY_URL`
- [ ] Permisos de ubicación OK
- [ ] Link a `/privacidad` visible en la app

## Comunicación interna

- [ ] Cocina/caja saben: `preparando` dispara PollDriver
- [ ] Rollback: `UPDATE branches SET polldriver_enabled = false;`

## Post go-live

- [ ] Monitorear Despacho (`last_error` / sin repartidores)
- [ ] Ampliar sucursales solo tras 1–2 días estables
- [ ] (Opcional) cargar `customer_lat/lng` en jobs para multi-stop real

## Comandos locales

```powershell
cd "c:\APP POLLON\polldriver"
pnpm install --frozen-lockfile
pnpm build:admin
pnpm --filter admin-web test
pnpm check:supabase
pnpm verify:golive
```
