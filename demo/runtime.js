// Versão de demonstração da Ponte: o servidor verdadeiro (server/*.js) corre dentro do navegador,
// com a base de dados SQLite guardada no IndexedDB do telemóvel. A app e o painel usam-no
// através de um "fetch" interceptado. Tudo fica só neste aparelho.
import { Buffer } from 'buffer';
import { shared, initSqlite } from './shims/sqlite.js';
import { files, fsHooks } from './shims/fs.js';
import { COUNTRIES } from '../public/js/countries.js';

// ------------------------------------------------------------------ armazenamento (IndexedDB)
const IDB = 'ponte-demo', STORE = 'kv';
let idbP = null;
function idb() {
  if (!idbP) idbP = new Promise((ok, ko) => {
    try {
      const r = indexedDB.open(IDB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
    } catch (e) { ko(e); }
  });
  return idbP;
}
async function idbGet(k) {
  try { const d = await idb(); return await new Promise((ok) => { const q = d.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => ok(q.result ?? null); q.onerror = () => ok(null); }); } catch { return null; }
}
async function idbSet(k, v) {
  try { const d = await idb(); await new Promise((ok) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(v, k); tx.oncomplete = ok; tx.onerror = ok; }); } catch { /* sem armazenamento: fica em memória */ }
}
export async function resetDemo() {
  try { const d = await idb(); await new Promise((ok) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = ok; tx.onerror = ok; }); } catch { /* */ }
  try { localStorage.clear(); sessionStorage.clear(); } catch { /* */ }
}

let saveTimer = null;
function schedulePersist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const bytes = shared.db.export();
      shared.db.exec('PRAGMA foreign_keys = ON;'); // export() reabre a base de dados
      idbSet('db', bytes);
    } catch (e) { console.warn('demo: não foi possível guardar', e); }
  }, 500);
}

// ------------------------------------------------------------------ sessão (cookie) em localStorage
// Uma sessão para a app (cliente) e outra para o painel (equipa).
let COOKIE_KEY = 'ponte.demo.cookie.app';
let MODE = 'app';
export function setMode(m) { MODE = m; COOKIE_KEY = 'ponte.demo.cookie.' + m; }
const getCookie = () => { try { return localStorage.getItem(COOKIE_KEY) || ''; } catch { return ''; } };
function setCookie(header) {
  const first = String(header).split(';')[0];
  try { if (/Max-Age=0/i.test(header) || first.endsWith('=')) localStorage.removeItem(COOKIE_KEY); else localStorage.setItem(COOKIE_KEY, first); } catch { /* */ }
}

// ------------------------------------------------------------------ ponte para o servidor
let handleApi = null;
export function call(method, path, body, { cookie } = {}) {
  const url = new URL(path, 'http://ponte.demo');
  const raw = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  const headers = { cookie: cookie ?? getCookie(), 'content-type': raw ? 'application/json' : '', 'x-forwarded-for': 'demo', host: 'ponte.demo' };
  return new Promise((resolve) => {
    const res = {
      _h: {}, statusCode: 200, headersSent: false,
      setHeader(k, v) { this._h[k.toLowerCase()] = v; }, getHeader(k) { return this._h[k.toLowerCase()]; },
      writeHead(s, h) { this.statusCode = s; for (const [k, v] of Object.entries(h || {})) this._h[k.toLowerCase()] = v; return this; },
      end(b) { resolve({ status: this.statusCode, headers: this._h, body: b ?? '' }); },
    };
    const req = { method, headers, url: path, socket: { remoteAddress: 'demo' }, async *[Symbol.asyncIterator]() { if (raw) yield Buffer.from(raw); } };
    Promise.resolve(handleApi(req, res, url)).catch((e) => resolve({ status: 500, headers: {}, body: JSON.stringify({ error: String(e?.message || e) }) }));
  });
}
const json = async (method, path, body, opts) => {
  const r = await call(method, path, body, opts);
  if (opts?.keepCookie && r.headers['set-cookie']) opts.jar.v = String(r.headers['set-cookie']).split(';')[0];
  return { status: r.status, data: (() => { try { return JSON.parse(r.body); } catch { return r.body; } })() };
};

