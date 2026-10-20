// Funcionalidades avançadas: favoritos e comparação, contentor partilhado, visita virtual,
// pagamento protegido por fases e fiabilidade dos fornecedores.
import { h, fill, icon, toast, sheet, field, empty, topbar, fmtDate, fmtMoney, priceLabel, convert } from '../ui.js';
import { t, countryInfo } from '../i18n.js';
import { get, post, del } from '../api.js';
import { state, go, requireLogin, rerender } from '../app.js';
import { ls } from './main.js';
import { payPicker } from '../pay.js';

// ------------------------------------------------------------------ favoritos e comparação
export const favs = {
  all() { return ls.get('ponte.favs', []); },
  has(id) { return this.all().includes(id); },
  toggle(id) { const a = this.all(); const i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.unshift(id); ls.set('ponte.favs', a.slice(0, 100)); return i < 0; },
};
export const compare = {
  all() { return ls.get('ponte.compare', []); },
  has(id) { return this.all().includes(id); },
  toggle(id) {
    let a = this.all();
    if (a.includes(id)) a = a.filter((x) => x !== id);
    else { if (a.length >= 3) { toast(t('Pode comparar até 3 artigos.')); return false; } a.push(id); }
    ls.set('ponte.compare', a);
    return a.includes(id);
  },
};

export function favButtons(p) {
  const wrap = h('div', { class: 'row', style: { gap: '8px' } });
  const draw = () => fill(wrap,
    h('button', { class: 'chip' + (favs.has(p.id) ? ' on' : ''), 'aria-pressed': favs.has(p.id) ? 'true' : 'false', onclick: () => { toast(favs.toggle(p.id) ? t('Guardado nos favoritos.') : t('Removido dos favoritos.')); draw(); } },
      icon('heart', 14), favs.has(p.id) ? t('Nos favoritos') : t('Favorito')),
    h('button', { class: 'chip' + (compare.has(p.id) ? ' on' : ''), onclick: () => { compare.toggle(p.id); draw(); } }, icon('compare', 14), t('Comparar')),
    compare.all().length >= 2 ? h('a', { class: 'link', href: '#/compare' }, t('Ver comparação ({n})', { n: compare.all().length })) : null);
  draw();
  return wrap;
}

export function reliabilityBadge(r, big) {
  if (!r || r.score === null) return null;
  const color = r.score >= 85 ? 'green' : r.score >= 70 ? 'gold' : 'red';
  if (!big) return h('span', { class: 'badge ' + color, title: t('Fiabilidade') }, icon('shield', 11, 2.4), `${r.score}/100`);
  const bar = (label, v) => (v ? h('div', { class: 'row small', style: { gap: '8px' } }, h('span', { style: { width: '110px' }, class: 'muted' }, t(label)),
    h('div', { class: 'grow', style: { height: '6px', borderRadius: '3px', background: 'var(--grey-tint)' } }, h('div', { style: { height: '6px', borderRadius: '3px', width: `${v * 20}%`, background: 'var(--green)' } })),
    h('strong', {}, `${v}/5`)) : null);
  return h('div', { class: 'card stack' },
    h('div', { class: 'row between' }, h('div', {}, h('div', { class: 'kicker', style: { color: 'var(--green)' } }, t('Fiabilidade do fornecedor')),
      h('div', { class: 'xs muted' }, r.orders_done ? t('Baseada em {n} encomendas acompanhadas pela Ponte', { n: r.orders_done }) : t('Avaliação da equipa Ponte'))),
    h('span', { class: 'display', style: { fontSize: '28px', color: `var(--${color === 'gold' ? 'gold-dk' : color === 'red' ? 'red-dk' : 'green'})` } }, String(r.score))),
    bar('Qualidade', r.quality), bar('Prazos', r.delivery), bar('Comunicação', r.comms));
}

