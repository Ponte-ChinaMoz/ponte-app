// Ecrãs principais: boas-vindas, personalização, conta, início, explorar, pesquisa, perfil e definições.
import { h, fill, icon, logo, toast, sheet, field, segmented, empty, fmtRange, fmtDate, priceLabel } from '../ui.js';
import { t, lang, setLang, LANGS, pick, country, countryInfo, setCountry, locale } from '../i18n.js';
import { COUNTRIES, OTHER, CURRENCIES, timeIn } from '../countries.js';
import { get, post, patch, del } from '../api.js';
import { state, go, refreshUser, rerender, requireLogin } from '../app.js';
import { trackCard } from './track.js';
import { equipmentCard } from './service.js';
import { listen, canListen, pref, setPref, readAloud, voiceCfg } from '../voice.js';

const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignorar */ } },
};
export { ls };

// Relógio duplo: hora em Guangzhou e na capital do país do utilizador.
function homeClock() {
  const c = countryInfo();
  const gz = timeIn('Asia/Shanghai', locale());
  return c.capital ? `Guangzhou ${gz} · ${c.flag} ${c.capital} ${timeIn(c.tz, locale())}` : `Guangzhou · 广州 ${gz}`;
}

// ------------------------------------------------------------------ boas-vindas
export function welcome() {
  return h('div', { class: 'welcome' },
    h('div', { class: 'row between' },
      h('div', { class: 'brand' }, logo(34), 'Ponte'),
      h('a', { class: 'btn sm light', href: '#/settings' }, icon('globe', 18), LANGS.find(([c]) => c === lang())[2])),
    h('div', { class: 'art', html: `<svg viewBox="0 0 334 300" width="100%" role="img" aria-label="Lusofonia – Guangzhou">
      <circle cx="78" cy="86" r="52" fill="#C23A2B"/><circle cx="262" cy="74" r="34" fill="#E8B04B"/>
      <path d="M0 236 Q167 30 334 236" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
      <path d="M0 236h334" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
      <path d="M56 236v-60M110 236v-100M167 236v-118M224 236v-100M278 236v-60" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>
      <path d="M20 270c40-14 80-14 120 0s80 14 120 0 50-10 74-6" fill="none" stroke="#7FB8A6" stroke-width="4" stroke-linecap="round"/>
      <text x="16" y="30" font-family="Manrope,sans-serif" font-size="13" font-weight="700" fill="#F3D9A4">LUSOFONIA</text>
      <text x="228" y="140" font-family="Manrope,sans-serif" font-size="13" font-weight="700" fill="#F3D9A4">GUANGZHOU</text></svg>` }),
    h('h1', { class: 'display', style: { fontSize: '36px', lineHeight: '1.03', letterSpacing: '-1px', marginTop: '8px' } }, t('A ponte da lusofonia para a China.')),
    h('p', { style: { color: '#D6E9E1', fontSize: '16px', margin: '14px 0 0' } }, t('Feita para quem fala português. Fornecedores verificados, feiras, carga e apoio local em Guangzhou, com uma equipa que fala a sua língua.')),
    h('div', { class: 'flags', 'aria-label': t('Países de língua portuguesa') }, COUNTRIES.map((c) => h('span', { title: c.name }, c.flag))),
    h('div', { class: 'stack', style: { marginTop: 'auto', paddingTop: '28px' } },
      h('a', { class: 'btn accent block', href: '#/start' }, t('Começar')),
      h('a', { class: 'btn light block', href: '#/login' }, t('Já tenho conta · Entrar'))));
}

// ------------------------------------------------------------------ personalizar
const GOALS = [
  ['feiras', 'fair', 'Visitar feiras'], ['fornecedores', 'factory', 'Encontrar fornecedores'],
  ['carga', 'truck', 'Importar e enviar carga'], ['negocios', 'card', 'Viagem de negócios'],
];
const WHENS = [['ja', 'Já estou na China'], ['semanas', 'Nas próximas semanas'], ['planear', 'Ainda estou a planear']];

