// API da Ponte: rotas públicas, de cliente e de administração.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, run, tx, getSetting, setSetting } from './db.js';
import { config } from './config.js';
import {
  hashPassword, verifyPassword, createSession, destroySession, tokenFromRequest,
  userFromRequest, sessionCookie, tooManyAttempts, recordFailure, publicUser,
} from './auth.js';
import { answer as botAnswer } from './bot.js';
import { parseCSV, toCSV } from './csv.js';
import { searchCatalog, parseFilters, parseNatural } from './catalog.js';
import { notifyUser, whatsappEnabled } from './notify.js';
import { translate, translateProvider } from './translate.js';
import { transcribe, sttProvider } from './stt.js';
import { identify as visionIdentify, visionProvider } from './vision.js';
import { COUNTRIES, CURRENCIES, PHONE_WALLETS, countryOf, normalizePhone, fixPrep } from '../public/js/countries.js';
import { CARRIERS, PORTS, MILESTONES, milestone, guessCode, computeShipment, orderStepFor } from './tracking.js';

// ---------------------------------------------------------------- utilitários
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };

const str = (v, max = 500) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' || v === 'sim' ? 1 : 0);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || ''));
const LANGS = ['pt', 'en', 'es', 'it', 'fr', 'zh'];
const validCountry = (c) => (COUNTRIES.some((x) => x.code === c) || c === 'XX' ? c : null);

// Câmbio: unidades de cada moeda por 1 USD. Aceita o formato antigo (USD_MZN, CNY_MZN…).
const DEFAULT_RATES = { USD: 1, MZN: 63.9, AOA: 915, BRL: 5.5, CVE: 95, XOF: 565, EUR: 0.86, STN: 21.1, CNY: 7.15, ZAR: 17.8 };
function readRates() {
  const r = getSetting('rates', {}) || {};
  const out = { ...DEFAULT_RATES };
  if (r.USD_MZN) {
    out.MZN = r.USD_MZN;
    if (r.CNY_MZN) out.CNY = +(r.USD_MZN / r.CNY_MZN).toFixed(4);
    if (r.EUR_MZN) out.EUR = +(r.USD_MZN / r.EUR_MZN).toFixed(4);
    if (r.ZAR_MZN) out.ZAR = +(r.USD_MZN / r.ZAR_MZN).toFixed(4);
  }
  for (const c of Object.keys(CURRENCIES)) if (Number(r[c]) > 0) out[c] = Number(r[c]);
  return { ...out, USD: 1, updated_at: r.updated_at || null, note: r.note || 'Valores indicativos: actualize no painel.' };
}

// Meio de pagamento válido para o país do cliente; carteiras móveis pedem o número.
function checkPayMethod(user, method, phone) {
  const c = countryOf(user.country || 'MZ');
  const allowed = new Set([...c.pay.map((p) => p.id), 'cartao']);
  if (!allowed.has(method)) fail(400, 'Escolha um meio de pagamento disponível no seu país.');
  if (PHONE_WALLETS.has(method) && !normalizePhone(phone, c.code)) fail(400, fixPrep(`Número inválido para ${c.name}${c.dial ? ` (+${c.dial})` : ''}.`));
}

export const ORDER_STEPS = 7; // recebido, cotações, amostra, produção, inspecção, embarque, chegada

function track(userId, type, meta) {
  try { run('INSERT INTO events(user_id, type, meta) VALUES(?, ?, ?)', userId || null, String(type).slice(0, 60), meta ? JSON.stringify(meta).slice(0, 500) : null); }
  catch { /* nunca falhar por causa das estatísticas */ }
}

// Mensagens do assistente no idioma do utilizador.
const BOT_TEXT = {
  handoff: {
    pt: 'Claro! Passei a conversa à equipa Ponte. A Lara responde normalmente no mesmo dia útil ({h}).',
    en: 'Of course! I have passed the conversation to the Ponte team. Lara usually replies the same working day ({h}).',
    es: '¡Claro! He pasado la conversación al equipo Ponte. Lara suele responder el mismo día laborable ({h}).',
    it: 'Certo! Ho passato la conversazione al team Ponte. Lara di solito risponde lo stesso giorno lavorativo ({h}).',
    fr: 'Bien sûr ! J’ai transmis la conversation à l’équipe Ponte. Lara répond en général le jour ouvrable même ({h}).',
    zh: '好的！我已将对话转给 Ponte 团队。Lara 通常会在当天工作时间内回复（{h}）。',
  },
  unknown: {
    pt: 'Ainda não tenho uma resposta automática para isso. Deixei a sua pergunta à equipa Ponte e a Lara vai responder aqui ({h}).',
    en: 'I don’t have an automatic answer for that yet. I have left your question for the Ponte team and Lara will reply here ({h}).',
    es: 'Todavía no tengo una respuesta automática para eso. He dejado su pregunta al equipo Ponte y Lara responderá aquí ({h}).',
    it: 'Non ho ancora una risposta automatica. Ho lasciato la domanda al team Ponte e Lara risponderà qui ({h}).',
    fr: 'Je n’ai pas encore de réponse automatique. J’ai transmis votre question à l’équipe Ponte et Lara répondra ici ({h}).',
    zh: '我暂时没有自动回答。我已把您的问题留给 Ponte 团队，Lara 会在这里回复（{h}）。',
  },
  welcome: {
    pt: 'Olá! Sou o assistente da Ponte. Respondo já às dúvidas mais comuns sobre viagem, pagamentos, feiras, fornecedores e carga. Se precisar, passo a conversa à Lara.',
    en: 'Hello! I am the Ponte assistant. I answer common questions about travel, payments, fairs, suppliers and cargo right away. If needed, I will pass you to Lara.',
    es: '¡Hola! Soy el asistente de Ponte. Respondo al momento las dudas más comunes sobre viaje, pagos, ferias, proveedores y carga. Si lo necesita, le paso con Lara.',
    it: 'Ciao! Sono l’assistente di Ponte. Rispondo subito alle domande più comuni su viaggio, pagamenti, fiere, fornitori e merci. Se serve, ti passo a Lara.',
    fr: 'Bonjour ! Je suis l’assistant Ponte. Je réponds tout de suite aux questions courantes sur le voyage, les paiements, les salons, les fournisseurs et le fret. Si besoin, je vous passe à Lara.',
    zh: '您好！我是 Ponte 助手。我可以立即回答关于旅行、付款、展会、供应商和货运的常见问题。如有需要，我会为您转接 Lara。',
  },
};
const botText = (key, lang) => (BOT_TEXT[key][lang] || BOT_TEXT[key].pt).replace('{h}', config.supportHours);

function saveUpload({ data, mime, name }, visibility) {
  const ALLOWED = visibility === 'public'
    ? { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' }
    : {
      'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    };
  const ext = ALLOWED[mime];
  if (!ext) fail(400, 'Tipo de ficheiro não permitido.');
  const b64 = String(data || '').replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) fail(400, 'Ficheiro vazio.');
  if (buf.length > config.maxUploadMb * 1024 * 1024) fail(413, `Ficheiro maior que ${config.maxUploadMb} MB.`);
  const file = crypto.randomBytes(12).toString('hex') + ext;
  fs.writeFileSync(path.join(config.dataDir, 'uploads', visibility, file), buf);
  return { file, size: buf.length, name: str(name, 200) || file, mime };
}

// ------------------------------------------------- serialização pública (anónima)
function reliability(s) {
  const r = [s.rating_quality, s.rating_delivery, s.rating_comms].filter((x) => x);
  const auto = s.id ? get(`SELECT COUNT(*) n FROM orders o JOIN quote_requests q ON q.id = o.quote_id WHERE q.supplier_id = ? AND o.status_step >= 6`, s.id).n : 0;
  return { score: r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 20) : null, orders_done: (s.orders_done || 0) + auto,
    quality: s.rating_quality || null, delivery: s.rating_delivery || null, comms: s.rating_comms || null };
}

export function publicSupplier(s, productCount) {
  // ATENÇÃO: nunca acrescentar aqui company_name, contact_person, phone, wechat, email,
  // address, website, commission_pct ou internal_notes. O modelo da Ponte é intermediado.
  return {
    code: s.public_code, title: s.public_title, category: s.category, city: s.city, district: s.district,
    description: s.description, moq: s.moq, certifications: s.certifications, lead_time: s.lead_time,
    languages: s.languages, verified: !!s.verified, visited_at: s.visited_at, is_sample: !!s.is_sample,
    product_count: productCount ?? undefined, reliability: reliability(s),
  };
}

function publicProduct(p) {
  return {
    id: p.id, name: p.name, category: p.category, description: p.description, price_min: p.price_min,
    price_max: p.price_max, price_currency: p.price_currency, price_unit: p.price_unit, moq: p.moq,
    image: p.image, featured: !!p.featured, is_sample: !!p.is_sample,
    styles: p.styles, quality: p.quality, durability_years: p.durability_years, spare_parts: p.spare_parts, mechanism: p.mechanism,
    colors: p.colors, materials: p.materials, sizes: p.sizes, tags: p.tags, warranty: p.warranty, certifications: p.certifications,
    lead_time_days: p.lead_time_days, moq_qty: p.moq_qty, buy_online: !!p.buy_online,
    supplier: p.s_code ? { code: p.s_code, title: p.s_title, city: p.s_city, verified: !!p.s_verified,
      reliability: reliability({ id: p.s_id, rating_quality: p.s_rq, rating_delivery: p.s_rd, rating_comms: p.s_rc, orders_done: p.s_od }) } : null,
  };
}

const PRODUCT_SELECT = `SELECT p.*, s.id AS s_id, s.public_code AS s_code, s.public_title AS s_title, s.city AS s_city, s.verified AS s_verified,
  s.rating_quality AS s_rq, s.rating_delivery AS s_rd, s.rating_comms AS s_rc, s.orders_done AS s_od
  FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id AND s.active = 1`;

// ---------------------------------------------------------------- router
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, opts });
}
const authed = { auth: true };
const admin = { admin: true };

async function readBody(req) {
  const limit = (config.maxUploadMb + 2) * 1024 * 1024;
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) fail(413, 'Pedido demasiado grande.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(res, status, payload, headers = {}) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': typeof payload === 'string' && headers['Content-Type'] ? headers['Content-Type'] : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export async function handleApi(req, res, url) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
  try {
    let body = {};
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const ct = req.headers['content-type'] || '';
      const raw = await readBody(req);
      if (raw) {
        // Exigir JSON nos pedidos que alteram dados (protecção contra CSRF a partir de formulários).
        if (!ct.includes('application/json')) fail(415, 'Use Content-Type: application/json.');
        try { body = JSON.parse(raw); } catch { fail(400, 'JSON inválido.'); }
      }
    }
    const p = url.pathname;
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = p.match(r.re);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const user = userFromRequest(req);
      if ((r.opts.auth || r.opts.admin) && !user) fail(401, 'Precisa de entrar na sua conta.');
      if (r.opts.admin && user.role !== 'admin') fail(403, 'Acesso reservado à equipa Ponte.');
      const query = Object.fromEntries(url.searchParams);
      const ctx = { req, res, url, params, query, body, user, ip };
      const result = await r.handler(ctx);
      if (result === undefined) return; // a rota já respondeu
      return send(res, 200, result);
    }
    fail(404, 'Rota não encontrada.');
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: 'Erro interno. Tente de novo.' });
  }
}

