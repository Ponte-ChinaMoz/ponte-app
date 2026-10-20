// node:path mínimo (só o que o servidor usa).
const norm = (p) => p.replace(/\/+/g, '/');
export const join = (...a) => norm(a.filter(Boolean).join('/'));
export const resolve = (...a) => { const p = join(...a); return p.startsWith('/') ? p : '/' + p; };
export const dirname = (p) => norm(p).replace(/\/[^/]*$/, '') || '/';
export const basename = (p, ext) => { const b = norm(p).split('/').pop(); return ext && b.endsWith(ext) ? b.slice(0, -ext.length) : b; };
export const extname = (p) => { const m = basename(p).match(/\.[^.]*$/); return m ? m[0] : ''; };
export const sep = '/';
export default { join, resolve, dirname, basename, extname, sep };