export function start() {
  const sel = new Set(state.user?.interests?.length ? state.user.interests : ls.get('ponte.interests', ['feiras', 'fornecedores']));
  let when = state.user?.travel_when || ls.get('ponte.when', 'semanas');
  const root = h('div', { class: 'screen no-tabs' });

  let ctry = state.user?.country || country();
  const draw = () => {
    const countries = h('div', { class: 'country-grid' }, [...COUNTRIES, OTHER].map((c) => h('button', {
      class: 'country' + (c.code === ctry ? ' on' : ''), 'aria-pressed': c.code === ctry ? 'true' : 'false',
      onclick: () => { ctry = c.code; setCountry(c.code); draw(); } }, h('span', { class: 'flag' }, c.flag), h('span', {}, t(c.name)))));
    const goals = h('div', { class: 'grid2' }, GOALS.map(([id, ic, label]) => {
      const on = sel.has(id);
      return h('button', {
        class: 'plan' + (on ? ' on' : ''), style: { minHeight: '118px', padding: '14px', position: 'relative' }, 'aria-pressed': on ? 'true' : 'false',
        onclick: () => { on ? sel.delete(id) : sel.add(id); draw(); },
      }, h('span', { class: 'ic ' + (on ? 'glass' : 'green') }, icon(ic)), h('span', { class: 'h3', style: { fontWeight: 800 } }, t(label)),
      on ? h('span', { class: 'badge', style: { position: 'absolute', top: '12px', right: '12px', background: 'var(--gold)', color: 'var(--ink)' } }, icon('check', 12, 3.5)) : null);
    }));
    const whens = h('div', { class: 'stack' }, WHENS.map(([id, label]) => h('label', { class: 'card tight check', style: { borderColor: when === id ? 'var(--green)' : '', borderWidth: '2px' } },
      h('input', { type: 'radio', name: 'when', checked: when === id, onchange: () => { when = id; draw(); } }), t(label))));
    fill(root,
      h('div', { class: 'row between' },
        h('a', { class: 'icon-btn ghost', href: '#/welcome', 'aria-label': t('Voltar') }, icon('back')),
        h('a', { class: 'link', href: '#/', onclick: finish }, t('Saltar'))),
      h('div', {}, h('h1', { class: 'h1' }, t('De onde é?')),
        h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, t('A Ponte adapta a moeda, os portos, os pagamentos e a alfândega ao seu país.'))),
      countries,
      h('div', {}, h('h2', { class: 'h2' }, t('O que vem fazer à China?')),
        h('p', { class: 'muted small', style: { margin: '8px 0 0' } }, t('Escolha uma ou mais opções. A Ponte mostra primeiro o que lhe interessa.'))),
      goals,
      h('h2', { class: 'h2' }, t('Quando viaja?')),
      whens,
      h('button', { class: 'btn primary block', onclick: finish }, t('Continuar')));
  };
  async function finish(e) {
    e?.preventDefault();
    ls.set('ponte.interests', [...sel]); ls.set('ponte.when', when); ls.set('ponte.onboarded', 1);
    try { localStorage.setItem('ponte.onboarded', '1'); } catch { /* ignorar */ }
    setCountry(ctry);
    if (state.user) { try { await patch('/me', { interests: [...sel], travel_when: when, country: ctry }); await refreshUser(); } catch { /* ignorar */ } }
    go('#/');
  }
  draw();
  return root;
}

// ------------------------------------------------------------------ conta
function authForm(mode, query) {
  const err = h('div', { class: 'form-error', hidden: true });
  const name = h('input', { autocomplete: 'name', required: true });
  const email = h('input', { type: 'email', autocomplete: 'email', required: true, inputmode: 'email' });
  const phone = h('input', { type: 'tel', autocomplete: 'tel', placeholder: countryInfo().dial ? `+${countryInfo().dial} …` : '+…' });
  const pass = h('input', { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true, minlength: 8 });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, mode === 'login' ? t('Entrar') : t('Criar conta'));
  const form = h('form', { class: 'stack lg', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    err.hidden = true; btn.disabled = true;
    try {
      const body = mode === 'login'
        ? { email: email.value, password: pass.value }
        : { name: name.value, email: email.value, phone: phone.value, password: pass.value, lang: lang(), country: country(),
          interests: ls.get('ponte.interests', []), travel_when: ls.get('ponte.when', null) };
      await post(mode === 'login' ? '/auth/login' : '/auth/register', body);
      try { localStorage.setItem('ponte.onboarded', '1'); } catch { /* ignorar */ }
      await refreshUser();
      if (state.user?.lang && state.user.lang !== lang()) setLang(state.user.lang);
      if (state.user?.country) setCountry(state.user.country);
      toast(mode === 'login' ? t('Bem-vindo de volta!') : t('Conta criada. Bem-vindo à Ponte!'));
      go('#' + (query.next || '/'));
    } catch (ex) {
      err.textContent = ex.message === 'offline' ? t('Sem ligação à internet.') : ex.message;
      err.hidden = false;
    } finally { btn.disabled = false; }
  } },
  mode === 'register' ? field(t('Nome'), name) : null,
  field(t('Email'), email),
  mode === 'register' ? field(t('Telefone (opcional)'), phone) : null,
  field(t('Palavra-passe'), pass, mode === 'register' ? t('Pelo menos 8 caracteres.') : null),
  err, btn);
  return h('div', { class: 'screen no-tabs' },
    h('div', { class: 'row' }, h('button', { class: 'icon-btn ghost', 'aria-label': t('Voltar'), onclick: () => history.back() }, icon('back')), h('div', { class: 'brand' }, logo(30), 'Ponte')),
    h('h1', { class: 'h1' }, mode === 'login' ? t('Entrar na sua conta') : t('Criar a sua conta')),
    h('p', { class: 'muted small', style: { margin: 0 } }, mode === 'login' ? t('Aceda às suas cotações, pedidos e ao chat com a equipa.') : t('Grátis. Precisa de conta para pedir cotações e falar com a equipa Ponte.')),
    form,
    h('div', { class: 'center small' },
      mode === 'login'
        ? [t('Ainda não tem conta?'), ' ', h('a', { href: '#/register' + (query.next ? '?next=' + encodeURIComponent(query.next) : ''), class: 'link' }, t('Criar conta'))]
        : [t('Já tem conta?'), ' ', h('a', { href: '#/login' + (query.next ? '?next=' + encodeURIComponent(query.next) : ''), class: 'link' }, t('Entrar'))]),
    h('a', { href: '#/', class: 'link center', onclick: () => { try { localStorage.setItem('ponte.onboarded', '1'); } catch { /* ignorar */ } } }, t('Continuar sem conta')));
}
export const login = ({ query }) => authForm('login', query);
export const register = ({ query }) => authForm('register', query);