export async function favorites() {
  const ids = favs.all();
  const items = (await Promise.all(ids.map((id) => get('/products/' + id).catch(() => null)))).filter(Boolean);
  const root = h('div', { class: 'screen' });
  const draw = () => fill(root,
    topbar(t('Favoritos')),
    items.length ? [
      h('p', { class: 'small muted', style: { margin: 0 } }, t('Escolha 2 ou 3 artigos para comparar lado a lado.')),
      h('div', { class: 'stack' }, items.map((p) => h('div', { class: 'card row' },
        h('label', { class: 'check', style: { minHeight: 0 } }, h('input', { type: 'checkbox', checked: compare.has(p.id), 'aria-label': t('Comparar'), onchange: () => { compare.toggle(p.id); draw(); } })),
        h('a', { class: 'grow', href: `#/product/${p.id}`, style: { color: 'inherit', textDecoration: 'none' } }, h('div', { class: 'h3' }, p.name), h('div', { class: 'xs muted' }, priceLabel(p))),
        h('button', { class: 'icon-btn ghost', 'aria-label': t('Remover'), onclick: () => { favs.toggle(p.id); items.splice(items.indexOf(p), 1); draw(); } }, icon('trash', 18))))),
      h('a', { class: 'btn primary block' + (compare.all().length < 2 ? ' disabled' : ''), href: '#/compare', 'aria-disabled': compare.all().length < 2 ? 'true' : null,
        onclick: (e) => { if (compare.all().length < 2) { e.preventDefault(); toast(t('Escolha pelo menos 2 artigos.')); } } }, icon('compare', 18), t('Comparar seleccionados ({n})', { n: compare.all().length }))]
      : empty('heart', t('Ainda não guardou artigos. Toque em "Favorito" na página de um produto.'), h('a', { class: 'btn primary', style: { marginTop: '12px' }, href: '#/catalog' }, t('Ver catálogo'))));
  draw();
  return root;
}

export async function compareView() {
  const ids = compare.all();
  const items = (await Promise.all(ids.map((id) => get('/products/' + id).catch(() => null)))).filter(Boolean);
  if (items.length < 2) return h('div', { class: 'screen' }, topbar(t('Comparar')), empty('compare', t('Escolha pelo menos 2 artigos para comparar.'), h('a', { class: 'btn primary', style: { marginTop: '12px' }, href: '#/favorites' }, t('Abrir favoritos'))));
  const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '—');
  const rows = [
    ['Preço', (p) => priceLabel(p), (p) => -(p.price_min ?? 1e12)],
    ['Qualidade', (p) => stars(p.quality), (p) => p.quality || 0],
    ['Durabilidade', (p) => (p.durability_years ? t('{n} anos', { n: p.durability_years }) : '—'), (p) => p.durability_years || 0],
    ['Peças sobresselentes', (p) => t({ sim: 'Disponíveis', limitado: 'Limitadas', nao: 'Não disponíveis' }[p.spare_parts] || '—'), (p) => ({ sim: 2, limitado: 1 }[p.spare_parts] || 0)],
    ['Fiabilidade do fornecedor', (p) => (p.supplier?.reliability?.score ? `${p.supplier.reliability.score}/100` : '—'), (p) => p.supplier?.reliability?.score || 0],
    ['Prazo de produção', (p) => (p.lead_time_days ? t('{n} dias', { n: p.lead_time_days }) : '—'), (p) => -(p.lead_time_days || 1e6)],
    ['Encomenda mínima', (p) => String(p.moq_qty || p.moq || '—'), (p) => -(p.moq_qty || 1e6)],
    ['Funcionamento', (p) => (p.mechanism ? p.mechanism.split(',').map((x) => t(x.trim())).join(', ') : '—')],
    ['Materiais', (p) => (p.materials ? p.materials.split(',').map((x) => t(x.trim())).join(', ') : '—')],
    ['Estilo', (p) => (p.styles ? p.styles.split(',').map((x) => t(x.trim())).join(', ') : '—')],
    ['Garantia', (p) => p.warranty || '—'],
  ];
  const cols = `120px repeat(${items.length}, minmax(130px, 1fr))`;
  const cell = (content, best, head) => h('div', { style: { padding: '10px 8px', borderTop: '1px solid var(--line-2)', fontSize: '13px', fontWeight: head ? 700 : 500, background: best ? 'var(--green-tint)' : '' } }, content);
  return h('div', { class: 'screen' },
    topbar(t('Comparar')),
    h('p', { class: 'xs muted', style: { margin: 0 } }, t('A verde: o melhor valor em cada linha.')),
    h('div', { style: { overflowX: 'auto', margin: '0 -20px', padding: '0 20px' } },
      h('div', { class: 'card', style: { padding: 0, display: 'grid', gridTemplateColumns: cols, minWidth: `${120 + 130 * items.length}px` } },
        h('div'), items.map((p) => h('a', { href: `#/product/${p.id}`, style: { padding: '12px 8px', fontWeight: 800, fontSize: '14px', color: 'inherit', textDecoration: 'none' } }, p.name)),
        rows.map(([label, fmt, score]) => {
          const scores = score ? items.map(score) : null;
          const max = scores ? Math.max(...scores) : null;
          return [cell(t(label), false, true), items.map((p, i) => cell(fmt(p), scores && scores[i] === max && scores.filter((x) => x === max).length < items.length && max !== 0))];
        }))),
    h('div', { class: 'grid2' }, items.slice(0, 2).map((p) => h('a', { class: 'btn outline sm', href: `#/product/${p.id}` }, t('Ver {n}', { n: p.name.split(' ').slice(0, 2).join(' ') })))),
    h('button', { class: 'btn ghost block', onclick: () => { ls.set('ponte.compare', []); go('#/favorites'); } }, t('Limpar comparação')));
}