// ------------------------------------------------------------------ Claude (capacidade "sample"): fotografias e tradução
let samplePromise = null;
const sampleReady = () => {
  if (!samplePromise) samplePromise = Promise.resolve(globalThis.claude?.use ? globalThis.claude.use('sample') : null).catch(() => null);
  return Promise.race([samplePromise, new Promise((r) => setTimeout(() => r(null), 3000))]);
};

async function visionViaClaude(body) {
  const sample = await sampleReady();
  if (!sample) return { status: 501, data: { error: 'Reconhecimento de imagem indisponível nesta demonstração.' } };
  const { visionPrompt, sanitizeVision, extractJson } = await import('../server/vision.js');
  const blob = await (await fetchOrig(body.image)).blob();
  const country = COUNTRIES.find((c) => c.code === body.country)?.name || 'Moçambique';
  const styles = ['minimalista', 'clássico', 'vintage', 'gótico', 'avant-garde', 'moderno', 'industrial', 'rústico', 'escandinavo', 'luxo', 'desportivo', 'boho', 'oriental', 'africano'];
  try {
    const prompt = visionPrompt(body.lang || 'pt', styles, country) + (body.note ? `\n\nInformação do cliente: ${String(body.note).slice(0, 300)}` : '') + '\n\nA fotografia está em anexo.';
    const { text } = await sample(prompt, { images: [blob] });
    const result = sanitizeVision(extractJson(text));
    if (!result) return { status: 502, data: { error: 'Não foi possível interpretar a fotografia. Tente outra, com o objecto inteiro e boa luz.' } };
    // Artigos parecidos no catálogo (pelo próprio servidor da demonstração)
    const seen = new Map();
    for (const q of [result.name, ...(result.search_terms || [])].slice(0, 4)) {
      const r = await json('GET', '/api/catalog?q=' + encodeURIComponent(q));
      for (const p of r.data?.items || []) if (!seen.has(p.id)) seen.set(p.id, p);
    }
    return { status: 200, data: { result, similar: [...seen.values()].slice(0, 6) } };
  } catch (e) {
    if (e?.code === 'not_granted' || e?.code === 'images_unavailable') return { status: 501, data: { error: 'Autorize a Ponte a usar o Claude para identificar fotografias.' } };
    return { status: 502, data: { error: 'O reconhecimento não respondeu. Tente de novo.' } };
  }
}

async function translateViaClaude(body) {
  const sample = await sampleReady();
  if (!sample) return { status: 501, data: { error: 'Tradução automática indisponível nesta demonstração.' } };
  const names = { pt: 'português', en: 'inglês', es: 'espanhol', it: 'italiano', fr: 'francês', zh: 'chinês simplificado (mandarim)' };
  try {
    const { text } = await sample(`Traduz o texto seguinte para ${names[body.target] || 'chinês simplificado'}. É uma conversa de negócios entre um cliente lusófono e um fornecedor na China. Responde só com a tradução, sem aspas nem explicações.\n\n${String(body.text).slice(0, 1500)}`, { modelTier: 'quick' });
    return { status: 200, data: { text: text.trim(), provider: 'claude' } };
  } catch (e) {
    return { status: e?.code === 'not_granted' ? 501 : 502, data: { error: 'A tradução não respondeu. Tente de novo.' } };
  }
}

