// node:crypto mínimo para a demonstração (aleatoriedade do navegador; scrypt em JavaScript).
import { Buffer } from 'buffer';
import { scrypt } from '@noble/hashes/scrypt';
export function randomBytes(n) { return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(n))); }
// Parâmetro reduzido (N=1024): na demonstração as contas ficam só neste telemóvel.
export function scryptSync(password, salt, len) { return Buffer.from(scrypt(String(password), salt, { N: 1024, r: 8, p: 1, dkLen: len })); }
export function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0; }
export default { randomBytes, scryptSync, timingSafeEqual };
