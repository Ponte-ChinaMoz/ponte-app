// Pequena biblioteca de interface: criação segura de elementos, ícones, avisos e folhas.
import { t, lang, locale } from './i18n.js';

// h('div', { class: 'card', onclick }, 'texto', filho, ...) — texto é sempre inserido como texto (sem HTML).
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v; // usar só com conteúdo próprio (ícones)
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

// Substitui o conteúdo de um elemento (aceita listas, como h()).
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

const P = {
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  factory: '<path d="M3 21V10l6 4V10l6 4V6h6v15z"/>',
  truck: '<path d="M2 17h14V7H2zM16 11h4l2 3v3h-6"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4z"/><path d="M20 4h-7a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>',
  phone: '<path d="M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.2"/>',
  box: '<path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  shieldPlus: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 9v6M9 12h6"/>',
  mega: '<path d="M4 10v4l12 5V5z"/><path d="M16 9a3 3 0 0 1 0 6"/>',
  grid: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  fair: '<path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  send: '<path d="M4 12l16-8-6 16-2-7z"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  card: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  walk: '<circle cx="13" cy="4.5" r="1.5"/><path d="M11 8l-3 4 3 2v6M11 8l4 3h3M11 14l4 6"/>',
  car: '<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 16v3M20 16v3M7 13h2M15 13h2"/>',
  bus: '<path d="M6 4h12a2 2 0 0 1 2 2v11H4V6a2 2 0 0 1 2-2z"/><path d="M4 11h16M7 20v-3M17 20v-3"/>',
  bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3 7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  ship: '<path d="M3 15l2 5h14l2-5z"/><path d="M6 15V9h12v6M9 9V5h6v4"/><path d="M2 21c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1 2-1 4-1"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h8"/>',
  ruler: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="8"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  hotel: '<path d="M3 20V8h18v12M3 14h18M7 11h.01"/>',
  food: '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9"/>',
  health: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/>',
  train: '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 21l1.5-4M15 21l-1.5-4"/>',
  market: '<path d="M4 9l1-5h14l1 5M4 9v11h16V9M4 9h16M9 20v-6h6v6"/>',
  translate: '<path d="M4 5h8M8 3v2M6 5c0 4 3 7 6 8M10 5c0 3-3 7-6 8"/><path d="M13 21l4-10 4 10M14.5 18h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9H4z"/><path d="M4 7l11-3v3M16 13h.01"/>',
  install: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 7v7M9 11l3 3 3-3"/>',
  cart: '<path d="M3 4h2l2.4 11h11.2L21 8H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
  filter: '<path d="M4 5h16l-6 8v5l-4 2v-7z"/>',
  plane: '<path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  compare: '<rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="5" width="7" height="14" rx="1.5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>',
  whatsapp: '<path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c.5 2 2.5 4 4.5 4.5l1-1.2 1.8.9c-.3 1-1.2 1.6-2.2 1.4-3-.6-5.3-2.9-5.9-5.9-.2-1 .4-1.9 1.4-2.2l.9 1.8z"/>',
  admin: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 12l3-3 2 2 4-4"/>',
};

export function icon(name, size = 22, stroke = 1.9) {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${P[name] || P.info}</svg>`;
  return span;
}

export function logo(size = 34) {
  const span = document.createElement('span');
  span.style.display = 'inline-flex';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 34 34"><rect width="34" height="34" rx="10" fill="#0F5C48"/><path d="M6 23 Q17 6 28 23" fill="none" stroke="#E8B04B" stroke-width="2.6" stroke-linecap="round"/><path d="M6 23h22" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><path d="M11 23v-6M17 23v-8.5M23 23v-6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  return span;
}

let toastTimer;
export function toast(text) {
  document.querySelectorAll('.toast').forEach((n) => n.remove());
  const el = h('div', { class: 'toast', role: 'status' }, text);
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

export function sheet(...content) {
  const back = h('div', { class: 'sheet-back' });
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'grab' }), ...content);
  back.appendChild(box);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  const f = box.querySelector('button, a, input');
  if (f) f.focus({ preventScroll: true });
  return close;
}

export function topbar(title, { back = true, right = null } = {}) {
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn ghost', 'aria-label': t('Voltar'), onclick: () => (history.length > 1 ? history.back() : (location.hash = '#/')) }, icon('back')) : null,
    h('h1', { class: 'title' }, title),
    right);
}

export function empty(iconName, text, action) {
  return h('div', { class: 'empty' }, h('span', { class: 'ic grey' }, icon(iconName)), h('div', { class: 'small' }, text), action || null);
}

export function skeleton(n = 3, height = 90) {
  return h('div', { class: 'stack' }, Array.from({ length: n }, () => h('div', { class: 'skel', style: { minHeight: height + 'px' } })));
}

export function segmented(options, value, onChange) {
  return h('div', { class: 'seg', role: 'tablist' }, options.map(([v, label]) =>
    h('button', { class: v === value ? 'on' : '', role: 'tab', 'aria-selected': v === value ? 'true' : 'false', onclick: () => onChange(v) }, label)));
}

export function chips(options, value, onChange) {
  return h('div', { class: 'chip-row' }, options.map(([v, label]) =>
    h('button', { class: 'chip' + (v === value ? ' on' : ''), 'aria-pressed': v === value ? 'true' : 'false', onclick: () => onChange(v) }, label)));
}

export function field(label, input, hint) {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
}

export const LOCALES = { pt: 'pt-PT', en: 'en-GB', es: 'es-ES', it: 'it-IT', fr: 'fr-FR', zh: 'zh-CN' };

export function fmtDate(iso, opts = { day: 'numeric', month: 'short' }) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString(locale(), opts);
}

export function fmtRange(a, b, confirmed = true) {
  if (!a) return '';
  if (!confirmed) return fmtDate(a, { month: 'long', year: 'numeric' }) + ' · ' + t('datas a confirmar');
  if (!b || a === b) return fmtDate(a, { day: 'numeric', month: 'short', year: 'numeric' });
  return `${fmtDate(a)} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function fmtMoney(n, cur = 'USD') {
  if (n === null || n === undefined || isNaN(n)) return '';
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: n >= 100 ? 0 : 2 }).format(n) + ' ' + cur;
}

// Converte entre moedas com o câmbio da equipa (unidades por 1 USD).
export function convert(n, from, to, rates) {
  if (!rates || n === null || n === undefined) return null;
  const a = from === 'USD' ? 1 : rates[from]; const b = to === 'USD' ? 1 : rates[to];
  return a && b ? (n / a) * b : null;
}

export function priceLabel(p) {
  if (p.price_min && p.price_max && p.price_max !== p.price_min) return `${fmtMoney(p.price_min, '').trim()}–${fmtMoney(p.price_max, p.price_currency)}`;
  if (p.price_min) return t('desde {v}', { v: fmtMoney(p.price_min, p.price_currency) });
  return t('Preço sob consulta');
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve({ name: file.name, mime: file.type, data: r.result });
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(t('Copiado')); }
  catch { toast(text); }
}