// ================================================================= AUTENTICAÇÃO
route('POST', '/api/auth/register', ({ req, res, body, ip }) => {
  if (tooManyAttempts(ip)) fail(429, 'Demasiadas tentativas. Aguarde alguns minutos.');
  const name = str(body.name, 120), email = str(body.email, 200)?.toLowerCase(), password = String(body.password || '');
  if (!name) fail(400, 'Indique o seu nome.');
  if (!isEmail(email)) fail(400, 'Email inválido.');
  if (password.length < 8) fail(400, 'A palavra-passe deve ter pelo menos 8 caracteres.');
  if (get('SELECT id FROM users WHERE email = ?', email)) { recordFailure(ip); fail(409, 'Já existe uma conta com este email.'); }
  recordFailure(ip); // limita também a criação de muitas contas a partir do mesmo endereço
  const lang = LANGS.includes(body.lang) ? body.lang : 'pt';
  const interests = Array.isArray(body.interests) ? JSON.stringify(body.interests.slice(0, 10).map((x) => String(x).slice(0, 30))) : '[]';
  const country = validCountry(body.country) || 'MZ';
  const r = run(`INSERT INTO users(name, email, phone, password_hash, lang, company, city, interests, travel_when, country, currency)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, name, email, str(body.phone, 40), hashPassword(password), lang,
  str(body.company, 120), str(body.city, 80), interests, str(body.travel_when, 30), country, countryOf(country).currency);
  const { token, expires } = createSession(r.lastInsertRowid);
  res.setHeader('Set-Cookie', sessionCookie(req, token, expires));
  track(r.lastInsertRowid, 'registo');
  return { user: publicUser(get('SELECT * FROM users WHERE id = ?', r.lastInsertRowid)), token };
});

route('POST', '/api/auth/login', ({ req, res, body, ip }) => {
  if (tooManyAttempts(ip)) fail(429, 'Demasiadas tentativas. Aguarde alguns minutos.');
  const u = get('SELECT * FROM users WHERE email = ?', String(body.email || '').trim().toLowerCase());
  if (!u || !verifyPassword(String(body.password || ''), u.password_hash)) { recordFailure(ip); fail(401, 'Email ou palavra-passe incorrectos.'); }
  const { token, expires } = createSession(u.id);
  res.setHeader('Set-Cookie', sessionCookie(req, token, expires));
  track(u.id, 'entrada');
  return { user: publicUser(u), token };
});

route('POST', '/api/auth/logout', ({ req, res }) => {
  destroySession(tokenFromRequest(req));
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
  return { ok: true };
});

route('GET', '/api/me', ({ user }) => {
  if (!user) return { user: null };
  const conv = get('SELECT unread_user FROM conversations WHERE user_id = ?', user.id);
  return { user: publicUser(user), unread: conv ? conv.unread_user : 0 };
});

route('PATCH', '/api/me', ({ user, body }) => {
  const sets = [], vals = [];
  const allow = { name: 120, phone: 40, company: 120, city: 80, travel_when: 30 };
  for (const [k, max] of Object.entries(allow)) if (k in body) { sets.push(`${k} = ?`); vals.push(str(body[k], max)); }
  if ('lang' in body && LANGS.includes(body.lang)) { sets.push('lang = ?'); vals.push(body.lang); }
  if ('currency' in body && CURRENCIES[body.currency]) { sets.push('currency = ?'); vals.push(body.currency); }
  if ('country' in body && validCountry(body.country)) {
    sets.push('country = ?'); vals.push(body.country);
    if (!('currency' in body)) { sets.push('currency = ?'); vals.push(countryOf(body.country).currency); }
  }
  if ('whatsapp' in body) { sets.push('whatsapp = ?'); vals.push(str(body.whatsapp, 30)); }
  if ('notify_whatsapp' in body) { sets.push('notify_whatsapp = ?'); vals.push(bool(body.notify_whatsapp)); }
  if (body.prefs && typeof body.prefs === 'object') { sets.push('prefs = ?'); vals.push(JSON.stringify(body.prefs).slice(0, 4000)); }
  if (Array.isArray(body.interests)) { sets.push('interests = ?'); vals.push(JSON.stringify(body.interests.slice(0, 10).map((x) => String(x).slice(0, 30)))); }
  if ('password' in body) {
    if (String(body.password).length < 8) fail(400, 'A palavra-passe deve ter pelo menos 8 caracteres.');
    if (!verifyPassword(String(body.current_password || ''), user.password_hash)) fail(400, 'A palavra-passe actual não está correcta.');
    sets.push('password_hash = ?'); vals.push(hashPassword(String(body.password)));
  }
  if (sets.length) run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...vals, user.id);
  return { user: publicUser(get('SELECT * FROM users WHERE id = ?', user.id)) };
}, authed);

route('DELETE', '/api/me', ({ req, res, user }) => {
  if (user.role === 'admin') fail(400, 'Uma conta de administração não pode ser apagada por aqui.');
  run('DELETE FROM users WHERE id = ?', user.id);
  res.setHeader('Set-Cookie', sessionCookie(req, '', 0));
  return { ok: true };
}, authed);

// ================================================================= CONTEÚDOS PÚBLICOS
route('GET', '/api/config', () => ({
  mapTiles: config.mapTiles, mapAttribution: config.mapAttribution, paymentsMode: config.paymentsMode,
  supportHours: config.supportHours, orderSteps: ORDER_STEPS, translate: translateProvider(), whatsapp: whatsappEnabled(), stt: !!sttProvider(), vision: !!visionProvider(),
}));

route('GET', '/api/home', ({ user }) => {
  const today = new Date().toISOString().slice(0, 10);
  const nextFair = get(`SELECT * FROM fairs WHERE COALESCE(end_date, start_date) >= ? ORDER BY start_date LIMIT 1`, today);
  const nextHoliday = get(`SELECT * FROM holidays WHERE end_date >= ? ORDER BY start_date LIMIT 1`, today);
  const springFestival = get(`SELECT * FROM holidays WHERE end_date >= ? AND (name_cn LIKE '%春节%' OR name_pt LIKE '%Primavera%') ORDER BY start_date LIMIT 1`, today);
  const featured = all(`${PRODUCT_SELECT} WHERE p.active = 1 AND p.featured = 1 ORDER BY p.id DESC LIMIT 6`).map(publicProduct);
  const sponsored = all('SELECT * FROM promotions WHERE active = 1 AND sponsored = 1 ORDER BY id DESC LIMIT 3');
  let activeOrder = null, openQuotes = 0, tracking = null, service = null;
  if (user) {
    activeOrder = get('SELECT id, code, title, status_step FROM orders WHERE user_id = ? AND status_step < ? ORDER BY updated_at DESC LIMIT 1', user.id, ORDER_STEPS - 1) || null;
    openQuotes = get(`SELECT COUNT(*) n FROM quote_requests WHERE user_id = ? AND status IN ('novo','em_analise','cotado')`, user.id).n;
    const live = userShipments(user).map(shipmentSummary).filter((x) => x.phase < 5);
    service = all('SELECT * FROM equipment WHERE user_id = ? AND maint_interval_days > 0', user.id).map((e) => equipmentView(e)).filter((e) => e.maint_days !== null && e.maint_days <= 7)
      .sort((a, b) => a.maint_days - b.maint_days)[0] || null;
    tracking = live.sort((a, b) => (b.phase === 2) - (a.phase === 2) || String(a.eta || '9').localeCompare(String(b.eta || '9')))[0] || null;
  }
  return { nextFair, nextHoliday, springFestival, featured, sponsored, activeOrder, openQuotes, tracking, maintenanceDue: service };
});

route('GET', '/api/suppliers', ({ query, user }) => {
  const where = ['s.active = 1'], vals = [];
  if (query.category) { where.push('s.category = ?'); vals.push(query.category); }
  if (query.q) {
    where.push('(s.public_title LIKE ? OR s.description LIKE ? OR s.city LIKE ? OR s.category LIKE ?)');
    const q = `%${query.q}%`; vals.push(q, q, q, q);
    track(user?.id, 'pesquisa', { q: query.q, em: 'fornecedores' });
  }
  return all(`SELECT s.*, (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.active = 1) AS pc
    FROM suppliers s WHERE ${where.join(' AND ')} ORDER BY s.verified DESC, s.public_title`, ...vals)
    .map((s) => publicSupplier(s, s.pc));
});

route('GET', '/api/suppliers/:code', ({ params, user }) => {
  const s = get('SELECT * FROM suppliers WHERE public_code = ? AND active = 1', params.code);
  if (!s) fail(404, 'Fornecedor não encontrado.');
  track(user?.id, 'ver_fornecedor', { code: s.public_code });
  const products = all(`${PRODUCT_SELECT} WHERE p.supplier_id = ? AND p.active = 1 ORDER BY p.featured DESC, p.name`, s.id).map(publicProduct);
  return { ...publicSupplier(s, products.length), products };
});

route('GET', '/api/categories', () => ({
  suppliers: all('SELECT category, COUNT(*) n FROM suppliers WHERE active = 1 GROUP BY category ORDER BY n DESC'),
  products: all('SELECT category, COUNT(*) n FROM products WHERE active = 1 GROUP BY category ORDER BY n DESC'),
}));

route('GET', '/api/products', ({ query, user }) => {
  const where = ['p.active = 1'], vals = [];
  if (query.category) { where.push('p.category = ?'); vals.push(query.category); }
  if (query.featured) where.push('p.featured = 1');
  if (query.q) {
    where.push('(p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ?)');
    const q = `%${query.q}%`; vals.push(q, q, q);
    track(user?.id, 'pesquisa', { q: query.q, em: 'produtos' });
  }
  return all(`${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.featured DESC, p.id DESC LIMIT 200`, ...vals).map(publicProduct);
});

route('GET', '/api/products/:id', ({ params, user }) => {
  const p = get(`${PRODUCT_SELECT} WHERE p.id = ? AND p.active = 1`, Number(params.id));
  if (!p) fail(404, 'Produto não encontrado.');
  track(user?.id, 'ver_produto', { id: p.id });
  return publicProduct(p);
});

route('GET', '/api/search', ({ query, user }) => {
  const q = str(query.q, 80);
  if (!q) return { products: [], suppliers: [], fairs: [], places: [], faq: [] };
  track(user?.id, 'pesquisa', { q, em: 'global' });
  const like = `%${q}%`;
  return {
    products: all(`${PRODUCT_SELECT} WHERE p.active = 1 AND (p.name LIKE ? OR p.category LIKE ? OR p.description LIKE ?) LIMIT 8`, like, like, like).map(publicProduct),
    suppliers: all(`SELECT * FROM suppliers WHERE active = 1 AND (public_title LIKE ? OR category LIKE ? OR city LIKE ?) LIMIT 6`, like, like, like).map((s) => publicSupplier(s)),
    fairs: all('SELECT * FROM fairs WHERE name LIKE ? OR sectors LIKE ? OR city LIKE ? LIMIT 5', like, like, like),
    places: all('SELECT * FROM places WHERE name LIKE ? OR category LIKE ? OR district LIKE ? LIMIT 6', like, like, like),
    faq: all('SELECT id, lang, question, answer FROM faq WHERE question LIKE ? OR keywords LIKE ? LIMIT 4', like, like),
  };
});

route('GET', '/api/fairs', () => all('SELECT * FROM fairs ORDER BY start_date'));
route('GET', '/api/holidays', ({ query }) => (query.year
  ? all('SELECT * FROM holidays WHERE year = ? ORDER BY start_date', Number(query.year))
  : all('SELECT * FROM holidays ORDER BY start_date')));
route('GET', '/api/sales', () => all('SELECT * FROM sales_events ORDER BY month, id'));
route('GET', '/api/places', ({ query }) => (query.category
  ? all('SELECT * FROM places WHERE category = ? ORDER BY is_sample, name', query.category)
  : all('SELECT * FROM places ORDER BY is_sample, category, name')));
route('GET', '/api/promotions', ({ query }) => (query.category
  ? all('SELECT * FROM promotions WHERE active = 1 AND category = ? ORDER BY sponsored DESC, id DESC', query.category)
  : all('SELECT * FROM promotions WHERE active = 1 ORDER BY sponsored DESC, id DESC')));
route('GET', '/api/plans', () => all('SELECT * FROM plans ORDER BY sort').map((p) => ({ ...p, features: JSON.parse(p.features || '[]') })));
route('GET', '/api/rates', () => readRates());
route('GET', '/api/faq', ({ query }) => {
  const lang = LANGS.includes(query.lang) ? query.lang : 'pt';
  let rows = all('SELECT id, lang, question, answer, quick FROM faq WHERE lang = ? ORDER BY sort, id', lang);
  if (!rows.length) rows = all("SELECT id, lang, question, answer, quick FROM faq WHERE lang = 'en' ORDER BY sort, id");
  return rows;
});
route('GET', '/api/partners', ({ query, user }) => {
  const types = ['despachante', 'transitario', 'interprete', 'hotel', 'tecnico'];
  const where = ["status = 'aprovado'", 'listed = 1'], vals = [];
  if (types.includes(query.type)) { where.push('type = ?'); vals.push(query.type); }
  // Parceiros do país do cliente primeiro (o país pode estar guardado como código ou nome).
  const c = countryOf(user?.country || query.country || 'MZ');
  if (query.only_country) { where.push('(country = ? OR country = ?)'); vals.push(c.code, c.name); }
  // Só dados de apresentação: os contactos ficam com a equipa Ponte.
  return all(`SELECT id, type, company, city, country, languages, services FROM partners WHERE ${where.join(' AND ')}
    ORDER BY CASE WHEN country = ? OR country = ? THEN 0 ELSE 1 END, company`, ...vals, c.code, c.name);
});

route('POST', '/api/events', ({ body, user }) => {
  track(user?.id, `ecra:${str(body.screen, 40) || '?'}`);
  return { ok: true };
});

// ================================================================= CATÁLOGO (mega filtro)
function userPrefs(user, query) {
  if (query.prefs) { try { return JSON.parse(query.prefs); } catch { /* ignorar */ } }
  if (user) { try { const p = JSON.parse(user.prefs || '{}'); return Object.keys(p).length ? p : null; } catch { /* ignorar */ } }
  return null;
}

route('GET', '/api/catalog', ({ query, user }) => {
  const f = parseFilters(query);
  if (f.q) track(user?.id, 'pesquisa', { q: f.q, em: 'catalogo' });
  const r = searchCatalog(f, userPrefs(user, query), `${PRODUCT_SELECT} WHERE p.active = 1`);
  return { total: r.total, facets: r.facets, items: r.items.map((it) => ({ ...publicProduct(it.p), match: it.match })) };
});

route('GET', '/api/catalog/parse', ({ query }) => parseNatural(String(query.text || '').slice(0, 200)));

// ================================================================= CESTO E COMPRA ONLINE
route('POST', '/api/checkout', ({ user, body }) => {
  const items = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  if (!items.length) fail(400, 'O cesto está vazio.');
  const mode = body.delivery_mode === 'china' ? 'china' : 'mocambique';
  const plan = body.payment_plan === 'total' ? 'total' : 'fases';
  const address = str(body.address, 500);
  if (!address) fail(400, mode === 'china' ? 'Indique o hotel ou a morada na China.' : 'Indique a cidade e a morada de entrega.');
  const lines = items.map((it) => {
    const p = get('SELECT * FROM products WHERE id = ? AND active = 1', Number(it.product_id));
    if (!p) fail(400, 'Um dos produtos já não está disponível.');
    const qty = Math.max(1, Math.floor(Number(it.qty) || 1));
    if (p.moq_qty && qty < p.moq_qty) fail(400, `"${p.name}": a quantidade mínima é ${p.moq_qty}.`);
    return { p, qty, color: str(it.color, 40), size: str(it.size, 40), notes: str(it.notes, 300) };
  });
  const allPriced = lines.every((l) => l.p.price_min !== null);
  const total = lines.reduce((s, l) => s + (l.p.price_min || 0) * l.qty, 0);
  const id = tx(() => {
    const r = run(`INSERT INTO orders(code, user_id, title, route, kind, delivery_mode, delivery_address, total_usd, payment_status, client_note, payment_plan)
      VALUES(?, ?, ?, ?, 'compra', ?, ?, ?, ?, ?, ?)`, nextOrderCode(), user.id,
    lines.length === 1 ? `${lines[0].qty} × ${lines[0].p.name}` : `Compra online · ${lines.length} artigos`,
    mode === 'china' ? 'Fornecedor → levantamento na China' : `China → ${countryOf(user.country).name}`, mode, address, allPriced ? total : null,
    allPriced ? 'pendente' : 'por_confirmar', str(body.notes, 1000), plan);
    for (const l of lines) {
      run('INSERT INTO order_items(order_id, product_id, name, qty, unit_price, currency, color, size, notes) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
        r.lastInsertRowid, l.p.id, l.p.name, l.qty, l.p.price_min, l.p.price_currency, l.color, l.size, l.notes);
    }
    run('INSERT INTO order_events(order_id, step, note) VALUES(?, 0, ?)', r.lastInsertRowid,
      allPriced ? 'Encomenda recebida. A equipa confirma stock, prazo e frete.' : 'Encomenda recebida. A equipa confirma preços, stock e frete antes do pagamento.');
    return r.lastInsertRowid;
  });
  let payment = null;
  if (allPriced && body.pay_now && body.method) {
    payment = payOrder(user, get('SELECT * FROM orders WHERE id = ?', id), plan === 'total' ? 'total' : 'sinal', body.method, body.phone);
  }
  track(user.id, 'compra_online', { order: id, items: lines.length });
  return { id, allPriced, total: allPriced ? total : null, payment };
}, authed);

// ================================================================= TRADUTOR
const trLimit = new Map();
route('POST', '/api/translate', async ({ body, user, ip }) => {
  const text = str(body.text, 1500);
  if (!text) fail(400, 'Escreva o texto a traduzir.');
  const target = LANGS.includes(body.target) ? body.target : 'zh';
  const source = LANGS.includes(body.source) ? body.source : 'auto';
  const k = user?.id || ip;
  const rec = trLimit.get(k) || { n: 0, t: Date.now() };
  if (Date.now() - rec.t > 3600e3) { rec.n = 0; rec.t = Date.now(); }
  if (++rec.n > (user ? 300 : 40)) fail(429, 'Limite de traduções por hora atingido.');
  trLimit.set(k, rec);
  if (!translateProvider()) fail(501, 'Tradução automática ainda não configurada no servidor.');
  try {
    const r = await translate(text, source, target);
    track(user?.id, 'traducao', { target });
    return r;
  } catch (e) {
    console.error(e);
    fail(502, 'O serviço de tradução não respondeu. Tente de novo.');
  }
});

// Voz → texto no servidor. Corpo: { audio: base64, mime, lang }. Máx. ~60 s de áudio comprimido.
const sttLimit = new Map();
route('POST', '/api/stt', async ({ body, user, ip }) => {
  if (!sttProvider()) fail(501, 'Reconhecimento de voz no servidor ainda não configurado.');
  const b64 = String(body.audio || '').replace(/^data:[^,]*,/, '');
  if (!b64) fail(400, 'Sem áudio.');
  const buf = Buffer.from(b64, 'base64');
  if (buf.length < 200) fail(400, 'Gravação demasiado curta.');
  if (buf.length > 2.5 * 1024 * 1024) fail(413, 'Gravação demasiado longa.');
  const mime = String(body.mime || 'audio/webm');
  if (!/^audio\/[\w.+-]+/.test(mime)) fail(400, 'Formato de áudio inválido.');
  const k = user?.id || ip;
  const rec = sttLimit.get(k) || { n: 0, t: Date.now() };
  if (Date.now() - rec.t > 3600e3) { rec.n = 0; rec.t = Date.now(); }
  if (++rec.n > (user ? 200 : 30)) fail(429, 'Limite de gravações por hora atingido.');
  sttLimit.set(k, rec);
  try {
    const r = await transcribe(buf, mime, LANGS.includes(body.lang) ? body.lang : undefined);
    track(user?.id, 'voz', { lang: body.lang });
    return r;
  } catch (e) {
    console.error(e);
    fail(502, 'O serviço de voz não respondeu. Tente de novo ou escreva.');
  }
});

// Reconhecimento visual de uma fotografia + artigos parecidos no catálogo da Ponte.
const VISION_STYLES = ['minimalista', 'clássico', 'vintage', 'gótico', 'avant-garde', 'moderno', 'industrial', 'rústico', 'escandinavo', 'luxo', 'desportivo', 'boho', 'oriental', 'africano'];
const visLimit = new Map();

function similarProducts(terms, limit = 6) {
  const score = new Map();
  terms.filter(Boolean).slice(0, 6).forEach((term, i) => {
    const r = searchCatalog(parseFilters({ q: String(term).slice(0, 80) }), null, `${PRODUCT_SELECT} WHERE p.active = 1`);
    r.items.slice(0, 8).forEach((it, k) => {
      const prev = score.get(it.p.id) || { p: it.p, s: 0 };
      prev.s += (6 - i) + (8 - k) / 8;
      score.set(it.p.id, prev);
    });
  });
  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, limit).map((x) => publicProduct(x.p));
}

route('POST', '/api/vision', async ({ body, user, ip }) => {
  if (!visionProvider()) fail(501, 'Reconhecimento de imagem ainda não configurado no servidor.');
  const image = String(body.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) fail(400, 'Envie uma fotografia (JPEG, PNG ou WebP).');
  if (image.length > 4 * 1024 * 1024) fail(413, 'Fotografia demasiado grande.');
  const k = user?.id || ip;
  const rec = visLimit.get(k) || { n: 0, t: Date.now() };
  if (Date.now() - rec.t > 3600e3) { rec.n = 0; rec.t = Date.now(); }
  if (++rec.n > (user ? 60 : 8)) fail(429, user ? 'Limite de identificações por hora atingido.' : 'Crie conta para identificar mais fotografias.');
  visLimit.set(k, rec);
  const lang = LANGS.includes(body.lang) ? body.lang : 'pt';
  let result;
  try {
    result = await visionIdentify(image, lang, VISION_STYLES, str(body.note, 300), countryOf(user?.country || body.country || 'MZ').name);
  } catch (e) {
    console.error(e);
    fail(502, 'O serviço de reconhecimento não respondeu. Tente de novo.');
  }
  if (!result) fail(502, 'Não foi possível interpretar a fotografia. Tente outra, com o objecto inteiro e boa luz.');
  track(user?.id, 'visao', { name: result.name, kind: result.kind });
  return { result, similar: similarProducts([result.name, ...result.search_terms, result.category]) };
});

// ================================================================= RASTREIO
const fmtPt = (iso) => (iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

function shipmentUsers(s) {
  const ids = new Set();
  if (s.order_id) { const o = get('SELECT user_id FROM orders WHERE id = ?', s.order_id); if (o) ids.add(o.user_id); }
  if (s.group_id) for (const b of all("SELECT DISTINCT user_id FROM group_bookings WHERE shipment_id = ? AND status != 'cancelado'", s.group_id)) ids.add(b.user_id);
  return [...ids];
}
function canSeeShipment(s, user) {
  return user && (user.role === 'admin' || shipmentUsers(s).includes(user.id));
}

function shipmentView(s, mode = 'client') {
  const events = all('SELECT * FROM shipment_events WHERE shipment_id = ?', s.id);
  const c = computeShipment(s, events);
  const order = s.order_id ? get('SELECT id, code, title FROM orders WHERE id = ?', s.order_id) : null;
  const group = s.group_id ? get('SELECT id, title, container FROM group_shipments WHERE id = ?', s.group_id) : null;
  const v = {
    id: s.id, ref: s.ref, title: s.title || order?.title || group?.title?.replace('[Exemplo] ', '') || s.ref, mode: s.mode,
    carrier: s.carrier, carrier_name: c.carrier_name, carrier_url: c.carrier_url,
    container_no: s.container_no, tracking_no: s.tracking_no, vessel: s.vessel, voyage: s.voyage,
    origin: c.stops[0], destination: c.stops[c.stops.length - 1], stops: c.stops, path: c.path,
    etd: s.etd, atd: s.atd, eta: s.eta, eta_original: s.eta_original, ata: s.ata,
    phase: c.phase, phase_label: c.phase_label, progress: c.progress, position: c.position,
    delayed: c.delayed, delay_days: c.delay_days, days_left: c.days_left, overdue: c.overdue,
    distance_km: c.distance_km, remaining_km: c.remaining_km, events: c.events, updated_at: s.updated_at, is_sample: !!s.is_sample,
  };
  if (mode === 'public') { v.events = v.events.map(({ source, ...e }) => e); return v; }
  Object.assign(v, { bl_no: s.bl_no, booking_no: s.booking_no, share_token: s.share_token,
    order: order ? { id: order.id, code: order.code } : null, group: group ? { id: group.id, title: group.title, container: group.container } : null });
  if (mode === 'admin') Object.assign(v, { order_id: s.order_id, group_id: s.group_id, origin_port: s.origin_port, transship_port: s.transship_port, dest_port: s.dest_port, notes: s.notes, raw_title: s.title, users: shipmentUsers(s).length });
  return v;
}
const shipmentSummary = (s) => { const v = shipmentView(s); return { id: v.id, ref: v.ref, title: v.title, mode: v.mode, phase: v.phase, phase_label: v.phase_label, eta: v.eta, days_left: v.days_left, delayed: v.delayed, delay_days: v.delay_days, progress: v.progress, origin: v.origin.name, destination: v.destination.name, last: v.events[0] || null }; };

function userShipments(user) {
  return all(`SELECT DISTINCT s.* FROM shipments s
    LEFT JOIN orders o ON o.id = s.order_id
    LEFT JOIN group_bookings b ON b.shipment_id = s.group_id AND b.status != 'cancelado'
    WHERE o.user_id = ? OR b.user_id = ? ORDER BY s.updated_at DESC`, user.id, user.id);
}

// Mensagem automática no chat do cliente (aparece com o alerta de "nova mensagem").
function postTrackingMessage(userId, text, senderName = 'Rastreio Ponte') {
  const c = conversationFor(userId);
  run("INSERT INTO messages(conversation_id, sender, sender_name, body) VALUES(?, 'bot', ?, ?)", c.id, senderName, text);
  run("UPDATE conversations SET unread_user = unread_user + 1, last_message_at = datetime('now') WHERE id = ?", c.id);
}
function notifyShipment(s, text) {
  for (const uid of shipmentUsers(s)) {
    postTrackingMessage(uid, `📦 ${s.ref} · ${text}`);
    notifyUser(get('SELECT * FROM users WHERE id = ?', uid), `${s.ref}: ${text}`);
  }
}

// Acrescenta uma etapa e trata do resto: datas reais, etapa do pedido, avisos.
function addShipmentEvent(s, e, { notify = true, source = 'equipa' } = {}) {
  const code = MILESTONES.some((m) => m[0] === e.code) ? e.code : guessCode(e.code || e.status || e.label);
  const port = PORTS[e.port] || null;
  const when = str(e.happened_at, 30) || new Date().toISOString().slice(0, 19).replace('T', ' ');
  const location = str(e.location, 160) || port?.name || null;
  run('INSERT INTO shipment_events(shipment_id, code, label, location, lat, lng, happened_at, note, source) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)',
    s.id, code, str(e.label, 160), location, num(e.lat) ?? port?.lat ?? null, num(e.lng) ?? port?.lng ?? null, when, str(e.note, 600), source);
  if (code === 'partida' && !s.atd) run('UPDATE shipments SET atd = ? WHERE id = ?', when.slice(0, 10), s.id);
  if (code === 'chegada' && !s.ata) run('UPDATE shipments SET ata = ? WHERE id = ?', when.slice(0, 10), s.id);
  run("UPDATE shipments SET updated_at = datetime('now') WHERE id = ?", s.id);
  const fresh = get('SELECT * FROM shipments WHERE id = ?', s.id);
  const view = shipmentView(fresh);
  // A etapa do pedido acompanha o transporte (embarque / chegada).
  if (fresh.order_id) {
    const target = orderStepFor(view.phase);
    const o = get('SELECT * FROM orders WHERE id = ?', fresh.order_id);
    if (o && target !== null && target > o.status_step) {
      run("UPDATE orders SET status_step = ?, updated_at = datetime('now') WHERE id = ?", target, o.id);
      run('INSERT INTO order_events(order_id, step, note) VALUES(?, ?, ?)', o.id, target, `Rastreio: ${str(e.label, 160) || milestone(code)[1]}${location ? ' — ' + location : ''}`);
    }
  }
  if (notify) {
    const label = str(e.label, 160) || milestone(code)[1];
    notifyShipment(fresh, `${label}${location ? ' — ' + location : ''}.${e.note ? ' ' + str(e.note, 300) : ''}${view.phase < 3 && fresh.eta ? ` Chegada prevista: ${fmtPt(fresh.eta)}.` : ''}`);
  }
  return view;
}

function nextShipmentRef() {
  let ref;
  do ref = 'TR-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6); while (get('SELECT id FROM shipments WHERE ref = ?', ref));
  return ref;
}

const SHIP_FIELDS = ['title', 'mode', 'carrier', 'carrier_name', 'container_no', 'bl_no', 'booking_no', 'tracking_no', 'vessel', 'voyage',
  'origin_port', 'transship_port', 'dest_port', 'etd', 'atd', 'eta', 'ata', 'notes'];
function shipValues(body, old = {}) {
  const v = {};
  for (const k of SHIP_FIELDS) v[k] = k in body ? str(body[k], k === 'notes' ? 1000 : 120) : (old[k] ?? null);
  if (!['mar', 'aereo', 'courier', 'estrada'].includes(v.mode)) v.mode = 'mar';
  for (const k of ['etd', 'atd', 'eta', 'ata']) if (v[k] && !/^\d{4}-\d{2}-\d{2}$/.test(v[k])) fail(400, `Data inválida em ${k} (use AAAA-MM-DD).`);
  for (const k of ['container_no', 'bl_no', 'tracking_no', 'booking_no']) if (v[k]) v[k] = v[k].toUpperCase().replace(/\s+/g, '');
  v.order_id = 'order_id' in body ? num(body.order_id) : (old.order_id ?? null);
  v.group_id = 'group_id' in body ? num(body.group_id) : (old.group_id ?? null);
  if (v.order_id && !get('SELECT id FROM orders WHERE id = ?', v.order_id)) fail(400, 'Pedido não encontrado.');
  if (v.group_id && !get('SELECT id FROM group_shipments WHERE id = ?', v.group_id)) fail(400, 'Contentor partilhado não encontrado.');
  return v;
}

// --- cliente
route('GET', '/api/tracking', ({ user }) => userShipments(user).map(shipmentSummary), authed);
route('GET', '/api/tracking/:id', ({ params, user }) => {
  const s = get('SELECT * FROM shipments WHERE id = ?', Number(params.id));
  if (!s || !canSeeShipment(s, user)) fail(404, 'Envio não encontrado.');
  return shipmentView(s);
}, authed);
// Link de partilha: qualquer pessoa com o link vê o percurso (sem preços nem documentos).
const trackLimit = new Map();
route('GET', '/api/track/:token', ({ params, ip }) => {
  const rec = trackLimit.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - rec.t > 3600e3) { rec.n = 0; rec.t = Date.now(); }
  if (++rec.n > 300) fail(429, 'Demasiados pedidos. Tente mais tarde.');
  trackLimit.set(ip, rec);
  const s = get('SELECT * FROM shipments WHERE share_token = ?', String(params.token).slice(0, 64));
  if (!s) fail(404, 'Link de rastreio inválido ou expirado.');
  return shipmentView(s, 'public');
});

// --- integração automática (agregador de rastreio ou transitário)
route('POST', '/api/tracking/webhook', ({ req, query, body }) => {
  const token = process.env.TRACKING_WEBHOOK_TOKEN;
  if (!token) fail(501, 'Webhook de rastreio não configurado (TRACKING_WEBHOOK_TOKEN).');
  const given = String(req.headers['x-ponte-token'] || query.token || '');
  if (given.length !== token.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token))) fail(401, 'Token inválido.');
  const list = Array.isArray(body.events) ? body.events : [body];
  const ref = String(body.ref || body.container_no || body.bl_no || body.tracking_no || body.reference || '').toUpperCase().replace(/\s+/g, '');
  if (!ref) fail(400, 'Indique ref, container_no, bl_no ou tracking_no.');
  const s = get('SELECT * FROM shipments WHERE ref = ? OR container_no = ? OR bl_no = ? OR tracking_no = ?', ref, ref, ref, ref);
  if (!s) fail(404, 'Envio não encontrado.');
  if (body.eta && /^\d{4}-\d{2}-\d{2}/.test(body.eta)) updateEta(s, String(body.eta).slice(0, 10));
  if (body.vessel) run('UPDATE shipments SET vessel = ? WHERE id = ?', str(body.vessel, 120), s.id);
  let added = 0;
  for (const e of list.slice(0, 50)) {
    if (!e || (!e.code && !e.status && !e.label)) continue;
    const when = str(e.happened_at || e.date, 30);
    if (when && get('SELECT id FROM shipment_events WHERE shipment_id = ? AND happened_at = ? AND COALESCE(label, code) = COALESCE(?, ?)', s.id, when, str(e.label || e.status, 160), e.code || guessCode(e.status))) continue;
    addShipmentEvent(get('SELECT * FROM shipments WHERE id = ?', s.id), { ...e, happened_at: when, label: e.label || e.status }, { source: 'transportadora', notify: e.notify !== false });
    added++;
  }
  return { ok: true, added };
});

// Nova data prevista: guarda a original e avisa os clientes se mudar.
function updateEta(s, eta) {
  if (!eta || eta === s.eta) return false;
  run("UPDATE shipments SET eta = ?, eta_original = COALESCE(eta_original, ?), updated_at = datetime('now') WHERE id = ?", eta, s.eta || eta, s.id);
  if (s.eta) {
    const diff = Math.round((new Date(eta) - new Date(s.eta)) / 864e5);
    if (Math.abs(diff) >= 1) notifyShipment(s, diff > 0 ? `nova data prevista de chegada: ${fmtPt(eta)} (atraso de ${diff} dia${diff > 1 ? 's' : ''}).` : `boa notícia: chega mais cedo, a ${fmtPt(eta)}.`);
  }
  return true;
}

// --- equipa
route('GET', '/api/admin/tracking-meta', () => ({
  carriers: CARRIERS, ports: Object.entries(PORTS).map(([code, p]) => ({ code, ...p })), milestones: MILESTONES.map(([code, label, ic, phase]) => ({ code, label, icon: ic, phase })),
  orders: all('SELECT o.id, o.code, o.title, u.name user_name FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC LIMIT 300'),
  groups: all('SELECT id, title, container, status FROM group_shipments ORDER BY id DESC LIMIT 100'),
  webhook: !!process.env.TRACKING_WEBHOOK_TOKEN,
}), admin);
route('GET', '/api/admin/shipments', () => all('SELECT * FROM shipments ORDER BY updated_at DESC').map((s) => shipmentView(s, 'admin')), admin);
route('POST', '/api/admin/shipments', ({ body }) => {
  const v = shipValues(body);
  if (!v.order_id && !v.group_id && !v.title) fail(400, 'Ligue o envio a um pedido ou contentor, ou dê-lhe um título.');
  const r = run(`INSERT INTO shipments(ref, share_token, order_id, group_id, ${SHIP_FIELDS.join(', ')}, eta_original) VALUES(?, ?, ?, ?, ${SHIP_FIELDS.map(() => '?').join(', ')}, ?)`,
    nextShipmentRef(), crypto.randomBytes(12).toString('base64url'), v.order_id, v.group_id, ...SHIP_FIELDS.map((k) => v[k]), v.eta);
  const s = get('SELECT * FROM shipments WHERE id = ?', r.lastInsertRowid);
  if (body.notify !== false) notifyShipment(s, `já pode acompanhar o envio na app (Perfil → Rastrear encomendas).${s.eta ? ` Chegada prevista: ${fmtPt(s.eta)}.` : ''}`);
  return { id: s.id, ref: s.ref };
}, admin);
route('PUT', '/api/admin/shipments/:id', ({ params, body }) => {
  const s = get('SELECT * FROM shipments WHERE id = ?', Number(params.id));
  if (!s) fail(404, 'Envio não encontrado.');
  const v = shipValues(body, s);
  const newEta = v.eta; v.eta = s.eta;
  run(`UPDATE shipments SET order_id = ?, group_id = ?, ${SHIP_FIELDS.map((k) => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
    v.order_id, v.group_id, ...SHIP_FIELDS.map((k) => v[k]), s.id);
  if (newEta !== s.eta) {
    if (s.eta) updateEta(get('SELECT * FROM shipments WHERE id = ?', s.id), newEta);
    else run('UPDATE shipments SET eta = ?, eta_original = COALESCE(eta_original, ?) WHERE id = ?', newEta, newEta, s.id);
  }
  if (body.new_link) run('UPDATE shipments SET share_token = ? WHERE id = ?', crypto.randomBytes(12).toString('base64url'), s.id);
  return { ok: true };
}, admin);
route('DELETE', '/api/admin/shipments/:id', ({ params }) => { run('DELETE FROM shipments WHERE id = ?', Number(params.id)); return { ok: true }; }, admin);
route('POST', '/api/admin/shipments/:id/events', ({ params, body }) => {
  const s = get('SELECT * FROM shipments WHERE id = ?', Number(params.id));
  if (!s) fail(404, 'Envio não encontrado.');
  if (!body.code) fail(400, 'Escolha a etapa.');
  if (body.happened_at && !/^\d{4}-\d{2}-\d{2}/.test(body.happened_at)) fail(400, 'Data inválida.');
  return addShipmentEvent(s, body, { notify: body.notify !== false });
}, admin);
route('DELETE', '/api/admin/shipments/:id/events/:eid', ({ params }) => {
  run('DELETE FROM shipment_events WHERE id = ? AND shipment_id = ?', Number(params.eid), Number(params.id));
  return { ok: true };
}, admin);

// ================================================================= PÓS-VENDA: EQUIPAMENTOS, AVARIAS, PEÇAS, MANUTENÇÃO
const SVC_KINDS = ['avaria', 'pecas', 'manutencao', 'instalacao', 'duvida'];
const SVC_URGENCY = ['parada', 'limitada', 'normal'];
const SVC_STATUS = ['novo', 'diagnostico', 'proposta', 'aceite', 'em_resolucao', 'resolvido', 'fechado'];
const SVC_LABEL = { novo: 'pedido recebido', diagnostico: 'em diagnóstico com a fábrica', proposta: 'proposta de solução pronta', aceite: 'solução aceite',
  em_resolucao: 'em resolução', resolvido: 'resolvido', fechado: 'fechado' };
const SVC_SOLUTIONS = ['remota', 'peca', 'tecnico', 'garantia', 'devolucao', 'outro'];
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(new Date(iso + 'T12:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);

function equipmentView(e, full) {
  const warrantyUntil = e.purchased_at && e.warranty_months ? new Date(new Date(e.purchased_at + 'T12:00:00Z').setUTCMonth(new Date(e.purchased_at + 'T12:00:00Z').getUTCMonth() + e.warranty_months)).toISOString().slice(0, 10) : null;
  const base = e.last_maint_at || e.purchased_at;
  const nextMaint = e.maint_interval_days && base ? addDays(base.slice(0, 10), e.maint_interval_days) : null;
  const daysTo = (iso) => (iso ? Math.round((new Date(iso + 'T12:00:00Z') - new Date(today() + 'T12:00:00Z')) / 864e5) : null);
  const open = get("SELECT COUNT(*) n FROM service_tickets WHERE equipment_id = ? AND status NOT IN ('resolvido', 'fechado')", e.id).n;
  const v = {
    id: e.id, name: e.name, brand: e.brand, model: e.model, serial_no: e.serial_no, category: e.category, purchased_at: e.purchased_at,
    warranty_months: e.warranty_months, warranty_until: warrantyUntil, warranty_days: daysTo(warrantyUntil), in_warranty: warrantyUntil ? warrantyUntil >= today() : null,
    voltage: e.voltage, power: e.power, specs: e.specs, wear_parts: e.wear_parts, location: e.location, notes: e.notes, status: e.status,
    maint_interval_days: e.maint_interval_days, last_maint_at: e.last_maint_at, next_maint: nextMaint, maint_days: daysTo(nextMaint),
    open_tickets: open, order_id: e.order_id, product_id: e.product_id, created_by: e.created_by, created_at: e.created_at,
  };
  if (full) {
    v.documents = all("SELECT id, name, mime, created_at FROM documents WHERE owner_type = 'equipment' AND owner_id = ? AND visible_to_client = 1 ORDER BY id", e.id);
    v.log = all('SELECT id, kind, note, author, created_at FROM equipment_log WHERE equipment_id = ? ORDER BY id DESC LIMIT 50', e.id);
    v.tickets = all('SELECT id, code, kind, title, status, created_at, updated_at FROM service_tickets WHERE equipment_id = ? ORDER BY id DESC', e.id);
    v.order = e.order_id ? get('SELECT id, code FROM orders WHERE id = ?', e.order_id) : null;
  }
  return v;
}
const EQ_FIELDS = { name: 120, brand: 80, model: 80, serial_no: 80, category: 60, location: 120, voltage: 40, power: 40, specs: 2000, wear_parts: 1000, notes: 1000 };
function eqValues(body, old = {}) {
  const v = {};
  for (const [k, max] of Object.entries(EQ_FIELDS)) v[k] = k in body ? str(body[k], max) : (old[k] ?? null);
  v.purchased_at = 'purchased_at' in body ? (/^\d{4}-\d{2}-\d{2}$/.test(body.purchased_at || '') ? body.purchased_at : null) : (old.purchased_at ?? null);
  v.warranty_months = 'warranty_months' in body ? num(body.warranty_months) : (old.warranty_months ?? null);
  v.maint_interval_days = 'maint_interval_days' in body ? num(body.maint_interval_days) : (old.maint_interval_days ?? null);
  if (!v.name) fail(400, 'Indique o nome do equipamento.');
  return v;
}
const svcCode = () => { let c; do c = 'AS-' + crypto.randomBytes(3).toString('hex').toUpperCase(); while (get('SELECT id FROM service_tickets WHERE code = ?', c)); return c; };
function ticketView(tk, forAdmin) {
  const v = { ...tk };
  if (!forAdmin) delete v.internal_note;
  v.events = all('SELECT id, status, note, author, created_at FROM service_events WHERE ticket_id = ? ORDER BY id', tk.id);
  v.photos = all("SELECT id, name, mime FROM documents WHERE owner_type = 'ticket' AND owner_id = ? ORDER BY id", tk.id);
  v.equipment = tk.equipment_id ? equipmentView(get('SELECT * FROM equipment WHERE id = ?', tk.equipment_id) || { id: 0, name: '?' }) : null;
  v.partner = tk.partner_id ? get('SELECT id, company, city, country FROM partners WHERE id = ?', tk.partner_id) : null;
  v.order = tk.order_id ? get('SELECT id, code FROM orders WHERE id = ?', tk.order_id) : null;
  if (forAdmin) {
    const u = get('SELECT name, email, COALESCE(whatsapp, phone) phone, country FROM users WHERE id = ?', tk.user_id);
    Object.assign(v, { user_name: u?.name, user_email: u?.email, user_phone: u?.phone, user_country: u?.country });
    // A equipa vê o fornecedor real para falar com a fábrica.
    const eq = tk.equipment_id ? get('SELECT supplier_id, product_id FROM equipment WHERE id = ?', tk.equipment_id) : null;
    const sid = eq?.supplier_id || (eq?.product_id ? get('SELECT supplier_id FROM products WHERE id = ?', eq.product_id)?.supplier_id : null);
    v.supplier = sid ? get('SELECT id, public_code, company_name, contact_person, phone, wechat, email FROM suppliers WHERE id = ?', sid) : null;
  }
  return v;
}
function svcNotify(tk, text) {
  postTrackingMessage(tk.user_id, `🛠 ${tk.code} · ${text}`, 'Assistência Ponte');
  notifyUser(get('SELECT * FROM users WHERE id = ?', tk.user_id), `${tk.code}: ${text}`);
}

// --- cliente: equipamentos
route('GET', '/api/equipment', ({ user }) => all('SELECT * FROM equipment WHERE user_id = ? ORDER BY id DESC', user.id).map((e) => equipmentView(e)), authed);
route('POST', '/api/equipment', ({ user, body }) => {
  const v = eqValues(body);
  const orderId = num(body.order_id);
  const order = orderId ? get('SELECT id FROM orders WHERE id = ? AND user_id = ?', orderId, user.id) : null;
  const r = run(`INSERT INTO equipment(user_id, order_id, ${Object.keys(v).join(', ')}) VALUES(?, ?, ${Object.keys(v).map(() => '?').join(', ')})`, user.id, order?.id || null, ...Object.values(v));
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 3) : [];
  for (const f of photos) {
    const saved = saveUpload(f, 'private');
    run(`INSERT INTO documents(owner_type, owner_id, name, mime, file, size, visible_to_client, uploaded_by) VALUES('equipment', ?, ?, ?, ?, ?, 1, ?)`, r.lastInsertRowid, saved.name, saved.mime, saved.file, saved.size, user.id);
  }
  run("INSERT INTO equipment_log(equipment_id, kind, note, author) VALUES(?, 'nota', 'Equipamento registado.', 'cliente')", r.lastInsertRowid);
  track(user.id, 'equipamento_registo', {});
  return { id: r.lastInsertRowid };
}, authed);
route('GET', '/api/equipment/:id', ({ params, user }) => {
  const e = get('SELECT * FROM equipment WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!e) fail(404, 'Equipamento não encontrado.');
  return equipmentView(e, true);
}, authed);
route('PATCH', '/api/equipment/:id', ({ params, user, body }) => {
  const e = get('SELECT * FROM equipment WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!e) fail(404, 'Equipamento não encontrado.');
  const v = eqValues(body, e);
  run(`UPDATE equipment SET ${Object.keys(v).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...Object.values(v), e.id);
  return { ok: true };
}, authed);
route('DELETE', '/api/equipment/:id', ({ params, user }) => { run('DELETE FROM equipment WHERE id = ? AND user_id = ?', Number(params.id), user.id); return { ok: true }; }, authed);
route('POST', '/api/equipment/:id/maintenance', ({ params, user, body }) => {
  const e = get('SELECT * FROM equipment WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!e) fail(404, 'Equipamento não encontrado.');
  const when = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : today();
  run('UPDATE equipment SET last_maint_at = ?, maint_notified_at = NULL WHERE id = ?', when, e.id);
  run("INSERT INTO equipment_log(equipment_id, kind, note, author) VALUES(?, 'manutencao', ?, 'cliente')", e.id, str(body.note, 500) || 'Manutenção feita.');
  return equipmentView(get('SELECT * FROM equipment WHERE id = ?', e.id), true);
}, authed);

// --- cliente: pedidos de assistência
route('GET', '/api/service', ({ user }) => all(`SELECT t.id, t.code, t.kind, t.urgency, t.title, t.status, t.solution_type, t.quote_usd, t.created_at, t.updated_at, e.name equipment_name
  FROM service_tickets t LEFT JOIN equipment e ON e.id = t.equipment_id WHERE t.user_id = ? ORDER BY t.updated_at DESC`, user.id), authed);
route('POST', '/api/service', ({ user, body }) => {
  const kind = SVC_KINDS.includes(body.kind) ? body.kind : 'avaria';
  const urgency = SVC_URGENCY.includes(body.urgency) ? body.urgency : 'normal';
  const eq = num(body.equipment_id) ? get('SELECT * FROM equipment WHERE id = ? AND user_id = ?', num(body.equipment_id), user.id) : null;
  const title = str(body.title, 160) || (eq ? `${{ avaria: 'Avaria', pecas: 'Peças', manutencao: 'Manutenção', instalacao: 'Instalação', duvida: 'Dúvida' }[kind]}: ${eq.name}` : null);
  if (!title) fail(400, 'Diga-nos o que se passa.');
  if (kind === 'pecas' && !str(body.parts, 2000) && !(Array.isArray(body.photos) && body.photos.length)) fail(400, 'Indique as peças ou envie uma fotografia.');
  const inWarranty = eq ? equipmentView(eq).in_warranty : null;
  const id = tx(() => {
    const r = run(`INSERT INTO service_tickets(code, user_id, equipment_id, kind, urgency, title, description, error_code, parts, under_warranty)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, svcCode(), user.id, eq?.id || null, kind, urgency, title, str(body.description, 4000), str(body.error_code, 120), str(body.parts, 2000), inWarranty === null ? null : inWarranty ? 1 : 0);
    run("INSERT INTO service_events(ticket_id, status, note, author) VALUES(?, 'novo', ?, 'cliente')", r.lastInsertRowid, 'Pedido enviado.');
    if (eq && kind === 'avaria') {
      run("INSERT INTO equipment_log(equipment_id, kind, note, author) VALUES(?, 'avaria', ?, 'cliente')", eq.id, title);
      if (urgency === 'parada') run("UPDATE equipment SET status = 'avariado' WHERE id = ?", eq.id);
    }
    return r.lastInsertRowid;
  });
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 4) : [];
  for (const f of photos) {
    const saved = saveUpload(f, 'private');
    run(`INSERT INTO documents(owner_type, owner_id, name, mime, file, size, visible_to_client, uploaded_by) VALUES('ticket', ?, ?, ?, ?, ?, 1, ?)`, id, saved.name, saved.mime, saved.file, saved.size, user.id);
  }
  const tk = get('SELECT * FROM service_tickets WHERE id = ?', id);
  postTrackingMessage(user.id, `🛠 ${tk.code} · ${urgency === 'parada' ? 'Recebemos o seu pedido urgente (máquina parada). A equipa responde com prioridade.' : 'Recebemos o seu pedido de assistência. A equipa fala com a fábrica e responde aqui.'}`, 'Assistência Ponte');
  track(user.id, 'assistencia_pedido', { kind, urgency });
  return { id, code: tk.code };
}, authed);
route('GET', '/api/service/:id', ({ params, user }) => {
  const tk = get('SELECT * FROM service_tickets WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!tk) fail(404, 'Pedido não encontrado.');
  return ticketView(tk);
}, authed);
route('POST', '/api/service/:id/message', ({ params, user, body }) => {
  const tk = get('SELECT * FROM service_tickets WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!tk) fail(404, 'Pedido não encontrado.');
  const note = str(body.note, 2000);
  if (!note) fail(400, 'Escreva a mensagem.');
  run("INSERT INTO service_events(ticket_id, status, note, author) VALUES(?, NULL, ?, 'cliente')", tk.id, note);
  const reopen = ['resolvido', 'fechado'].includes(tk.status) && body.reopen;
  run(`UPDATE service_tickets SET updated_at = datetime('now')${reopen ? ", status = 'diagnostico'" : ''} WHERE id = ?`, tk.id);
  return ticketView(get('SELECT * FROM service_tickets WHERE id = ?', tk.id));
}, authed);
route('POST', '/api/service/:id/accept', ({ params, user }) => {
  const tk = get('SELECT * FROM service_tickets WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!tk) fail(404, 'Pedido não encontrado.');
  if (tk.status !== 'proposta') fail(400, 'Ainda não há proposta para aceitar.');
  run("UPDATE service_tickets SET status = 'aceite', updated_at = datetime('now') WHERE id = ?", tk.id);
  run("INSERT INTO service_events(ticket_id, status, note, author) VALUES(?, 'aceite', 'Proposta aceite pelo cliente.', 'cliente')", tk.id);
  return ticketView(get('SELECT * FROM service_tickets WHERE id = ?', tk.id));
}, authed);
route('POST', '/api/service/:id/rate', ({ params, user, body }) => {
  const r = Math.max(1, Math.min(5, Math.round(num(body.rating) || 0)));
  const tk = get("SELECT * FROM service_tickets WHERE id = ? AND user_id = ? AND status IN ('resolvido', 'fechado')", Number(params.id), user.id);
  if (!tk) fail(400, 'Só pode avaliar depois de resolvido.');
  run('UPDATE service_tickets SET rating = ? WHERE id = ?', r, tk.id);
  run("INSERT INTO service_events(ticket_id, status, note, author) VALUES(?, NULL, ?, 'cliente')", tk.id, `Avaliação: ${r}/5${body.comment ? ' — ' + str(body.comment, 500) : ''}`);
  return { ok: true };
}, authed);

// Lembretes de manutenção preventiva (corre periodicamente; ver server/index.js).
export function maintenanceSweep() {
  const soon = addDays(today(), 3);
  let n = 0;
  for (const e of all("SELECT * FROM equipment WHERE maint_interval_days > 0 AND status != 'inactivo'")) {
    const v = equipmentView(e);
    if (!v.next_maint || v.next_maint > soon) continue;
    if (e.maint_notified_at && e.maint_notified_at >= (e.last_maint_at || e.purchased_at || '')) continue;
    postTrackingMessage(e.user_id, `🛠 ${v.maint_days < 0 ? `Manutenção em atraso: ${e.name}` : `Manutenção de ${e.name} em ${v.maint_days} dia(s)`}. ${e.wear_parts ? 'Peças de desgaste a verificar: ' + e.wear_parts + '. ' : ''}Precisa de peças ou de um técnico? Abra Assistência na app.`, 'Assistência Ponte');
    notifyUser(get('SELECT * FROM users WHERE id = ?', e.user_id), `manutenção de ${e.name} ${v.maint_days < 0 ? 'em atraso' : `em ${v.maint_days} dia(s)`}.`);
    run('UPDATE equipment SET maint_notified_at = ? WHERE id = ?', today(), e.id);
    n++;
  }
  return n;
}

// --- equipa
route('GET', '/api/admin/service', () => all('SELECT * FROM service_tickets ORDER BY CASE status WHEN \'novo\' THEN 0 WHEN \'diagnostico\' THEN 1 WHEN \'aceite\' THEN 2 WHEN \'em_resolucao\' THEN 3 WHEN \'proposta\' THEN 4 ELSE 5 END, CASE urgency WHEN \'parada\' THEN 0 WHEN \'limitada\' THEN 1 ELSE 2 END, updated_at DESC')
  .map((tk) => ticketView(tk, true)), admin);
route('PUT', '/api/admin/service/:id', ({ params, body }) => {
  const tk = get('SELECT * FROM service_tickets WHERE id = ?', Number(params.id));
  if (!tk) fail(404, 'Pedido não encontrado.');
  const status = SVC_STATUS.includes(body.status) ? body.status : tk.status;
  const sol = SVC_SOLUTIONS.includes(body.solution_type) ? body.solution_type : ('solution_type' in body ? null : tk.solution_type);
  run(`UPDATE service_tickets SET status = ?, solution_type = ?, solution = ?, quote_usd = ?, partner_id = ?, internal_note = ?, updated_at = datetime('now') WHERE id = ?`,
    status, sol, 'solution' in body ? str(body.solution, 3000) : tk.solution, 'quote_usd' in body ? num(body.quote_usd) : tk.quote_usd,
    'partner_id' in body ? num(body.partner_id) : tk.partner_id, 'internal_note' in body ? str(body.internal_note, 2000) : tk.internal_note, tk.id);
  const note = str(body.note, 2000);
  if (status !== tk.status || note) run("INSERT INTO service_events(ticket_id, status, note, author) VALUES(?, ?, ?, 'equipa')", tk.id, status !== tk.status ? status : null, note);
  if (tk.equipment_id && status === 'resolvido' && tk.status !== 'resolvido') {
    run("UPDATE equipment SET status = 'activo' WHERE id = ?", tk.equipment_id);
    run("INSERT INTO equipment_log(equipment_id, kind, note, author) VALUES(?, 'reparacao', ?, 'equipa')", tk.equipment_id, `${tk.code} resolvido${body.solution ? ': ' + str(body.solution, 300) : ''}`);
  }
  if (body.notify !== false && (status !== tk.status || note)) {
    svcNotify(tk, `${status !== tk.status ? SVC_LABEL[status] + '. ' : ''}${note || ''}${status === 'proposta' ? ' Veja a proposta e aceite na app.' : ''}`.trim());
  }
  return { ok: true };
}, admin);
// Pedido de peças → encomenda normal (com pagamento por fases e rastreio).
route('POST', '/api/admin/service/:id/order', ({ params, body }) => {
  const tk = get('SELECT * FROM service_tickets WHERE id = ?', Number(params.id));
  if (!tk) fail(404, 'Pedido não encontrado.');
  if (tk.order_id) return { id: tk.order_id };
  const u = get('SELECT country FROM users WHERE id = ?', tk.user_id);
  const r = run(`INSERT INTO orders(code, user_id, title, route, kind, total_usd, payment_plan, payment_status) VALUES(?, ?, ?, ?, 'pecas', ?, 'total', ?)`,
    nextOrderCode(), tk.user_id, str(body.title, 160) || `Peças · ${tk.title}`, `Fábrica → ${countryOf(u?.country).name} (courier/aéreo)`, num(body.total_usd) ?? tk.quote_usd, (num(body.total_usd) ?? tk.quote_usd) ? 'pendente' : 'por_confirmar');
  run('INSERT INTO order_events(order_id, step, note) VALUES(?, 0, ?)', r.lastInsertRowid, `Encomenda de peças do pedido de assistência ${tk.code}.`);
  run("UPDATE service_tickets SET order_id = ?, status = CASE WHEN status IN ('novo','diagnostico','proposta','aceite') THEN 'em_resolucao' ELSE status END, updated_at = datetime('now') WHERE id = ?", r.lastInsertRowid, tk.id);
  run("INSERT INTO service_events(ticket_id, status, note, author) VALUES(?, 'em_resolucao', 'Encomenda de peças criada: acompanhe o pagamento e o envio em Os meus pedidos.', 'equipa')", tk.id);
  svcNotify(tk, 'encomenda de peças criada. Pague e acompanhe o envio em Os meus pedidos.');
  return { id: r.lastInsertRowid };
}, admin);
route('GET', '/api/admin/equipment', () => all(`SELECT e.*, u.name user_name, u.email user_email FROM equipment e JOIN users u ON u.id = e.user_id ORDER BY e.id DESC`)
  .map((e) => ({ ...equipmentView(e), user_id: e.user_id, user_name: e.user_name, user_email: e.user_email, supplier_id: e.supplier_id })), admin);
route('POST', '/api/admin/equipment', ({ body }) => {
  const u = get('SELECT id FROM users WHERE id = ? OR email = ?', num(body.user_id) || -1, String(body.user_email || '').toLowerCase());
  if (!u) fail(404, 'Cliente não encontrado.');
  const v = eqValues(body);
  const order = num(body.order_id) ? get('SELECT * FROM orders WHERE id = ?', num(body.order_id)) : null;
  const r = run(`INSERT INTO equipment(user_id, order_id, supplier_id, product_id, created_by, ${Object.keys(v).join(', ')}) VALUES(?, ?, ?, ?, 'equipa', ${Object.keys(v).map(() => '?').join(', ')})`,
    u.id, order?.id || null, num(body.supplier_id), num(body.product_id), ...Object.values(v));
  run("INSERT INTO equipment_log(equipment_id, kind, note, author) VALUES(?, 'nota', 'Registado pela equipa Ponte.', 'equipa')", r.lastInsertRowid);
  postTrackingMessage(u.id, `🛠 Registámos o seu equipamento "${v.name}" em Assistência: garantia, manutenção e peças num só lugar.`, 'Assistência Ponte');
  return { id: r.lastInsertRowid };
}, admin);
route('PUT', '/api/admin/equipment/:id', ({ params, body }) => {
  const e = get('SELECT * FROM equipment WHERE id = ?', Number(params.id));
  if (!e) fail(404, 'Equipamento não encontrado.');
  const v = eqValues(body, e);
  run(`UPDATE equipment SET supplier_id = ?, ${Object.keys(v).map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, 'supplier_id' in body ? num(body.supplier_id) : e.supplier_id, ...Object.values(v), e.id);
  return { ok: true };
}, admin);
route('POST', '/api/admin/equipment/:id/documents', ({ params, body, user }) => {
  const e = get('SELECT id FROM equipment WHERE id = ?', Number(params.id));
  if (!e) fail(404, 'Equipamento não encontrado.');
  const saved = saveUpload(body, 'private');
  const r = run(`INSERT INTO documents(owner_type, owner_id, name, mime, file, size, visible_to_client, uploaded_by) VALUES('equipment', ?, ?, ?, ?, ?, 1, ?)`, e.id, saved.name, saved.mime, saved.file, saved.size, user.id);
  return { id: r.lastInsertRowid };
}, admin);

// ================================================================= CLIENTE: COTAÇÕES, PEDIDOS, CARGA
route('POST', '/api/quotes', ({ body, user }) => {
  let product = null, supplierId = null;
  if (body.product_id) {
    product = get('SELECT * FROM products WHERE id = ? AND active = 1', Number(body.product_id));
    if (!product) fail(404, 'Produto não encontrado.');
    supplierId = product.supplier_id;
  } else if (body.supplier_code) {
    const s = get('SELECT id FROM suppliers WHERE public_code = ? AND active = 1', String(body.supplier_code));
    if (!s) fail(404, 'Fornecedor não encontrado.');
    supplierId = s.id;
  }
  const title = str(body.title, 160) || product?.name;
  if (!title) fail(400, 'Diga-nos o que procura.');
  const r = run(`INSERT INTO quote_requests(user_id, product_id, supplier_id, title, details, quantity, target_price, destination)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)`, user.id, product?.id || null, supplierId, title, str(body.details, 3000),
  str(body.quantity, 60), str(body.target_price, 60), str(body.destination, 120));
  const photos = Array.isArray(body.photos) ? body.photos.slice(0, 3) : [];
  for (const f of photos) {
    const saved = saveUpload(f, 'private');
    run(`INSERT INTO documents(owner_type, owner_id, name, mime, file, size, visible_to_client, uploaded_by) VALUES('quote', ?, ?, ?, ?, ?, 1, ?)`,
      r.lastInsertRowid, saved.name, saved.mime, saved.file, saved.size, user.id);
  }
  track(user.id, photos.length ? 'cotacao_foto' : 'cotacao_pedida', { id: r.lastInsertRowid });
  return { id: r.lastInsertRowid, status: 'novo' };
}, authed);

route('GET', '/api/quotes', ({ user }) => all(`SELECT (SELECT COUNT(*) FROM documents d WHERE d.owner_type = 'quote' AND d.owner_id = q.id) AS photos, q.id, q.title, q.details, q.quantity, q.target_price, q.destination, q.status,
  q.response, q.quoted_price, q.created_at, q.updated_at, q.product_id, s.public_code AS supplier_code, s.public_title AS supplier_title
  FROM quote_requests q LEFT JOIN suppliers s ON s.id = q.supplier_id WHERE q.user_id = ? ORDER BY q.id DESC`, user.id));

route('POST', '/api/quotes/:id/accept', ({ params, user }) => {
  const q = get('SELECT * FROM quote_requests WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!q) fail(404, 'Cotação não encontrada.');
  if (q.status !== 'cotado') fail(400, 'Esta cotação ainda não tem proposta para aceitar.');
  run(`UPDATE quote_requests SET status = 'aceite', updated_at = datetime('now') WHERE id = ?`, q.id);
  track(user.id, 'cotacao_aceite', { id: q.id });
  return { ok: true };
}, authed);

function orderView(o, forAdmin) {
  const events = all('SELECT step, note, created_at FROM order_events WHERE order_id = ? ORDER BY id', o.id);
  const docs = all(`SELECT id, name, mime, size, created_at, visible_to_client FROM documents WHERE owner_type = 'order' AND owner_id = ?
    ${forAdmin ? '' : 'AND visible_to_client = 1'} ORDER BY id`, o.id);
  const items = all('SELECT id, product_id, name, qty, unit_price, currency, color, size, notes FROM order_items WHERE order_id = ? ORDER BY id', o.id);
  const v = { id: o.id, code: o.code, title: o.title, route: o.route, status_step: o.status_step, client_note: o.client_note,
    created_at: o.created_at, updated_at: o.updated_at, events, documents: docs, items, kind: o.kind, delivery_mode: o.delivery_mode,
    delivery_address: o.delivery_address, total_usd: o.total_usd, payment_status: o.payment_status,
    payment_plan: o.payment_plan, deposit_pct: o.deposit_pct, deposit_paid: !!o.deposit_paid, balance_paid: !!o.balance_paid };
  v.shipments = all('SELECT * FROM shipments WHERE order_id = ? ORDER BY id DESC', o.id).map(shipmentSummary);
  if (forAdmin) Object.assign(v, { internal_note: o.internal_note, user_id: o.user_id, quote_id: o.quote_id });
  return v;
}

route('GET', '/api/orders', ({ user }) => all('SELECT * FROM orders WHERE user_id = ? ORDER BY updated_at DESC', user.id).map((o) => orderView(o)), authed);
route('GET', '/api/orders/:id', ({ params, user }) => {
  const o = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!o) fail(404, 'Pedido não encontrado.');
  return orderView(o);
}, authed);

route('GET', '/api/documents/:id', ({ params, user, res }) => {
  const d = get('SELECT * FROM documents WHERE id = ?', Number(params.id));
  if (!d) fail(404, 'Documento não encontrado.');
  if (user.role !== 'admin') {
    const ok = d.visible_to_client && ((d.owner_type === 'order' && get('SELECT id FROM orders WHERE id = ? AND user_id = ?', d.owner_id, user.id))
      || (d.owner_type === 'quote' && get('SELECT id FROM quote_requests WHERE id = ? AND user_id = ?', d.owner_id, user.id))
      || (d.owner_type === 'ticket' && get('SELECT id FROM service_tickets WHERE id = ? AND user_id = ?', d.owner_id, user.id))
      || (d.owner_type === 'equipment' && get('SELECT id FROM equipment WHERE id = ? AND user_id = ?', d.owner_id, user.id)));
    if (!ok) fail(403, 'Sem acesso a este documento.');
  }
  const file = path.join(config.dataDir, 'uploads', 'private', path.basename(d.file));
  if (!fs.existsSync(file)) fail(404, 'Ficheiro em falta.');
  res.writeHead(200, {
    'Content-Type': d.mime || 'application/octet-stream',
    'Content-Disposition': `inline; filename="${encodeURIComponent(d.name)}"`,
    'Cache-Control': 'private, no-store',
  });
  fs.createReadStream(file).pipe(res);
  return undefined;
}, authed);

route('POST', '/api/freight', ({ body, user }) => {
  const modes = ['fcl', 'lcl', 'aereo', 'courier'];
  if (!modes.includes(body.mode)) fail(400, 'Escolha o tipo de envio.');
  const r = run(`INSERT INTO freight_requests(user_id, mode, origin, destination, volume_cbm, weight_kg, incoterm, goods, include_customs)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, user.id, body.mode, str(body.origin, 120), str(body.destination, 120),
  num(body.volume_cbm), num(body.weight_kg), str(body.incoterm, 10), str(body.goods, 1000), bool(body.include_customs));
  track(user.id, 'frete_pedido', { mode: body.mode });
  return { id: r.lastInsertRowid };
}, authed);

route('GET', '/api/freight', ({ user }) => all('SELECT * FROM freight_requests WHERE user_id = ? ORDER BY id DESC', user.id), authed);

// ================================================================= PARCEIROS (registo)
route('POST', '/api/partners', ({ body, user }) => {
  const types = ['despachante', 'transitario', 'fornecedor', 'tecnico', 'interprete', 'hotel', 'anunciante'];
  if (!types.includes(body.type)) fail(400, 'Escolha o tipo de parceiro.');
  const company = str(body.company, 160);
  if (!company) fail(400, 'Indique o nome da empresa.');
  const email = str(body.email, 200) || user?.email;
  if (!isEmail(email)) fail(400, 'Indique um email válido.');
  if (body.type === 'despachante' && !str(body.licence_no, 80)) fail(400, 'Indique o número de licença de despachante.');
  const r = run(`INSERT INTO partners(user_id, type, company, contact_name, email, phone, country, city, tax_id, licence_no, languages, services)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, user?.id || null, body.type, company, str(body.contact_name, 120) || user?.name,
  email, str(body.phone, 40), str(body.country, 80), str(body.city, 80), str(body.tax_id, 60), str(body.licence_no, 80),
  str(body.languages, 200), str(body.services, 1000));
  const files = Array.isArray(body.documents) ? body.documents.slice(0, 5) : [];
  for (const f of files) {
    const saved = saveUpload(f, 'private');
    run(`INSERT INTO documents(owner_type, owner_id, name, mime, file, size, visible_to_client, uploaded_by)
      VALUES('partner', ?, ?, ?, ?, ?, 0, ?)`, r.lastInsertRowid, saved.name, saved.mime, saved.file, saved.size, user?.id || null);
  }
  track(user?.id, 'parceiro_registo', { type: body.type });
  return { id: r.lastInsertRowid, status: 'pendente' };
});

route('GET', '/api/partners/mine', ({ user }) => all('SELECT id, type, company, status, created_at FROM partners WHERE user_id = ? ORDER BY id DESC', user.id), authed);

// ================================================================= PAGAMENTO PROTEGIDO POR FASES
// Sinal (por omissão 30%) para a Ponte iniciar a encomenda; o restante só depois da inspecção de qualidade.
const INSPECTION_STEP = 4;
function payOrder(user, o, stage, method, phone) {
  checkPayMethod(user, method, phone);
  if (!o.total_usd) fail(400, 'A equipa ainda está a confirmar o valor desta encomenda.');
  let amount, label;
  if (stage === 'total') {
    if (o.deposit_paid || o.balance_paid) fail(400, 'Esta encomenda já tem pagamentos registados.');
    amount = o.total_usd; label = 'total';
  } else if (stage === 'sinal') {
    if (o.deposit_paid) fail(400, 'O sinal já foi pago.');
    amount = o.total_usd * (o.deposit_pct || 30) / 100; label = 'sinal';
  } else if (stage === 'restante') {
    if (!o.deposit_paid) fail(400, 'Pague primeiro o sinal.');
    if (o.balance_paid) fail(400, 'O restante já foi pago.');
    if (o.status_step < INSPECTION_STEP) fail(400, 'O restante só é pago depois da inspecção de qualidade.');
    amount = o.total_usd * (100 - (o.deposit_pct || 30)) / 100; label = 'restante';
  } else fail(400, 'Fase de pagamento inválida.');
  if (config.paymentsMode !== 'test') fail(501, 'Pagamentos reais ainda não estão activos.');
  const reference = 'PNT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  run(`INSERT INTO payments(user_id, plan_id, amount, currency, method, phone, status, reference) VALUES(?, ?, ?, 'USD', ?, ?, 'teste', ?)`,
    user.id, `encomenda:${o.id}:${label}`, Math.round(amount * 100) / 100, method, str(phone, 20), reference);
  if (label === 'total') run("UPDATE orders SET deposit_paid = 1, balance_paid = 1, payment_status = 'pago', updated_at = datetime('now') WHERE id = ?", o.id);
  else if (label === 'sinal') run("UPDATE orders SET deposit_paid = 1, payment_status = 'sinal_pago', updated_at = datetime('now') WHERE id = ?", o.id);
  else run("UPDATE orders SET balance_paid = 1, payment_status = 'pago', updated_at = datetime('now') WHERE id = ?", o.id);
  run('INSERT INTO order_events(order_id, step, note) VALUES(?, ?, ?)', o.id, o.status_step,
    `Pagamento ${label === 'sinal' ? 'do sinal' : label === 'restante' ? 'do restante' : 'total'} recebido (${reference}).`);
  track(user.id, 'pagamento_encomenda', { order: o.id, stage: label });
  return { reference, amount, stage: label, test: true };
}

route('POST', '/api/orders/:id/pay', ({ params, user, body }) => {
  const o = get('SELECT * FROM orders WHERE id = ? AND user_id = ?', Number(params.id), user.id);
  if (!o) fail(404, 'Pedido não encontrado.');
  return payOrder(user, o, body.stage, body.method, body.phone);
}, authed);

// ================================================================= CONTENTOR PARTILHADO
function groupView(g, userId) {
  const booked = get("SELECT COALESCE(SUM(cbm), 0) n FROM group_bookings WHERE shipment_id = ? AND status != 'cancelado'", g.id).n;
  const mine = userId ? all("SELECT id, cbm, goods, status, created_at FROM group_bookings WHERE shipment_id = ? AND user_id = ? AND status != 'cancelado'", g.id, userId) : [];
  return { ...g, booked_cbm: Math.round(booked * 10) / 10, free_cbm: Math.max(0, Math.round((g.capacity_cbm - booked) * 10) / 10),
    fill_pct: Math.min(100, Math.round((booked / g.capacity_cbm) * 100)), mine };
}
// Os contentores para o país do cliente aparecem primeiro.
route('GET', '/api/groups', ({ user, query }) => all(`SELECT * FROM group_shipments WHERE status IN ('aberto', 'fechado', 'enviado')
  ORDER BY CASE WHEN dest_country = ? THEN 0 ELSE 1 END, CASE status WHEN 'aberto' THEN 0 ELSE 1 END, closes_at`, user?.country || query.country || 'MZ')
  .map((g) => {
    const v = groupView(g, user?.id);
    const sh = get('SELECT * FROM shipments WHERE group_id = ? ORDER BY id DESC LIMIT 1', g.id);
    if (sh) { const sm = shipmentSummary(sh); v.tracking = { phase_label: sm.phase_label, eta: sm.eta, progress: sm.progress, id: v.mine.length ? sm.id : null }; }
    return v;
  }));
route('POST', '/api/groups/:id/join', ({ params, user, body }) => {
  const g = get("SELECT * FROM group_shipments WHERE id = ? AND status = 'aberto'", Number(params.id));
  if (!g) fail(404, 'Este contentor já não está aberto.');
  const cbm = num(body.cbm);
  if (!cbm || cbm < 0.5) fail(400, 'Indique o volume (mínimo 0,5 m³).');
  const v = groupView(g);
  if (cbm > v.free_cbm) fail(400, `Só restam ${v.free_cbm} m³ neste contentor.`);
  const r = run('INSERT INTO group_bookings(shipment_id, user_id, cbm, goods) VALUES(?, ?, ?, ?)', g.id, user.id, cbm, str(body.goods, 500));
  track(user.id, 'contentor_reserva', { group: g.id, cbm });
  return { id: r.lastInsertRowid };
}, authed);
route('DELETE', '/api/groups/bookings/:id', ({ params, user }) => {
  run("UPDATE group_bookings SET status = 'cancelado' WHERE id = ? AND user_id = ? AND status = 'pendente'", Number(params.id), user.id);
  return { ok: true };
}, authed);

// ================================================================= VISITA VIRTUAL
route('POST', '/api/visits', ({ user, body }) => {
  const kind = ['fabrica', 'feira', 'mercado'].includes(body.kind) ? body.kind : 'fabrica';
  let supplierId = null;
  if (body.supplier_code) supplierId = get('SELECT id FROM suppliers WHERE public_code = ?', String(body.supplier_code))?.id || null;
  const r = run('INSERT INTO visits(user_id, kind, target, supplier_id, preferred, channel, notes) VALUES(?, ?, ?, ?, ?, ?, ?)', user.id, kind,
    str(body.target, 200), supplierId, str(body.preferred, 200), ['whatsapp', 'wechat', 'app'].includes(body.channel) ? body.channel : 'whatsapp', str(body.notes, 1000));
  track(user.id, 'visita_pedida', { kind });
  return { id: r.lastInsertRowid };
}, authed);
route('GET', '/api/visits', ({ user }) => all('SELECT id, kind, target, preferred, channel, notes, status, scheduled_at, admin_note, created_at FROM visits WHERE user_id = ? ORDER BY id DESC', user.id), authed);

// ================================================================= CHAT
function conversationFor(userId) {
  let c = get('SELECT * FROM conversations WHERE user_id = ?', userId);
  if (!c) {
    const r = run('INSERT INTO conversations(user_id, last_message_at) VALUES(?, datetime(\'now\'))', userId);
    c = get('SELECT * FROM conversations WHERE id = ?', r.lastInsertRowid);
  }
  return c;
}

function addMessage(convId, sender, body, senderName = null) {
  const r = run('INSERT INTO messages(conversation_id, sender, sender_name, body) VALUES(?, ?, ?, ?)', convId, sender, senderName, body);
  run("UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?", convId);
  return get('SELECT * FROM messages WHERE id = ?', r.lastInsertRowid);
}

route('GET', '/api/chat', ({ user, query }) => {
  const c = conversationFor(user.id);
  if (!get('SELECT id FROM messages WHERE conversation_id = ? LIMIT 1', c.id)) addMessage(c.id, 'bot', botText('welcome', user.lang));
  const after = Number(query.after || 0);
  run('UPDATE conversations SET unread_user = 0 WHERE id = ?', c.id);
  return { messages: all('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id LIMIT 500', c.id, after), needs_human: !!c.needs_human };
}, authed);

route('POST', '/api/chat', ({ user, body }) => {
  const text = str(body.body, 2000);
  if (!text) fail(400, 'Mensagem vazia.');
  const c = conversationFor(user.id);
  const out = [addMessage(c.id, 'user', text, user.name)];
  run('UPDATE conversations SET unread_admin = unread_admin + 1 WHERE id = ?', c.id);

  // Se a equipa já está na conversa, o assistente não interrompe.
  if (!c.needs_human || body.force_bot) {
    const a = botAnswer(text, user.lang);
    if (a.handoff) {
      out.push(addMessage(c.id, 'bot', botText('handoff', user.lang)));
      run('UPDATE conversations SET needs_human = 1 WHERE id = ?', c.id);
    } else if (a.text) {
      out.push(addMessage(c.id, 'bot', a.text));
      track(user.id, 'bot_resposta', { faq: a.faqId });
    } else {
      out.push(addMessage(c.id, 'bot', botText('unknown', user.lang)));
      run('UPDATE conversations SET needs_human = 1 WHERE id = ?', c.id);
      track(user.id, 'bot_sem_resposta', { q: text.slice(0, 120) });
    }
  }
  return { messages: out, needs_human: !!get('SELECT needs_human FROM conversations WHERE id = ?', c.id).needs_human };
}, authed);

route('POST', '/api/chat/human', ({ user, body }) => {
  const c = conversationFor(user.id);
  const out = [];
  const text = str(body.body, 2000);
  if (text) out.push(addMessage(c.id, 'user', text, user.name));
  run('UPDATE conversations SET needs_human = 1, unread_admin = unread_admin + 1 WHERE id = ?', c.id);
  out.push(addMessage(c.id, 'bot', botText('handoff', user.lang)));
  return { messages: out, needs_human: true };
}, authed);

// ================================================================= PAGAMENTOS (modo de teste)
route('POST', '/api/payments', ({ user, body }) => {
  const plan = get('SELECT * FROM plans WHERE id = ?', String(body.plan_id || ''));
  if (!plan) fail(404, 'Plano não encontrado.');
  checkPayMethod(user, body.method, body.phone);
  const reference = 'PNT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  if (config.paymentsMode !== 'test') {
    // Aqui entra a integração real com cada operador (M-Pesa, Multicaixa Express, Pix, MB WAY…) ou processador de cartões.
    fail(501, 'Pagamentos reais ainda não estão activos.');
  }
  run(`INSERT INTO payments(user_id, plan_id, amount, currency, method, phone, status, reference)
    VALUES(?, ?, ?, ?, ?, ?, 'teste', ?)`, user.id, plan.id, plan.price_amount, plan.currency, body.method,
  str(body.phone, 20), reference);
  run('UPDATE users SET plan = ? WHERE id = ?', plan.id, user.id);
  track(user.id, 'pagamento_teste', { plan: plan.id, method: body.method });
  return { status: 'teste', reference, plan: plan.id, test: true };
}, authed);

route('GET', '/api/payments', ({ user }) => all('SELECT id, plan_id, amount, currency, method, status, reference, created_at FROM payments WHERE user_id = ? ORDER BY id DESC', user.id), authed);

// ================================================================= ADMINISTRAÇÃO
// Recursos editáveis no painel: campos permitidos e tipo.
const RESOURCES = {
  suppliers: {
    fields: {
      public_code: 's', public_title: 's', category: 's', city: 's', district: 's', description: 't', moq: 's',
      certifications: 's', lead_time: 's', languages: 's', verified: 'b', visited_at: 's', company_name: 's',
      contact_person: 's', phone: 's', wechat: 's', email: 's', address: 't', website: 's', commission_pct: 'n',
      internal_notes: 't', active: 'b', is_sample: 'b', rating_quality: 'n', rating_delivery: 'n', rating_comms: 'n', orders_done: 'n',
    },
    required: ['public_title', 'category'], order: 'id DESC',
  },
  products: {
    fields: {
      supplier_id: 'n', name: 's', category: 's', description: 't', price_min: 'n', price_max: 'n', price_currency: 's',
      price_unit: 's', moq: 's', image: 's', featured: 'b', active: 'b', is_sample: 'b',
      styles: 's', quality: 'n', durability_years: 'n', spare_parts: 's', mechanism: 's', colors: 's', materials: 's', sizes: 's',
      tags: 's', warranty: 's', certifications: 's', lead_time_days: 'n', moq_qty: 'n', buy_online: 'b',
    },
    required: ['name', 'category'], order: 'id DESC',
  },
  fairs: {
    fields: { name: 's', city: 's', venue: 's', start_date: 's', end_date: 's', sectors: 't', tags: 's', website: 's', place_id: 'n', confirmed: 'b', notes: 't' },
    required: ['name'], order: 'start_date',
  },
  holidays: {
    fields: { year: 'n', name_pt: 's', name_en: 's', name_cn: 's', start_date: 's', end_date: 's', official: 'b', note: 't' },
    required: ['year', 'name_pt', 'start_date', 'end_date'], order: 'start_date',
  },
  sales_events: {
    fields: { tag: 's', name_pt: 's', name_en: 's', date_label: 's', month: 'n', description_pt: 't', description_en: 't' },
    required: ['tag', 'name_pt'], order: 'month',
  },
  places: {
    fields: {
      category: 's', name: 's', name_cn: 's', address_cn: 't', city: 's', district: 's', lat: 'n', lng: 'n', phone: 's',
      description: 't', hours: 's', approximate: 'b', is_sample: 'b',
    },
    required: ['category', 'name'], order: 'category, name',
  },
  promotions: {
    fields: {
      title: 's', partner_name: 's', category: 's', badge: 's', code: 's', valid_label: 's', description: 't', link: 's',
      sponsored: 'b', active: 'b', is_sample: 'b',
    },
    required: ['title'], order: 'id DESC',
  },
  faq: {
    fields: { lang: 's', question: 's', answer: 't', keywords: 't', sort: 'n', quick: 'b' },
    required: ['question', 'answer'], order: 'lang, sort, id',
  },
  group_shipments: {
    fields: { title: 's', origin: 's', destination: 's', dest_country: 's', container: 's', capacity_cbm: 'n', price_per_cbm: 'n', currency: 's', closes_at: 's', departs_label: 's', status: 's', notes: 't', is_sample: 'b' },
    required: ['title'], order: 'id DESC',
  },
  plans: {
    fields: { id: 's', name: 's', price_label: 's', price_amount: 'n', currency: 's', features: 'j', highlight: 'b', sort: 'n' },
    required: ['id', 'name'], order: 'sort', textId: true,
  },
};

function cleanFields(resource, body, creating) {
  const spec = RESOURCES[resource];
  const out = {};
  for (const [k, type] of Object.entries(spec.fields)) {
    if (!(k in body)) continue;
    const v = body[k];
    if (type === 'n') out[k] = num(v);
    else if (type === 'b') out[k] = bool(v);
    else if (type === 'j') out[k] = Array.isArray(v) ? JSON.stringify(v) : (typeof v === 'string' ? JSON.stringify(v.split('\n').map((x) => x.trim()).filter(Boolean)) : '[]');
    else out[k] = str(v, type === 't' ? 5000 : 300);
  }
  if (creating) for (const r of spec.required) if (out[r] === null || out[r] === undefined) fail(400, `Campo obrigatório: ${r}`);
  return out;
}

function nextSupplierCode() {
  for (;;) {
    const code = 'PNT-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    if (!get('SELECT id FROM suppliers WHERE public_code = ?', code)) return code;
  }
}

function createRow(resource, body) {
  const data = cleanFields(resource, body, true);
  if (resource === 'suppliers' && !data.public_code) data.public_code = nextSupplierCode();
  const keys = Object.keys(data);
  const r = run(`INSERT INTO ${resource}(${keys.join(', ')}) VALUES(${keys.map(() => '?').join(', ')})`, ...keys.map((k) => data[k]));
  return RESOURCES[resource].textId ? data.id : r.lastInsertRowid;
}

route('GET', '/api/admin/stats', () => {
  const n = (sql, ...p) => get(sql, ...p).n;
  const since30 = "datetime('now', '-30 days')";
  return {
    users: n("SELECT COUNT(*) n FROM users WHERE role = 'client'"),
    users7: n("SELECT COUNT(*) n FROM users WHERE role = 'client' AND created_at >= datetime('now', '-7 days')"),
    quotesOpen: n("SELECT COUNT(*) n FROM quote_requests WHERE status IN ('novo', 'em_analise')"),
    quotesNew: n("SELECT COUNT(*) n FROM quote_requests WHERE status = 'novo'"),
    ordersActive: n('SELECT COUNT(*) n FROM orders WHERE status_step < ?', ORDER_STEPS - 1),
    freightOpen: n("SELECT COUNT(*) n FROM freight_requests WHERE status = 'novo'"),
    partnersPending: n("SELECT COUNT(*) n FROM partners WHERE status = 'pendente'"),
    chatsWaiting: n('SELECT COUNT(*) n FROM conversations WHERE needs_human = 1 OR unread_admin > 0'),
    visitsPending: n("SELECT COUNT(*) n FROM visits WHERE status = 'pedido'"),
    serviceOpen: n("SELECT COUNT(*) n FROM service_tickets WHERE status IN ('novo', 'aceite') OR (status = 'diagnostico' AND urgency = 'parada')"),
    // Envios que precisam de atenção: atrasados, data prevista ultrapassada, ou sem actualização há 7 dias.
    shipmentsAttention: all('SELECT * FROM shipments').map((x) => ({ x, v: shipmentView(x) }))
      .filter(({ x, v }) => v.phase < 5 && (v.delayed || v.overdue || (Date.now() - new Date(x.updated_at.replace(' ', 'T') + 'Z')) > 7 * 864e5)).length,
    bookingsPending: n("SELECT COUNT(*) n FROM group_bookings WHERE status = 'pendente'"),
    whatsappPending: n("SELECT COUNT(*) n FROM events WHERE type = 'whatsapp_pendente' AND created_at >= datetime('now', '-7 days')"),
    suppliers: n('SELECT COUNT(*) n FROM suppliers WHERE active = 1'),
    products: n('SELECT COUNT(*) n FROM products WHERE active = 1'),
    sampleRows: n('SELECT (SELECT COUNT(*) FROM suppliers WHERE is_sample = 1) + (SELECT COUNT(*) FROM products WHERE is_sample = 1) + (SELECT COUNT(*) FROM places WHERE is_sample = 1) + (SELECT COUNT(*) FROM promotions WHERE is_sample = 1) AS n'),
    payments: all("SELECT plan_id, COUNT(*) n FROM payments GROUP BY plan_id"),
    plans: all("SELECT plan, COUNT(*) n FROM users WHERE role = 'client' GROUP BY plan"),
    countries: all("SELECT country, COUNT(*) n FROM users WHERE role = 'client' GROUP BY country ORDER BY n DESC"),
    topSearches: all(`SELECT json_extract(meta, '$.q') q, COUNT(*) n FROM events WHERE type = 'pesquisa' AND created_at >= ${since30}
      GROUP BY lower(json_extract(meta, '$.q')) ORDER BY n DESC LIMIT 10`),
    botMisses: all(`SELECT json_extract(meta, '$.q') q, created_at FROM events WHERE type = 'bot_sem_resposta' ORDER BY id DESC LIMIT 10`),
    botAnswered: n(`SELECT COUNT(*) n FROM events WHERE type = 'bot_resposta' AND created_at >= ${since30}`),
    screens: all(`SELECT substr(type, 6) screen, COUNT(*) n FROM events WHERE type LIKE 'ecra:%' AND created_at >= ${since30} GROUP BY type ORDER BY n DESC LIMIT 12`),
    daily: all(`SELECT date(created_at) d, COUNT(DISTINCT COALESCE(user_id, id)) n FROM events WHERE created_at >= datetime('now', '-14 days') GROUP BY d ORDER BY d`),
    recentQuotes: all(`SELECT q.id, q.title, q.status, q.created_at, u.name user_name FROM quote_requests q JOIN users u ON u.id = q.user_id ORDER BY q.id DESC LIMIT 6`),
  };
}, admin);

for (const resource of Object.keys(RESOURCES)) {
  route('GET', `/api/admin/${resource}`, () => all(`SELECT * FROM ${resource} ORDER BY ${RESOURCES[resource].order}`), admin);
  route('POST', `/api/admin/${resource}`, ({ body }) => ({ id: createRow(resource, body) }), admin);
  route('PUT', `/api/admin/${resource}/:id`, ({ params, body }) => {
    const data = cleanFields(resource, body, false);
    const keys = Object.keys(data);
    if (!keys.length) return { ok: true };
    const id = RESOURCES[resource].textId ? params.id : Number(params.id);
    const r = run(`UPDATE ${resource} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => data[k]), id);
    if (!r.changes) fail(404, 'Registo não encontrado.');
    return { ok: true };
  }, admin);
  route('DELETE', `/api/admin/${resource}/:id`, ({ params }) => {
    const id = RESOURCES[resource].textId ? params.id : Number(params.id);
    run(`DELETE FROM ${resource} WHERE id = ?`, id);
    return { ok: true };
  }, admin);
  route('POST', `/api/admin/import/${resource}`, ({ body }) => {
    const rows = parseCSV(body.csv);
    if (!rows.length) fail(400, 'O ficheiro não tem linhas.');
    let created = 0;
    const errors = [];
    tx(() => {
      rows.forEach((row, i) => {
        try { createRow(resource, row); created++; } catch (e) { errors.push(`Linha ${i + 2}: ${e.message}`); }
      });
    });
    return { created, errors: errors.slice(0, 20) };
  }, admin);
  route('GET', `/api/admin/export/${resource}`, ({ res }) => {
    const rows = all(`SELECT * FROM ${resource} ORDER BY id`);
    const cols = [...(RESOURCES[resource].textId ? [] : ['id']), ...Object.keys(RESOURCES[resource].fields)];
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ponte-${resource}.csv"`,
      'Cache-Control': 'no-store',
    });
    res.end(toCSV(rows, cols));
    return undefined;
  }, admin);
}

route('POST', '/api/admin/upload', ({ body }) => {
  const saved = saveUpload(body, 'public');
  return { url: `/uploads/${saved.file}` };
}, admin);

route('POST', '/api/admin/remove-samples', () => {
  tx(() => {
    run('DELETE FROM products WHERE is_sample = 1');
    run('DELETE FROM suppliers WHERE is_sample = 1');
    run('DELETE FROM places WHERE is_sample = 1');
    run('DELETE FROM promotions WHERE is_sample = 1');
    run("DELETE FROM partners WHERE company LIKE '[Exemplo]%'");
    run('DELETE FROM shipments WHERE is_sample = 1');
    run('DELETE FROM group_shipments WHERE is_sample = 1');
  });
  return { ok: true };
}, admin);

// --- cotações
route('GET', '/api/admin/quotes', () => all(`SELECT q.*, u.name user_name, u.email user_email, COALESCE(u.whatsapp, u.phone) user_phone, u.country user_country,
  s.public_title supplier_title, s.company_name supplier_company, p.name product_name
  FROM quote_requests q JOIN users u ON u.id = q.user_id LEFT JOIN suppliers s ON s.id = q.supplier_id
  LEFT JOIN products p ON p.id = q.product_id ORDER BY CASE q.status WHEN 'novo' THEN 0 WHEN 'em_analise' THEN 1 ELSE 2 END, q.id DESC`), admin);

route('GET', '/api/admin/quotes/:id/photos', ({ params }) => all("SELECT id, name, mime FROM documents WHERE owner_type = 'quote' AND owner_id = ?", Number(params.id)), admin);

route('PUT', '/api/admin/quotes/:id', ({ params, body }) => {
  const statuses = ['novo', 'em_analise', 'cotado', 'aceite', 'recusado', 'fechado'];
  const q = get('SELECT * FROM quote_requests WHERE id = ?', Number(params.id));
  if (!q) fail(404, 'Cotação não encontrada.');
  const status = statuses.includes(body.status) ? body.status : q.status;
  run(`UPDATE quote_requests SET status = ?, response = ?, quoted_price = ?, supplier_id = ?, updated_at = datetime('now') WHERE id = ?`,
    status, 'response' in body ? str(body.response, 5000) : q.response, 'quoted_price' in body ? str(body.quoted_price, 120) : q.quoted_price,
    'supplier_id' in body ? num(body.supplier_id) : q.supplier_id, q.id);
  if (status === 'cotado' && q.status !== 'cotado') notifyUser(get('SELECT * FROM users WHERE id = ?', q.user_id), `a proposta para "${q.title}" está pronta na app.`);
  return { ok: true };
}, admin);

function nextOrderCode() {
  const n = get('SELECT COUNT(*) n FROM orders').n + 1001;
  let code = `PT-${n}`;
  while (get('SELECT id FROM orders WHERE code = ?', code)) code = `PT-${n}-${crypto.randomBytes(1).toString('hex')}`;
  return code;
}

route('POST', '/api/admin/quotes/:id/order', ({ params, body }) => {
  const q = get('SELECT * FROM quote_requests WHERE id = ?', Number(params.id));
  if (!q) fail(404, 'Cotação não encontrada.');
  const existing = get('SELECT id FROM orders WHERE quote_id = ?', q.id);
  if (existing) return { id: existing.id };
  const r = run('INSERT INTO orders(code, user_id, quote_id, title, route, status_step) VALUES(?, ?, ?, ?, ?, 0)',
    nextOrderCode(), q.user_id, q.id, str(body.title, 160) || q.title, str(body.route, 160) || (q.destination ? `China → ${q.destination}` : null));
  run('INSERT INTO order_events(order_id, step, note) VALUES(?, 0, ?)', r.lastInsertRowid, 'Pedido criado a partir da cotação.');
  run(`UPDATE quote_requests SET status = 'fechado', updated_at = datetime('now') WHERE id = ?`, q.id);
  return { id: r.lastInsertRowid };
}, admin);

// --- pedidos
route('GET', '/api/admin/orders', () => all(`SELECT o.*, u.name user_name, u.email user_email FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.updated_at DESC`)
  .map((o) => ({ ...orderView(o, true), user_name: o.user_name, user_email: o.user_email })), admin);

route('POST', '/api/admin/orders', ({ body }) => {
  const u = get('SELECT id FROM users WHERE id = ? OR email = ?', num(body.user_id) || -1, String(body.user_email || '').toLowerCase());
  if (!u) fail(404, 'Cliente não encontrado.');
  const title = str(body.title, 160);
  if (!title) fail(400, 'Indique o título do pedido.');
  const r = run('INSERT INTO orders(code, user_id, title, route) VALUES(?, ?, ?, ?)', nextOrderCode(), u.id, title, str(body.route, 160));
  run('INSERT INTO order_events(order_id, step, note) VALUES(?, 0, ?)', r.lastInsertRowid, 'Pedido criado.');
  return { id: r.lastInsertRowid };
}, admin);

route('PUT', '/api/admin/orders/:id', ({ params, body }) => {
  const o = get('SELECT * FROM orders WHERE id = ?', Number(params.id));
  if (!o) fail(404, 'Pedido não encontrado.');
  const step = num(body.status_step);
  const newStep = step === null ? o.status_step : Math.max(0, Math.min(ORDER_STEPS - 1, step));
  run(`UPDATE orders SET status_step = ?, title = ?, route = ?, client_note = ?, internal_note = ?, updated_at = datetime('now') WHERE id = ?`,
    newStep, str(body.title, 160) || o.title, 'route' in body ? str(body.route, 160) : o.route,
    'client_note' in body ? str(body.client_note, 2000) : o.client_note, 'internal_note' in body ? str(body.internal_note, 2000) : o.internal_note, o.id);
  if ('total_usd' in body || 'payment_plan' in body || 'deposit_pct' in body) {
    run(`UPDATE orders SET total_usd = ?, payment_plan = ?, deposit_pct = ?, payment_status = CASE WHEN payment_status = 'por_confirmar' AND ? IS NOT NULL THEN 'pendente' ELSE payment_status END WHERE id = ?`,
      'total_usd' in body ? num(body.total_usd) : o.total_usd, body.payment_plan === 'total' ? 'total' : body.payment_plan === 'fases' ? 'fases' : o.payment_plan,
      num(body.deposit_pct) ?? o.deposit_pct, num(body.total_usd), o.id);
  }
  if (newStep !== o.status_step || body.event_note) run('INSERT INTO order_events(order_id, step, note) VALUES(?, ?, ?)', o.id, newStep, str(body.event_note, 500));
  if (newStep !== o.status_step) notifyUser(get('SELECT * FROM users WHERE id = ?', o.user_id), `o seu pedido ${o.code} avançou: ${['pedido recebido', 'cotações', 'amostra aprovada', 'em produção', 'inspecção de qualidade', 'embarque', 'chegada ao destino'][newStep]}.${body.event_note ? ' ' + body.event_note : ''}`);
  return { ok: true };
}, admin);

route('POST', '/api/admin/orders/:id/documents', ({ params, body, user }) => {
  const o = get('SELECT id FROM orders WHERE id = ?', Number(params.id));
  if (!o) fail(404, 'Pedido não encontrado.');
  const saved = saveUpload(body, 'private');
  const r = run(`INSERT INTO documents(owner_type, owner_id, name, mime, file, size, visible_to_client, uploaded_by)
    VALUES('order', ?, ?, ?, ?, ?, ?, ?)`, o.id, saved.name, saved.mime, saved.file, saved.size, body.visible_to_client === false ? 0 : 1, user.id);
  run("UPDATE orders SET updated_at = datetime('now') WHERE id = ?", o.id);
  return { id: r.lastInsertRowid };
}, admin);

route('DELETE', '/api/admin/documents/:id', ({ params }) => {
  const d = get('SELECT * FROM documents WHERE id = ?', Number(params.id));
  if (d) {
    run('DELETE FROM documents WHERE id = ?', d.id);
    fs.rmSync(path.join(config.dataDir, 'uploads', 'private', path.basename(d.file)), { force: true });
  }
  return { ok: true };
}, admin);

// --- carga
route('GET', '/api/admin/freight', () => all('SELECT f.*, u.name user_name, u.email user_email, u.phone user_phone, u.country user_country FROM freight_requests f JOIN users u ON u.id = f.user_id ORDER BY f.id DESC'), admin);
route('PUT', '/api/admin/freight/:id', ({ params, body }) => {
  const statuses = ['novo', 'em_analise', 'cotado', 'fechado'];
  run('UPDATE freight_requests SET status = COALESCE(?, status), response = ? WHERE id = ?',
    statuses.includes(body.status) ? body.status : null, str(body.response, 5000), Number(params.id));
  return { ok: true };
}, admin);

// --- parceiros
route('GET', '/api/admin/partners', () => all('SELECT * FROM partners ORDER BY CASE status WHEN \'pendente\' THEN 0 ELSE 1 END, id DESC')
  .map((p) => ({ ...p, documents: all("SELECT id, name, mime, size FROM documents WHERE owner_type = 'partner' AND owner_id = ?", p.id) })), admin);
route('PUT', '/api/admin/partners/:id', ({ params, body }) => {
  const statuses = ['pendente', 'aprovado', 'recusado'];
  run('UPDATE partners SET status = COALESCE(?, status), admin_note = COALESCE(?, admin_note), listed = COALESCE(?, listed), services = COALESCE(?, services) WHERE id = ?',
    statuses.includes(body.status) ? body.status : null, str(body.admin_note, 2000), 'listed' in body ? bool(body.listed) : null,
    str(body.services, 1000), Number(params.id));
  return { ok: true };
}, admin);
route('DELETE', '/api/admin/partners/:id', ({ params }) => { run('DELETE FROM partners WHERE id = ?', Number(params.id)); return { ok: true }; }, admin);

// --- conversas
route('GET', '/api/admin/conversations', () => all(`SELECT c.*, u.name user_name, u.email user_email, u.plan user_plan,
  (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY id DESC LIMIT 1) last_body
  FROM conversations c JOIN users u ON u.id = c.user_id ORDER BY c.needs_human DESC, c.last_message_at DESC`), admin);
route('GET', '/api/admin/conversations/:id', ({ params, query }) => {
  const c = get('SELECT c.*, u.name user_name, u.email user_email, COALESCE(u.whatsapp, u.phone) user_phone, u.country user_country, u.lang user_lang FROM conversations c JOIN users u ON u.id = c.user_id WHERE c.id = ?', Number(params.id));
  if (!c) fail(404, 'Conversa não encontrada.');
  run('UPDATE conversations SET unread_admin = 0 WHERE id = ?', c.id);
  return { conversation: c, messages: all('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id', c.id, Number(query.after || 0)) };
}, admin);
route('POST', '/api/admin/conversations/:id', ({ params, body, user }) => {
  const c = get('SELECT * FROM conversations WHERE id = ?', Number(params.id));
  if (!c) fail(404, 'Conversa não encontrada.');
  const text = str(body.body, 4000);
  if (!text) fail(400, 'Mensagem vazia.');
  const m = addMessage(c.id, 'admin', text, user.name);
  notifyUser(get('SELECT * FROM users WHERE id = ?', c.user_id), `tem uma nova mensagem da equipa: "${text.slice(0, 120)}${text.length > 120 ? '…' : ''}"`);
  run('UPDATE conversations SET unread_user = unread_user + 1, unread_admin = 0, needs_human = ? WHERE id = ?', body.keep_open === false ? 0 : 1, c.id);
  return { message: m };
}, admin);
route('PUT', '/api/admin/conversations/:id', ({ params, body }) => {
  run('UPDATE conversations SET needs_human = ? WHERE id = ?', bool(body.needs_human), Number(params.id));
  return { ok: true };
}, admin);

// --- contentores partilhados: reservas
route('GET', '/api/admin/group_bookings', () => all(`SELECT b.*, g.title shipment_title, u.name user_name, u.email user_email, COALESCE(u.whatsapp, u.phone) user_phone, u.country user_country
  FROM group_bookings b JOIN group_shipments g ON g.id = b.shipment_id JOIN users u ON u.id = b.user_id ORDER BY b.id DESC`), admin);
route('PUT', '/api/admin/group_bookings/:id', ({ params, body }) => {
  const b = get('SELECT * FROM group_bookings WHERE id = ?', Number(params.id));
  if (!b) fail(404, 'Reserva não encontrada.');
  const st = ['pendente', 'confirmado', 'cancelado'].includes(body.status) ? body.status : b.status;
  run('UPDATE group_bookings SET status = ?, admin_note = ? WHERE id = ?', st, str(body.admin_note, 1000), b.id);
  if (st === 'confirmado' && b.status !== 'confirmado') notifyUser(get('SELECT * FROM users WHERE id = ?', b.user_id), `a sua reserva de ${b.cbm} m³ no contentor partilhado foi confirmada.`);
  return { ok: true };
}, admin);

// --- visitas virtuais
route('GET', '/api/admin/visits', () => all(`SELECT v.*, u.name user_name, u.email user_email, COALESCE(u.whatsapp, u.phone) user_phone, u.country user_country, s.public_title supplier_title, s.company_name supplier_company
  FROM visits v JOIN users u ON u.id = v.user_id LEFT JOIN suppliers s ON s.id = v.supplier_id ORDER BY CASE v.status WHEN 'pedido' THEN 0 ELSE 1 END, v.id DESC`), admin);
route('PUT', '/api/admin/visits/:id', ({ params, body }) => {
  const v = get('SELECT * FROM visits WHERE id = ?', Number(params.id));
  if (!v) fail(404, 'Visita não encontrada.');
  const st = ['pedido', 'marcado', 'feito', 'cancelado'].includes(body.status) ? body.status : v.status;
  run('UPDATE visits SET status = ?, scheduled_at = ?, admin_note = ? WHERE id = ?', st, str(body.scheduled_at, 60), str(body.admin_note, 1000), v.id);
  if (st === 'marcado' && (v.status !== 'marcado' || body.scheduled_at !== v.scheduled_at)) notifyUser(get('SELECT * FROM users WHERE id = ?', v.user_id), `a sua visita virtual está marcada para ${body.scheduled_at || 'breve'}.`);
  return { ok: true };
}, admin);

// --- utilizadores
route('GET', '/api/admin/users', () => all(`SELECT id, name, email, phone, whatsapp, notify_whatsapp, role, company, city, country, lang, plan, interests, travel_when, created_at,
  (SELECT COUNT(*) FROM quote_requests q WHERE q.user_id = users.id) quotes,
  (SELECT COUNT(*) FROM orders o WHERE o.user_id = users.id) orders FROM users ORDER BY id DESC`), admin);
route('PUT', '/api/admin/users/:id', ({ params, body, user }) => {
  const id = Number(params.id);
  if (id === user.id && body.role && body.role !== 'admin') fail(400, 'Não pode retirar a sua própria administração.');
  run('UPDATE users SET role = COALESCE(?, role), plan = COALESCE(?, plan) WHERE id = ?',
    ['client', 'admin'].includes(body.role) ? body.role : null, str(body.plan, 30), id);
  return { ok: true };
}, admin);
route('POST', '/api/admin/users', ({ body }) => {
  const email = str(body.email, 200)?.toLowerCase();
  if (!isEmail(email)) fail(400, 'Email inválido.');
  if (String(body.password || '').length < 8) fail(400, 'Palavra-passe com pelo menos 8 caracteres.');
  if (get('SELECT id FROM users WHERE email = ?', email)) fail(409, 'Já existe uma conta com este email.');
  const r = run('INSERT INTO users(name, email, password_hash, role) VALUES(?, ?, ?, ?)', str(body.name, 120) || email, email,
    hashPassword(String(body.password)), body.role === 'admin' ? 'admin' : 'client');
  return { id: r.lastInsertRowid };
}, admin);

// --- definições (câmbio)
route('GET', '/api/admin/settings', () => ({ rates: readRates() }), admin);
route('PUT', '/api/admin/settings', ({ body }) => {
  if (body.rates) {
    const r = body.rates;
    const out = { USD: 1, updated_at: new Date().toISOString().slice(0, 10), note: str(r.note, 200) };
    for (const c of Object.keys(CURRENCIES)) if (c !== 'USD' && num(r[c]) > 0) out[c] = num(r[c]);
    setSetting('rates', out);
  }
  return { ok: true };
}, admin);