// ------------------------------------------------------------------ início
const STAGES = [
  { id: 'preparar', label: 'Preparar', title: 'Preparar a viagem', text: 'Visto, pagamentos e internet: reveja a checklist antes de partir.',
    a: [['Abrir checklist', '#/guide'], ['Ver feriados', '#/agenda?tab=feriados']] },
  { id: 'viajar', label: 'Viajar', title: 'Na China', text: 'Mapas com rotas, cartão para o taxista e contactos úteis sempre à mão.',
    a: [['Como chegar', '#/map'], ['Contactos úteis', '#/contacts']] },
  { id: 'comprar', label: 'Comprar', title: 'Encontrar e negociar', text: 'Compare fornecedores verificados e peça cotações à equipa Ponte.',
    a: [['Ver fornecedores', '#/suppliers'], ['Falar com a equipa', '#/chat']] },
  { id: 'enviar', label: 'Enviar', title: 'Enviar para o seu país', text: 'Contentor, grupagem ou aéreo, com despacho aduaneiro incluído.',
    a: [['Cotar frete', '#/freight'], ['Os meus pedidos', '#/orders']] },
];

function stageFromProfile() {
  const w = state.user?.travel_when || ls.get('ponte.when', 'semanas');
  return w === 'ja' ? 1 : 0;
}

