// Comércio: fornecedores (anónimos), showroom, cotações, pedidos, carga, parceiros, planos, pagamentos e promoções.
import { h, fill, icon, toast, sheet, field, segmented, chips, empty, topbar, fmtDate, fmtMoney, priceLabel, fileToBase64, copy } from '../ui.js';
import { t } from '../i18n.js';
import { get, post } from '../api.js';
import { state, go, requireLogin, rerender } from '../app.js';
import { ORDER_STEP_LABELS } from './main.js';
import { reliabilityBadge, paymentBlock } from './plus.js';
import { speakButton } from '../voice.js';
import { trackCard } from './track.js';
import { payPicker } from '../pay.js';
import { countryInfo } from '../i18n.js';

export function shrink(file, max = 1280) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve({ name: (file.name || 'foto').replace(/\.\w+$/, '') + '.jpg', mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.8) });
    };
    img.onerror = () => fileToBase64(file).then(resolve);
    img.src = URL.createObjectURL(file);
  });
}

const anonNote = () => h('div', { class: 'card tight row', style: { background: 'var(--green-tint)', border: 0 } },
  h('span', { style: { color: 'var(--green)' } }, icon('shield', 22)),
  h('span', { class: 'small', style: { color: 'var(--green-dk)' } }, t('Fornecedores visitados e verificados pela equipa Ponte. O contacto é feito através de nós: negociamos em chinês e acompanhamos a qualidade.')));

function productCard(p) {
  return h('a', { class: 'prod', href: `#/product/${p.id}` },
    h('div', { class: 'img' }, p.image ? h('img', { src: p.image, alt: '', loading: 'lazy' }) : icon('grid', 30, 1.4)),
    h('div', { class: 'body' },
      h('div', { class: 'h3', style: { lineHeight: 1.25 } }, p.name),
      h('div', { class: 'xs muted' }, p.category),
      h('div', { class: 'small', style: { fontWeight: 800, marginTop: '4px' } }, priceLabel(p))));
}

function supplierCard(s) {
  return h('a', { class: 'card stack', href: `#/supplier/${s.code}`, style: { textDecoration: 'none', color: 'inherit' } },
    h('div', { class: 'row top' },
      h('span', { class: 'ic gold' }, icon('factory', 22)),
      h('div', { class: 'grow' }, h('div', { class: 'h3' }, s.title), h('div', { class: 'small muted' }, [s.city, s.district].filter(Boolean).join(' · '))),
      reliabilityBadge(s.reliability) || (s.verified ? h('span', { class: 'badge green' }, icon('check', 11, 3), t('Verificado')) : null)),
    h('div', { class: 'row wrap', style: { gap: '6px' } },
      h('span', { class: 'badge grey' }, s.category),
      s.moq ? h('span', { class: 'badge grey' }, t('Mín.') + ' ' + s.moq) : null,
      s.product_count ? h('span', { class: 'badge grey' }, (s.product_count === 1 ? t('1 produto') : t('{n} produtos', { n: s.product_count }))) : null,
      s.is_sample ? h('span', { class: 'badge gold' }, t('Exemplo')) : null));
}

// ------------------------------------------------------------------ fornecedores e showroom
export async function suppliers({ query }) {
  const tab = query.tab === 'showroom' ? 'showroom' : 'fornecedores';
  const cat = query.cat || '';
  const q = query.q || '';
  const cats = await get('/categories');
  const list = tab === 'showroom'
    ? await get('/products?' + new URLSearchParams({ ...(cat && { category: cat }), ...(q && { q }) }))
    : await get('/suppliers?' + new URLSearchParams({ ...(cat && { category: cat }), ...(q && { q }) }));
  const nav = (o) => go('#/suppliers?' + new URLSearchParams({ tab, ...(cat && { cat }), ...(q && { q }), ...o }));
  const catList = (tab === 'showroom' ? cats.products : cats.suppliers).map((c) => [c.category, `${c.category} (${c.n})`]);
  const input = h('input', { value: q, placeholder: tab === 'showroom' ? t('Procurar produto') : t('Procurar fornecedor'), enterkeyhint: 'search', 'aria-label': t('Procurar') });

  return h('div', { class: 'screen' },
    topbar(t('Comprar na China')),
    segmented([['fornecedores', t('Fornecedores')], ['showroom', t('Showroom')]], tab, (v) => go('#/suppliers?tab=' + v)),
    h('form', { class: 'search soft', onsubmit: (e) => { e.preventDefault(); nav({ q: input.value.trim() }); } }, icon('search', 20), input),
    chips([['', t('Todos')], ...catList], cat, (v) => go('#/suppliers?' + new URLSearchParams({ tab, ...(v && { cat: v }), ...(q && { q }) }))),
    tab === 'fornecedores' ? anonNote() : h('a', { class: 'card green row', href: '#/catalog', style: { textDecoration: 'none' } }, icon('filter', 22),
      h('span', { class: 'grow' }, h('strong', { style: { display: 'block' } }, t('Catálogo com mega filtro')), h('span', { class: 'small', style: { color: '#D6E9E1' } }, t('Estilo, preço, qualidade, durabilidade, materiais, cores…'))), icon('chevron', 16)),
    list.length
      ? (tab === 'showroom' ? h('div', { class: 'grid2' }, list.map(productCard)) : h('div', { class: 'stack' }, list.map(supplierCard)))
      : empty('search', t('Nada encontrado com estes filtros.'), h('a', { class: 'btn outline', style: { marginTop: '12px' }, href: '#/quote' }, t('Pedir à equipa que encontre'))),
    h('a', { class: 'btn primary block', href: '#/quote' }, icon('plus', 18), t('Não encontra? Diga-nos o que procura')));
}

