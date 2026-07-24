/**
 * Prueba conectividad Supabase + OpenFreeMap + bundle Vercel.
 * Lee apps/admin-web/.env.local. No imprime secretos completos.
 * Uso: node scripts/probe-connectivity.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, 'apps/admin-web/.env.local');

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1).trim();
  }
  return out;
}

function mask(s) {
  if (!s) return '(vacío)';
  if (s.length < 12) return '***';
  return `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`;
}

function jwtLooksOk(key) {
  return typeof key === 'string' && key.startsWith('eyJ') && key.split('.').length === 3;
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
const url = env.VITE_SUPABASE_URL || '';
const key = env.VITE_SUPABASE_ANON_KEY || '';
const mapStyle = env.VITE_MAP_STYLE_URL || '';

console.log('=== LOCAL (.env.local) ===');
console.log('URL:', url);
console.log('KEY:', mask(key), jwtLooksOk(key) ? 'JWT_OK' : 'JWT_BAD');
console.log('MAP:', mapStyle || '(default código)');

const results = [];

async function check(name, fn) {
  try {
    const ok = await fn();
    results.push([name, ok]);
    console.log(`${ok ? 'OK' : 'FAIL'} — ${name}`);
  } catch (e) {
    results.push([name, false]);
    console.log(`FAIL — ${name}: ${String(e.message || e).slice(0, 140)}`);
  }
}

await check('OpenFreeMap liberty reachable', async () => {
  const r = await fetch('https://tiles.openfreemap.org/styles/liberty');
  if (!r.ok) return false;
  const j = await r.json();
  return Boolean(j && (j.version || j.sources || j.layers));
});

await check('Supabase auth health', async () => {
  const r = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.ok;
});

await check('Supabase REST pd_delivery_jobs (anon)', async () => {
  const r = await fetch(`${url}/rest/v1/pd_delivery_jobs?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  // 200 OK o 401/403 por RLS = tabla existe; 404 = no existe
  return r.status === 200 || r.status === 401 || r.status === 403 || r.status === 406;
});

for (const table of [
  'pd_driver_location_latest',
  'pd_geofence_events',
  'pd_tracking_sessions',
  'pd_delivery_assignments',
]) {
  await check(`tabla ${table}`, async () => {
    const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    return r.status !== 404;
  });
}

await check('RPC pd_distance_meters', async () => {
  const r = await fetch(`${url}/rest/v1/rpc/pd_distance_meters`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_lat1: -20.23,
      p_lng1: -70.15,
      p_lat2: -20.24,
      p_lng2: -70.16,
    }),
  });
  if (!r.ok) return false;
  const n = await r.json();
  return typeof n === 'number' && n > 0;
});

await check('RPC pd_list_live_assignments (existe)', async () => {
  const r = await fetch(`${url}/rest/v1/rpc/pd_list_live_assignments`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  // sin sesión: forbidden/401 ok; 404 = función no desplegada
  const body = await r.text();
  if (r.status === 404) return false;
  return true;
});

console.log('\n=== VERCEL PRODUCTION BUNDLE ===');
const html = await (await fetch('https://app-polldriver.vercel.app')).text();
const m = html.match(/\/assets\/index-[^"]+\.js/);
if (!m) {
  console.log('FAIL — no se encontró JS del build');
  process.exit(1);
}
const jsUrl = `https://app-polldriver.vercel.app${m[0]}`;
const js = await (await fetch(jsUrl)).text();
console.log('bundle:', m[0], `len=${js.length}`);

const hostOk = js.includes('jhpfxxwudxyhldisxrro.supabase.co');
const mapOk = js.includes('openfreemap.org/styles/liberty');
const osrmOk = /project-osrm|osrm\.org/i.test(js);
console.log(`${hostOk ? 'OK' : 'FAIL'} — host Supabase embebido`);
console.log(`${mapOk ? 'OK' : 'FAIL'} — OpenFreeMap liberty embebido`);
console.log(`${osrmOk ? 'OK' : 'FAIL'} — OSRM referenciado`);

// Detectar JWT truncado típico: empieza por yJ en vez de eyJ junto al host
const trunc = /supabase\.co["'],\s*[A-Za-z_$]+=["']yJhbGci/.test(js);
const fullEyJ = /["']eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\./.test(js);
console.log(`${fullEyJ ? 'OK' : 'FAIL'} — anon JWT completo (eyJ…) en bundle`);
console.log(`${trunc ? 'FAIL' : 'OK'} — no hay JWT truncado (yJ…)`);

if (trunc || !fullEyJ) {
  console.log(`
ACCIÓN REQUERIDA EN VERCEL:
1. Project → Settings → Environment Variables
2. VITE_SUPABASE_ANON_KEY = pegar JWT COMPLETO que empiece por eyJ (copiar de .env.local)
3. Asegurar VITE_SUPABASE_URL = https://jhpfxxwudxyhldisxrro.supabase.co
4. VITE_MAP_STYLE_URL = https://tiles.openfreemap.org/styles/liberty
5. Redeploy Production (obligatorio: Vite incrusta env en el build)
`);
}

const fails = results.filter(([, ok]) => !ok).length + (hostOk && mapOk && fullEyJ && !trunc ? 0 : 1);
process.exit(fails ? 1 : 0);
