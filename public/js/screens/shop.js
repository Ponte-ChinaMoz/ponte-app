// Loja: mega filtro do catálogo, perfil de estilo, produto, cesto e compra online.
import { h, fill, icon, toast, sheet, field, empty, topbar, priceLabel, fmtMoney, copy, convert } from '../ui.js';
import { t, lang, countryInfo } from '../i18n.js';
import { get, post, patch } from '../api.js';
import { state, go, requireLogin, refreshUser } from '../app.js';
import { ls } from './main.js';
import { favButtons, reliabilityBadge } from './plus.js';
import { payPicker } from '../pay.js';

// ------------------------------------------------------------------ vocabulário
export const STYLES = ['minimalista', 'clássico', 'vintage', 'gótico', 'avant-garde', 'moderno', 'industrial', 'rústico', 'escandinavo', 'luxo', 'desportivo', 'boho', 'oriental', 'africano'];
const MECHANISMS = ['manual', 'mecânico', 'analógico', 'digital', 'eléctrico', 'solar'];
const MATERIALS = ['madeira maciça', 'metal', 'aço inox', 'couro', 'algodão', 'veludo', 'vidro', 'plástico', 'ferro forjado', 'ganga'];
export const COLORS = {
  preto: '#151515', branco: '#FFFFFF', cinzento: '#8C9490', vermelho: '#C23A2B', azul: '#2F5DA8', verde: '#2E7D4F', amarelo: '#E8C04B',
  castanho: '#7A4E2D', bege: '#DCC9A6', dourado: '#C9A227', prateado: '#C0C4C8', rosa: '#E59AB4', laranja: '#E07B2C', roxo: '#6D4AA0', 'madeira natural': '#B98A55',
};
const FACETS = [
  ['category', 'Categoria'], ['styles', 'Estilo'], ['mechanism', 'Funcionamento'], ['colors', 'Cores'], ['materials', 'Materiais'],
  ['sizes', 'Tamanhos'], ['spare_parts', 'Peças sobresselentes'], ['certifications', 'Certificações'],
];
const SPARE = { sim: 'Disponíveis', limitado: 'Limitadas', nao: 'Não disponíveis' };
const SORTS = [['relevancia', 'Mais relevantes'], ['preco_asc', 'Preço: mais baixo'], ['preco_desc', 'Preço: mais alto'], ['qualidade', 'Melhor qualidade'], ['durabilidade', 'Mais duradouros'], ['prazo', 'Entrega mais rápida'], ['novos', 'Novidades']];
const LIST_KEYS = FACETS.map(([k]) => k);
const NUM_KEYS = ['price_min', 'price_max', 'quality_min', 'durability_min', 'lead_max', 'moq_max'];
const valueLabel = (key, v) => (key === 'spare_parts' ? t(SPARE[v] || v) : t(v));

export function myPrefs() {
  const p = state.user?.prefs && Object.keys(state.user.prefs).length ? state.user.prefs : ls.get('ponte.prefs', {});
  return p && Object.keys(p).length ? p : null;
}

const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');
const swatch = (c, size = 18) => h('span', { style: { width: size + 'px', height: size + 'px', borderRadius: '50%', background: COLORS[c] || '#ddd', border: '1px solid rgba(0,0,0,.18)', display: 'inline-block', flex: `0 0 ${size}px` } });

// ------------------------------------------------------------------ cesto
export const cart = {
  items() { return ls.get('ponte.cart', []); },
  save(items) { ls.set('ponte.cart', items); document.dispatchEvent(new Event('cart')); },
  count() { return this.items().reduce((s, i) => s + 1, 0); },
  add(item) {
    const items = this.items();
    const same = items.find((i) => i.product_id === item.product_id && i.color === item.color && i.size === item.size);
    if (same) same.qty += item.qty; else items.push(item);
    this.save(items);
  },
  clear() { this.save([]); },
};

export function cartButton() {
  const n = cart.count();
  return h('a', { class: 'icon-btn', href: '#/cart', 'aria-label': t('Cesto de compras') + (n ? ` (${n})` : '') }, icon('cart', 20), n ? h('span', { class: 'dot-badge' }, String(n)) : null);
}

// ------------------------------------------------------------------ estado dos filtros (na barra de endereço)
function readFilters(query) {
  const f = { q: query.q || '', sort: query.sort || 'relevancia', for_me: query.for_me === '1', priced: query.priced === '1', buy_online: query.buy_online === '1' };
  for (const k of LIST_KEYS) f[k] = query[k] ? query[k].split('|').filter(Boolean) : [];
  for (const k of NUM_KEYS) f[k] = query[k] !== undefined && query[k] !== '' ? Number(query[k]) : null;
  return f;
}

function toParams(f, extra = {}) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.sort && f.sort !== 'relevancia') p.set('sort', f.sort);
  if (f.for_me) p.set('for_me', '1');
  if (f.priced) p.set('priced', '1');
  if (f.buy_online) p.set('buy_online', '1');
  for (const k of LIST_KEYS) if (f[k].length) p.set(k, f[k].join('|'));
  for (const k of NUM_KEYS) if (f[k] !== null && !isNaN(f[k])) p.set(k, String(f[k]));
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  return p;
}

