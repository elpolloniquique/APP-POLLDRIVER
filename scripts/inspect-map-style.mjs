/**
 * Comprueba qué estilo de mapa está embebido en el deploy (sin imprimir keys).
 */
const site = process.argv[2] || 'https://app-polldriver.vercel.app';
const html = await (await fetch(`${site}/mapa`)).text();
const m = html.match(/assets\/([^"']+\.js)/);
if (!m) {
  console.log('no asset');
  process.exit(1);
}
const js = await (await fetch(`${site}/assets/${m[1]}`)).text();
console.log('asset', m[1]);
console.log('has_maptiler', js.includes('api.maptiler.com'));
console.log('has_demotiles', js.includes('demotiles.maplibre.org'));
console.log('has_openfreemap', js.includes('openfreemap'));
console.log('has_streets_v2', js.includes('streets-v2'));
console.log('has_placeholder_key', js.includes('TU_API_KEY'));
const idx = js.indexOf('api.maptiler.com');
if (idx >= 0) {
  const slice = js.slice(idx, idx + 120);
  console.log('maptiler_has_key_param', /key=/.test(slice));
  console.log('maptiler_key_looks_placeholder', /key=TU_API/.test(slice));
}