export async function home() {
  const data = await get('/home');
  const progress = ls.get('ponte.stage', stageFromProfile());
  let sel = progress;
  const firstName = state.user?.name?.split(' ')[0];

  const stageCard = h('div');
  const journey = h('div', { class: 'journey' });
  const drawJourney = () => {
    fill(journey,
      h('div', { class: 'track' }), h('div', { class: 'fill', style: { width: `${(76 * progress) / 3}%` } }),
      STAGES.map((s, i) => h('button', {
        class: [i < progress ? 'done' : '', i === progress ? 'now' : '', i === sel ? 'sel' : ''].join(' '),
        'aria-pressed': i === sel ? 'true' : 'false', onclick: () => { sel = i; drawJourney(); },
      }, h('span', { class: 'dot' }, i < progress ? icon('check', 16, 3) : String(i + 1)), h('span', { class: 'lbl' }, t(s.label)))));
    const s = STAGES[sel];
    stageCard.replaceChildren(h('div', { class: 'card', style: { background: 'var(--bg)', border: 0 } },
      h('div', { class: 'kicker', style: { color: 'var(--gold-dk)' } },
        t('Etapa {n}', { n: sel + 1 }) + ' · ' + (sel < progress ? t('concluída') : sel === progress ? t('agora') : t('a seguir'))),
      h('div', { class: 'display', style: { fontSize: '20px', marginTop: '6px' } }, t(s.title)),
      h('div', { class: 'small', style: { color: 'var(--ink-2)', marginTop: '4px' } }, t(s.text)),
      h('div', { class: 'row', style: { marginTop: '12px', gap: '8px' } },
        h('a', { class: 'btn primary sm grow', href: s.a[0][1] }, t(s.a[0][0])),
        h('a', { class: 'btn outline sm grow', href: s.a[1][1] }, t(s.a[1][0]))),
      sel === progress && sel < 3 ? h('button', { class: 'link', onclick: () => { ls.set('ponte.stage', progress + 1); rerender(); } }, t('Marcar etapa como concluída')) : null));
  };
  drawJourney();

  const search = h('form', { class: 'search', role: 'search', 'data-novoice': '', onsubmit: (e) => { e.preventDefault(); const q = e.target.q.value.trim(); if (q) go('#/search?q=' + encodeURIComponent(q)); } },
    icon('search', 20), h('label', { class: 'sr', for: 'hq' }, t('Pergunte ou procure')),
    h('input', { id: 'hq', name: 'q', placeholder: t('Pergunte ou procure: cadeiras, hotel, feira…'), enterkeyhint: 'search' }),
    h('a', { class: 'icon-btn', href: '#/identify', style: { border: 0, background: 'var(--green-tint)', color: 'var(--green)' }, 'aria-label': t('Identificar por fotografia') }, icon('camera', 18, 2)),
    voiceButton((text) => go('#/search?q=' + encodeURIComponent(text))));

  const fair = data.nextFair;
  const alert = data.springFestival;
  const install = installBanner();

  return h('div', { class: 'screen' },
    h('div', { class: 'row' },
      logo(34),
      h('div', { class: 'grow' }, h('div', { class: 'xs muted', style: { fontWeight: 600 } }, homeClock()),
        h('div', { class: 'display', style: { fontSize: '22px', lineHeight: 1.1 } }, firstName ? t('Olá, {n}', { n: firstName }) : t('Olá!'))),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': t('Idioma e definições') }, icon('globe', 20)),
      state.user
        ? h('a', { class: 'icon-btn', href: '#/chat', 'aria-label': t('Mensagens') }, icon('bell', 20), state.unread ? h('span', { class: 'dot-badge' }, String(state.unread)) : null)
        : h('a', { class: 'btn sm outline', href: '#/login' }, t('Entrar'))),
    search,
    h('div', { class: 'grid3', style: { gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' } },
      [['#/identify', 'camera', 'Foto'], ['#/translate', 'translate', 'Tradutor'], ['#/travel', 'plane', 'Voos'], ['#/cart', 'cart', 'Cesto']].map(([href, ic, label]) =>
        h('a', { href, class: 'card tight', style: { textDecoration: 'none', color: 'var(--ink)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', padding: '12px 4px' } },
          h('span', { class: 'ic sm green' }, icon(ic, 18)), h('span', { class: 'xs', style: { fontWeight: 700 } }, t(label))))),
    install,
    data.maintenanceDue ? h('div', { class: 'stack' }, h('div', { class: 'row between' }, h('h2', { class: 'h2' }, t('Manutenção')), h('a', { class: 'link', href: '#/service' }, t('Assistência'))), equipmentCard(data.maintenanceDue)) : null,
    data.tracking ? h('div', { class: 'stack' }, h('div', { class: 'row between' }, h('h2', { class: 'h2' }, t('A sua encomenda')), h('a', { class: 'link', href: '#/track' }, t('Ver todas'))), trackCard(data.tracking))
    : data.activeOrder ? h('a', { class: 'card green', href: `#/order/${data.activeOrder.id}`, style: { textDecoration: 'none' } },
      h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Pedido em curso') + ' · ' + data.activeOrder.code),
      h('div', { class: 'h3', style: { marginTop: '4px' } }, data.activeOrder.title),
      h('div', { class: 'small', style: { color: '#D6E9E1' } }, t(ORDER_STEP_LABELS[data.activeOrder.status_step]))) : null,
    h('div', { class: 'card stack lg' },
      h('div', { class: 'row between' }, h('h2', { class: 'h2' }, t('A sua viagem')), h('span', { class: 'xs muted', style: { fontWeight: 700 } }, t('Toque numa etapa'))),
      journey, stageCard),
    h('div', {},
      h('h2', { class: 'h2', style: { marginBottom: '12px' } }, t('O que quer fazer?')),
      h('div', { class: 'grid2' },
        bigAction('#/chat', 'chat', 'Falar com a equipa', 'Resposta imediata', true),
        bigAction('#/catalog', 'factory', 'Comprar artigos', 'Catálogo com filtros'),
        bigAction('#/freight', 'truck', 'Enviar carga', 'Frete e despacho'),
        bigAction('#/agenda', 'calendar', 'Agenda China', 'Feiras, feriados, saldos')),
      h('a', { class: 'btn ghost block', href: '#/explore' }, t('Ver todos os serviços'), icon('arrow', 16, 2.2))),
    alert ? h('a', { class: 'card gold row', href: '#/agenda?tab=feriados', style: { textDecoration: 'none', color: 'var(--ink)' } },
      h('span', { class: 'ic', style: { background: 'var(--gold)' } }, icon('warn', 20)),
      h('span', { class: 'grow small' }, h('strong', {}, t('{n} a {d}.', { n: pick(alert, 'name'), d: fmtDate(alert.start_date, { day: 'numeric', month: 'long' }) })), ' ',
        t('As fábricas param semanas: feche encomendas a tempo.')),
      icon('chevron', 16, 2.2)) : null,
    h('div', {},
      h('h2', { class: 'h2', style: { marginBottom: '12px' } }, t('Para si')),
      h('div', { class: 'hscroll' },
        fair ? h('a', { class: 'card dark', href: '#/agenda?tab=feiras', style: { minHeight: '150px' } },
          h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Próxima feira')),
          h('div', { class: 'display', style: { fontSize: '19px', margin: '6px 0' } }, fair.name),
          h('div', { class: 'small', style: { color: '#BFCBC5' } }, fmtRange(fair.start_date, fair.end_date, !!fair.confirmed))) : null,
        data.sponsored.map((p) => h('a', { class: 'card red', href: '#/promos', style: { minHeight: '150px' } },
          h('div', { class: 'kicker', style: { color: 'var(--red-tint)' } }, t('Patrocinado')),
          h('div', { class: 'display', style: { fontSize: '19px', margin: '6px 0' } }, p.title),
          h('div', { class: 'small', style: { color: 'var(--red-tint)' } }, p.partner_name || ''))),
        data.featured.map((p) => h('a', { class: 'card', href: `#/product/${p.id}`, style: { minHeight: '150px' } },
          h('div', { class: 'kicker', style: { color: 'var(--green)' } }, t('No showroom')),
          h('div', { class: 'display', style: { fontSize: '19px', margin: '6px 0' } }, p.name),
          h('div', { class: 'small muted' }, priceLabel(p)))))));
}

export const ORDER_STEP_LABELS = ['Pedido recebido', 'Cotações', 'Amostra aprovada', 'Em produção', 'Inspecção de qualidade', 'Embarque', 'Chegada ao destino'];

function bigAction(href, ic, title, desc, primary) {
  return h('a', { class: 'big-action' + (primary ? ' green' : ''), href },
    h('span', { class: 'ic ' + (primary ? 'glass' : ic === 'factory' ? 'red' : ic === 'truck' ? 'gold' : 'green') }, icon(ic)),
    h('span', {}, h('span', { class: 't', style: { display: 'block' } }, t(title)), h('span', { class: 'd', style: { display: 'block' } }, t(desc))));
}

export function voiceButton(onText) {
  if (!canListen()) return null;
  return h('button', { type: 'button', class: 'icon-btn', style: { border: 0, background: 'var(--green-tint)', color: 'var(--green)' }, 'aria-label': t('Pesquisar por voz'),
    onclick: async () => { const text = await listen({ title: t('Pesquisar por voz') }); if (text) onText(text); } }, icon('mic', 18, 2));
}

function isIos() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone; }

export function installBanner(force) {
  if (isStandalone()) return null;
  if (!force && ls.get('ponte.installDismissed', 0) > Date.now() - 7 * 864e5) return null;
  if (!state.installEvent && !isIos() && !force) return null;
  const box = h('div', { class: 'install' },
    h('span', { class: 'ic glass' }, icon('install')),
    h('span', { class: 'grow small' }, h('strong', {}, t('Instale a Ponte no telefone')), h('br'), t('Abre como uma app, mesmo com pouca rede.')),
    h('button', { class: 'btn accent sm', onclick: async () => {
      if (state.installEvent) { state.installEvent.prompt(); await state.installEvent.userChoice; state.installEvent = null; box.remove(); }
      else sheet(h('div', { class: 'stack lg' }, h('h2', { class: 'h2' }, t('Instalar no iPhone')),
        h('ol', { class: 'small', style: { paddingLeft: '18px', margin: 0, lineHeight: 1.8 } },
          h('li', {}, t('Abra este site no Safari.')),
          h('li', {}, t('Toque no botão Partilhar (quadrado com seta para cima).')),
          h('li', {}, t('Escolha "Adicionar ao ecrã principal".'))),
        h('p', { class: 'small muted', style: { margin: 0 } }, t('No Android, use o menu do Chrome (⋮) → "Instalar app" ou "Adicionar ao ecrã principal".'))));
    } }, t('Instalar')),
    force ? null : h('button', { class: 'icon-btn ghost', style: { color: '#fff', marginLeft: '-6px' }, 'aria-label': t('Fechar'), onclick: () => { ls.set('ponte.installDismissed', Date.now()); box.remove(); } }, icon('x', 18)));
  return box;
}

// ------------------------------------------------------------------ explorar
export const EXPLORE = [
  ['preparar', 'Preparar a viagem', 'Antes de partir', 'green', [
    ['Guia de estadia', 'Checklist, bairros, comer bem', '#/guide', 'book'],
    ['Voos e transportes', 'Bilhetes de avião e comboio, transfers', '#/travel', 'plane'],
    ['Agenda China', 'Feriados, feiras e saldos', '#/agenda', 'calendar'],
    ['Ferramentas', 'Custo de importação, câmbio, frases', '#/tools', 'calc'],
    ['País, idioma e moeda', 'Moçambique, Angola, Brasil, Cabo Verde, Guiné-Bissau, Portugal, São Tomé, Timor', '#/settings', 'globe']]],
  ['china', 'Na China', 'Durante a estadia', 'gold', [
    ['Tradutor para mandarim', 'Escreva ou fale; mostre à outra pessoa', '#/translate', 'translate'],
    ['Mapa e rotas', 'A pé, carro, metro, autocarro', '#/map', 'pin'],
    ['Feiras', 'Canton Fair, CIFF e outras', '#/agenda?tab=feiras', 'fair'],
    ['Contactos úteis', 'Emergência, saúde, apps essenciais', '#/contacts', 'phone']]],
  ['comprar', 'Comprar', 'Fornecedores e ofertas', 'red', [
    ['Fornecedores verificados', 'Visitados pela equipa Ponte', '#/suppliers', 'factory'],
    ['Catálogo com filtros', 'Estilo, preço, qualidade, materiais…', '#/catalog', 'filter'],
    ['O meu estilo', 'Artigos escolhidos para o seu perfil', '#/prefs', 'star'],
    ['Cesto de compras', 'Compra online com entrega', '#/cart', 'cart'],
    ['Identificar por fotografia', 'O que é, medidas, capacidade, materiais e opções', '#/identify', 'camera'],
    ['Favoritos e comparar', 'Compare até 3 artigos lado a lado', '#/favorites', 'heart'],
    ['Visita virtual', 'Veja a fábrica ou a feira em directo', '#/visit', 'video'],
    ['Promoções', 'Hotéis, transporte, amostras', '#/promos', 'tag']]],
  ['enviar', 'Enviar para o seu país', 'Carga e alfândega', 'grey', [
    ['Contentor partilhado', 'Pague só os m³ que usa', '#/groups', 'box'],
    ['Despacho e carga', 'Frete marítimo, aéreo, courier', '#/freight', 'truck'],
    ['Rastrear encomendas', 'Mapa, data de chegada e atrasos', '#/track', 'ship'],
    ['Os meus pedidos', 'Da fábrica ao porto', '#/orders', 'box'],
    ['As minhas cotações', 'Propostas da equipa Ponte', '#/quotes', 'doc']]],
  ['pos', 'Depois da compra', 'Assistência, peças e manutenção', 'red', [
    ['Assistência técnica', 'Avarias resolvidas com a fábrica, em chinês', '#/service', 'tool'],
    ['Peças sobresselentes', 'Pela referência ou por fotografia', '#/service/new?kind=pecas', 'gear'],
    ['Os meus equipamentos', 'Garantia, manuais e manutenção', '#/service', 'shield'],
    ['Técnicos no seu país', 'Parceiros verificados pela Ponte', '#/service', 'user']]],
  ['ajuda', 'Ajuda e negócios', 'Equipa Ponte e parceiros', 'green', [
    ['Falar com a equipa', 'Assistente automático e chat', '#/chat', 'chat'],
    ['Ser parceiro', 'Despachantes, transitários, fábricas', '#/partner', 'shieldPlus'],
    ['Anunciar na Ponte', 'Chegue a importadores', '#/partner?type=anunciante', 'mega'],
    ['Planos', 'Explorador, Viajante, Negócios', '#/plans', 'star']]],
];

export function explore() {
  const sections = EXPLORE.map(([id, title, sub, color, rows], i) => h('section', { id: 'sec-' + id, class: 'card', style: { padding: '16px 16px 6px' } },
    h('div', { class: 'row', style: { marginBottom: '4px' } },
      h('span', { class: 'ic sm', style: { background: color === 'gold' ? 'var(--gold-dk)' : color === 'red' ? 'var(--red-dk)' : color === 'grey' ? 'var(--ink)' : 'var(--green)', color: '#fff', fontWeight: 800 } }, String(i + 1)),
      h('div', {}, h('h2', { class: 'h2' }, t(title)), h('div', { class: 'xs muted' }, t(sub)))),
    rows.map(([rt, rd, href, ic]) => h('a', { class: 'list-item', href },
      h('span', { class: 'ic ' + color }, icon(ic, 20)),
      h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, t(rt)), h('span', { class: 'd', style: { display: 'block' } }, t(rd))),
      h('span', { class: 'chev' }, icon('chevron', 16, 2.2))))));
  return h('div', { class: 'screen' },
    h('div', {}, h('h1', { class: 'h1' }, t('Explorar')), h('p', { class: 'muted small', style: { margin: '4px 0 0' } }, t('Todos os serviços, organizados pelas etapas da viagem.'))),
    h('div', { class: 'chip-row' }, EXPLORE.map(([id, title]) => h('button', { class: 'chip', onclick: () => document.getElementById('sec-' + id).scrollIntoView({ behavior: 'smooth', block: 'start' }) }, t(title)))),
    sections);
}

