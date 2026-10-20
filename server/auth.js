// Autenticação: palavras-passe com scrypt e sessões guardadas na base de dados.
import crypto from 'node:crypto';
import { get, run } from './db.js';

const SESSION_DAYS = 30;
export const COOKIE = 'ponte_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  run('INSERT INTO sessions(token, user_id, expires_at) VALUES(?, ?, ?)', token, userId, expires);
  run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  return { token, expires };
}

export function destroySession(token) {
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function tokenFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return parseCookies(req.headers.cookie)[COOKIE] || null;
}

export function userFromRequest(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const row = get(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?`,
    token, Date.now());
  return row || null;
}

export function sessionCookie(req, token, expires) {
  const secure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (expires) parts.push(`Expires=${new Date(expires).toUTCString()}`);
  else parts.push('Max-Age=0');
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// Limite simples de tentativas de entrada por IP (proteção contra força bruta).
// Só as tentativas falhadas contam; ao fim de 15 minutos o contador recomeça.
const attempts = new Map();
function rec(ip) {
  const now = Date.now();
  const r = attempts.get(ip) || { n: 0, t: now };
  if (now - r.t > 15 * 60e3) { r.n = 0; r.t = now; }
  attempts.set(ip, r);
  return r;
}
export function tooManyAttempts(ip) { return rec(ip).n >= 20; }
export function recordFailure(ip) { rec(ip).n++; }

export function publicUser(u) {
  if (!u) return null;
  let interests = [], prefs = {};
  try { interests = JSON.parse(u.interests || '[]'); } catch { /* ignorar */ }
  try { prefs = JSON.parse(u.prefs || '{}'); } catch { /* ignorar */ }
  return {
    id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, company: u.company,
    city: u.city, country: u.country || 'MZ', lang: u.lang, currency: u.currency, plan: u.plan, interests, prefs, travel_when: u.travel_when, whatsapp: u.whatsapp, notify_whatsapp: !!u.notify_whatsapp,
  };
}
