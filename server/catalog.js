// Mega filtro do catálogo: pesquisa por texto, filtros combináveis com contagens (facetas)
// e ordenação por compatibilidade com o perfil do cliente.
import { all } from './db.js';
import { normalize } from './bot.js';

export const LIST_FACETS = ['category', 'styles', 'mechanism', 'colors', 'materials', 'sizes', 'spare_parts', 'certifications'];

// Sinónimos simples para a pesquisa (português, inglês e alguns termos comuns).
const SYN = {
  cadeira: ['assento', 'chair', 'banco'], sofa: ['sofá', 'couch', 'estofado'], candeeiro: ['lampada', 'luz', 'iluminacao', 'lamp', 'led'],
  mesa: ['secretaria', 'table', 'desk'], roupa: ['vestuario', 'camisa', 'polo', 'uniforme', 'clothes'], relogio: ['watch', 'clock'],
  solar: ['painel', 'fotovoltaico', 'energia'], frigorifico: ['frio', 'congelador', 'camara', 'fridge'], telemovel: ['telefone', 'phone', 'smartphone'],
  ferramenta: ['tool', 'berbequim', 'chave'], mala: ['bolsa', 'bag', 'couro'], sapato: ['calcado', 'shoe', 'tenis'],
};
const SYN_INDEX = {};
for (const [k, list] of Object.entries(SYN)) for (const w of [k, ...list]) SYN_INDEX[normalize(w)] = [k, ...list].map(normalize);

const split = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const lower = (arr) => arr.map((x) => normalize(x));

function prepare(p) {
  const lists = {};
  for (const f of LIST_FACETS) lists[f] = f === 'category' || f === 'spare_parts' ? (p[f] ? [p[f]] : []) : split(p[f]);
  return {
    p, lists, norm: Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, lower(v)])),
    text: {
      name: normalize(p.name), cat: normalize(p.category), tags: normalize([p.tags, p.styles, p.materials, p.mechanism, p.colors].filter(Boolean).join(' ')),
      desc: normalize(p.description),
    },
    price: p.price_min ?? p.price_max ?? null,
  };
}

function textScore(item, words) {
  if (!words.length) return 0;
  let score = 0, hits = 0;
  for (const w of words) {
    const single = w.length > 4 ? w.replace(/(oes|aes|es|s)$/, (m) => (m === 'oes' ? 'ao' : m === 'aes' ? 'ao' : '')) : w;
    const variants = [...new Set([...(SYN_INDEX[w] || [w]), ...(SYN_INDEX[single] || [single])])];
    let best = 0;
    for (const v of variants) {
      const exact = v === w ? 1 : 0.7;
      const has = (field) => (field.split(' ').some((x) => x === v) ? 1 : field.split(' ').some((x) => x.startsWith(v) && v.length >= 3) ? 0.7 : field.includes(v) && v.length >= 4 ? 0.4 : 0);
      best = Math.max(best, exact * Math.max(has(item.text.name) * 3, has(item.text.cat) * 2, has(item.text.tags) * 2, has(item.text.desc) * 1));
    }
    if (best > 0) hits++;
    score += best;
  }
  // Todas as palavras devem aparecer de alguma forma.
  return hits === words.length ? score : -1;
}

// Compatibilidade com o perfil (0–100): estilo, materiais, cores, funcionamento, qualidade e orçamento.
export function matchScore(item, prefs) {
  if (!prefs) return null;
  let total = 0, got = 0;
  const overlap = (key, w) => {
    const want = lower(prefs[key] || []);
    if (!want.length) return;
    total += w;
    const have = item.norm[key] || [];
    const n = want.filter((x) => have.includes(x)).length;
    got += n ? w * Math.min(1, 0.6 + 0.4 * n / want.length) : 0;
  };
  overlap('styles', 35); overlap('materials', 12); overlap('colors', 10); overlap('mechanism', 10);
  if (prefs.quality_min) { total += 15; const q = item.p.quality || 0; got += q >= prefs.quality_min ? 15 : Math.max(0, 15 - (prefs.quality_min - q) * 6); }
  if (prefs.budget_max) {
    total += 18;
    if (item.price === null) got += 9;
    else if (item.price <= prefs.budget_max) got += 18;
    else got += Math.max(0, 18 * (1 - (item.price - prefs.budget_max) / prefs.budget_max));
  }
  if (prefs.spare_parts && item.p.spare_parts === 'sim') { total += 5; got += 5; } else if (prefs.spare_parts) total += 5;
  if (!total) return null;
  return Math.round((got / total) * 100);
}

function passes(item, f, skip) {
  for (const key of LIST_FACETS) {
    if (key === skip || !f[key]?.length) continue;
    const want = lower(f[key]);
    if (!item.norm[key].some((x) => want.includes(x))) return false;
  }
  if (f.price_min !== null && (item.price === null || item.price < f.price_min)) return false;
  if (f.price_max !== null && (item.price === null || item.price > f.price_max)) return false;
  if (f.quality_min && (item.p.quality || 0) < f.quality_min) return false;
  if (f.durability_min && (item.p.durability_years || 0) < f.durability_min) return false;
  if (f.lead_max && item.p.lead_time_days && item.p.lead_time_days > f.lead_max) return false;
  if (f.lead_max && !item.p.lead_time_days) return false;
  if (f.moq_max && item.p.moq_qty && item.p.moq_qty > f.moq_max) return false;
  if (f.priced && item.price === null) return false;
  if (f.buy_online && !item.p.buy_online) return false;
  return true;
}

