/**
 * Verificación local previa a go-live (Fase 10).
 * No imprime secretos. Uso: node scripts/verify-go-live.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'vercel.json',
  'pnpm-lock.yaml',
  'package.json',
  'docs/GO_LIVE_CHECKLIST.md',
  'docs/FASE10_PRODUCTION.md',
  'apps/admin-web/package.json',
  'apps/driver-mobile/eas.json',
  'apps/driver-mobile/app.json',
  'apps/driver-mobile/.env.example',
  'supabase/migrations/018_pd_live_tracking.sql',
  'supabase/migrations/019_pd_live_geofence_multistop.sql',
  'supabase/migrations/020_pd_production_verify.sql',
];

const migrationsDir = path.join(root, 'supabase/migrations');
const migrationFiles = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((f) => /^\d{3}_.+\.sql$/i.test(f)).sort()
  : [];

let failed = 0;

function ok(label) {
  console.log(`OK  — ${label}`);
}
function fail(label) {
  failed += 1;
  console.log(`FAIL — ${label}`);
}

for (const rel of requiredFiles) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) ok(`archivo ${rel}`);
  else fail(`falta ${rel}`);
}

const needMigrations = [
  '001',
  '017',
  '018',
  '019',
  '020',
];
for (const n of needMigrations) {
  if (migrationFiles.some((f) => f.startsWith(`${n}_`))) ok(`migración ${n}_*`);
  else fail(`migración ${n}_* ausente`);
}

const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
if (vercel.buildCommand === 'pnpm build:admin') ok('vercel buildCommand');
else fail('vercel buildCommand debe ser pnpm build:admin');
if (vercel.outputDirectory === 'apps/admin-web/dist') ok('vercel outputDirectory');
else fail('vercel outputDirectory incorrecto');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.packageManager?.startsWith('pnpm@')) ok(`packageManager ${pkg.packageManager}`);
else fail('packageManager pnpm requerido');

const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
if (envExample.includes('openfreemap.org')) ok('.env.example OpenFreeMap');
else fail('.env.example sin OpenFreeMap');
if (!/maptiler\.com/i.test(envExample)) ok('.env.example sin MapTiler');
else fail('.env.example aún apunta a MapTiler');

const lock = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
const mobilePkg = JSON.parse(
  fs.readFileSync(path.join(root, 'apps/driver-mobile/package.json'), 'utf8'),
);
const hasAsyncInPkg = Boolean(mobilePkg.dependencies?.['@react-native-async-storage/async-storage']);
const hasAsyncInLock = /apps\/driver-mobile:[\s\S]*?@react-native-async-storage\/async-storage/.test(
  lock,
);
if (hasAsyncInPkg === hasAsyncInLock) ok('lockfile alineado con driver-mobile');
else fail('pnpm-lock desincronizado (causa típica de fallo Vercel)');

const adminEnv = path.join(root, 'apps/admin-web/.env.local');
if (fs.existsSync(adminEnv)) {
  const text = fs.readFileSync(adminEnv, 'utf8');
  if (/VITE_SUPABASE_URL=https:\/\//.test(text) && !/TU_PROYECTO/.test(text)) {
    ok('admin .env.local URL presente');
  } else fail('admin .env.local URL incompleta');
  if (/VITE_MAP_STYLE_URL=.*openfreemap/.test(text)) ok('admin mapa OpenFreeMap');
  else fail('admin .env.local sin OpenFreeMap (recomendado prod)');
} else {
  console.log('WARN — apps/admin-web/.env.local no encontrado (ok en CI; requerido local)');
}

console.log('');
console.log(`Migraciones detectadas: ${migrationFiles.length}`);
console.log(migrationFiles.join(', '));
console.log('');
if (failed) {
  console.log(`Resultado: ${failed} fallo(s). Corregir antes de go-live.`);
  process.exit(1);
}
console.log('Resultado: verify-go-live OK. Completar checklist humano + SQL 020 en Supabase.');
process.exit(0);