// ------------------------------------------------------------------ contentor partilhado
export async function groups({ query = {} } = {}) {
  const list = await get('/groups');
  const open = list.filter((g) => g.status === 'aberto');
  const join = (g) => {
    if (!state.user) return requireLogin('/groups');
    const cbm = h('input', { type: 'number', inputmode: 'decimal', min: 0.5, step: 0.5, max: g.free_cbm, placeholder: t('Ex.: 3'), value: query.m3 || null });
    const goods = h('textarea', { placeholder: t('Ex.: 40 caixas de cadeiras, 2 paletes de tecidos') });
    const close = sheet(h('div', { class: 'stack lg' },
      h('h2', { class: 'h2' }, t('Reservar espaço')),
      h('div', { class: 'small muted' }, `${g.title.replace('[Exemplo] ', '')} · ${t('restam {n} m³', { n: g.free_cbm })}`),
      field(t('Volume (m³)'), cbm, t('Não sabe o volume? Indique uma estimativa: a equipa mede no armazém.')),
      field(t('Mercadoria'), goods),
      h('button', { class: 'btn primary block', onclick: async () => {
        try { await post(`/groups/${g.id}/join`, { cbm: cbm.value, goods: goods.value }); close(); toast(t('Reserva enviada. A equipa confirma por mensagem.')); rerender(); } catch (e) { toast(e.message); }
      } }, t('Reservar'))));
  };
  const card = (g) => h('div', { class: 'card stack' },
    h('div', { class: 'row between top' },
      h('div', { class: 'grow' }, h('div', { class: 'h3' }, g.title), h('div', { class: 'xs muted' }, `${g.origin || ''} → ${g.destination || ''} · ${g.container || ''}`)),
      h('span', { class: 'badge ' + (g.status === 'aberto' ? 'green' : 'grey') }, t({ aberto: 'Aberto', fechado: 'Fechado', enviado: 'A caminho' }[g.status] || g.status))),
    h('div', {},
      h('div', { class: 'row between xs', style: { fontWeight: 700, marginBottom: '4px' } }, h('span', {}, t('{p}% cheio', { p: g.fill_pct })), h('span', {}, t('restam {n} m³', { n: g.free_cbm }))),
      h('div', { style: { height: '10px', borderRadius: '5px', background: 'var(--grey-tint)', overflow: 'hidden' } }, h('div', { style: { height: '10px', width: `${g.fill_pct}%`, background: g.fill_pct > 85 ? 'var(--red)' : 'var(--green)' } }))),
    h('div', { class: 'grid2' },
      h('div', {}, h('div', { class: 'xs muted' }, t('Fecho das reservas')), h('div', { class: 'h3' }, g.closes_at ? fmtDate(g.closes_at, { day: 'numeric', month: 'long' }) : '—')),
      h('div', {}, h('div', { class: 'xs muted' }, t('Partida prevista')), h('div', { class: 'h3' }, g.departs_label || '—'))),
    h('div', { class: 'small' }, g.price_per_cbm ? t('{v} por m³ (frete marítimo)', { v: fmtMoney(g.price_per_cbm, g.currency) }) : t('Preço por m³ indicado pela equipa ao confirmar.')),
    g.notes ? h('div', { class: 'xs muted' }, g.notes) : null,
    g.mine.length ? h('div', { class: 'card tight', style: { background: 'var(--green-tint)', border: 0 } },
      g.mine.map((b) => h('div', { class: 'row between small' }, h('span', {}, t('A sua reserva: {n} m³', { n: b.cbm })),
        h('span', { class: 'row', style: { gap: '6px' } }, h('span', { class: 'badge ' + (b.status === 'confirmado' ? 'green' : 'gold') }, t(b.status === 'confirmado' ? 'Confirmada' : 'A confirmar')),
          b.status === 'pendente' ? h('button', { class: 'link', style: { padding: 0 }, onclick: async () => { await del(`/groups/bookings/${b.id}`); toast(t('Reserva cancelada.')); rerender(); } }, t('Cancelar')) : null)))) : null,
    g.tracking ? h('a', { class: 'card tight row', href: g.tracking.id ? `#/track/${g.tracking.id}` : '#/track', style: { textDecoration: 'none', color: 'inherit', background: 'var(--green-tint)', border: 0 } },
      icon('ship', 18), h('span', { class: 'grow small' }, h('strong', {}, t(g.tracking.phase_label)), g.tracking.eta ? ' · ' + t('Chegada prevista: {d}', { d: fmtDate(g.tracking.eta, { day: 'numeric', month: 'long' }) }) : ''),
      g.tracking.id ? h('span', { class: 'link' }, t('Rastrear')) : null) : null,
    g.status === 'aberto' && g.free_cbm > 0 ? h('button', { class: 'btn primary block', onclick: () => join(g) }, t('Reservar espaço neste contentor')) : null);
  if (query.m3 && open.length) setTimeout(() => join(open.find((g) => g.free_cbm >= Number(query.m3)) || open[0]), 300);
  return h('div', { class: 'screen' },
    topbar(t('Contentor partilhado')),
    h('div', { class: 'card green stack' },
      h('div', { class: 'display', style: { fontSize: '20px' } }, t('Compre pouco, pague só o espaço que usa')),
      h('div', { class: 'small', style: { color: '#D6E9E1' } }, t('Junte a sua mercadoria à de outros clientes num contentor da Ponte. Recebemos tudo no armazém em Guangzhou, verificamos, fotografamos e enviamos.'))),
    (() => {
      // Primeiro os contentores para o país do cliente; depois os outros destinos.
      const ci = countryInfo();
      const mine = list.filter((g) => g.dest_country === ci.code);
      const others = list.filter((g) => g.dest_country !== ci.code);
      if (!open.length) return empty('box', t('Não há contentores abertos neste momento. A equipa abre novos todos os meses.'));
      return [
        h('h2', { class: 'h2' }, `${ci.flag} ${ci.code === 'XX' ? t('Contentores disponíveis') : t('Para {p}', { p: t(ci.name) })}`),
        mine.length ? mine.map(card) : h('div', { class: 'card stack' }, h('div', { class: 'small' }, t('Ainda não há contentor partilhado aberto para {p}. Quando houver clientes suficientes, a equipa abre um.', { p: t(ci.name) })),
          h('a', { class: 'btn outline sm', href: '#/chat?msg=' + encodeURIComponent(t('Quero reservar espaço num contentor partilhado para {p}.', { p: ci.name })) }, t('Avisar-me quando abrir'))),
        others.length ? [h('h2', { class: 'h2' }, t('Outros destinos')), others.map(card)] : null];
    })(),
    h('a', { class: 'btn outline block', href: '#/freight' }, t('Prefiro um contentor só para mim')));
}