function apiQuery(f) {
  const extra = {};
  const prefs = myPrefs();
  if (f.for_me && prefs && !state.user) extra.prefs = JSON.stringify(prefs);
  return '/catalog?' + toParams(f, extra);
}

const activeCount = (f) => LIST_KEYS.reduce((s, k) => s + f[k].length, 0) + NUM_KEYS.filter((k) => f[k] !== null).length + (f.priced ? 1 : 0) + (f.buy_online ? 1 : 0);

export function productTile(p) {
  return h('a', { class: 'prod', href: `#/product/${p.id}` },
    h('div', { class: 'img', style: { position: 'relative' } },
      p.image ? h('img', { src: p.image, alt: '', loading: 'lazy' }) : icon('grid', 30, 1.4),
      p.match !== null && p.match !== undefined ? h('span', { class: 'badge', style: { position: 'absolute', top: '8px', left: '8px', background: p.match >= 70 ? 'var(--green)' : 'var(--ink)', color: '#fff' } }, t('{n}% para si', { n: p.match })) : null),
    h('div', { class: 'body' },
      h('div', { class: 'h3', style: { lineHeight: 1.25 } }, p.name),
      p.styles ? h('div', { class: 'xs muted' }, p.styles.split(',').map((s) => t(s.trim())).join(' · ')) : h('div', { class: 'xs muted' }, p.category),
      p.quality ? h('div', { class: 'xs', style: { color: 'var(--gold-dk)', letterSpacing: '1px' }, 'aria-label': t('Qualidade {n} de 5', { n: p.quality }) }, stars(p.quality)) : null,
      p.colors ? h('div', { class: 'row', style: { gap: '4px', marginTop: '2px' } }, p.colors.split(',').slice(0, 6).map((c) => swatch(c.trim(), 14))) : null,
      h('div', { class: 'small', style: { fontWeight: 800, marginTop: '4px' } }, priceLabel(p)),
      localHint(p.price_min, p.price_currency)));
}

// "≈ 3 200 Kz" — preço na moeda do país do cliente (câmbio indicativo).
export function localHint(n, cur = 'USD') {
  const to = state.user?.currency || ls.get('ponte.currency', countryInfo().currency);
  if (!n || !state.rates || to === cur) return null;
  const v = convert(n, cur || 'USD', to, state.rates);
  return v ? h('div', { class: 'xs muted' }, '≈ ' + fmtMoney(v, to)) : null;
}