export async function supplier({ params }) {
  const s = await get('/suppliers/' + encodeURIComponent(params.code));
  const fact = (label, value) => (value ? h('div', { class: 'card tight' }, h('div', { class: 'xs muted', style: { fontWeight: 700 } }, t(label)), h('div', { class: 'h3' }, value)) : null);
  return h('div', { class: 'screen' },
    topbar(t('Fornecedor')),
    h('div', { class: 'card stack lg' },
      h('div', { class: 'row top' },
        h('span', { class: 'ic gold', style: { width: '52px', height: '52px', flexBasis: '52px' } }, icon('factory', 26)),
        h('div', { class: 'grow' }, h('h2', { class: 'display', style: { fontSize: '22px' } }, s.title),
          h('div', { class: 'small muted' }, [s.category, s.city, s.district].filter(Boolean).join(' · ')))),
      h('div', { class: 'row wrap', style: { gap: '6px' } },
        s.verified ? h('span', { class: 'badge green' }, icon('shield', 12, 2.4), t('Verificado pela Ponte')) : null,
        h('span', { class: 'badge grey' }, t('Ref.') + ' ' + s.code),
        s.is_sample ? h('span', { class: 'badge gold' }, t('Exemplo')) : null),
      s.description ? h('p', { class: 'small', style: { margin: 0 } }, s.description) : null),
    reliabilityBadge(s.reliability, true),
    h('div', { class: 'grid2' }, fact('Encomenda mínima', s.moq), fact('Prazo de produção', s.lead_time), fact('Certificações', s.certifications), fact('Idiomas', s.languages)),
    anonNote(),
    h('a', { class: 'btn outline block', href: `#/visit?supplier=${encodeURIComponent(s.code)}` }, icon('video', 18), t('Visita virtual a esta fábrica')),
    s.products.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Produtos')), h('div', { class: 'grid2' }, s.products.map(productCard))) : null,
    h('a', { class: 'btn primary block', href: `#/quote?supplier=${encodeURIComponent(s.code)}` }, t('Pedir cotação via Ponte')));
}

export async function product({ params }) {
  const p = await get('/products/' + Number(params.id));
  return h('div', { class: 'screen' },
    topbar(t('Produto')),
    h('div', { class: 'prod', style: { border: 0 } }, h('div', { class: 'img', style: { borderRadius: '20px' } }, p.image ? h('img', { src: p.image, alt: p.name }) : icon('grid', 48, 1.2))),
    h('div', { class: 'stack' },
      h('div', { class: 'row wrap', style: { gap: '6px' } }, h('span', { class: 'badge grey' }, p.category), p.is_sample ? h('span', { class: 'badge gold' }, t('Exemplo')) : null),
      h('h2', { class: 'display', style: { fontSize: '26px' } }, p.name),
      h('div', { class: 'display', style: { fontSize: '20px', color: 'var(--green)' } }, priceLabel(p)),
      h('div', { class: 'small muted' }, [p.price_unit ? t('por {u}', { u: p.price_unit }) : null, p.moq ? t('Encomenda mínima: {m}', { m: p.moq }) : null, t('Preço FOB indicativo')].filter(Boolean).join(' · ')),
      p.description ? h('p', { style: { margin: '6px 0 0' } }, p.description) : null),
    p.supplier ? h('a', { class: 'card row', href: `#/supplier/${p.supplier.code}`, style: { textDecoration: 'none', color: 'inherit' } },
      h('span', { class: 'ic gold' }, icon('factory', 20)),
      h('span', { class: 'grow' }, h('span', { class: 'h3', style: { display: 'block' } }, p.supplier.title), h('span', { class: 'xs muted' }, [p.supplier.city, p.supplier.verified ? t('Verificado') : null].filter(Boolean).join(' · '))),
      icon('chevron', 16)) : null,
    h('a', { class: 'btn primary block', href: `#/quote?product=${p.id}` }, t('Pedir cotação via Ponte')),
    h('a', { class: 'btn ghost block', href: '#/chat' }, t('Tirar uma dúvida com a equipa')));
}

