// Servidor HTTP da Ponte: API em /api, app do cliente em /, painel em /admin.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.js';
import { handleApi, maintenanceSweep } from './api.js';
import { ensureSeed } from './seed.js';

ensureSeed();
// Lembretes de manutenção preventiva: ao arrancar e de 6 em 6 horas.
const sweep = () => { try { maintenanceSweep(); } catch (e) { console.error('manutenção:', e.message); } };
setTimeout(sweep, 5000).unref();
setInterval(sweep, 6 * 3600e3).unref();

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
};

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'geolocation=(self), microphone=(self), camera=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
  ].join('; '),
};

function serveFile(req, res, file, { cache = 'no-cache', status = 200 } = {}) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    const ext = path.extname(file).toLowerCase();
    const type = TYPES[ext] || 'application/octet-stream';
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
    const headers = { 'Content-Type': type, 'Cache-Control': cache, ETag: etag, ...SECURITY };
    const gzip = /^(text|application\/(json|manifest)|image\/svg)/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (gzip) {
      headers['Content-Encoding'] = 'gzip';
      headers.Vary = 'Accept-Encoding';
      res.writeHead(status, headers);
      fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
    } else {
      headers['Content-Length'] = st.size;
      res.writeHead(status, headers);
      fs.createReadStream(file).pipe(res);
    }
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { res.writeHead(400); return res.end(); }
  const p = decodeURIComponent(url.pathname);

  if (p === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
  if (p.startsWith('/api/')) return handleApi(req, res, url);

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }

  // Imagens públicas carregadas no painel (fotos de produtos).
  if (p.startsWith('/uploads/')) {
    const file = path.join(config.dataDir, 'uploads', 'public', path.basename(p));
    return serveFile(req, res, file, { cache: 'public, max-age=604800' });
  }

  if (p === '/admin' || p.startsWith('/admin/')) return serveFile(req, res, path.join(config.publicDir, 'admin.html'));

  const safe = path.normalize(path.join(config.publicDir, p));
  if (!safe.startsWith(config.publicDir)) { res.writeHead(403); return res.end(); }
  if (p !== '/' && fs.existsSync(safe) && fs.statSync(safe).isFile()) {
    const long = /\/(fonts|vendor|icons)\//.test(p);
    return serveFile(req, res, safe, { cache: long ? 'public, max-age=2592000' : 'no-cache' });
  }
  // Qualquer outro caminho abre a app (navegação interna por #).
  return serveFile(req, res, path.join(config.publicDir, 'index.html'));
});

server.listen(config.port, () => {
  console.log(`Ponte a funcionar em http://localhost:${config.port}  ·  painel: http://localhost:${config.port}/admin`);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => server.close(() => process.exit(0)));
