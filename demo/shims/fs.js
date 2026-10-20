// node:fs em memória: guarda os ficheiros carregados (fotografias, documentos) no navegador.
import { basename } from './path.js';
export const files = new Map();
export const fsHooks = { onWrite: null };
export function mkdirSync() {}
export function existsSync(p) { return files.has(basename(p)); }
export function readFileSync(p) { if (!files.has(basename(p))) throw new Error('ENOENT ' + p); return files.get(basename(p)); }
export function writeFileSync(p, data) { files.set(basename(p), data); fsHooks.onWrite?.(basename(p), data); }
export function rmSync(p) { files.delete(basename(p)); }
export function createReadStream(p) { const buf = readFileSync(p); return { pipe(res) { res.end(buf); } }; }
export default { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync, createReadStream };