// ------------------------------------------------------------------ cotação
export async function quoteForm({ query }) {
  let p = null, s = null;
  if (query.product) p = await get('/products/' + Number(query.product));
  else if (query.supplier) s = await get('/suppliers/' + encodeURIComponent(query.supplier));
  const title = h('input', { value: p ? p.name : (query.title || ''), required: true, placeholder: t('Ex.: 200 cadeiras de escritório') });
  const qty = h('input', { placeholder: p?.moq ? t('Mínimo: {m}', { m: p.moq }) : t('Ex.: 200 unidades') });
  const target = h('input', { placeholder: t('Ex.: 25 USD por unidade') });
  const dest = h('select', {}, [...countryInfo().cities.slice(0, 8), 'Outro destino'].map((d) => h('option', { value: d }, t(d))));
  const details = h('textarea', { placeholder: t('Cores, medidas, materiais, logótipo, prazo…') });
  // Pós-venda pedido logo na compra (evita máquinas paradas à espera de peças).
  const EXTRAS = [['kit', 'Kit de peças de desgaste e sobresselentes'], ['manual', 'Manual e lista de peças em português'], ['arranque', 'Arranque e formação por vídeo com a fábrica'], ['tensao', 'Tensão e ficha eléctrica do meu país']];
  const extras = Object.fromEntries(EXTRAS.map(([k]) => [k, h('input', { type: 'checkbox' })]));
  const photos = [];
  const photoList = h('div', { class: 'row wrap', style: { gap: '8px' } });
  const photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr', id: 'qphoto' });
  photoInput.addEventListener('change', async () => {
    for (const f of photoInput.files) {
      if (photos.length >= 3) break;
      const small = await shrink(f);
      photos.push(small);
      photoList.appendChild(h('img', { src: small.data, alt: '', style: { width: '72px', height: '72px', objectFit: 'cover', borderRadius: '12px' } }));
    }
    photoInput.value = '';
  });
  if (query.from === 'identify') {
    // Vem do reconhecimento por fotografia: trazer a foto, o nome e as especificações.
    try {
      const x = JSON.parse(sessionStorage.getItem('ponte.identify') || 'null');
      if (x) {
        if (x.photo) { photos.push(x.photo); photoList.appendChild(h('img', { src: x.photo.data, alt: '', style: { width: '72px', height: '72px', objectFit: 'cover', borderRadius: '12px' } })); }
        if (x.title && !title.value) title.value = x.title;
        if (x.details) details.value = x.details;
      }
    } catch { /* ignorar */ }
  } else if (query.photo) setTimeout(() => photoInput.click(), 300);
  const err = h('div', { class: 'form-error', hidden: true });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, t('Enviar pedido de cotação'));
  return h('div', { class: 'screen' },
    topbar(t('Pedir cotação')),
    p || s ? h('div', { class: 'card tight row' }, h('span', { class: 'ic ' + (p ? 'green' : 'gold') }, icon(p ? 'grid' : 'factory', 20)),
      h('div', { class: 'grow' }, h('div', { class: 'h3' }, p ? p.name : s.title), h('div', { class: 'xs muted' }, p ? priceLabel(p) : s.category))) : null,
    h('div', { class: 'banner-test row' }, icon('info', 18), t('A equipa Ponte negoceia com a fábrica e responde aqui, normalmente em poucos dias úteis.')),
    h('form', { class: 'stack lg', onsubmit: async (e) => {
      e.preventDefault();
      if (!title.value.trim() && !photos.length) { err.textContent = t('Diga-nos o que procura ou envie uma fotografia.'); err.hidden = false; return; }
      btn.disabled = true; err.hidden = true;
      try {
        await post('/quotes', { product_id: p?.id, supplier_code: s?.code, title: title.value || (photos.length ? t('Procurar artigo da fotografia') : ''), quantity: qty.value, target_price: target.value, destination: dest.value, details: [details.value, ...EXTRAS.filter(([k]) => extras[k].checked).map(([, l]) => '• ' + t(l))].filter(Boolean).join('\n'), photos });
        sheet(h('div', { class: 'stack lg center' }, h('span', { class: 'ic green', style: { margin: '0 auto', width: '64px', height: '64px' } }, icon('check', 32, 2.6)),
          h('h2', { class: 'display', style: { fontSize: '24px' } }, t('Pedido enviado')),
          h('p', { class: 'small', style: { margin: 0 } }, t('A equipa Ponte já recebeu o seu pedido. Vai receber a proposta em "As minhas cotações" e uma mensagem no chat.')),
          h('a', { class: 'btn primary block', href: '#/quotes', onclick: () => document.querySelector('.sheet-back')?.remove() }, t('Ver as minhas cotações'))));
      } catch (ex) { err.textContent = ex.message; err.hidden = false; } finally { btn.disabled = false; }
    } },
    query.photo ? h('div', { class: 'card green stack' }, h('div', { class: 'h3' }, t('Procurar por fotografia')),
      h('div', { class: 'small', style: { color: '#D6E9E1' } }, t('Fotografe o artigo (numa loja, revista ou ecrã). A equipa encontra a fábrica que o produz e envia-lhe preços.'))) : null,
    h('div', { class: 'stack' }, h('label', { for: 'qphoto', class: 'btn outline block', style: { borderStyle: 'dashed' } }, icon('camera', 18), t('Adicionar fotografias (até 3)')), photoInput, photoList),
    field(t('O que procura?'), title), field(t('Quantidade'), qty), field(t('Preço-alvo (opcional)'), target), field(t('Destino'), dest), field(t('Detalhes'), details),
    h('div', { class: 'card stack' }, h('div', { class: 'h3' }, t('Para máquinas e equipamentos')), h('div', { class: 'xs muted' }, t('Peça já o pós-venda: evita ter a máquina parada à espera de peças.')),
      EXTRAS.map(([k, l]) => h('label', { class: 'check' }, extras[k], t(l)))),
    err, btn));
}