// ------------------------------------------------------------------ fetch interceptado
const fetchOrig = globalThis.fetch.bind(globalThis);
function patchFetch() {
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return fetchOrig(input, init);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body;
    let out;
    if (url === '/api/vision' && method === 'POST') out = await visionViaClaude(JSON.parse(body || '{}'));
    else if (url === '/api/translate' && method === 'POST') out = await translateViaClaude(JSON.parse(body || '{}'));
    if (out) return new Response(JSON.stringify(out.data), { status: out.status, headers: { 'Content-Type': 'application/json' } });
    const r = await call(method, url, body ?? undefined);
    if (r.headers['set-cookie']) setCookie(r.headers['set-cookie']);
    if (url === '/api/config' && r.status === 200) {
      const cfg = JSON.parse(r.body);
      const s = await sampleReady();
      cfg.vision = !!s; cfg.translate = s ? 'claude' : null; cfg.stt = false; cfg.demo = true;
      return new Response(JSON.stringify(cfg), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const ct = r.headers['content-type'] || 'application/json; charset=utf-8';
    return new Response(r.body instanceof Uint8Array || Buffer.isBuffer(r.body) ? new Uint8Array(r.body) : r.body, { status: r.status, headers: { 'Content-Type': ct } });
  };
}

// Imagens e documentos guardados no telemóvel: <img src="/api/documents/7"> → blob:
function watchDocuments() {
  const cache = new Map();
  const fix = async (el, attr) => {
    const v = el.getAttribute(attr);
    if (!v || !v.startsWith('/api/documents/')) return;
    el.setAttribute(attr, '');
    let u = cache.get(v);
    if (!u) {
      const r = await call('GET', v);
      if (r.status !== 200) return;
      u = URL.createObjectURL(new Blob([new Uint8Array(r.body)], { type: r.headers['content-type'] || 'application/octet-stream' }));
      cache.set(v, u);
    }
    el.setAttribute(attr, u);
  };
  const scan = (root) => {
    root.querySelectorAll?.('img[src^="/api/documents/"]').forEach((el) => fix(el, 'src'));
    root.querySelectorAll?.('a[href^="/api/documents/"]').forEach((el) => fix(el, 'href'));
  };
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && scan(n.parentNode || n)))).observe(document.body, { childList: true, subtree: true });
}

// ------------------------------------------------------------------ dados de demonstração
function guessCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const c = COUNTRIES.find((x) => x.tz === tz);
    if (c) return c.code;
    if (/^America\/(Sao_Paulo|Recife|Fortaleza|Bahia|Manaus|Belem|Cuiaba|Campo_Grande|Maceio)/.test(tz)) return 'BR';
  } catch { /* */ }
  return 'MZ';
}
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

export const DEMO = { client: { email: 'cliente@ponte.demo', password: 'demo1234' }, team: { email: 'equipa@ponte.demo', password: 'ponte2026' } };