// ------------------------------------------------------------------ catálogo com mega filtro
export async function catalog({ query }) {
  const f = readFilters(query);
  const data = await get(apiQuery(f));
  const prefs = myPrefs();
  const nav = (nf) => go('#/catalog?' + toParams(nf));
  const input = h('input', { value: f.q, placeholder: t('Procurar artigos: cadeira, relógio, mala…'), enterkeyhint: 'search', 'aria-label': t('Procurar') });

  // Filtros activos (removíveis)
  const active = [];
  for (const k of LIST_KEYS) for (const v of f[k]) active.push([valueLabel(k, v), () => nav({ ...f, [k]: f[k].filter((x) => x !== v) })]);
  if (f.price_min !== null || f.price_max !== null) active.push([`${f.price_min ?? 0}–${f.price_max ?? '∞'} USD`, () => nav({ ...f, price_min: null, price_max: null })]);
  if (f.quality_min) active.push([t('Qualidade ≥ {n}', { n: f.quality_min }), () => nav({ ...f, quality_min: null })]);
  if (f.durability_min) active.push([t('Dura ≥ {n} anos', { n: f.durability_min }), () => nav({ ...f, durability_min: null })]);
  if (f.lead_max) active.push([t('Entrega ≤ {n} dias', { n: f.lead_max }), () => nav({ ...f, lead_max: null })]);
  if (f.moq_max) active.push([t('Mínimo ≤ {n}', { n: f.moq_max }), () => nav({ ...f, moq_max: null })]);
  if (f.priced) active.push([t('Com preço'), () => nav({ ...f, priced: false })]);
  if (f.buy_online) active.push([t('Compra online'), () => nav({ ...f, buy_online: false })]);

  const saved = ls.get('ponte.searches', []);
  const sortSel = h('select', { class: 'input', style: { minHeight: '42px', fontSize: '14px', width: 'auto', flex: 1 }, 'aria-label': t('Ordenar'), onchange: (e) => nav({ ...f, sort: e.target.value, for_me: false }) },
    SORTS.map(([v, l]) => h('option', { value: v, selected: v === f.sort && !f.for_me }, t(l))));

  // Pesquisa por frase: "200 cadeiras pretas até 40 dólares" → filtros (também usada pelos comandos de voz)
  async function smart(text) {
      if (!text) return nav({ ...f, q: '' });
      // Pesquisa por frase: "200 cadeiras pretas até 40 dólares" → filtros
      let parsed = null;
      try { parsed = await get('/catalog/parse?text=' + encodeURIComponent(text)); } catch { /* offline */ }
      if (!parsed) return nav({ ...f, q: text });
      const nf = { ...f, q: parsed.q };
      for (const [k, v] of Object.entries(parsed.filters)) nf[k] = [...new Set([...(nf[k] || []), ...v])];
      for (const k of ['price_min', 'price_max', 'quality_min', 'durability_min', 'moq_max']) if (parsed[k] !== undefined) nf[k] = parsed[k];
      if (parsed.sort) nf.sort = parsed.sort;
      const understood = [...Object.values(parsed.filters).flat().map((x) => t(x)), parsed.price_max ? t('até {v} USD', { v: parsed.price_max }) : null, parsed.qty ? t('{n} unidades', { n: parsed.qty }) : null].filter(Boolean);
      if (understood.length) toast(t('Entendi: {f}', { f: understood.join(' · ') }));
      nav(nf);
  }
  if (query.voice) { const v = query.voice; setTimeout(() => smart(v.replace(/^\s*(quero|preciso de|procuro|comprar|i want|i need|quiero|necesito|voglio|cerco|je veux)\s+/i, '')), 0); }

  return h('div', { class: 'screen' },
    h('div', { class: 'topbar' }, h('button', { class: 'icon-btn ghost', 'aria-label': t('Voltar'), onclick: () => history.back() }, icon('back')),
      h('h1', { class: 'title' }, t('Catálogo')), cartButton()),
    h('form', { class: 'search', role: 'search', onsubmit: (e) => { e.preventDefault(); smart(input.value.trim()); } }, icon('search', 20), input,
      h('a', { class: 'icon-btn', href: '#/identify', style: { border: 0, background: 'var(--green-tint)', color: 'var(--green)', width: '40px', height: '40px', flexBasis: '40px' }, 'aria-label': t('Procurar por fotografia') }, icon('camera', 18)),
      h('button', { type: 'button', class: 'btn sm primary', onclick: () => filterSheet(f, data.facets) }, icon('filter', 16), activeCount(f) ? `${t('Filtros')} (${activeCount(f)})` : t('Filtros'))),
    h('div', { class: 'row', style: { gap: '8px' } },
      h('button', { class: 'chip' + (f.for_me ? ' on' : ''), 'aria-pressed': f.for_me ? 'true' : 'false', onclick: () => (prefs ? nav({ ...f, for_me: !f.for_me }) : go('#/prefs?next=' + encodeURIComponent('/catalog?for_me=1'))) },
        icon('star', 14), t('Para o meu perfil')),
      sortSel),
    active.length ? h('div', { class: 'chip-row' }, active.map(([label, rm]) => h('button', { class: 'chip on', onclick: rm, 'aria-label': t('Remover filtro {f}', { f: label }) }, label, icon('x', 12, 2.6))),
      h('button', { class: 'chip', onclick: () => nav({ q: f.q, sort: f.sort, for_me: f.for_me, ...Object.fromEntries(LIST_KEYS.map((k) => [k, []])), ...Object.fromEntries(NUM_KEYS.map((k) => [k, null])) }) }, t('Limpar tudo'))) : null,
    !active.length && !f.q && saved.length ? h('div', { class: 'chip-row' }, saved.map((s) => h('a', { class: 'chip', href: '#/catalog?' + s.params }, icon('star', 12), s.name))) : null,
    !active.length && !f.q ? h('div', { class: 'chip-row' }, STYLES.slice(0, 8).map((s) => h('button', { class: 'chip', onclick: () => nav({ ...f, styles: [s] }) }, t(s)))) : null,
    h('div', { class: 'row between' },
      h('span', { class: 'small muted', style: { fontWeight: 700 } }, data.total === 1 ? t('1 artigo') : t('{n} artigos', { n: data.total })),
      active.length || f.q ? h('button', { class: 'link', onclick: () => {
        const name = (f.q || active.map(([l]) => l).slice(0, 3).join(', ')).slice(0, 40);
        ls.set('ponte.searches', [{ name, params: String(toParams(f)) }, ...saved.filter((s) => s.params !== String(toParams(f)))].slice(0, 8));
        toast(t('Pesquisa guardada.'));
      } }, icon('star', 14), ' ', t('Guardar pesquisa')) : null),
    f.for_me && prefs ? h('div', { class: 'card tight row', style: { background: 'var(--green-tint)', border: 0 } }, icon('star', 18),
      h('span', { class: 'small grow' }, t('Ordenado pela compatibilidade com o seu perfil: {s}.', { s: (prefs.styles || []).map((x) => t(x)).join(', ') || t('preferências guardadas') })),
      h('a', { class: 'link', href: '#/prefs' }, t('Editar'))) : null,
    data.items.length ? h('div', { class: 'grid2' }, data.items.map(productTile))
      : empty('search', t('Nenhum artigo com estes filtros.'), h('a', { class: 'btn primary', style: { marginTop: '12px' }, href: '#/quote?title=' + encodeURIComponent(f.q || active.map(([l]) => l).join(', ')) }, t('Pedir à equipa que encontre'))),
    h('p', { class: 'xs muted center', style: { margin: 0 } }, t('Não encontra o que procura? A equipa Ponte procura nas fábricas por si.')));
}

