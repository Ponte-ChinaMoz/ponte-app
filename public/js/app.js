// Núcleo da app: estado, navegação (router), barra inferior, instalação e modo offline.
import { h, icon, toast } from './ui.js';
import { t, setCountry } from './i18n.js';
import { get, post } from './api.js';
import * as Main from './screens/main.js';
import * as Trade from './screens/trade.js';
import * as Travel from './screens/travel.js';
import * as Chat from './screens/chat.js';
import * as Shop from './screens/shop.js';
import * as Go from './screens/go.js';
import * as Plus from './screens/plus.js';
import * as Vision from './screens/vision.js';
import * as Track from './screens/track.js';
import * as Service from './screens/service.js';
import { voiceCfg, watchDictation, voiceFab, pref } from './voice.js';

export const state = { user: null, config: {}, unread: 0, installEvent: null, cleanup: null };

const ROUTES = [
  ['/', Main.home],
  ['/welcome', Main.welcome, { tabs: false }],
  ['/start', Main.start, { tabs: false }],
  ['/login', Main.login, { tabs: false }],
  ['/register', Main.register, { tabs: false }],
  ['/explore', Main.explore],
  ['/search', Main.search],
  ['/profile', Main.profile],
  ['/settings', Main.settings],
  ['/chat', Chat.chat, { auth: true }],
  ['/map', Travel.map],
  ['/agenda', Travel.agenda],
  ['/guide', Travel.guide],
  ['/contacts', Travel.contacts],
  ['/tools', Travel.tools],
  ['/suppliers', Trade.suppliers],
  ['/supplier/:code', Trade.supplier],
  ['/product/:id', Shop.product],
  ['/catalog', Shop.catalog],
  ['/prefs', Shop.prefs],
  ['/cart', Shop.cartView],
  ['/checkout', Shop.checkout, { auth: true, tabs: false }],
  ['/translate', Go.translator],
  ['/travel', Go.trips],
  ['/favorites', Plus.favorites],
  ['/compare', Plus.compareView],
  ['/groups', Plus.groups],
  ['/visit', Plus.visit],
  ['/identify', Vision.identify],
  ['/track', Track.trackList],
  ['/track/:id', Track.trackDetail, { auth: true }],
  ['/t/:token', Track.trackPublic],
  ['/service', Service.serviceHome],
  ['/service/new', Service.serviceNew, { auth: true }],
  ['/service/:id', Service.serviceView, { auth: true }],
  ['/equipment/new', Service.equipmentForm, { auth: true }],
  ['/equipment/:id', Service.equipmentView, { auth: true }],
  ['/quote', Trade.quoteForm, { auth: true }],
  ['/quotes', Trade.quotes, { auth: true }],
  ['/orders', Trade.orders, { auth: true }],
  ['/order/:id', Trade.order, { auth: true }],
  ['/freight', Trade.freight],
  ['/partner', Trade.partner],
  ['/plans', Trade.plans],
  ['/pay/:plan', Trade.pay, { auth: true, tabs: false }],
  ['/promos', Trade.promos],
  ['/payments', Trade.payments, { auth: true }],
];