const Q_STATUS = { novo: ['Recebido', 'grey'], em_analise: ['Em análise', 'gold'], cotado: ['Proposta pronta', 'green'], aceite: ['Aceite', 'green'], recusado: ['Recusado', 'red'], fechado: ['Convertido em pedido', 'solid'] };

export async function quotes() {
  const list = await get('/quotes');
  return h('div', { class: 'screen' },
    topbar(t('As minhas cotações')),
    list.length ? list.map((q) => h('div', { class: 'card stack' },
      h('div', { class: 'row between top' }, h('div', { class: 'grow' }, h('div', { class: 'h3' }, q.title), h('div', { class: 'xs muted' }, fmtDate(q.created_at) + (q.quantity ? ' · ' + q.quantity : '') + (q.photos ? ' · ' + t('{n} foto(s)', { n: q.photos }) : ''))),
        h('span', { class: 'badge ' + Q_STATUS[q.status][1] }, t(Q_STATUS[q.status][0]))),
      q.supplier_title ? h('div', { class: 'xs muted' }, t('Fornecedor') + ': ' + q.supplier_title) : null,
      q.response || q.quoted_price ? h('div', { class: 'card tight', style: { background: 'var(--green-tint)', border: 0 } },
        h('div', { class: 'row between' }, h('div', { class: 'kicker', style: { color: 'var(--green)' } }, t('Proposta da equipa Ponte')),
          speakButton(`${t('Proposta da equipa Ponte')}. ${q.quoted_price || ''}. ${q.response || ''}`)),
        q.quoted_price ? h('div', { class: 'display', style: { fontSize: '20px', margin: '4px 0' } }, q.quoted_price) : null,
        q.response ? h('div', { class: 'small pre' }, q.response) : null) : null,
      q.status === 'cotado' ? h('div', { class: 'row', style: { gap: '8px' } },
        h('button', { class: 'btn primary sm grow', onclick: async () => { await post(`/quotes/${q.id}/accept`); toast(t('Proposta aceite. A equipa vai avançar com o pedido.')); rerender(); } }, t('Aceitar proposta')),
        h('a', { class: 'btn outline sm grow', href: '#/chat' }, t('Negociar no chat'))) : null))
      : empty('doc', t('Ainda não pediu cotações.'), h('a', { class: 'btn primary', style: { marginTop: '12px' }, href: '#/suppliers' }, t('Ver fornecedores'))),
    list.length ? h('a', { class: 'btn outline block', href: '#/quote' }, icon('plus', 18), t('Novo pedido de cotação')) : null);
}

// ------------------------------------------------------------------ pedidos
export async function orders() {
  const list = await get('/orders');
  return h('div', { class: 'screen' },
    topbar(t('Os meus pedidos')),
    list.length ? list.map((o) => h('a', { class: 'card stack', href: `#/order/${o.id}`, style: { textDecoration: 'none', color: 'inherit' } },
      h('div', { class: 'row between' }, h('span', { class: 'xs muted', style: { fontWeight: 800 } }, t('PEDIDO') + ' ' + o.code),
        h('span', { class: 'badge ' + (o.status_step >= 6 ? 'green' : 'gold') }, t(ORDER_STEP_LABELS[o.status_step]))),
      h('div', { class: 'h3' }, o.title), o.route ? h('div', { class: 'small muted' }, o.route) : null,
      h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--grey-tint)', overflow: 'hidden' } },
        h('div', { style: { height: '6px', width: `${(o.status_step / 6) * 100}%`, background: 'var(--green)' } }))))
      : empty('box', t('Ainda não tem pedidos. Quando aceitar uma cotação, o pedido aparece aqui.'), h('a', { class: 'btn primary', style: { marginTop: '12px' }, href: '#/quotes' }, t('Ver cotações'))));
}

const STEP_SUBS = ['Especificações e quantidade confirmadas', 'Fornecedores comparados pela equipa', 'Fotos e vídeo enviados', 'Acompanhamento na fábrica', 'Antes do pagamento final', 'Contentor a caminho', 'Desalfandegamento e entrega'];