// ------------------------------------------------------------------ pesquisa
export async function search({ query }) {
  const q = query.q || '';
  const input = h('input', { name: 'q', value: q, placeholder: t('Procurar'), enterkeyhint: 'search', 'aria-label': t('Procurar') });
  const form = h('form', { class: 'search soft', role: 'search', 'data-novoice': '', onsubmit: (e) => { e.preventDefault(); go('#/search?q=' + encodeURIComponent(input.value.trim())); } },
    icon('search', 20), input, voiceButton((text) => go('#/search?q=' + encodeURIComponent(text))));
  const screen = h('div', { class: 'screen' }, h('div', { class: 'topbar' }, h('button', { class: 'icon-btn ghost', 'aria-label': t('Voltar'), onclick: () => history.back() }, icon('back')), h('h1', { class: 'title' }, t('Pesquisa'))), form);
  if (!q) return screen;
  const r = await get('/search?q=' + encodeURIComponent(q));
  const total = r.products.length + r.suppliers.length + r.fairs.length + r.places.length + r.faq.length;
  if (!total) {
    screen.append(empty('search', t('Sem resultados para "{q}".', { q })),
      h('a', { class: 'btn primary block', href: '#/quote?title=' + encodeURIComponent(q) }, t('Pedir à equipa Ponte que encontre')),
      h('p', { class: 'xs muted center', style: { margin: 0 } }, t('A equipa procura fornecedores para si, mesmo que ainda não estejam na app.')));
    return screen;
  }
  const group = (title, items) => (items.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, title), h('div', { class: 'list' }, items)) : null);
  const row = (href, ic, tt, d) => h('a', { class: 'list-item', href }, h('span', { class: 'ic green' }, icon(ic, 20)),
    h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, tt), d ? h('span', { class: 'd', style: { display: 'block' } }, d) : null), h('span', { class: 'chev' }, icon('chevron', 16)));
  r.faq.forEach((f) => screen.append(h('div', { class: 'card' }, h('div', { class: 'kicker', style: { color: 'var(--green)' } }, t('Resposta rápida')),
    h('div', { class: 'h3', style: { margin: '4px 0' } }, f.question), h('div', { class: 'small pre' }, f.answer))));
  screen.append(
    group(t('Produtos'), r.products.map((p) => row(`#/product/${p.id}`, 'grid', p.name, `${p.category} · ${priceLabel(p)}`))),
    group(t('Fornecedores'), r.suppliers.map((s) => row(`#/supplier/${s.code}`, 'factory', s.title, `${s.category} · ${s.city || ''}`))),
    group(t('Feiras'), r.fairs.map((f) => row('#/agenda?tab=feiras', 'fair', f.name, fmtRange(f.start_date, f.end_date, !!f.confirmed)))),
    group(t('Locais'), r.places.map((p) => row(`#/map?place=${p.id}`, 'pin', p.name, p.city))),
    h('a', { class: 'btn outline block', href: '#/quote?title=' + encodeURIComponent(q) }, t('Não encontrou? Peça à equipa Ponte')));
  return screen;
}