function filterSheet(f0, facets0) {
  const f = JSON.parse(JSON.stringify(f0));
  let facets = facets0;
  const body = h('div', { class: 'stack lg' });
  const btn = h('button', { class: 'btn primary block', style: { position: 'sticky', bottom: '0' }, onclick: () => { close(); go('#/catalog?' + toParams(f)); } }, t('Ver resultados'));
  let timer;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try { const d = await get(apiQuery(f)); facets = d.facets; btn.textContent = d.total === 1 ? t('Ver 1 resultado') : t('Ver {n} resultados', { n: d.total }); draw(); } catch { /* offline */ }
    }, 220);
  };
  const toggle = (k, v) => { f[k] = f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v]; draw(); refresh(); };
  const numInput = (k, ph) => h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: ph, value: f[k] ?? '', 'aria-label': ph,
    oninput: (e) => { f[k] = e.target.value === '' ? null : Number(e.target.value); refresh(); } });
  const pills = (k, options) => h('div', { class: 'row wrap', style: { gap: '6px' } }, options.map(([v, label]) => h('button', { class: 'chip' + (f[k] === v ? ' on' : ''), onclick: () => { f[k] = f[k] === v ? null : v; draw(); refresh(); } }, label)));
  const section = (title, ...content) => h('div', { class: 'stack' }, h('h3', { class: 'h3' }, title), ...content);

  function draw() {
    const facetSection = ([key, title]) => {
      let values = facets[key] || [];
      // Mostrar também as opções conhecidas sem resultados (estilos e funcionamento), para descoberta.
      const known = key === 'styles' ? STYLES : key === 'mechanism' ? MECHANISMS : key === 'materials' ? MATERIALS : [];
      for (const v of [...known, ...f[key]]) if (!values.some((x) => x.value === v)) values = [...values, { value: v, count: 0 }];
      if (!values.length) return null;
      return section(t(title), h('div', { class: 'row wrap', style: { gap: '6px' } }, values.map(({ value, count }) => {
        const on = f[key].includes(value);
        return h('button', { class: 'chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', style: { opacity: count || on ? 1 : 0.45 }, onclick: () => toggle(key, value) },
          key === 'colors' ? swatch(value, 16) : null, valueLabel(key, value), h('span', { class: 'xs', style: { opacity: 0.7 } }, String(count)));
      })));
    };
    const pr = facets.price;
    fill(body,
      h('div', { class: 'row between' }, h('h2', { class: 'display', style: { fontSize: '22px' } }, t('Filtros')),
        h('button', { class: 'link', onclick: () => { for (const k of LIST_KEYS) f[k] = []; for (const k of NUM_KEYS) f[k] = null; f.priced = false; f.buy_online = false; draw(); refresh(); } }, t('Limpar'))),
      facetSection(FACETS[0]), facetSection(FACETS[1]),
      section(t('Preço por unidade (USD)'), h('div', { class: 'grid2' }, numInput('price_min', pr ? t('Mín. {v}', { v: pr.min }) : t('Mínimo')), numInput('price_max', pr ? t('Máx. {v}', { v: pr.max }) : t('Máximo'))),
        h('div', { class: 'row wrap', style: { gap: '6px' } }, [[null, 10], [10, 50], [50, 200], [200, 1000], [1000, null]].map(([a, b]) =>
          h('button', { class: 'chip' + (f.price_min === a && f.price_max === b ? ' on' : ''), onclick: () => { f.price_min = a; f.price_max = b; draw(); refresh(); } }, a === null ? t('até {b}', { b }) : b === null ? t('mais de {a}', { a }) : `${a}–${b}`)))),
      section(t('Qualidade mínima'), pills('quality_min', [1, 2, 3, 4, 5].map((n) => [n, stars(n)]))),
      section(t('Durabilidade'), pills('durability_min', [[2, t('2+ anos')], [5, t('5+ anos')], [10, t('10+ anos')], [15, t('15+ anos')]])),
      facetSection(FACETS[6]), facetSection(FACETS[2]), facetSection(FACETS[3]), facetSection(FACETS[4]), facetSection(FACETS[5]), facetSection(FACETS[7]),
      section(t('Prazo de produção'), pills('lead_max', [[15, t('até 15 dias')], [25, t('até 25 dias')], [35, t('até 35 dias')], [60, t('até 60 dias')]])),
      section(t('Encomenda mínima'), pills('moq_max', [[1, t('a partir de 1')], [10, t('até 10')], [50, t('até 50')], [100, t('até 100')]])),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.priced, onchange: (e) => { f.priced = e.target.checked; refresh(); } }), t('Só artigos com preço indicado')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.buy_online, onchange: (e) => { f.buy_online = e.target.checked; refresh(); } }), t('Só artigos com compra online')),
      btn);
  }
  draw();
  refresh();
  const close = sheet(body);
}