export async function order({ params }) {
  const o = await get('/orders/' + Number(params.id));
  return h('div', { class: 'screen' },
    topbar(o.code),
    h('div', { class: 'card stack lg' },
      h('div', { class: 'row between top' }, h('div', { class: 'grow' }, h('div', { class: 'h2' }, o.title), o.route ? h('div', { class: 'small muted' }, o.route) : null),
        speakButton(() => {
          const ev = [...o.events].reverse().find((e) => e.step === o.status_step);
          return `${t('Pedido')} ${o.title}. ${t('Estado')}: ${t(ORDER_STEP_LABELS[o.status_step])}. ${ev?.note || t(STEP_SUBS[o.status_step])}`;
        }, { label: t('Ouvir'), cls: 'btn ghost sm' })),
      o.client_note ? h('div', { class: 'banner-test' }, o.client_note) : null,
      h('div', { class: 'timeline' }, ORDER_STEP_LABELS.map((label, i) => {
        const ev = [...o.events].reverse().find((e) => e.step === i);
        return h('div', { class: 'tl ' + (i < o.status_step ? 'done' : i === o.status_step ? 'now' : '') },
          h('div', { class: 'rail' }, h('span', { class: 'pt' }), i < 6 ? h('span', { class: 'ln' }) : null),
          h('div', { class: 'txt' }, h('div', { class: 'h3', style: { color: i > o.status_step ? 'var(--muted)' : '', fontWeight: i === o.status_step ? 800 : 700 } }, t(label)),
            h('div', { class: 'xs muted' }, ev?.note || t(STEP_SUBS[i])), ev ? h('div', { class: 'xs muted' }, fmtDate(ev.created_at)) : null));
      }))),
    o.shipments?.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Rastreio')), o.shipments.map(trackCard)) : null,
    o.items?.length ? h('div', { class: 'card stack' }, h('h2', { class: 'h3' }, t('Artigos')),
      o.items.map((i) => h('div', { class: 'row between small' }, h('span', { class: 'grow' }, `${i.qty} × ${i.name}${i.color ? ' · ' + t(i.color) : ''}${i.size ? ' · ' + i.size : ''}`),
        h('span', {}, i.unit_price ? fmtMoney(i.unit_price * i.qty, i.currency) : t('a confirmar')))),
      o.delivery_address ? h('div', { class: 'xs muted' }, (o.delivery_mode === 'china' ? t('Receber na China') : t('Entregar em {p}', { p: t(countryInfo().name) })) + ': ' + o.delivery_address) : null) : null,
    paymentBlock(o),
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Documentos')),
      o.documents.length ? h('div', { class: 'list' }, o.documents.map((d) => h('a', { class: 'list-item', href: `/api/documents/${d.id}`, target: '_blank', rel: 'noopener' },
        h('span', { class: 'ic sm green' }, icon('doc', 18)), h('span', { class: 'grow t' }, d.name), h('span', { class: 'chev' }, icon('download', 16)))))
        : h('div', { class: 'small muted' }, t('Os documentos (factura, fotos, Bill of Lading) aparecem aqui quando a equipa os enviar.'))),
    h('a', { class: 'btn outline block', href: '#/chat' }, t('Falar com a equipa sobre este pedido')));
}

// ------------------------------------------------------------------ carga e despacho
const MODES = [
  ['fcl', 'Contentor\nFCL', 'Contentor inteiro de 20 ou 40 pés. Para encomendas grandes.', 'Porto de Nansha · Guangzhou', 'porto'],
  ['lcl', 'Grupagem\nLCL', 'Partilha um contentor com outros clientes. Paga só o volume que usa.', 'Armazém em Guangzhou', 'porto'],
  ['aereo', 'Aéreo', 'Para mercadoria urgente ou de valor elevado.', 'Aeroporto de Baiyun', 'aeroporto'],
  ['courier', 'Courier', 'Amostras e pequenos volumes, porta a porta.', 'Fornecedor', 'A sua morada'],
];

