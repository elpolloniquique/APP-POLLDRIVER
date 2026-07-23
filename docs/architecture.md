# Arquitectura PollDriver

Ver plan completo: [POLLDRIVER_IMPLEMENTATION_PLAN.md](./POLLDRIVER_IMPLEMENTATION_PLAN.md)

## Resumen

- Hermano de `el-pollon/` (React/Vite SPA).
- Mismo Supabase.
- Admin: Vite+React+TS en puerto **5174**.
- GPS: Expo Location → Realtime Broadcast → MapLibre.
- Prefijo tablas: `pd_*`.
