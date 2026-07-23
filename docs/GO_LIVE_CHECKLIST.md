# Checklist go-live PollDriver

Marca cada ítem antes de activar en una sucursal real.

## Infra

- [ ] Repo GitHub `APP-POLLDRIVER` actualizado
- [ ] Proyecto Vercel desplegado (env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- [ ] Auth Supabase: Confirm email OFF (recomendado) o SMTP propio
- [ ] Redirect URLs Auth incluyen dominio Vercel

## Base de datos

Ejecutar en orden `001` … `017` (SQL Editor):

- [ ] 001 branch extensions  
- [ ] 002 driver core  
- [ ] 003 jobs / offers / assignments  
- [ ] 004 location  
- [ ] 005 RLS  
- [ ] 006 functions  
- [ ] 007 sync triggers + realtime  
- [ ] 008 verify (opcional)  
- [ ] 009 enable branch (o SQL manual)  
- [ ] 010 applications  
- [ ] 011 dispatch offers  
- [ ] 012 accept race  
- [ ] 013 location fn  
- [ ] 014 pickup / delivery  
- [ ] 015 pricing  
- [ ] 016 reports  
- [ ] 017 production verify → revisar NOTICE / counts  

## Sucursal piloto

- [ ] `lat` / `lng` cargados en `branches`
- [ ] `polldriver_enabled = true` **solo** en la sucursal piloto
- [ ] Al menos 1 repartidor aprobado (`role=delivery`)
- [ ] Regla de tarifa en `/tarifas` (opcional pero recomendado)

## Prueba end-to-end

- [ ] Pedido delivery → `preparando` → aparece job + ofertas
- [ ] Repartidor acepta (web o app)
- [ ] GPS visible en `/mapa`
- [ ] Retiro → `pedidos.estado = en_delivery` en El Pollón
- [ ] Entrega → `entregado`
- [ ] `/reportes` muestra actividad

## Móvil (opcional día 1)

- [ ] `eas build` preview APK instalado en 1 teléfono de prueba
- [ ] Permisos de ubicación OK
- [ ] Link a `/privacidad` visible

## Comunicación interna

- [ ] Cocina/caja saben el flujo `preparando` dispara PollDriver
- [ ] Plan de rollback: `polldriver_enabled = false`

## Post go-live

- [ ] Monitorear errores en Despacho (`last_error` sin repartidores)
- [ ] Ampliar a más sucursales solo tras 1–2 días estables