// ------------------------------------------------------------------ perfil
export async function profile() {
  if (!state.user) {
    return h('div', { class: 'screen' }, h('h1', { class: 'h1' }, t('Perfil')),
      h('div', { class: 'card green stack lg' }, h('div', { class: 'display', style: { fontSize: '22px' } }, t('Crie a sua conta Ponte')),
        h('div', { class: 'small', style: { color: '#D6E9E1' } }, t('Peça cotações, acompanhe encomendas e fale com a equipa em Guangzhou.')),
        h('a', { class: 'btn accent block', href: '#/register' }, t('Criar conta grátis')),
        h('a', { class: 'btn light block', href: '#/login' }, t('Entrar'))),
      settingsList(), h('div', { class: 'list' }, listLink('#/partner', 'shieldPlus', 'Ser parceiro'), listLink('#/plans', 'star', 'Planos')));
  }
  const u = state.user;
  const [orders, quotes, plans] = await Promise.all([get('/orders'), get('/quotes'), get('/plans')]);
  const plan = plans.find((p) => p.id === u.plan);
  const initials = u.name.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  const stat = (href, n, label) => h('a', { class: 'card tight', href, style: { flex: 1, textDecoration: 'none', color: 'inherit' } },
    h('div', { class: 'display', style: { fontSize: '24px' } }, String(n)), h('div', { class: 'xs muted', style: { fontWeight: 600 } }, t(label)));
  return h('div', { class: 'screen' },
    h('h1', { class: 'h1' }, t('Perfil')),
    h('div', { class: 'card green stack lg' },
      h('div', { class: 'row' },
        h('span', { style: { width: '58px', height: '58px', borderRadius: '29px', background: 'var(--gold)', color: 'var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--display)', fontWeight: 800, fontSize: '20px' } }, initials),
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: 800, fontSize: '18px' } }, u.name), h('div', { class: 'small', style: { color: '#BFDCD0' } }, u.email))),
      h('div', { class: 'row between', style: { background: 'rgba(255,255,255,.12)', borderRadius: '16px', padding: '12px 14px' } },
        h('div', {}, h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Plano actual')), h('div', { style: { fontWeight: 800, fontSize: '16px' } }, plan ? plan.name : u.plan)),
        h('a', { class: 'btn sm', href: '#/plans', style: { background: '#fff', color: 'var(--green)' } }, t('Mudar de plano')))),
    h('div', { class: 'row', style: { gap: '8px' } },
      stat('#/orders', orders.filter((o) => o.status_step < 6).length, 'pedidos activos'),
      stat('#/quotes', quotes.filter((q) => ['novo', 'em_analise', 'cotado'].includes(q.status)).length, 'cotações abertas'),
      stat('#/chat', state.unread, 'mensagens novas')),
    h('div', { class: 'list' },
      listLink('#/track', 'ship', 'Rastrear encomendas'), listLink('#/service', 'tool', 'Assistência e equipamentos'), listLink('#/orders', 'box', 'Os meus pedidos'), listLink('#/quotes', 'doc', 'As minhas cotações'),
      listLink('#/freight', 'truck', 'Pedidos de carga'), listLink('#/payments', 'card', 'Pagamentos e recibos'),
      listLink('#/cart', 'cart', 'Cesto de compras'), listLink('#/favorites', 'heart', 'Favoritos'), listLink('#/groups', 'box', 'Contentor partilhado'),
      listLink('#/visit', 'video', 'Visitas virtuais'), listLink('#/prefs', 'star', 'O meu estilo'),
      listLink('#/start', 'compass', 'Os meus interesses')),
    settingsList(),
    h('div', { class: 'list' }, listLink('#/partner', 'shieldPlus', 'Ser parceiro'), listLink('#/partner?type=anunciante', 'mega', 'Anunciar na Ponte'),
      u.role === 'admin' ? h('a', { class: 'list-item', href: '/admin' }, h('span', { class: 'ic gold' }, icon('admin', 20)), h('span', { class: 'grow t' }, t('Painel de gestão')), h('span', { class: 'chev' }, icon('chevron', 16))) : null),
    h('button', { class: 'btn ghost block', style: { color: 'var(--red-dk)' }, onclick: async () => { await post('/auth/logout'); state.user = null; state.unread = 0; toast(t('Sessão terminada.')); go('#/'); } }, icon('logout', 18), t('Terminar sessão')));
}