const TABS = [
  ['/', 'home', 'Início'], ['/explore', 'compass', 'Explorar'], ['/map', 'pin', 'Mapa'],
  ['/chat', 'chat', 'Chat'], ['/profile', 'user', 'Perfil'],
];
// A que separador pertence cada ecrã (para o destacar na barra).
const TAB_OF = {
  '/': '/', '/search': '/', '/map': '/map', '/chat': '/chat', '/profile': '/profile', '/settings': '/profile',
  '/quotes': '/profile', '/orders': '/profile', '/track': '/profile', '/service': '/profile', '/equipment': '/profile', '/order': '/profile', '/payments': '/profile', '/plans': '/profile',
};

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function match(path) {
  for (const [pattern, fn, opts = {}] of ROUTES) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    const m = path.match(re);
    if (m) return { fn, opts, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function go(hash) { location.hash = hash; }

export function requireLogin(next) {
  toast(t('Entre ou crie conta para continuar.'));
  go('#/login?next=' + encodeURIComponent(next || location.hash.slice(1)));
}

function renderTabs(path) {
  const active = TAB_OF[path] || TAB_OF['/' + path.split('/')[1]] || '/explore';
  const nav = h('nav', { 'aria-label': t('Navegação principal') }, TABS.map(([href, ic, label]) =>
    h('a', { href: '#' + href, class: 'tab' + (href === active ? ' on' : ''), 'aria-current': href === active ? 'page' : null },
      icon(ic, 24), t(label),
      href === '/chat' && state.unread ? h('span', { class: 'dot-badge' }, String(state.unread)) : null)));
  const bar = document.querySelector('.tabbar');
  bar.replaceChildren(nav);
}

let renderSeq = 0;
async function render() {
  const { path, query } = parseHash();
  let onboarded = false;
  try { onboarded = localStorage.getItem('ponte.onboarded') === '1'; } catch { /* ignorar */ }
  if (path === '/' && !onboarded && !state.user) return go('#/welcome');

  const m = match(path) || match('/');
  document.querySelectorAll('.sheet-back, .taxi').forEach((n) => n.remove());
  if (state.cleanup) { try { state.cleanup(); } catch { /* ignorar */ } state.cleanup = null; }
  if (m.opts.auth && !state.user) return requireLogin(path + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''));

  const seq = ++renderSeq;
  document.body.classList.toggle('hidden-tabs', m.opts.tabs === false);
  document.body.classList.toggle('no-fab', m.opts.tabs === false || ['/chat', '/translate', '/map', '/welcome', '/identify'].includes(path) || pref('ponte.voiceFab', '1') === '0');
  renderTabs(path);
  const root = document.getElementById('app');
  try {
    const el = await m.fn({ params: m.params, query, state });
    if (seq !== renderSeq) return; // o utilizador já navegou para outro ecrã
    root.replaceChildren(el);
    window.scrollTo(0, 0);
    const title = el.querySelector('h1');
    document.title = title ? `${title.textContent} · Ponte` : 'Ponte';
  } catch (e) {
    console.error(e);
    if (seq !== renderSeq) return;
    root.replaceChildren(h('div', { class: 'screen' },
      h('div', { class: 'empty' }, h('span', { class: 'ic red' }, icon('warn')),
        h('div', { class: 'h3' }, e.message === 'offline' ? t('Sem ligação à internet.') : t('Não foi possível abrir este ecrã.')),
        h('button', { class: 'btn outline', style: { marginTop: '14px' }, onclick: render }, t('Tentar de novo')))));
  }
  post('/events', { screen: path.split('/')[1] || 'inicio' }).catch(() => {});
}

export async function refreshUser() {
  try {
    const r = await get('/me');
    state.user = r.user;
    state.unread = r.unread || 0;
    if (r.user?.country) setCountry(r.user.country);
  } catch { /* offline: manter estado */ }
  renderTabs(parseHash().path);
}

export function rerender() { render(); }

async function boot() {
  document.body.appendChild(h('div', { class: 'tabbar' }));
  try { state.config = await get('/config'); } catch { state.config = {}; }
  voiceCfg.stt = !!state.config.stt;
  get('/rates').then((r) => { state.rates = r; }).catch(() => {});
  if (!globalThis.PONTE_NO_MIC) document.body.appendChild(voiceFab(go));
  watchDictation();
  await refreshUser();
  if (state.user?.lang) {
    const { setLang, lang } = await import('./i18n.js');
    if (lang() !== state.user.lang) setLang(state.user.lang);
  }
  window.addEventListener('hashchange', render);
  render();
  // Mensagens novas da equipa: verificar a cada minuto.
  setInterval(async () => {
    if (!state.user || document.hidden) return;
    const before = state.unread;
    await refreshUser();
    if (state.unread > before && parseHash().path !== '/chat') toast(t('Nova mensagem da equipa Ponte'));
  }, 60000);
}

// Instalar a app (Android/Chrome). No iPhone mostra-se a instrução "Adicionar ao ecrã principal".
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installEvent = e; });
window.addEventListener('appinstalled', () => { state.installEvent = null; toast(t('Ponte instalada no seu telefone.')); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

boot();