// ------------------------------------------------------------------ visita virtual
export async function visit({ query }) {
  let supplier = null, fair = null;
  if (query.supplier) supplier = await get('/suppliers/' + encodeURIComponent(query.supplier)).catch(() => null);
  if (query.fair) fair = (await get('/fairs')).find((f) => String(f.id) === query.fair) || null;
  let kind = fair ? 'feira' : 'fabrica', channel = 'whatsapp';
  const target = h('input', { value: supplier ? supplier.title : fair ? fair.name : '', placeholder: t('Ex.: fábrica de mobiliário, stand da feira…') });
  const preferred = h('input', { placeholder: t('Ex.: terça ou quarta, depois das 10h ({c})', { c: countryInfo().capital || 'hora local' }) });
  const notes = h('textarea', { placeholder: t('O que quer ver? Ex.: linha de produção, amostras, acabamentos') });
  const mine = state.user ? await get('/visits') : [];
  const root = h('div', { class: 'screen' });
  const draw = () => fill(root,
    topbar(t('Visita virtual')),
    h('div', { class: 'card dark stack' },
      h('div', { class: 'display', style: { fontSize: '20px' } }, t('Veja a fábrica ou a feira em directo, sem viajar')),
      h('div', { class: 'small', style: { color: '#BFCBC5' } }, t('A equipa Ponte vai ao local e mostra-lhe tudo por videochamada: produtos, acabamentos, linha de produção. Pode fazer perguntas ao vivo, com tradução.'))),
    h('div', { class: 'grid3' }, [['fabrica', 'Fábrica', 'factory'], ['feira', 'Feira', 'fair'], ['mercado', 'Mercado', 'market']].map(([id, label, ic]) =>
      h('button', { class: 'mode' + (kind === id ? ' on' : ''), onclick: () => { kind = id; draw(); } }, icon(ic, 22), t(label)))),
    field(t('O que quer visitar?'), target),
    field(t('Quando lhe dá jeito?'), preferred),
    h('div', { class: 'field' }, h('span', {}, t('Videochamada por')), h('div', { class: 'row wrap', style: { gap: '6px' } },
      [['whatsapp', 'WhatsApp'], ['wechat', 'WeChat'], ['app', t('Chat da Ponte')]].map(([id, l]) => h('button', { class: 'chip' + (channel === id ? ' on' : ''), onclick: () => { channel = id; draw(); } }, l)))),
    field(t('Notas'), notes),
    h('button', { class: 'btn primary block', onclick: async () => {
      if (!state.user) return requireLogin('/visit' + (query.supplier ? '?supplier=' + query.supplier : ''));
      try {
        await post('/visits', { kind, target: target.value, supplier_code: supplier?.code, preferred: preferred.value, channel, notes: notes.value });
        toast(t('Pedido enviado. A equipa propõe data e hora.')); go('#/visit?r=' + Date.now());
      } catch (e) { toast(e.message); }
    } }, icon('video', 18), t('Pedir visita virtual')),
    mine.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('As minhas visitas')),
      h('div', { class: 'list' }, mine.map((v) => h('div', { class: 'list-item' }, h('span', { class: 'ic sm green' }, icon('video', 18)),
        h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, v.target || t(v.kind)), h('span', { class: 'd' }, v.scheduled_at ? t('Marcada: {d}', { d: v.scheduled_at }) : v.preferred || fmtDate(v.created_at))),
        h('span', { class: 'badge ' + (v.status === 'marcado' ? 'green' : v.status === 'feito' ? 'grey' : 'gold') }, t({ pedido: 'Pedido', marcado: 'Marcada', feito: 'Feita', cancelado: 'Cancelada' }[v.status])))))) : null);
  draw();
  return root;
}