export async function freight({ query }) {
  let mode = MODES.some((m) => m[0] === query.mode) ? query.mode : 'fcl';
  const [fwd, brk, mine] = await Promise.all([get('/partners?type=transitario'), get('/partners?type=despachante'), state.user ? get('/freight') : []]);
  const cur = MODES.find((m) => m[0] === mode);
  const origin = h('input', { value: t(cur[3]) });
  const ci = countryInfo();
  const destOpts = [...ci.ports.map(([, n]) => n), ...ci.airports.map(([, n]) => t('Aeroporto de {c}', { c: n })), t('A sua morada')];
  const defDest = cur[4] === 'porto' ? ci.ports[0]?.[1] : cur[4] === 'aeroporto' ? t('Aeroporto de {c}', { c: ci.airports[0]?.[1] || '' }) : t('A sua morada');
  const dest = h('select', {}, destOpts.map((d) => h('option', { selected: d === defDest }, t(d))));
  const vol = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: 'm³' });
  const wt = h('input', { type: 'number', inputmode: 'decimal', min: 0, step: 'any', placeholder: 'kg' });
  const inc = h('select', {}, ['FOB', 'EXW', 'CIF', 'DAP'].map((x) => h('option', {}, x)));
  const goods = h('textarea', { placeholder: t('Ex.: 200 cadeiras em caixas, 40 volumes') });
  const customs = h('input', { type: 'checkbox', checked: true });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, t('Receber cotações'));
  const partnerRow = (p) => h('div', { class: 'list-item' }, h('span', { class: 'ic sm gold', style: { fontWeight: 800, fontSize: '12px' } }, p.company.replace(/\[.*?\]\s*/, '').slice(0, 2).toUpperCase()),
    h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, p.company), h('span', { class: 'd', style: { display: 'block' } }, [p.services, p.languages].filter(Boolean).join(' · '))),
    h('span', { class: 'badge green' }, t('Parceiro')));

  return h('div', { class: 'screen' },
    topbar(t('Despacho e carga')),
    h('a', { class: 'card green row', href: '#/groups', style: { textDecoration: 'none' } }, h('span', { class: 'ic glass' }, icon('box', 20)),
      h('span', { class: 'grow' }, h('strong', { style: { display: 'block' } }, t('Contentor partilhado')), h('span', { class: 'small', style: { color: '#D6E9E1' } }, t('Compre pouco e pague só os m³ que usa.'))), icon('chevron', 16)),
    h('form', { class: 'card stack lg', onsubmit: async (e) => {
      e.preventDefault();
      if (!state.user) return requireLogin('/freight?mode=' + mode);
      btn.disabled = true;
      try {
        await post('/freight', { mode, origin: origin.value, destination: dest.value, volume_cbm: vol.value, weight_kg: wt.value, incoterm: inc.value, goods: goods.value, include_customs: customs.checked });
        toast(t('Pedido enviado. A equipa compara transitários e responde aqui.'));
        rerender();
      } catch (ex) { toast(ex.message); } finally { btn.disabled = false; }
    } },
    h('h2', { class: 'h2' }, t('Pedir cotação de frete')),
    h('div', { class: 'mode-row' }, MODES.map(([id, label]) => h('button', { type: 'button', class: 'mode' + (id === mode ? ' on' : ''), style: { whiteSpace: 'pre-line' }, onclick: () => go('#/freight?mode=' + id) }, t(label)))),
    h('p', { class: 'small muted', style: { margin: 0 } }, t(cur[2])),
    h('div', { class: 'grid2' }, field(t('Origem'), origin), field(t('Destino'), dest)),
    h('div', { class: 'grid3' }, field(t('Volume'), vol), field(t('Peso'), wt), field('Incoterm', inc)),
    field(t('Mercadoria'), goods),
    h('label', { class: 'check' }, customs, t('Incluir despacho aduaneiro em {p}', { p: t(countryInfo().name) })),
    btn),
    mine.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Os meus pedidos de frete')),
      mine.map((f) => h('div', { class: 'card tight stack' },
        h('div', { class: 'row between' }, h('span', { class: 'h3' }, `${f.mode.toUpperCase()} · ${f.destination || ''}`), h('span', { class: 'badge ' + (f.status === 'cotado' ? 'green' : 'gold') }, t({ novo: 'Recebido', em_analise: 'Em análise', cotado: 'Proposta pronta', fechado: 'Fechado' }[f.status] || f.status))),
        f.response ? h('div', { class: 'small pre' }, f.response) : h('div', { class: 'xs muted' }, fmtDate(f.created_at))))) : null,
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Transitários parceiros')), fwd.length ? h('div', { class: 'list' }, fwd.map(partnerRow)) : h('div', { class: 'small muted' }, t('Em breve.'))),
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Despachantes aduaneiros')), brk.length ? h('div', { class: 'list' }, brk.map(partnerRow)) : h('div', { class: 'small muted' }, t('Em breve.'))),
    h('div', { class: 'card stack' }, h('h2', { class: 'h3' }, t('Documentos para o desalfandegamento')),
      h('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px', lineHeight: 1.8 } },
        ['Factura comercial e packing list', 'Bill of Lading (marítimo) ou AWB (aéreo)', 'Certificado de origem', 'Licenças ou certificados do produto, quando exigidos'].map((d) => h('li', {}, t(d)))),
      h('div', { class: 'xs muted' }, t('O despachante parceiro confirma a lista para a sua mercadoria.'))),
    h('a', { class: 'card dark row', href: '#/partner?type=despachante', style: { textDecoration: 'none' } },
      h('span', { class: 'grow' }, h('span', { style: { display: 'block', fontWeight: 800 } }, t('É despachante ou transitário?')), h('span', { class: 'small', style: { color: '#BFCBC5' } }, t('Registe-se e receba pedidos de clientes.'))),
      h('span', { style: { color: 'var(--gold)' } }, icon('arrow', 20, 2.2))));
}

// ------------------------------------------------------------------ registo de parceiros
const PTYPES = [
  ['despachante', 'Despachante aduaneiro', 'doc'], ['transitario', 'Transitário / carga', 'truck'], ['fornecedor', 'Fornecedor / fábrica', 'factory'],
  ['tecnico', 'Técnico / assistência técnica', 'tool'], ['interprete', 'Intérprete / guia', 'translate'], ['hotel', 'Hotel / restaurante', 'hotel'], ['anunciante', 'Anunciante', 'mega'],
];