// ------------------------------------------------------------------ perfil de estilo
export function prefs({ query }) {
  const p = { styles: [], materials: [], colors: [], mechanism: [], quality_min: null, budget_max: null, spare_parts: false, ...(myPrefs() || {}) };
  const root = h('div', { class: 'screen' });
  const multi = (key, options, withSwatch) => h('div', { class: 'row wrap', style: { gap: '6px' } }, options.map((v) => {
    const on = p[key].includes(v);
    return h('button', { class: 'chip' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false', onclick: () => { p[key] = on ? p[key].filter((x) => x !== v) : [...p[key], v]; draw(); } },
      withSwatch ? swatch(v, 16) : null, t(v));
  }));
  const budget = h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, value: p.budget_max ?? '', placeholder: t('Ex.: 100'), oninput: (e) => { p.budget_max = e.target.value ? Number(e.target.value) : null; } });
  async function save() {
    ls.set('ponte.prefs', p);
    if (state.user) { try { await patch('/me', { prefs: p }); await refreshUser(); } catch { /* ignorar */ } }
    toast(t('Perfil de estilo guardado.'));
    go('#' + (query.next || '/catalog?for_me=1'));
  }
  function draw() {
    fill(root,
      topbar(t('O meu estilo')),
      h('p', { class: 'small muted', style: { margin: 0 } }, t('Diga-nos do que gosta. O catálogo ordena os artigos pela compatibilidade com o seu perfil.')),
      h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Estilos preferidos')), multi('styles', STYLES)),
      h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Orçamento por unidade (USD)')), budget),
      h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Qualidade mínima')),
        h('div', { class: 'row wrap', style: { gap: '6px' } }, [1, 2, 3, 4, 5].map((n) => h('button', { class: 'chip' + (p.quality_min === n ? ' on' : ''), onclick: () => { p.quality_min = p.quality_min === n ? null : n; draw(); } }, stars(n))))),
      h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Funcionamento')), multi('mechanism', MECHANISMS)),
      h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Materiais')), multi('materials', MATERIALS)),
      h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Cores')), multi('colors', Object.keys(COLORS), true)),
      h('label', { class: 'card tight check' }, h('input', { type: 'checkbox', checked: !!p.spare_parts, onchange: (e) => { p.spare_parts = e.target.checked; } }), t('Dou prioridade a artigos com peças sobresselentes')),
      h('button', { class: 'btn primary block', onclick: save }, t('Guardar e ver artigos para mim')));
  }
  draw();
  return root;
}

