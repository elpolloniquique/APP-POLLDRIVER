# PollDriver Driver (Expo)

App móvil de repartidores para **El Pollón**.

## Funciones

- Login (mismo Supabase)
- Ofertas: aceptar / rechazar
- Pedidos activos: retiro / entrega
- GPS → `pd_upsert_driver_location` (throttle servidor ~8s; cliente envía ~15s)
- Link a política de privacidad

## Dev

```powershell
cd "c:\APP POLLON\polldriver"
pnpm install
cd apps\driver-mobile
copy .env.example .env
pnpm start
```

## APK (EAS)

```powershell
npx eas-cli login
npx eas init
pnpm eas:build:apk
```

Ver `docs/FASE10_PRODUCTION.md`.

## Nota

Mientras el APK no esté distribuido, usar el panel web `/ofertas` + **Compartir GPS**.