function listLink(href, ic, label, value) {
  return h('a', { class: 'list-item', href }, h('span', { class: 'ic sm grey', style: { color: 'var(--green)' } }, icon(ic, 19)),
    h('span', { class: 'grow t' }, t(label)), value ? h('span', { class: 'small muted' }, value) : null, h('span', { class: 'chev' }, icon('chevron', 16)));
}

function settingsList() {
  return h('div', { class: 'list' },
    listLink('#/settings', 'globe', 'País, idioma e moeda', `${countryInfo().flag} ${LANGS.find(([c]) => c === lang())[2]} · ${state.user?.currency || ls.get('ponte.currency', countryInfo().currency)}`),
    listLink('#/contacts', 'phone', 'Contactos de emergência', '110 · 120 · 119'));
}

// ------------------------------------------------------------------ definições
export function settings() {
  const currencies = [...new Set([countryInfo().currency, 'USD', 'EUR', 'CNY', ...Object.keys(CURRENCIES)])];
  let cur = state.user?.currency || ls.get('ponte.currency', countryInfo().currency);
  const preview = {
    pt: 'A sua ponte para fazer negócios na China.', en: 'Your bridge to doing business in China.', es: 'Tu puente para hacer negocios en China.',
    it: 'Il tuo ponte per fare affari in Cina.', fr: 'Votre pont pour faire des affaires en Chine.', zh: '您在中国开展业务的桥梁。',
  };
  const notifOk = 'Notification' in window && Notification.permission === 'granted';
  return h('div', { class: 'screen' },
    h('div', { class: 'topbar' }, h('button', { class: 'icon-btn ghost', 'aria-label': t('Voltar'), onclick: () => history.back() }, icon('back')), h('h1', { class: 'title' }, t('Idioma e definições'))),
    h('div', { class: 'card green' }, h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Pré-visualização')),
      h('div', { class: 'display', style: { fontSize: '22px', marginTop: '6px' } }, preview[lang()]),
      h('div', { class: 'small', style: { color: '#D6E9E1', marginTop: '6px' } }, t('O assistente também responde no idioma escolhido.'))),
    h('div', { class: 'list', role: 'radiogroup', 'aria-label': t('Idioma') }, LANGS.map(([code, name, short]) => h('button', {
      class: 'list-item', role: 'radio', 'aria-checked': code === lang() ? 'true' : 'false',
      onclick: async () => {
        setLang(code);
        if (state.user) { try { await patch('/me', { lang: code }); await refreshUser(); } catch { /* ignorar */ } }
        rerender();
      } },
    h('span', { class: 'ic sm grey', style: { fontWeight: 800, fontSize: '12px' } }, short),
    h('span', { class: 'grow t' }, name),
    h('span', { style: { width: '22px', height: '22px', borderRadius: '11px', border: code === lang() ? '7px solid var(--green)' : '2px solid #9AA8A1' } })))),
    h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('O seu país')),
      h('p', { class: 'small muted', style: { margin: 0 } }, t('Adapta a moeda, os portos de destino, os pagamentos, a alfândega e o português do Brasil.')),
      h('div', { class: 'country-grid' }, [...COUNTRIES, OTHER].map((c) => h('button', { class: 'country' + (c.code === country() ? ' on' : ''), onclick: async () => {
        setCountry(c.code); ls.set('ponte.currency', c.currency);
        if (state.user) { try { await patch('/me', { country: c.code }); await refreshUser(); } catch { /* ignorar */ } }
        toast(t('País: {p}', { p: t(c.name) })); rerender();
      } }, h('span', { class: 'flag' }, c.flag), h('span', {}, t(c.name)))))),
    h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Moeda de referência')),
      h('div', { class: 'row wrap', style: { gap: '6px' } }, currencies.map((c) => h('button', { class: 'chip' + (c === cur ? ' on' : ''), onclick: async () => {
        cur = c; ls.set('ponte.currency', c);
        if (state.user) { try { await patch('/me', { currency: c }); await refreshUser(); } catch { /* ignorar */ } }
        rerender();
      } }, c)))),
    h('div', { class: 'card stack' },
      h('h2', { class: 'h2' }, t('Notificações')),
      h('p', { class: 'small muted', style: { margin: 0 } }, t('Avisos de mensagens da equipa, feiras e feriados.')),
      notifOk ? h('span', { class: 'badge green' }, icon('check', 12, 3), t('Activadas'))
        : h('button', { class: 'btn outline', onclick: async () => {
          if (!('Notification' in window)) return toast(t('Este telefone não suporta notificações no navegador.'));
          const p = await Notification.requestPermission();
          toast(p === 'granted' ? t('Notificações activadas.') : t('Notificações não autorizadas.'));
          rerender();
        } }, icon('bell', 18), t('Activar notificações'))),
    voiceCard(),
    state.user ? whatsappCard() : null,
    installBanner(true),
    state.user ? h('button', { class: 'btn ghost', style: { color: 'var(--red-dk)' }, onclick: () => {
      const close = sheet(h('div', { class: 'stack lg' }, h('h2', { class: 'h2' }, t('Apagar a sua conta?')),
        h('p', { class: 'small', style: { margin: 0 } }, t('Apaga a conta, as cotações, os pedidos e as mensagens. Não pode ser desfeito.')),
        h('button', { class: 'btn danger block', onclick: async () => { await del('/me'); state.user = null; close(); toast(t('Conta apagada.')); go('#/welcome'); } }, t('Apagar definitivamente')),
        h('button', { class: 'btn ghost block', onclick: () => close() }, t('Cancelar'))));
    } }, icon('trash', 18), t('Apagar a minha conta')) : null,
    h('p', { class: 'xs muted center', style: { margin: 0 } }, 'Ponte · v1.0'));
}

