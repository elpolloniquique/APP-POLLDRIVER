/**
 * Comprueba la key embebida en el deploy de Vercel (sin imprimir secretos).
 * Uso: node scripts/check-prod-supabase-key.mjs
 */
const site = process.argv[2] || 'https://app-polldriver.vercel.app';

function normalizeAnonKey(key) {
  const t = (key || '').trim();
  if (t.startsWith('yJhbGciOiJIUzI1NiIsInR5cCI6')) return `e${t}`;
  return t;
}

const html = await (await fetch(`${site}/login`)).text();
const m = html.match(/assets\/([^"']+\.js)/);
if (!m) {
  console.log('FAIL — no se encontró el JS del login');
  process.exit(1);
}
const js = await (await fetch(`${site}/assets/${m[1]}`)).text();
const url = (js.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0] || '';

const around = js.indexOf('jhpfxxwudxyhldisxrro.supabase.co');
const window = around >= 0 ? js.slice(around, around + 500) : js;
const strLits = [...window.matchAll(/"([^"\\]{20,})"/g)].map((x) => x[1]);
let key = '';
for (const s of strLits) {
  if (s.includes('supabase.co')) continue;
  if (/^e?yJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(s)) {
    key = normalizeAnonKey(s.startsWith('eyJ') ? s : s.startsWith('yJ') ? s : s);
    if (s.startsWith('yJ')) key = normalizeAnonKey(s);
    break;
  }
}

console.log('site:', site);
console.log('asset:', m[1]);
console.log('url:', url || '(ninguna)');
console.log('key_len:', key.length);
console.log('key_starts_eyJ:', key.startsWith('eyJ'));

if (!url || !key) {
  console.log('FAIL — faltan URL o key en el bundle');
  process.exit(1);
}

const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ email: 'probe@invalid.local', password: 'x' }),
});
const body = await r.text();
const invalid = /invalid api key/i.test(body);
console.log('auth_status:', r.status);
console.log('invalid_api_key:', invalid ? 'YES' : 'no');
if (invalid) {
  console.log(
    'ACCIÓN: En Vercel pon VITE_SUPABASE_ANON_KEY completa (debe empezar por eyJ) y Redeploy.',
  );
  process.exit(1);
}
console.log('OK — key del deploy (con normalización) es aceptada por Supabase');
