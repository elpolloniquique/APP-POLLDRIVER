/**
 * Smoke test: lee apps/admin-web/.env.local y verifica URL/key + API.
 * No imprime secretos. Uso: node scripts/check-supabase-env.mjs
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

function jwtRef(token) {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return json.ref || null;
  } catch {
    return null;
  }
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
const url = env.VITE_SUPABASE_URL || '';
const key = env.VITE_SUPABASE_ANON_KEY || '';
const hostRef = url.replace(/^https?:\/\//, '').split('.')[0];
const keyRef = key.startsWith('eyJ') ? jwtRef(key) : '(publishable/non-jwt)';

const checks = [];
checks.push(['URL presente', Boolean(url)]);
checks.push(['KEY presente', Boolean(key)]);
checks.push(['URL no es placeholder', !url.includes('TU_PROYECTO')]);
if (typeof keyRef === 'string' && keyRef !== '(publishable/non-jwt)') {
  checks.push(['URL ref == JWT ref', hostRef === keyRef]);
}

let apiOk = false;
let profileHint = '';
try {
  const health = await fetch(`${url}/auth/v1/health`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  checks.push([`auth/health HTTP ${health.status}`, health.ok || health.status === 200]);

  const prof = await fetch(
    `${url}/rest/v1/profiles?select=email,role,is_active&email=eq.tutacanehuillca@gmail.com&limit=1`,
    {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    },
  );
  const body = await prof.text();
  checks.push([`profiles HTTP ${prof.status}`, prof.ok]);
  if (prof.ok) {
    apiOk = true;
    const rows = JSON.parse(body || '[]');
    if (rows[0]) {
      profileHint = `perfil (anon): role=${rows[0].role} active=${rows[0].is_active}`;
    } else {
      profileHint =
        'perfil: vacío con anon (normal si RLS). El login autenticado sí lee tu fila.';
    }
  } else {
    profileHint = `profiles body: ${body.slice(0, 120)}`;
  }
} catch (e) {
  checks.push(['fetch API', false]);
  profileHint = String(e?.message || e);
}

console.log('env file:', envPath);
console.log('host ref:', hostRef);
console.log('key ref:', keyRef);
for (const [name, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'} — ${name}`);
}
if (profileHint) console.log(profileHint);
process.exit(checks.every(([, ok]) => ok) && apiOk ? 0 : 1);