// ------------------------------------------------------------------ produto
export async function product({ params }) {
  const [p, techs] = await Promise.all([get('/products/' + Number(params.id)), get('/partners?type=tecnico').catch(() => [])]);
  const ci = countryInfo();
  const localTechs = techs.filter((x) => [ci.code, ci.name].includes(x.country)).length;
  // Bloco "pós-venda": mostra o que acontece se avariar (decisivo em máquinas e electrónica).
  const afterSales = () => h('div', { class: 'card stack' },
    h('div', { class: 'row' }, h('span', { class: 'ic green' }, icon('tool', 20)), h('div', { class: 'grow' }, h('h2', { class: 'h3' }, t('Depois da compra')), h('div', { class: 'xs muted' }, t('Se avariar, a Ponte trata com a fábrica por si.')))),
    h('div', { class: 'list' },
      h('div', { class: 'list-item' }, icon('shield', 18), h('span', { class: 'grow small' }, p.warranty ? t('Garantia: {g}', { g: p.warranty }) : t('Garantia a confirmar com a fábrica'))),
      h('div', { class: 'list-item' }, icon('gear', 18), h('span', { class: 'grow small' }, p.spare_parts ? t('Peças sobresselentes: {s}', { s: t(SPARE[p.spare_parts] || p.spare_parts) }) : t('Peças sobresselentes a confirmar'))),
      h('div', { class: 'list-item' }, icon('translate', 18), h('span', { class: 'grow small' }, t('Diagnóstico com o engenheiro da fábrica, em chinês, pela equipa Ponte'))),
      h('div', { class: 'list-item' }, icon('user', 18), h('span', { class: 'grow small' }, localTechs ? t('{n} técnico(s) parceiro(s) em {p}', { n: localTechs, p: t(ci.name) }) : t('Apoio remoto e envio de peças para {p}', { p: t(ci.name) })))),
    h('div', { class: 'xs muted' }, t('Dica: peça o kit de peças de desgaste e o manual em português junto com a encomenda.')));
  const colors = (p.colors || '').split(',').map((s) => s.trim()).filter(Boolean);
  const sizes = (p.sizes || '').split(',').map((s) => s.trim()).filter(Boolean);
  const min = p.moq_qty || 1;
  const sel = { color: colors[0] || null, size: sizes[0] || null, qty: min };
  const root = h('div', { class: 'screen' });
  const attr = (label, value) => (value ? h('div', { class: 'card tight' }, h('div', { class: 'xs muted', style: { fontWeight: 700 } }, t(label)), h('div', { class: 'h3' }, value)) : null);

  function draw() {
    const qtyInput = h('input', { class: 'input', type: 'number', inputmode: 'numeric', min, value: sel.qty, style: { width: '90px', textAlign: 'center' }, 'aria-label': t('Quantidade'),
      onchange: (e) => { sel.qty = Math.max(min, Math.floor(Number(e.target.value) || min)); draw(); } });
    const line = p.price_min ? sel.qty * p.price_min : null;
    fill(root,
      h('div', { class: 'topbar' }, h('button', { class: 'icon-btn ghost', 'aria-label': t('Voltar'), onclick: () => history.back() }, icon('back')), h('h1', { class: 'title' }, t('Produto')), cartButton()),
      h('div', { class: 'prod', style: { border: 0 } }, h('div', { class: 'img', style: { borderRadius: '20px' } }, p.image ? h('img', { src: p.image, alt: p.name }) : icon('grid', 48, 1.2))),
      h('div', { class: 'stack' },
        h('div', { class: 'row wrap', style: { gap: '6px' } }, h('span', { class: 'badge grey' }, p.category),
          (p.styles || '').split(',').filter(Boolean).map((s) => h('a', { class: 'badge green', href: '#/catalog?styles=' + encodeURIComponent(s.trim()), style: { textDecoration: 'none' } }, t(s.trim()))),
          p.is_sample ? h('span', { class: 'badge gold' }, t('Exemplo')) : null),
        h('h2', { class: 'display', style: { fontSize: '26px' } }, p.name),
        h('div', { class: 'display', style: { fontSize: '20px', color: 'var(--green)' } }, priceLabel(p)), localHint(p.price_min, p.price_currency),
        h('div', { class: 'small muted' }, [p.price_unit ? t('por {u}', { u: p.price_unit }) : null, t('Encomenda mínima: {m}', { m: min }), t('Preço FOB indicativo')].filter(Boolean).join(' · ')),
        p.description ? h('p', { style: { margin: '6px 0 0' } }, p.description) : null,
        favButtons(p)),
      h('div', { class: 'grid2' },
        attr('Qualidade', p.quality ? `${stars(p.quality)}` : null), attr('Durabilidade', p.durability_years ? t('{n} anos', { n: p.durability_years }) : null),
        attr('Peças sobresselentes', p.spare_parts ? t(SPARE[p.spare_parts] || p.spare_parts) : null), attr('Funcionamento', p.mechanism ? p.mechanism.split(',').map((x) => t(x.trim())).join(', ') : null),
        attr('Materiais', p.materials ? p.materials.split(',').map((x) => t(x.trim())).join(', ') : null), attr('Garantia', p.warranty),
        attr('Prazo de produção', p.lead_time_days ? t('{n} dias', { n: p.lead_time_days }) : null), attr('Certificações', p.certifications)),
      ['eléctrico', 'mecânico', 'digital', 'solar'].some((m) => (p.mechanism || '').includes(m)) || p.spare_parts ? afterSales() : null,
      colors.length ? h('div', { class: 'stack' }, h('h3', { class: 'h3' }, t('Cor')), h('div', { class: 'row wrap', style: { gap: '6px' } },
        colors.map((c) => h('button', { class: 'chip' + (sel.color === c ? ' on' : ''), 'aria-pressed': sel.color === c ? 'true' : 'false', onclick: () => { sel.color = c; draw(); } }, swatch(c, 16), t(c))))) : null,
      sizes.length ? h('div', { class: 'stack' }, h('h3', { class: 'h3' }, t('Tamanho')), h('div', { class: 'row wrap', style: { gap: '6px' } },
        sizes.map((s) => h('button', { class: 'chip' + (sel.size === s ? ' on' : ''), onclick: () => { sel.size = s; draw(); } }, s)))) : null,
      h('div', { class: 'card row between' },
        h('div', {}, h('div', { class: 'h3' }, t('Quantidade')), h('div', { class: 'xs muted' }, t('Mínimo {n}', { n: min }))),
        h('div', { class: 'row', style: { gap: '6px' } },
          h('button', { class: 'icon-btn', 'aria-label': t('Menos'), onclick: () => { sel.qty = Math.max(min, sel.qty - (min >= 50 ? 10 : 1)); draw(); } }, '−'), qtyInput,
          h('button', { class: 'icon-btn', 'aria-label': t('Mais'), onclick: () => { sel.qty += min >= 50 ? 10 : 1; draw(); } }, '+'))),
      line ? h('div', { class: 'row between' }, h('span', { class: 'muted' }, t('Subtotal estimado')), h('strong', {}, fmtMoney(line, p.price_currency))) : null,
      p.buy_online ? h('button', { class: 'btn primary block', onclick: () => {
        cart.add({ product_id: p.id, name: p.name, image: p.image, price: p.price_min, currency: p.price_currency, qty: sel.qty, min, color: sel.color, size: sel.size });
        sheet(h('div', { class: 'stack lg' }, h('div', { class: 'row' }, h('span', { class: 'ic green' }, icon('check', 22, 2.6)), h('h2', { class: 'h2' }, t('Adicionado ao cesto'))),
          h('a', { class: 'btn primary block', href: '#/cart', onclick: () => document.querySelector('.sheet-back')?.remove() }, t('Ver cesto e finalizar')),
          h('button', { class: 'btn ghost block', onclick: () => document.querySelector('.sheet-back')?.remove() }, t('Continuar a comprar'))));
      } }, icon('cart', 18), t('Adicionar ao cesto')) : null,
      h('a', { class: 'btn outline block', href: `#/quote?product=${p.id}` }, t('Pedir cotação personalizada')),
      p.supplier ? h('a', { class: 'card row', href: `#/supplier/${p.supplier.code}`, style: { textDecoration: 'none', color: 'inherit' } },
        h('span', { class: 'ic gold' }, icon('factory', 20)),
        h('span', { class: 'grow' }, h('span', { class: 'h3', style: { display: 'block' } }, p.supplier.title), h('span', { class: 'xs muted' }, [p.supplier.city, p.supplier.verified ? t('Verificado') : null].filter(Boolean).join(' · '))),
        reliabilityBadge(p.supplier.reliability), icon('chevron', 16)) : null,
      p.supplier ? h('a', { class: 'btn ghost block', href: `#/visit?supplier=${encodeURIComponent(p.supplier.code)}` }, icon('video', 18), t('Ver a fábrica em videochamada')) : null,
      h('a', { class: 'btn ghost block', href: '#/chat' }, t('Tirar uma dúvida com a equipa')));
  }
  draw();
  return root;
}