// ------------------------------------------------------------------ pagamento protegido
// Valor aproximado na moeda do país do cliente.
function localApprox(usd) {
  const to = state.user?.currency || countryInfo().currency;
  const v = to !== 'USD' && state.rates ? convert(usd, 'USD', to, state.rates) : null;
  return v ? h('div', { class: 'small muted' }, t('≈ {v} (câmbio indicativo)', { v: fmtMoney(v, to) })) : null;
}

export function paymentBlock(o) {
  if (!o.total_usd && o.kind !== 'compra') return null;
  const pct = o.deposit_pct || 30;
  const box = h('div', { class: 'card stack' });
  const pay = (stage) => {
    const amount = stage === 'total' ? o.total_usd : stage === 'sinal' ? o.total_usd * pct / 100 : o.total_usd * (100 - pct) / 100;
    const picker = payPicker();
    const body = h('div', { class: 'stack lg' });
    const draw = () => fill(body,
      h('h2', { class: 'h2' }, t('Pagar {v}', { v: fmtMoney(amount, 'USD') })),
      localApprox(amount),
      picker.el,
      state.config.paymentsMode === 'test' ? h('div', { class: 'banner-test' }, t('Modo de teste: os pagamentos são simulados e nada é cobrado.')) : null,
      h('button', { class: 'btn primary block', onclick: async () => {
        try { const r = await post(`/orders/${o.id}/pay`, { stage, ...picker.value() }); close(); toast(t('Pagamento registado ({r}).', { r: r.reference })); rerender(); } catch (e) { toast(e.message); }
      } }, t('Confirmar pagamento')));
    draw();
    const close = sheet(body);
  };
  const row = (label, amount, done, action, note) => h('div', { class: 'row between', style: { padding: '8px 0', borderTop: '1px solid var(--line-2)' } },
    h('div', {}, h('div', { class: 'h3' }, label), h('div', { class: 'xs muted' }, note || fmtMoney(amount, 'USD'))),
    done ? h('span', { class: 'badge green' }, icon('check', 11, 3), t('Pago')) : action);
  fill(box,
    h('div', { class: 'row' }, h('span', { class: 'ic green' }, icon('shield', 20)),
      h('div', { class: 'grow' }, h('div', { class: 'h3' }, t('Pagamento protegido')), h('div', { class: 'xs muted' }, t('O dinheiro fica com a Ponte e só segue para a fábrica nas fases combinadas.')))),
    !o.total_usd ? h('div', { class: 'banner-test' }, t('A equipa está a confirmar o valor final. Recebe um aviso quando puder pagar.'))
      : o.payment_plan === 'total'
        ? row(t('Pagamento total'), o.total_usd, o.balance_paid, h('button', { class: 'btn primary sm', onclick: () => pay('total') }, t('Pagar')))
        : [row(t('Sinal ({p}%)', { p: pct }), o.total_usd * pct / 100, o.deposit_paid, h('button', { class: 'btn primary sm', onclick: () => pay('sinal') }, t('Pagar sinal')), t('Para iniciar a produção') + ' · ' + fmtMoney(o.total_usd * pct / 100, 'USD')),
          row(t('Restante ({p}%)', { p: 100 - pct }), o.total_usd * (100 - pct) / 100, o.balance_paid,
            o.deposit_paid && o.status_step >= 4 ? h('button', { class: 'btn primary sm', onclick: () => pay('restante') }, t('Pagar restante')) : h('span', { class: 'badge grey' }, t('Após a inspecção')),
            t('Só depois de aprovar a inspecção com fotos') + ' · ' + fmtMoney(o.total_usd * (100 - pct) / 100, 'USD'))]);
  return box;
}