export function partner({ query }) {
  let type = PTYPES.some((p) => p[0] === query.type) ? query.type : 'despachante';
  const files = [];
  const root = h('div', { class: 'screen' });
  const inputs = {
    company: h('input', { required: true, placeholder: t('Ex.: Nome Lda') }),
    contact_name: h('input', { value: state.user?.name || '' }),
    email: h('input', { type: 'email', value: state.user?.email || '', required: true }),
    phone: h('input', { type: 'tel', value: state.user?.phone || '' }),
    country: h('input', { placeholder: countryInfo().name, value: countryInfo().code === 'XX' ? '' : countryInfo().name }),
    city: h('input', { placeholder: countryInfo().capital || '' }),
    tax_id: h('input', { placeholder: t('NUIT ou registo comercial') }),
    licence_no: h('input', { placeholder: t('Licença emitida pela autoridade aduaneira') }),
    languages: h('input', { placeholder: t('Português, inglês, chinês…') }),
    services: h('textarea', { placeholder: t('Serviços, zonas, especialidades…') }),
  };
  const fileInput = h('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png,.docx,.xlsx', multiple: true, class: 'sr', id: 'pdocs' });
  const fileList = h('div', { class: 'xs muted' });
  fileInput.addEventListener('change', async () => {
    for (const f of fileInput.files) { if (files.length < 5) files.push(await fileToBase64(f)); }
    fileList.textContent = files.map((f) => f.name).join(', ');
  });
  const err = h('div', { class: 'form-error', hidden: true });

  const draw = () => {
    const btn = h('button', { class: 'btn primary block', type: 'submit' }, t('Enviar para verificação'));
    fill(root, 
      topbar(t('Seja parceiro')),
      h('p', { class: 'small muted', style: { margin: 0 } }, t('Receba clientes de todos os países de língua portuguesa. Todos os parceiros são verificados antes de aparecer na app.')),
      h('div', { class: 'grid2' }, PTYPES.map(([id, label, ic]) => h('button', { type: 'button', class: 'plan' + (id === type ? ' on' : ''), style: { minHeight: '84px', padding: '12px', gap: '8px' }, onclick: () => { type = id; draw(); } },
        icon(ic, 22), h('span', { style: { fontWeight: 700, fontSize: '13px' } }, t(label))))),
      h('form', { class: 'stack lg', onsubmit: async (e) => {
        e.preventDefault();
        btn.disabled = true; err.hidden = true;
        try {
          const body = Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value]));
          await post('/partners', { ...body, type, documents: files });
          fill(root, h('div', { class: 'empty', style: { paddingTop: '80px' } },
            h('span', { class: 'ic gold', style: { width: '80px', height: '80px', margin: '0 auto 16px' } }, icon('shield', 40)),
            h('h1', { class: 'h1' }, t('Pedido recebido')),
            h('p', {}, t('A equipa Ponte vai verificar os seus dados. Assim que for aprovado, o seu perfil fica visível aos clientes.')),
            h('a', { class: 'btn primary block', href: '#/' }, t('Voltar ao início'))));
        } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
      } },
      field(t('Nome da empresa'), inputs.company), field(t('Pessoa de contacto'), inputs.contact_name),
      h('div', { class: 'grid2' }, field(t('Email'), inputs.email), field(t('Telefone'), inputs.phone)),
      h('div', { class: 'grid2' }, field(t('País'), inputs.country), field(t('Cidade'), inputs.city)),
      field(t('NUIT ou registo comercial'), inputs.tax_id),
      type === 'despachante' ? field(t('N.º de licença de despachante'), inputs.licence_no) : null,
      field(t('Idiomas de atendimento'), inputs.languages), field(t('Serviços'), inputs.services),
      h('label', { for: 'pdocs', class: 'btn outline block', style: { borderStyle: 'dashed' } }, icon('upload', 18), t('Carregar documentos (alvará, licença)')), fileInput, fileList,
      err, btn));
  };
  draw();
  return root;
}

// ------------------------------------------------------------------ planos e pagamento
export async function plans() {
  const list = await get('/plans');
  let sel = state.user?.plan === 'explorador' || !state.user ? (list.find((p) => p.highlight)?.id || list[0]?.id) : state.user.plan;
  const root = h('div', { class: 'screen' });
  const draw = () => {
    const cur = list.find((p) => p.id === sel);
    fill(root, 
      topbar(t('Escolha o seu plano')),
      h('p', { class: 'small muted', style: { margin: 0 } }, t('Pague em meticais com carteira móvel ou cartão.')),
      list.map((p) => h('button', { class: 'plan' + (p.id === sel ? ' on' : ''), onclick: () => { sel = p.id; draw(); } },
        h('div', { class: 'row between', style: { width: '100%' } }, h('span', { class: 'display', style: { fontSize: '20px' } }, p.name),
          p.highlight ? h('span', { class: 'badge', style: { background: 'var(--gold)', color: 'var(--ink)' } }, t('Mais escolhido')) : null,
          state.user?.plan === p.id ? h('span', { class: 'badge solid' }, t('Actual')) : null),
        h('div', { style: { fontWeight: 700 } }, p.price_label || ''),
        h('div', { class: 'stack', style: { gap: '6px' } }, p.features.map((f) => h('div', { class: 'row small', style: { gap: '8px', alignItems: 'flex-start' } }, icon('check', 16, 2.6), h('span', {}, f)))))),
      cur && cur.price_amount > 0 && state.user?.plan !== cur.id
        ? h('a', { class: 'btn primary block', href: `#/pay/${cur.id}` }, t('Continuar com {p}', { p: cur.name }))
        : cur && state.user?.plan === cur.id ? h('div', { class: 'badge green', style: { justifyContent: 'center', padding: '12px' } }, t('Este é o seu plano actual'))
          : h('button', { class: 'btn primary block', onclick: () => (state.user ? go(`#/pay/${cur.id}`) : requireLogin(`/pay/${cur.id}`)) }, cur?.price_amount > 0 ? t('Continuar com {p}', { p: cur.name }) : t('Pedir este plano')));
  };
  draw();
  return root;
}