// ------------------------------------------------------------------ cesto
export async function cartView() {
  const root = h('div', { class: 'screen' });
  let rates = {};
  try { rates = await get('/rates'); } catch { /* offline */ }
  function draw() {
    const items = cart.items();
    const priced = items.filter((i) => i.price);
    const subtotal = priced.reduce((s, i) => s + i.price * i.qty, 0);
    const pending = items.length - priced.length;
    fill(root,
      topbar(t('Cesto de compras')),
      items.length ? [
        h('div', { class: 'stack' }, items.map((it, idx) => h('div', { class: 'card row top' },
          h('div', { style: { width: '72px', height: '72px', borderRadius: '14px', background: 'var(--grey-tint)', flex: '0 0 72px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9AA8A1' } },
            it.image ? h('img', { src: it.image, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }) : icon('grid', 26, 1.4)),
          h('div', { class: 'grow stack', style: { gap: '4px' } },
            h('a', { class: 'h3', href: `#/product/${it.product_id}`, style: { color: 'inherit', textDecoration: 'none' } }, it.name),
            h('div', { class: 'xs muted' }, [it.color && t(it.color), it.size].filter(Boolean).join(' · ')),
            h('div', { class: 'row between' },
              h('div', { class: 'row', style: { gap: '4px' } },
                h('button', { class: 'icon-btn', style: { width: '34px', height: '34px', flexBasis: '34px' }, 'aria-label': t('Menos'), onclick: () => { const all = cart.items(); all[idx].qty = Math.max(it.min || 1, it.qty - ((it.min || 1) >= 50 ? 10 : 1)); cart.save(all); draw(); } }, '−'),
                h('span', { style: { minWidth: '40px', textAlign: 'center', fontWeight: 800 } }, String(it.qty)),
                h('button', { class: 'icon-btn', style: { width: '34px', height: '34px', flexBasis: '34px' }, 'aria-label': t('Mais'), onclick: () => { const all = cart.items(); all[idx].qty += (it.min || 1) >= 50 ? 10 : 1; cart.save(all); draw(); } }, '+')),
              h('strong', { class: 'small' }, it.price ? fmtMoney(it.price * it.qty, it.currency) : t('Preço a confirmar')))),
          h('button', { class: 'icon-btn ghost', 'aria-label': t('Remover'), onclick: () => { const all = cart.items(); all.splice(idx, 1); cart.save(all); draw(); } }, icon('trash', 18))))),
        h('div', { class: 'card stack' },
          h('div', { class: 'row between' }, h('span', { class: 'muted' }, t('Subtotal (FOB)')), h('strong', {}, fmtMoney(subtotal, 'USD'))),
          localTotal(subtotal, rates),
          pending ? h('div', { class: 'banner-test' }, t('{n} artigo(s) com preço a confirmar pela equipa.', { n: pending })) : null,
          h('div', { class: 'xs muted' }, t('Frete, seguro e despacho aduaneiro são calculados pela equipa conforme o destino.'))),
        h('button', { class: 'btn primary block', onclick: () => (state.user ? go('#/checkout') : requireLogin('/checkout')) }, t('Finalizar compra')),
        h('a', { class: 'btn ghost block', href: '#/catalog' }, t('Continuar a comprar'))]
        : empty('cart', t('O seu cesto está vazio.'), h('a', { class: 'btn primary', style: { marginTop: '12px' }, href: '#/catalog' }, t('Ver catálogo'))));
  }
  draw();
  return root;
}

// ------------------------------------------------------------------ finalizar compra
function localTotal(usd, rates) {
  const to = state.user?.currency || countryInfo().currency;
  const v = to !== 'USD' ? convert(usd, 'USD', to, rates) : null;
  return v ? h('div', { class: 'row between xs muted' }, h('span', {}, t('Aproximadamente')), h('span', {}, fmtMoney(v, to))) : null;
}