function whatsappCard() {
  const num = h('input', { type: 'tel', inputmode: 'tel', value: state.user.whatsapp || state.user.phone || '', placeholder: countryInfo().dial ? `+${countryInfo().dial} …` : '+…' });
  let on = !!state.user.notify_whatsapp;
  const box = h('div', { class: 'card stack' });
  const draw = () => fill(box,
    h('div', { class: 'row' }, h('span', { class: 'ic green' }, icon('whatsapp', 20)), h('div', { class: 'grow' }, h('h2', { class: 'h2' }, t('Avisos por WhatsApp')),
      h('div', { class: 'xs muted' }, t('Receba no WhatsApp: proposta pronta, pedido avançou, mensagem da equipa.')))),
    field(t('Número de WhatsApp'), num),
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: on, onchange: (e) => { on = e.target.checked; } }), t('Quero receber avisos por WhatsApp')),
    h('button', { class: 'btn outline', onclick: async () => {
      try { await patch('/me', { whatsapp: num.value, notify_whatsapp: on }); await refreshUser(); toast(t('Preferências guardadas.')); } catch (e) { toast(e.message); }
    } }, t('Guardar')));
  draw();
  return box;
}

function voiceCard() {
  const chk = (key, def, label) => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: pref(key, def) === '1', onchange: (e) => { setPref(key, e.target.checked ? '1' : '0'); document.body.classList.toggle('no-fab', key === 'ponte.voiceFab' && !e.target.checked); } }), t(label));
  const opts = [['auto', 'Automático'], ['device', 'Reconhecimento do telefone']];
  if (voiceCfg.stt) opts.push(['server', 'Servidor Ponte (recomendado na China)']);
  return h('div', { class: 'card stack' },
    h('div', { class: 'row' }, h('span', { class: 'ic green' }, icon('mic', 20)), h('div', { class: 'grow' }, h('h2', { class: 'h2' }, t('Voz')),
      h('div', { class: 'xs muted' }, t('Fale em vez de escrever: toque no microfone de qualquer campo, ou no botão redondo para dar ordens.')))),
    chk('ponte.voiceFab', '1', 'Mostrar o botão de comandos por voz'),
    chk('ponte.readAloud', '0', 'Ler as respostas em voz alta'),
    field(t('Reconhecimento de voz'), h('select', { onchange: (e) => { setPref('ponte.voiceEngine', e.target.value); setPref('ponte.sttFallback', '0'); toast(t('Preferências guardadas.')); } },
      opts.map(([v, l]) => h('option', { value: v, selected: pref('ponte.voiceEngine', 'auto') === v }, t(l)))),
      canListen() ? null : t('Este navegador não tem reconhecimento de voz.')));
}

export { requireLogin };