export async function pay({ params }) {
  const plan = (await get('/plans')).find((p) => p.id === params.plan);
  if (!plan) throw new Error('plano');
  const picker = payPicker();
  const root = h('div', { class: 'screen no-tabs' });
  const draw = () => {
    const btn = h('button', { class: 'btn danger block' }, t('Pagar {v}', { v: plan.price_label || '' }));
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await post('/payments', { plan_id: plan.id, ...picker.value() });
        const { refreshUser } = await import('../app.js');
        await refreshUser();
        fill(root, h('div', { class: 'empty', style: { paddingTop: '70px' } },
          h('span', { class: 'ic', style: { width: '90px', height: '90px', margin: '0 auto 16px', background: 'var(--green)', color: '#fff', borderRadius: '45px' } }, icon('check', 44, 2.4)),
          h('h1', { class: 'h1' }, t('Bem-vindo ao plano {p}', { p: plan.name })),
          h('p', {}, t('Referência: {r}', { r: r.reference })),
          r.test ? h('div', { class: 'banner-test' }, t('Modo de teste: nenhum valor foi cobrado.')) : null,
          h('a', { class: 'btn primary block', href: '#/chat', style: { marginTop: '16px' } }, t('Falar com a equipa')),
          h('a', { class: 'link', href: '#/' }, t('Voltar ao início'))));
      } catch (ex) { toast(ex.message); btn.disabled = false; }
    };
    fill(root, 
      topbar(t('Pagamento')),
      state.config.paymentsMode === 'test' ? h('div', { class: 'banner-test row' }, icon('info', 18), t('Modo de teste: os pagamentos são simulados e nada é cobrado.')) : null,
      h('div', { class: 'card green row between' }, h('div', {}, h('div', { class: 'xs', style: { color: '#BFDCD0' } }, t('Plano')), h('div', { class: 'display', style: { fontSize: '20px' } }, plan.name)),
        h('div', { style: { textAlign: 'right' } }, h('div', { class: 'xs', style: { color: '#BFDCD0' } }, t('Total')), h('div', { style: { fontWeight: 800, fontSize: '18px' } }, plan.price_label))),
      h('h2', { class: 'h2' }, t('Como quer pagar?')),
      h('div', { class: 'xs muted' }, t('Meios de pagamento de {p}', { p: `${countryInfo().flag} ${t(countryInfo().name)}` })),
      picker.el,
      h('div', { class: 'row xs muted' }, icon('lock', 16), t('Pagamento processado por um parceiro certificado.')),
      btn);
  };
  draw();
  return root;
}

export async function payments() {
  const list = await get('/payments');
  return h('div', { class: 'screen' }, topbar(t('Pagamentos e recibos')),
    list.length ? h('div', { class: 'list' }, list.map((p) => h('div', { class: 'list-item' }, h('span', { class: 'ic sm green' }, icon('card', 18)),
      h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, `${p.plan_id} · ${p.method}`), h('span', { class: 'd' }, `${p.reference} · ${fmtDate(p.created_at)}`)),
      h('span', { class: 'badge ' + (p.status === 'pago' ? 'green' : 'gold') }, p.status === 'teste' ? t('Teste') : p.status))))
      : empty('card', t('Sem pagamentos.')));
}

// ------------------------------------------------------------------ promoções
export async function promos({ query }) {
  const cat = query.cat || '';
  const all = await get('/promotions');
  const cats = [...new Set(all.map((p) => p.category).filter(Boolean))];
  const list = cat ? all.filter((p) => p.category === cat) : all;
  return h('div', { class: 'screen' },
    topbar(t('Promoções')),
    chips([['', t('Todas')], ...cats.map((c) => [c, t(c)])], cat, (v) => go('#/promos' + (v ? '?cat=' + encodeURIComponent(v) : ''))),
    list.length ? list.map((p) => h('div', { class: 'card stack' },
      h('div', { class: 'row' }, h('span', { class: 'ic gold', style: { fontWeight: 800, fontSize: '13px', fontFamily: 'var(--display)' } }, p.badge || '%'),
        h('div', { class: 'grow' }, h('div', { class: 'h3' }, p.title), h('div', { class: 'xs muted' }, p.partner_name || '')),
        p.sponsored ? h('span', { class: 'badge solid' }, t('Patrocinado')) : null),
      p.description ? h('div', { class: 'small' }, p.description) : null,
      h('div', { class: 'row between' },
        p.code ? h('button', { class: 'chip', style: { borderStyle: 'dashed', fontFamily: 'ui-monospace, monospace' }, onclick: () => copy(p.code) }, icon('copy', 14), p.code) : h('span'),
        h('span', { class: 'xs muted' }, p.valid_label || '')),
      p.link ? h('a', { class: 'btn outline sm', href: p.link, target: '_blank', rel: 'noopener' }, t('Ver oferta')) : null))
      : empty('tag', t('Sem promoções nesta categoria.')),
    h('div', { class: 'card green stack' }, h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Para empresas')),
      h('div', { class: 'display', style: { fontSize: '22px' } }, t('Anuncie a quem compra na China')),
      h('div', { class: 'small', style: { color: '#D6E9E1' } }, t('Importadores e empresários dos países de língua portuguesa, segmentados por país, sector e feira.')),
      h('a', { class: 'btn accent block', href: '#/partner?type=anunciante' }, t('Quero anunciar'))));
}
