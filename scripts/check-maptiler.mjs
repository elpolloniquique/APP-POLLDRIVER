/**
 * Verifica VITE_MAP_STYLE_URL sin imprimir la key.
 * Uso: node scripts/check-maptiler.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../apps/admin-web/.env.local',
);
const line = fs
  .readFileSync(envPath, 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('VITE_MAP_STYLE_URL='));

if (!line) {
  console.log('FAIL — falta VITE_MAP_STYLE_URL');
  process.exit(1);
}

const url = line.slice('VITE_MAP_STYLE_URL='.length).trim();
const key = url.split('key=')[1] || '';

console.log('archivo:', envPath);
console.log('es MapTiler:', url.includes('maptiler.com'));
console.log('key_len:', key.length);
console.log('sigue siendo placeholder:', key === 'TU_API_KEY' || key.includes('TU_API'));

const r = await fetch(url, { headers: { 'User-Agent': 'PollDriver-MapCheck/1.0' } });
const body = await r.text();
console.log('style_http:', r.status);
if (!r.ok) {
  console.log('error:', body.slice(0, 120).replace(/\s+/g, ' '));
  console.log(
    '→ En MapTiler Cloud → API keys → Copy key (no uses un ID de mapa). Pega solo la key tras key=',
  );
  process.exit(1);
}
console.log('OK — estilo MapTiler válido. Abre /mapa y reinicia pnpm dev:admin si hace falta.');