export function parseFilters(q) {
  const arr = (k) => (q[k] ? String(q[k]).split('|').map((x) => x.trim()).filter(Boolean).slice(0, 30) : []);
  const n = (k) => (q[k] !== undefined && q[k] !== '' && !isNaN(Number(q[k])) ? Number(q[k]) : null);
  const f = { q: String(q.q || '').slice(0, 100), sort: q.sort || 'relevancia', for_me: q.for_me === '1' };
  for (const k of LIST_FACETS) f[k] = arr(k);
  Object.assign(f, {
    price_min: n('price_min'), price_max: n('price_max'), quality_min: n('quality_min'), durability_min: n('durability_min'),
    lead_max: n('lead_max'), moq_max: n('moq_max'), priced: q.priced === '1', buy_online: q.buy_online === '1',
  });
  return f;
}

export function searchCatalog(f, prefs, rowsSql) {
  const items = all(rowsSql).map(prepare);
  const words = normalize(f.q).split(' ').filter((w) => w.length > 1);

  const textOk = new Map();
  for (const it of items) textOk.set(it, textScore(it, words));
  const base = items.filter((it) => textOk.get(it) >= 0);

  // Resultados
  const results = base.filter((it) => passes(it, f));
  for (const it of results) it.match = matchScore(it, prefs);
  const S = {
    relevancia: (a, b) => (textOk.get(b) - textOk.get(a)) || ((b.match ?? 0) - (a.match ?? 0)) || (b.p.featured - a.p.featured) || (b.p.id - a.p.id),
    perfil: (a, b) => ((b.match ?? 0) - (a.match ?? 0)) || (textOk.get(b) - textOk.get(a)),
    preco_asc: (a, b) => (a.price ?? 1e12) - (b.price ?? 1e12),
    preco_desc: (a, b) => (b.price ?? -1) - (a.price ?? -1),
    qualidade: (a, b) => (b.p.quality || 0) - (a.p.quality || 0) || (a.price ?? 1e12) - (b.price ?? 1e12),
    durabilidade: (a, b) => (b.p.durability_years || 0) - (a.p.durability_years || 0),
    prazo: (a, b) => (a.p.lead_time_days || 999) - (b.p.lead_time_days || 999),
    novos: (a, b) => b.p.id - a.p.id,
  };
  results.sort(S[f.for_me ? 'perfil' : f.sort] || S.relevancia);

  // Facetas "disjuntivas": cada faceta conta ignorando a sua própria selecção.
  const facets = {};
  for (const key of LIST_FACETS) {
    const counts = new Map();
    for (const it of base) {
      if (!passes(it, f, key)) continue;
      for (const v of it.lists[key]) counts.set(v, (counts.get(v) || 0) + 1);
    }
    facets[key] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value, count]) => ({ value, count }));
  }
  const prices = base.map((it) => it.price).filter((x) => x !== null);
  facets.price = prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null;

  return { total: results.length, items: results.slice(0, 120), facets };
}


// ------------------------------------------------------------------ pesquisa por frase
// "200 cadeiras pretas até 40 dólares, estilo minimalista" → filtros.
const EN = {
  black: 'preto', white: 'branco', red: 'vermelho', blue: 'azul', green: 'verde', yellow: 'amarelo', brown: 'castanho', grey: 'cinzento', gray: 'cinzento',
  gold: 'dourado', golden: 'dourado', silver: 'prateado', pink: 'rosa', orange: 'laranja', purple: 'roxo', beige: 'bege',
  gothic: 'gótico', minimalist: 'minimalista', classic: 'clássico', modern: 'moderno', rustic: 'rústico', industrial: 'industrial', luxury: 'luxo',
  sporty: 'desportivo', scandinavian: 'escandinavo', mechanical: 'mecânico', analog: 'analógico', analogue: 'analógico', electric: 'eléctrico',
  leather: 'couro', wood: 'madeira maciça', cotton: 'algodão', steel: 'aço inox', glass: 'vidro', velvet: 'veludo', denim: 'ganga',
  gotico: 'gótico', eletrico: 'eléctrico', eletrica: 'eléctrico', madeira: 'madeira maciça', inox: 'aço inox', aco: 'aço inox', cinza: 'cinzento',
};
const KNOWN = {
  styles: ['minimalista', 'clássico', 'vintage', 'gótico', 'avant-garde', 'moderno', 'industrial', 'rústico', 'escandinavo', 'luxo', 'desportivo', 'boho', 'oriental', 'africano'],
  colors: ['preto', 'branco', 'cinzento', 'vermelho', 'azul', 'verde', 'amarelo', 'castanho', 'bege', 'dourado', 'prateado', 'rosa', 'laranja', 'roxo', 'madeira natural'],
  mechanism: ['manual', 'mecânico', 'analógico', 'digital', 'eléctrico', 'solar'],
  materials: ['madeira maciça', 'metal', 'aço inox', 'couro', 'algodão', 'veludo', 'vidro', 'plástico', 'ferro forjado', 'ganga', 'alumínio', 'poliéster', 'silicone'],
};
const STOP_Q = new Set('de do da dos das com em para por um uma uns umas e o a os as estilo cor cores tipo que quero preciso procuro gostava queria artigo artigos the a an of with in for i want need looking style color'.split(' '));