export async function checkout() {
  const items = cart.items();
  if (!items.length) { go('#/cart'); return h('div'); }
  const allPriced = items.every((i) => i.price);
  const subtotal = items.reduce((s, i) => s + (i.price || 0) * i.qty, 0);
  let mode = 'mocambique', payNow = true, plan = 'fases';
  const ci = countryInfo();
  const picker = payPicker();
  const root = h('div', { class: 'screen no-tabs' });
  const city = ci.cities.length ? h('select', {}, ci.cities.map((c) => h('option', {}, c))) : h('input', { placeholder: t('Cidade e país') });
  const address = h('textarea', { placeholder: t('Bairro, rua, número, referência') });
  const chinaAddr = h('textarea', { placeholder: t('Nome do hotel ou morada em Guangzhou, e datas da estadia') });
  const notes = h('textarea', { placeholder: t('Instruções especiais (opcional)') });

  function draw() {
    const btn = h('button', { class: 'btn primary block' }, allPriced && payNow ? t('Confirmar e pagar') : t('Enviar encomenda'));
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await post('/checkout', {
          items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, color: i.color, size: i.size })),
          delivery_mode: mode, address: mode === 'china' ? chinaAddr.value : `${city.value}: ${address.value}`, notes: notes.value,
          pay_now: allPriced && payNow, ...picker.value(), payment_plan: plan,
        });
        cart.clear();
        fill(root, h('div', { class: 'empty', style: { paddingTop: '70px' } },
          h('span', { class: 'ic', style: { width: '90px', height: '90px', margin: '0 auto 16px', background: 'var(--green)', color: '#fff', borderRadius: '45px' } }, icon('check', 44, 2.4)),
          h('h1', { class: 'h1' }, t('Encomenda recebida')),
          h('p', {}, r.payment ? t('Pagamento registado (referência {r}). A equipa confirma stock, prazo e frete.', { r: r.payment.reference }) : t('A equipa Ponte confirma preços, stock e frete e envia-lhe a proposta final.')),
          r.payment?.test ? h('div', { class: 'banner-test' }, t('Modo de teste: nenhum valor foi cobrado.')) : null,
          h('a', { class: 'btn primary block', href: `#/order/${r.id}`, style: { marginTop: '16px' } }, t('Acompanhar a encomenda')),
          h('a', { class: 'link', href: '#/' }, t('Voltar ao início'))));
      } catch (e) { toast(e.message); btn.disabled = false; }
    };
    const modeCard = (id, ic, title, desc) => h('button', { class: 'card row', style: { textAlign: 'left', cursor: 'pointer', borderWidth: '2px', borderColor: mode === id ? 'var(--green)' : '' }, onclick: () => { mode = id; draw(); } },
      h('span', { class: 'ic ' + (mode === id ? 'green' : 'grey') }, icon(ic, 20)), h('span', { class: 'grow' }, h('span', { class: 'h3', style: { display: 'block' } }, t(title)), h('span', { class: 'xs muted' }, t(desc))),
      h('span', { style: { width: '22px', height: '22px', borderRadius: '11px', border: mode === id ? '7px solid var(--green)' : '2px solid #9AA8A1' } }));
    fill(root,
      topbar(t('Finalizar compra')),
      h('h2', { class: 'h2' }, t('Onde quer receber?')),
      modeCard('mocambique', 'truck', t('Entregar em {p}', { p: t(ci.name === 'Outro país' ? 'o seu país' : ci.name) }), 'A Ponte compra, junta a carga, envia e trata do despacho.'),
      modeCard('china', 'pin', 'Receber na China', 'Para quem está em Guangzhou: entregamos no hotel ou no nosso armazém.'),
      mode === 'mocambique' ? h('div', { class: 'stack' }, field(t('Cidade'), city), field(t('Morada'), address)) : field(t('Hotel ou morada na China'), chinaAddr),
      field(t('Notas'), notes),
      h('div', { class: 'card stack' }, h('h2', { class: 'h3' }, t('Resumo')),
        items.map((i) => h('div', { class: 'row between small' }, h('span', { class: 'grow' }, `${i.qty} × ${i.name}`), h('span', {}, i.price ? fmtMoney(i.price * i.qty, i.currency) : t('a confirmar')))),
        h('div', { class: 'row between', style: { borderTop: '1px solid var(--line-2)', paddingTop: '8px' } }, h('strong', {}, t('Subtotal')), h('strong', {}, fmtMoney(subtotal, 'USD'))),
        h('div', { class: 'xs muted' }, t('Frete e despacho: a equipa envia o valor antes do embarque.'))),
      h('h2', { class: 'h2' }, t('Como quer pagar?')),
      [['fases', 'Pagamento protegido (recomendado)', allPriced ? t('{a} agora como sinal; {b} só depois de aprovar a inspecção com fotos.', { a: fmtMoney(subtotal * 0.3, 'USD'), b: fmtMoney(subtotal * 0.7, 'USD') }) : t('30% de sinal; o restante só depois de aprovar a inspecção com fotos.')],
        ['total', 'Pagar tudo de uma vez', allPriced ? fmtMoney(subtotal, 'USD') : t('Valor total depois da confirmação')]].map(([id, title, desc]) =>
        h('button', { class: 'card row', style: { textAlign: 'left', cursor: 'pointer', borderWidth: '2px', borderColor: plan === id ? 'var(--green)' : '' }, onclick: () => { plan = id; draw(); } },
          h('span', { class: 'ic ' + (plan === id ? 'green' : 'grey') }, icon(id === 'fases' ? 'shield' : 'card', 20)),
          h('span', { class: 'grow' }, h('span', { class: 'h3', style: { display: 'block' } }, t(title)), h('span', { class: 'xs muted' }, desc)),
          h('span', { style: { width: '22px', height: '22px', borderRadius: '11px', border: plan === id ? '7px solid var(--green)' : '2px solid #9AA8A1' } }))),
      allPriced ? h('div', { class: 'stack' },
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: payNow, onchange: (e) => { payNow = e.target.checked; draw(); } }), plan === 'fases' ? t('Pagar já o sinal') : t('Pagar já o total')),
        payNow ? [picker.el,
          state.config.paymentsMode === 'test' ? h('div', { class: 'banner-test' }, t('Modo de teste: os pagamentos são simulados e nada é cobrado.')) : null] : null)
        : h('div', { class: 'banner-test' }, t('Alguns artigos não têm preço fixo. Envie a encomenda e a equipa confirma o valor antes de pagar.')),
      btn);
  }
  draw();
  return root;
}

export { copy, lang };
