/** Roles y redirección RapideX */
export const DRIVER_ROLES = new Set(['delivery', 'repartidor']);

/** Panel despacho / admin (cuentas creadas en Supabase con rol) */
export const DISPATCH_ROLES = new Set([
  'super_admin',
  'admin_sucursal',
  'administrador',
  'despachador',
  'cajera',
  'cajero',
  'cocina',
]);

/** Puede iniciar sesión en la app (incluye candidato a repartidor) */
export const APP_LOGIN_ROLES = new Set([
  ...DISPATCH_ROLES,
  ...DRIVER_ROLES,
  'cliente',
]);

export function isDriverRole(role: string | null | undefined): boolean {
  return Boolean(role && DRIVER_ROLES.has(role));
}

export function isDispatchRole(role: string | null | undefined): boolean {
  return Boolean(role && DISPATCH_ROLES.has(role));
}

export function canLoginToApp(role: string | null | undefined): boolean {
  return Boolean(role && APP_LOGIN_ROLES.has(role));
}

/** Ruta post-login según rol */
export function homePathForRole(role: string | null | undefined): string {
  if (isDriverRole(role)) return '/ofertas';
  if (isDispatchRole(role)) return '/';
  return '/onboarding';
}