async function seedDemo() {
  const country = guessCountry();
  const c = COUNTRIES.find((x) => x.code === country) || COUNTRIES[0];
  const port = { MZ: 'MPM', AO: 'AOLAD', BR: 'BRSSZ', CV: 'CVRAI', GW: 'GWOXB', PT: 'PTSIE', ST: 'STTMS', TL: 'TLDIL' }[c.code] || 'MPM';
  const admin = { v: '' }, client = { v: '' };
  await json('POST', '/api/auth/login', DEMO.team, { cookie: '', keepCookie: true, jar: admin });
  const A = (m, p, b) => json(m, p, b, { cookie: admin.v });
  await json('POST', '/api/auth/register', { name: 'Cliente Demonstração', email: DEMO.client.email, password: DEMO.client.password, country, phone: '' }, { cookie: '', keepCookie: true, jar: client });
  const C = (m, p, b) => json(m, p, b, { cookie: client.v });
  await C('PATCH', '/api/me', { interests: ['fornecedores', 'carga', 'feiras'], travel_when: 'semanas' });

  // Cotação com proposta pronta
  const q = await C('POST', '/api/quotes', { title: '300 cadeiras de escritório ergonómicas', quantity: '300 unidades', target_price: '35 USD por unidade', destination: c.cities[0], details: 'Pretas, com braços, base em nylon. Logótipo bordado.' });
  await A('PUT', `/api/admin/quotes/${q.data.id}`, { status: 'cotado', quoted_price: '31,50 USD por unidade (FOB Foshan)', response: 'Comparámos 3 fábricas em Foshan. Recomendamos a PNT-EX1: amostra em 5 dias, produção em 25 dias, garantia de 3 anos no mecanismo. Inclui logótipo bordado e embalagem individual.' });

  // Pedido a caminho, com rastreio
  const o = await A('POST', '/api/admin/orders', { user_email: DEMO.client.email, title: '50 × Relógio mecânico automático', route: `Guangzhou → ${c.name}` });
  for (const [step, note] of [[1, 'Três fábricas comparadas.'], [2, 'Amostra aprovada por vídeo.'], [3, 'Produção iniciada.'], [4, 'Inspecção: 50 de 50 verificados, fotos no pedido.']]) await A('PUT', `/api/admin/orders/${o.data.id}`, { status_step: step, event_note: note, total_usd: 2250, payment_plan: 'fases', deposit_pct: 30 });
  const sh = await A('POST', '/api/admin/shipments', { order_id: o.data.id, mode: 'mar', carrier: 'maersk', container_no: 'MSKU7654321', bl_no: 'MAEU123456789', vessel: 'Maersk Exemplo', voyage: '442W', origin_port: 'NSA', dest_port: port, etd: day(-9), eta: day(c.code === 'TL' ? 8 : 24), notify: false });
  for (const [code, p, d, note] of [['armazem', 'GZW', -15, 'Relógios recebidos: 50 unidades em 5 caixas.'], ['inspeccao', 'GZW', -13, 'Verificados 50 de 50.'], ['porto_origem', 'NSA', -11, null], ['partida', 'NSA', -9, 'Navio Maersk Exemplo, viagem 442W.']]) {
    await A('POST', `/api/admin/shipments/${sh.data.id}/events`, { code, port: p, happened_at: `${day(d)} 09:30:00`, note, notify: false });
  }

  // Equipamento com avaria e proposta de solução
  const eq = await C('POST', '/api/equipment', { name: 'Máquina de blocos semiautomática', brand: 'Exemplo', model: 'QT4-40', serial_no: 'QT440-2026-118', purchased_at: day(-80), warranty_months: 12, maint_interval_days: 90, voltage: '380 V · 15 kW', wear_parts: 'moldes, correias, rolamentos do vibrador', location: c.cities[0] });
  const tk = await C('POST', '/api/service', { kind: 'avaria', urgency: 'parada', equipment_id: eq.data.id, title: 'O vibrador não arranca', description: 'Desde ontem o motor do vibrador faz um zumbido e não roda. Já verifiquei os fusíveis.', error_code: 'E04' });
  await A('PUT', `/api/admin/service/${tk.data.id}`, { status: 'proposta', solution_type: 'peca', quote_usd: 68, note: 'Diagnóstico feito com o engenheiro da fábrica por videochamada.',
    solution: `A fábrica confirmou pelas fotos: o condensador de arranque do motor do vibrador queimou. Enviamos 2 condensadores (um de reserva) por courier: chegam em 5 a 7 dias. Um técnico parceiro faz a troca, ou a fábrica orienta por vídeo.` });

  // Mensagem de boas-vindas da Lara
  const chat = await C('GET', '/api/chat');
  const conv = (await A('GET', '/api/admin/conversations')).data?.find?.((x) => x.user_email === DEMO.client.email);
  if (conv) await A('POST', `/api/admin/conversations/${conv.id}`, { body: `Olá! Sou a Lara, da equipa Ponte em Guangzhou. Esta é uma demonstração: explore à vontade. A sua cotação das cadeiras já tem proposta, os relógios estão a caminho de ${c.capital} e a máquina de blocos tem uma solução à espera. 🇨🇳🤝${c.flag}` });
  void chat;
  try { localStorage.setItem('ponte.demo.cookie.app', client.v); localStorage.setItem('ponte.demo.cookie.admin', admin.v); localStorage.setItem('ponte.onboarded', '1'); localStorage.setItem('ponte.country', country); } catch { /* */ }
}

// ------------------------------------------------------------------ arranque
export async function boot() {
  const bytes = await idbGet('db');
  await initSqlite(bytes ? new Uint8Array(bytes) : null);
  const names = (await idbGet('files')) || [];
  for (const n of names) { const d = await idbGet('file:' + n); if (d) files.set(n, Buffer.from(d)); }
  fsHooks.onWrite = (n, d) => { if (!names.includes(n)) names.push(n); idbSet('files', names); idbSet('file:' + n, new Uint8Array(d)); };
  shared.onDirty = schedulePersist;
  const api = await import('../server/api.js');
  const seed = await import('../server/seed.js');
  handleApi = api.handleApi;
  seed.ensureSeed();
  if (!bytes) await seedDemo();
  // No painel, entra automaticamente com a conta da equipa de demonstração.
  if (MODE === 'admin' && !getCookie()) {
    const r = await call('POST', '/api/auth/login', JSON.stringify(DEMO.team), { cookie: '' });
    if (r.headers['set-cookie']) setCookie(r.headers['set-cookie']);
  }
  try { api.maintenanceSweep(); } catch { /* */ }
  schedulePersist();
  patchFetch();
  watchDocuments();
  sampleReady();
}
