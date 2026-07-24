/**
 * Comprueba la key embebida en el deploy de Vercel (sin imprimir secretos).
 * Uso: node scripts/check-prod-supabase-key.mjs
 */
const site = process.argv[2] || 'https://app-polldriver.vercel.app';

const html = await (await fetch(`${site}/login`)).text();
const m = html.match(/assets\/([^"']+\.js)/);
if (!m) {
  console.log('FAIL — no se encontró el JS del login');
  process.exit(1);
}
const js = await (await fetch(`${site}/assets/${m[1]}`)).text();
const url = (js.match(/https:\/\/[a-z0-9]+\.supabase\.co/) || [])[0] || '';
const pub = (js.match(/sb_publishable_[A-Za-z0-9_-]+/) || [])[0] || '';
const jwt =
  (js.match(
    /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  ) || [])[0] || '';
const key = jwt || pub;

console.log('site:', site);
console.log('asset:', m[1]);
console.log('url:', url || '(ninguna)');
console.log('key_type:', jwt ? 'jwt-anon' : pub ? 'publishable' : 'none');
console.log('key_len:', key.length);

if (!url || !key) {
  console.log('FAIL — faltan URL o key en el bundle (vars Vercel vacías o mal nombradas)');
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
    'ACCIÓN: En Vercel → Settings → Environment Variables pon VITE_SUPABASE_ANON_KEY = Legacy anon public (eyJ...) y Redeploy.',
  );
  process.exit(1);
}
console.log('OK — la key del deploy es aceptada por Supabase');