function variantsOf(v) {
  const n = normalize(v);
  const out = new Set([n]);
  if (!n.includes(' ')) {
    if (n.endsWith('o')) ['a', 'os', 'as'].forEach((x) => out.add(n.slice(0, -1) + x));
    else if (n.endsWith('e')) out.add(n + 's');
    else if (/[lr]$/.test(n)) out.add(n + 'es');
    else out.add(n + 's');
  }
  return [...out];
}

export function parseNatural(text) {
  let rest = ` ${normalize(text)} `;
  const f = { styles: [], colors: [], mechanism: [], materials: [], spare_parts: [] };
  const extra = {};
  const cut = (re) => { rest = rest.replace(re, ' '); };

  // valores (preço)
  const money = '(?:usd|us|dolares|dolar|\\$|mt|meticais)?';
  let m = rest.match(new RegExp(`entre (\\d+(?:[.,]\\d+)?) e (\\d+(?:[.,]\\d+)?) ?${money}`));
  if (m) { extra.price_min = Number(m[1].replace(',', '.')); extra.price_max = Number(m[2].replace(',', '.')); cut(m[0]); }
  m = rest.match(new RegExp(`(?:ate|menos de|abaixo de|maximo|max|no maximo|under|below|up to|less than) (\\d+(?:[.,]\\d+)?) ?${money}`));
  if (m) { extra.price_max = Number(m[1].replace(',', '.')); cut(m[0]); }
  m = rest.match(new RegExp(`(?:mais de|acima de|desde|a partir de|minimo|over|from|more than) (\\d+(?:[.,]\\d+)?) ?${money}`));
  if (m) { extra.price_min = Number(m[1].replace(',', '.')); cut(m[0]); }
  m = rest.match(/ (\d+(?:[.,]\d+)?) ?(?:usd|dolares|dolar|\$) /);
  if (m && extra.price_max === undefined) { extra.price_max = Number(m[1].replace(',', '.')); cut(m[0]); }

  // quantidade: "200 cadeiras", "50 unidades"
  m = rest.match(/ (\d{1,6}) (?:unidades|unidade|pecas|peca|pcs|un|x)? ?(?=[a-z])/);
  if (m) { extra.moq_max = Number(m[1]); extra.qty = Number(m[1]); cut(` ${m[1]} `); rest = rest.replace(/ (unidades|unidade|pecas|peca|pcs) /, ' '); }

  // vocabulário
  for (const [key, list] of Object.entries(KNOWN)) {
    for (const v of [...list].sort((a, b) => b.length - a.length)) {
      for (const variant of variantsOf(v)) {
        if (rest.includes(` ${variant} `)) { if (!f[key].includes(v)) f[key].push(v); cut(new RegExp(` ${variant} `, 'g')); }
      }
    }
  }
  for (const [en, pt] of Object.entries(EN)) {
    if (rest.includes(` ${en} `)) {
      const key = Object.keys(KNOWN).find((k) => KNOWN[k].includes(pt));
      if (key && !f[key].includes(pt)) f[key].push(pt);
      cut(new RegExp(` ${en} `, 'g'));
    }
  }
  // qualidade, durabilidade, peças, preço baixo
  if (/ (boa|alta|melhor) qualidade | premium | topo de gama | high quality /.test(rest)) { extra.quality_min = 4; cut(/ (boa|alta|melhor) qualidade | premium | topo de gama | high quality /); }
  if (/ (duradour[oa]s?|resistentes?|duravel|duraveis|durable) /.test(rest)) { extra.durability_min = 5; cut(/ (duradour[oa]s?|resistentes?|duravel|duraveis|durable) /); }
  if (/ (com pecas sobresselentes|pecas sobresselentes|com pecas de reposicao|pecas de reposicao|com pecas|reparave(l|is)|spare parts) /.test(rest)) { f.spare_parts.push('sim'); cut(/ (com pecas sobresselentes|pecas sobresselentes|com pecas de reposicao|pecas de reposicao|com pecas|reparave(l|is)|spare parts) /); }
  if (/ (barat[oa]s?|economic[oa]s?|cheap|baixo custo) /.test(rest)) { extra.sort = 'preco_asc'; cut(/ (barat[oa]s?|economic[oa]s?|cheap|baixo custo) /); }

  const q = rest.split(' ').filter((w) => w && !STOP_Q.has(w) && !/^\d+$/.test(w)).join(' ');
  const filters = Object.fromEntries(Object.entries(f).filter(([, v]) => v.length));
  return { q, filters, ...extra };
}
