/** Color estable por driver (sesión completa). */

const PALETTE = [
  '#1d4ed8', // azul
  '#15803d', // verde
  '#7c3aed', // morado
  '#c2410c', // naranja
  '#be123c', // rosa fuerte
  '#0f766e', // teal
  '#a16207', // ámbar
  '#4338ca', // índigo
] as const;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function driverColor(driverProfileId: string): string {
  if (!driverProfileId) return PALETTE[0];
  return PALETTE[hashId(driverProfileId) % PALETTE.length];
}
