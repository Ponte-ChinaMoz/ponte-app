// Gera demo/dist/ponte-demo.html: a Ponte inteira (app + painel + servidor) num só ficheiro,
// para experimentar no telemóvel sem alojamento. Uso: cd demo && npm install && node build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { feature } from 'topojson-client';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const pub = path.join(root, 'public');
const out = path.join(here, 'dist');
fs.mkdirSync(out, { recursive: true });

// Módulos do Node substituídos por versões para o navegador.
const SHIMS = { fs: 'fs.js', path: 'path.js', crypto: 'crypto.js', url: 'url.js', sqlite: 'sqlite.js' };
const shimPlugin = {
  name: 'node-shims',
  setup(b) {
    b.onResolve({ filter: /^(node:)?(fs|path|crypto|url|sqlite)$/ }, (a) => ({ path: path.join(here, 'shims', SHIMS[a.path.replace('node:', '')]) }));
  },
};

const result = await esbuild.build({
  entryPoints: [path.join(here, 'entry.js')],
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, write: false,
  plugins: [shimPlugin], logLevel: 'warning', legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' },
});
let js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// CSS: letras embutidas (data URI); folhas de estilo do Leaflet e do painel incluídas.
const fontUri = (f) => `url(data:font/woff2;base64,${fs.readFileSync(path.join(pub, 'fonts', f)).toString('base64')})`;
const appCss = fs.readFileSync(path.join(pub, 'css/app.css'), 'utf8').replace(/url\('\/fonts\/([^']+)'\)/g, (m, f) => fontUri(f));
const adminCss = fs.readFileSync(path.join(pub, 'css/admin.css'), 'utf8');
const leafletCss = fs.readFileSync(path.join(pub, 'vendor/leaflet/leaflet.css'), 'utf8').replace(/url\(images\/[^)]+\)/g, 'none');
const demoCss = `
.demo-bar { display: flex; align-items: center; gap: 8px; padding: 6px max(12px, env(safe-area-inset-right, 0px)) 6px max(12px, env(safe-area-inset-left, 0px)); background: var(--gold-tint, #FBEFD5); color: var(--ink, #13201B); font: 600 12px/1.3 var(--body, sans-serif); position: relative; z-index: 30; }
.demo-label { flex: 1; min-width: 0; }
.demo-bar button { border: 1px solid rgba(0,0,0,.15); background: #fff; color: inherit; font: inherit; font-weight: 800; border-radius: 999px; padding: 6px 10px; cursor: pointer; white-space: nowrap; }
.demo-splash { position: fixed; inset: 0; display: grid; place-content: center; gap: 14px; text-align: center; background: #0F5C48; color: #fff; font: 700 16px var(--body, sans-serif); z-index: 99; }
.demo-logo { width: 64px; height: 64px; margin: 0 auto; border-radius: 18px; background: #E8B04B; animation: demoPulse 1s ease-in-out infinite alternate; }
@keyframes demoPulse { from { transform: scale(.9); } to { transform: scale(1.05); } }
@media (prefers-reduced-motion: reduce) { .demo-logo { animation: none; } }
.leaflet-container { background: #CFE3EC; }
body.admin .demo-bar { background: #FBEFD5; }
`;

// Contorno dos continentes para os mapas (os mosaicos de mapa não carregam numa página partilhada).
const topo = JSON.parse(fs.readFileSync(path.join(here, 'node_modules/world-atlas/land-110m.json'), 'utf8'));
const land = feature(topo, topo.objects.land);
const round = (v) => (Array.isArray(v) ? v.map(round) : Math.round(v * 100) / 100);
for (const f of land.features || [land]) if (f.geometry) f.geometry.coordinates = round(f.geometry.coordinates);

const assets = { leaflet: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js', land };
const html = `<title>Ponte</title>
<meta name="description" content="Ponte: a ponte da lusofonia para a China — versão de demonstração.">
<meta name="theme-color" content="#0F5C48">
<style>${appCss}</style>
<style>${leafletCss}</style>
<style id="admin-css" media="not all">${adminCss}</style>
<style>${demoCss}</style>
<script>window.PONTE_ASSETS = ${JSON.stringify(assets)};</script>
<script type="module">${js}</script>
`;
const file = path.join(out, 'ponte-demo.html');
fs.writeFileSync(file, html);
console.log(`Gerado ${path.relative(root, file)} · ${(html.length / 1024 / 1024).toFixed(2)} MB`);
