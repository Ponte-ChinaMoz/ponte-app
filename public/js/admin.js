// Painel de gestão da Ponte (Lara e António): mensagens, cotações, pedidos, carga, parceiros,
// catálogo privado de fornecedores, conteúdos da app, utilizadores e definições.
import { h, fill, icon, logo, toast, fmtDate, fileToBase64 } from './ui.js';
import { api, get, post, put, patch, del } from './api.js';
import { COUNTRIES, CURRENCIES, countryOf, normalizePhone } from './countries.js';

const root = document.getElementById('admin');
let me = null;
let stats = {};
let pollTimer = null;
const ORDER_STEPS = ['Pedido recebido', 'Cotações', 'Amostra aprovada', 'Em produção', 'Inspecção de qualidade', 'Embarque', 'Chegada ao destino'];
const Q_STATUS = [['novo', 'Novo'], ['em_analise', 'Em análise'], ['cotado', 'Proposta enviada'], ['aceite', 'Aceite pelo cliente'], ['recusado', 'Recusado'], ['fechado', 'Fechado / pedido criado']];
const F_STATUS = [['novo', 'Novo'], ['em_analise', 'Em análise'], ['cotado', 'Proposta enviada'], ['fechado', 'Fechado']];
const P_STATUS = [['pendente', 'Pendente'], ['aprovado', 'Aprovado'], ['recusado', 'Recusado']];
const PLACE_CATS = ['feira', 'zona', 'mercado', 'transporte', 'hotel', 'restaurante', 'saude', 'dinheiro', 'servico'];
// Ligação directa para o WhatsApp do cliente (funciona já, sem a API da Meta).
function waLink(phone, text, country = 'MZ') {
  const d = normalizePhone(phone, country);
  if (!d) return null;
  return h('a', { class: 'btn sm outline', href: `https://wa.me/${d}?text=${encodeURIComponent(text || '')}`, target: '_blank', rel: 'noopener' }, icon('whatsapp', 16), 'WhatsApp');
}
const statusBadge = (list, v) => { const s = list.find((x) => x[0] === v); const c = { novo: 'red', pendente: 'red', em_analise: 'gold', cotado: 'green', aceite: 'green', aprovado: 'green', recusado: 'grey', fechado: 'grey' }[v] || 'grey'; return h('span', { class: 'badge ' + c }, s ? s[1] : v); };

// ------------------------------------------------------------------ catálogos genéricos
const SUPPLIER_OPTS = async () => (await get('/admin/suppliers')).map((s) => [s.id, `${s.public_code} · ${s.company_name || s.public_title}`]);
const PLACE_OPTS = async () => (await get('/admin/places')).map((p) => [p.id, `${p.name} (${p.category})`]);

const CRUD = {
  suppliers: {
    title: 'Fornecedores', icon: 'factory', group: 'Catálogo',
    note: 'Os campos da secção "Privado" nunca são mostrados aos clientes. O cliente vê só o perfil público e a referência.',
    cols: [['public_code', 'Ref.'], ['public_title', 'Título público'], ['company_name', 'Empresa (privado)'], ['category', 'Categoria'], ['city', 'Cidade'], ['verified', 'Verificado', 'bool'], ['active', 'Activo', 'bool']],
    fields: [
      ['§', 'Perfil público (visível aos clientes)'],
      ['public_title', 'Título público *', 'text', { hint: 'Ex.: Fábrica de mobiliário de escritório. Sem o nome da empresa.' }],
      ['category', 'Categoria *', 'text', { hint: 'Ex.: Mobiliário, Têxtil, Energia, Equipamentos' }],
      ['public_code', 'Referência', 'text', { hint: 'Deixe vazio para gerar automaticamente.' }],
      ['city', 'Cidade', 'text'], ['district', 'Zona / distrito', 'text'],
      ['description', 'Descrição', 'textarea', { full: true }],
      ['moq', 'Encomenda mínima', 'text'], ['lead_time', 'Prazo de produção', 'text'],
      ['certifications', 'Certificações', 'text'], ['languages', 'Idiomas', 'text'],
      ['visited_at', 'Visitado em', 'date'], ['verified', 'Verificado pela Ponte', 'bool'], ['active', 'Activo', 'bool', { def: 1 }], ['is_sample', 'Dado de exemplo', 'bool'],
      ['§', 'Privado — só a equipa Ponte vê', { private: true }],
      ['company_name', 'Nome da empresa', 'text'], ['contact_person', 'Pessoa de contacto', 'text'],
      ['phone', 'Telefone', 'text'], ['wechat', 'WeChat', 'text'], ['email', 'Email', 'text'], ['website', 'Site', 'text'],
      ['address', 'Morada', 'textarea', { full: true }], ['commission_pct', 'Comissão (%)', 'number'],
      ['internal_notes', 'Notas internas', 'textarea', { full: true }],
      ['§', 'Fiabilidade (o cliente vê a nota, não o nome)'],
      ['rating_quality', 'Qualidade (1–5)', 'number'], ['rating_delivery', 'Cumprimento de prazos (1–5)', 'number'],
      ['rating_comms', 'Comunicação (1–5)', 'number'], ['orders_done', 'Encomendas anteriores à app', 'number'],
    ],
  },
  products: {
    title: 'Produtos (showroom)', icon: 'grid', group: 'Catálogo',
    cols: [['image', '', 'img'], ['name', 'Produto'], ['category', 'Categoria'], ['price_min', 'Preço mín.'], ['price_max', 'Preço máx.'], ['featured', 'Destaque', 'bool'], ['active', 'Activo', 'bool']],
    fields: [
      ['name', 'Nome *', 'text'], ['category', 'Categoria *', 'text'],
      ['supplier_id', 'Fornecedor', 'select', { options: SUPPLIER_OPTS, full: true }],
      ['description', 'Descrição', 'textarea', { full: true }],
      ['price_min', 'Preço mínimo', 'number'], ['price_max', 'Preço máximo', 'number'],
      ['price_currency', 'Moeda', 'select', { options: Object.keys(CURRENCIES).map((c) => [c, c]), def: 'USD' }], ['price_unit', 'Unidade', 'text', { def: 'unidade' }],
      ['moq', 'Encomenda mínima (texto)', 'text'], ['moq_qty', 'Quantidade mínima (número)', 'number'], ['image', 'Fotografia', 'image', { full: true }],
      ['featured', 'Destacar no início', 'bool'], ['active', 'Activo', 'bool', { def: 1 }], ['buy_online', 'Permitir compra online (cesto)', 'bool', { def: 1 }], ['is_sample', 'Dado de exemplo', 'bool'],
      ['§', 'Atributos do mega filtro'],
      ['styles', 'Estilos', 'text', { full: true, hint: 'Separados por vírgula: minimalista, clássico, vintage, gótico, avant-garde, moderno, industrial, rústico, escandinavo, luxo, desportivo, boho, oriental, africano' }],
      ['quality', 'Qualidade (1 a 5)', 'number'], ['durability_years', 'Durabilidade (anos)', 'number'],
      ['spare_parts', 'Peças sobresselentes', 'select', { options: [['sim', 'Disponíveis'], ['limitado', 'Limitadas'], ['nao', 'Não disponíveis']] }],
      ['mechanism', 'Funcionamento', 'text', { hint: 'manual, mecânico, analógico, digital, eléctrico, solar' }],
      ['colors', 'Cores', 'text', { hint: 'preto, branco, cinzento, vermelho, azul, verde, castanho, bege, dourado, prateado…' }],
      ['materials', 'Materiais', 'text', { hint: 'madeira maciça, metal, couro, algodão…' }], ['sizes', 'Tamanhos / medidas', 'text', { hint: 'S, M, L ou 140 cm, 160 cm' }],
      ['lead_time_days', 'Prazo de produção (dias)', 'number'], ['warranty', 'Garantia', 'text'],
      ['certifications', 'Certificações', 'text'], ['tags', 'Palavras para a pesquisa', 'text', { hint: 'Sinónimos e termos em inglês ou chinês' }],
    ],
  },
  fairs: {
    title: 'Feiras', icon: 'fair', group: 'Conteúdos da app',
    cols: [['name', 'Feira'], ['start_date', 'Início'], ['end_date', 'Fim'], ['city', 'Cidade'], ['confirmed', 'Datas confirmadas', 'bool']],
    fields: [['name', 'Nome *', 'text', { full: true }], ['city', 'Cidade', 'text'], ['venue', 'Local', 'text'], ['start_date', 'Início', 'date'], ['end_date', 'Fim', 'date'],
      ['sectors', 'Sectores', 'textarea', { full: true }], ['tags', 'Etiquetas (filtros)', 'text', { hint: 'Separadas por vírgula: Mobiliário, Têxtil…' }], ['website', 'Site oficial', 'text'],
      ['place_id', 'Local no mapa', 'select', { options: PLACE_OPTS }], ['confirmed', 'Datas confirmadas', 'bool'], ['notes', 'Notas', 'textarea', { full: true }]],
  },
  holidays: {
    title: 'Feriados', icon: 'calendar', group: 'Conteúdos da app',
    cols: [['name_pt', 'Feriado'], ['name_cn', 'Chinês'], ['start_date', 'Início'], ['end_date', 'Fim'], ['official', 'Oficial', 'bool']],
    fields: [['year', 'Ano *', 'number'], ['name_pt', 'Nome (PT) *', 'text'], ['name_en', 'Nome (EN)', 'text'], ['name_cn', 'Nome (中文)', 'text'], ['start_date', 'Início *', 'date'], ['end_date', 'Fim *', 'date'],
      ['official', 'Calendário oficial publicado', 'bool'], ['note', 'Nota', 'textarea', { full: true }]],
  },
  sales_events: {
    title: 'Saldos', icon: 'tag', group: 'Conteúdos da app',
    cols: [['tag', 'Sigla'], ['name_pt', 'Nome'], ['date_label', 'Data'], ['month', 'Mês']],
    fields: [['tag', 'Sigla *', 'text'], ['name_pt', 'Nome (PT) *', 'text'], ['name_en', 'Nome (EN)', 'text'], ['date_label', 'Data (texto)', 'text'], ['month', 'Mês (1–12)', 'number'],
      ['description_pt', 'Descrição (PT)', 'textarea', { full: true }], ['description_en', 'Descrição (EN)', 'textarea', { full: true }]],
  },
  places: {
    title: 'Locais e mapa', icon: 'pin', group: 'Conteúdos da app',
    note: 'Coordenadas em WGS84 (as do Google Maps fora da China, ou do OpenStreetMap). A app converte ao abrir o Amap.',
    cols: [['name', 'Local'], ['category', 'Categoria'], ['city', 'Cidade'], ['lat', 'Lat'], ['lng', 'Lng'], ['is_sample', 'Exemplo', 'bool']],
    fields: [['category', 'Categoria *', 'select', { options: PLACE_CATS.map((c) => [c, c]) }], ['name', 'Nome *', 'text'], ['name_cn', 'Nome em chinês', 'text'],
      ['address_cn', 'Morada em chinês (para o taxista)', 'textarea', { full: true }], ['city', 'Cidade', 'text'], ['district', 'Distrito', 'text'],
      ['lat', 'Latitude', 'number'], ['lng', 'Longitude', 'number'], ['phone', 'Telefone', 'text'], ['hours', 'Horário', 'text'],
      ['description', 'Descrição', 'textarea', { full: true }], ['approximate', 'Localização aproximada', 'bool'], ['is_sample', 'Dado de exemplo', 'bool']],
  },
  promotions: {
    title: 'Promoções e anúncios', icon: 'mega', group: 'Conteúdos da app',
    cols: [['title', 'Título'], ['partner_name', 'Parceiro'], ['category', 'Categoria'], ['code', 'Código'], ['sponsored', 'Patrocinado', 'bool'], ['active', 'Activo', 'bool']],
    fields: [['title', 'Título *', 'text', { full: true }], ['partner_name', 'Parceiro', 'text'], ['category', 'Categoria', 'text', { hint: 'Alojamento, Transporte, Fornecedores, Carga, Restaurantes…' }],
      ['badge', 'Destaque curto', 'text', { hint: 'Ex.: -15%, Grátis' }], ['code', 'Código promocional', 'text'], ['valid_label', 'Validade', 'text'],
      ['description', 'Descrição', 'textarea', { full: true }], ['link', 'Ligação externa', 'text'],
      ['sponsored', 'Patrocinado (aparece no início)', 'bool'], ['active', 'Activo', 'bool', { def: 1 }], ['is_sample', 'Dado de exemplo', 'bool']],
  },
  faq: {
    title: 'Assistente automático', icon: 'chat', group: 'Conteúdos da app',
    note: 'O assistente compara a pergunta do cliente com as palavras-chave e a pergunta. Veja no Resumo as perguntas sem resposta para acrescentar novas entradas.',
    cols: [['lang', 'Idioma'], ['question', 'Pergunta'], ['keywords', 'Palavras-chave'], ['quick', 'Botão rápido', 'bool']],
    fields: [['lang', 'Idioma', 'select', { options: [['pt', 'Português'], ['en', 'English'], ['es', 'Español'], ['it', 'Italiano'], ['fr', 'Français'], ['zh', '中文']], def: 'pt' }],
      ['sort', 'Ordem', 'number'], ['question', 'Pergunta *', 'text', { full: true }], ['answer', 'Resposta *', 'textarea', { full: true, rows: 6 }],
      ['keywords', 'Palavras-chave', 'textarea', { full: true, hint: 'Separadas por vírgula, sem acentos: visto, carta convite, embaixada' }], ['quick', 'Mostrar como botão rápido no chat', 'bool']],
  },
  group_shipments: {
    title: 'Contentores partilhados', icon: 'box', group: 'Gestão',
    note: 'As reservas dos clientes aparecem em "Reservas de contentor". Feche o contentor (estado "fechado") quando estiver cheio ou na data de fecho.',
    cols: [['title', 'Contentor'], ['dest_country', 'País'], ['destination', 'Destino'], ['capacity_cbm', 'Capacidade m³'], ['closes_at', 'Fecho'], ['status', 'Estado']],
    fields: [['title', 'Título *', 'text', { full: true }], ['origin', 'Origem', 'text'], ['destination', 'Destino', 'text'],
      ['dest_country', 'País de destino', 'select', { options: COUNTRIES.map((c) => [c.code, `${c.flag} ${c.name}`]), def: 'MZ', hint: 'Os clientes deste país vêem este contentor primeiro.' }], ['container', 'Contentor', 'text', { hint: '20 pés, 40 pés, 40 pés HC' }],
      ['capacity_cbm', 'Capacidade (m³)', 'number', { def: 67 }], ['price_per_cbm', 'Preço por m³', 'number'], ['currency', 'Moeda', 'select', { options: Object.keys(CURRENCIES).map((c) => [c, c]), def: 'USD' }],
      ['closes_at', 'Fecho das reservas', 'date'], ['departs_label', 'Partida prevista (texto)', 'text'],
      ['status', 'Estado', 'select', { options: [['aberto', 'Aberto'], ['fechado', 'Fechado'], ['enviado', 'Enviado'], ['entregue', 'Entregue']], def: 'aberto' }],
      ['notes', 'Notas para os clientes', 'textarea', { full: true }], ['is_sample', 'Dado de exemplo', 'bool']],
  },
  plans: {
    title: 'Planos', icon: 'star', group: 'Conteúdos da app', textId: true,
    cols: [['id', 'Código'], ['name', 'Nome'], ['price_label', 'Preço (texto)'], ['price_amount', 'Valor'], ['highlight', 'Destaque', 'bool']],
    fields: [['id', 'Código *', 'text', { hint: 'Sem espaços. Não alterar depois de criado.' }], ['name', 'Nome *', 'text'], ['price_label', 'Preço mostrado', 'text', { hint: 'Ex.: 2 500 MT por viagem' }],
      ['price_amount', 'Valor a cobrar', 'number'], ['currency', 'Moeda', 'select', { options: Object.keys(CURRENCIES).map((c) => [c, c]), def: 'USD' }], ['sort', 'Ordem', 'number'],
      ['features', 'Vantagens (uma por linha)', 'lines', { full: true }], ['highlight', 'Marcar como "Mais escolhido"', 'bool']],
  },
};

// ------------------------------------------------------------------ navegação
const NAV = [
  ['Gestão', [['resumo', 'Resumo', 'admin'], ['mensagens', 'Mensagens', 'chat', 'chatsWaiting'], ['cotacoes', 'Cotações', 'doc', 'quotesNew'],
    ['pedidos', 'Pedidos', 'box'], ['rastreio', 'Rastreio', 'ship', 'shipmentsAttention'], ['assistencia', 'Assistência', 'tool', 'serviceOpen'], ['equipamentos', 'Equipamentos', 'gear'], ['carga', 'Carga', 'truck', 'freightOpen'], ['group_shipments', 'Contentores', 'box'], ['reservas', 'Reservas de contentor', 'box', 'bookingsPending'],
    ['visitas', 'Visitas virtuais', 'video', 'visitsPending'], ['parceiros', 'Parceiros', 'shieldPlus', 'partnersPending'], ['utilizadores', 'Clientes', 'user']]],
  ['Catálogo', [['suppliers', 'Fornecedores', 'factory'], ['products', 'Produtos', 'grid']]],
  ['Conteúdos da app', [['fairs', 'Feiras', 'fair'], ['holidays', 'Feriados', 'calendar'], ['sales_events', 'Saldos', 'tag'], ['places', 'Locais e mapa', 'pin'],
    ['promotions', 'Promoções', 'mega'], ['faq', 'Assistente', 'chat'], ['plans', 'Planos', 'star']]],
  ['Sistema', [['definicoes', 'Definições', 'lock']]],
];

function shell(active, title, actions, ...content) {
  const flat = NAV.flatMap(([, items]) => items);
  return h('div', { class: 'adm' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, logo(28), 'Ponte · Painel'),
      NAV.map(([g, items]) => [h('div', { class: 'grp' }, g), items.map(([id, label, ic, key]) =>
        h('a', { href: '#' + id, class: id === active ? 'on' : '' }, icon(ic, 18), label, key && stats[key] ? h('span', { class: 'count' }, String(stats[key])) : null))]),
      h('div', { style: { marginTop: 'auto', paddingTop: '16px' } },
        h('a', { href: '/', target: '_blank' }, icon('arrow', 18), 'Abrir a app'),
        h('a', { href: '#', onclick: async (e) => { e.preventDefault(); await post('/auth/logout'); location.reload(); } }, icon('logout', 18), 'Sair'))),
    h('div', {},
      h('div', { class: 'mobile-nav' }, h('select', { 'aria-label': 'Secção', onchange: (e) => { location.hash = e.target.value; } },
        flat.map(([id, label, , key]) => h('option', { value: id, selected: id === active }, label + (key && stats[key] ? ` (${stats[key]})` : ''))))),
      h('main', { class: 'main' }, h('div', { class: 'main-head' }, h('h1', {}, title), actions || null), ...content)));
}

function drawer(title, ...content) {
  const back = h('div', { class: 'drawer-back' });
  const close = () => back.remove();
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.appendChild(h('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' },
    h('div', { class: 'row between' }, h('h2', { class: 'display', style: { fontSize: '22px' } }, title),
      h('button', { class: 'icon-btn', 'aria-label': 'Fechar', onclick: close }, icon('x', 18))), ...content));
  document.body.appendChild(back);
  return close;
}

const fieldEl = (label, input, hint, full) => {
  const id = 'a' + Math.random().toString(36).slice(2, 8);
  input.id = id;
  return h('div', { class: 'field' + (full ? ' full' : '') }, h('label', { for: id }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
};

// ------------------------------------------------------------------ formulário genérico
async function buildForm(spec, row) {
  const getters = {};
  const items = [];
  for (const f of spec.fields) {
    const [key, label, type, opts = {}] = f;
    if (key === '§') { items.push(h('div', { class: 'full h3' + (type?.private ? ' private' : ''), style: { marginTop: '8px', color: type?.private ? 'var(--red-dk)' : '' } }, label)); continue; }
    const v = row ? row[key] : opts.def;
    let input;
    if (type === 'textarea' || type === 'lines') {
      const val = type === 'lines' ? (() => { try { return JSON.parse(v || '[]').join('\n'); } catch { return v || ''; } })() : (v ?? '');
      input = h('textarea', { rows: opts.rows || 3 });
      input.value = val;
      getters[key] = () => (type === 'lines' ? input.value.split('\n').map((x) => x.trim()).filter(Boolean) : input.value);
    } else if (type === 'bool') {
      input = h('input', { type: 'checkbox', checked: !!Number(v) });
      items.push(h('label', { class: 'check' + (opts.full ? ' full' : '') }, input, label));
      getters[key] = () => input.checked;
      continue;
    } else if (type === 'select') {
      const options = typeof opts.options === 'function' ? await opts.options() : opts.options;
      input = h('select', {}, h('option', { value: '' }, '—'), options.map(([val, lab]) => h('option', { value: val, selected: String(val) === String(v ?? '') }, lab)));
      getters[key] = () => input.value;
    } else if (type === 'image') {
      let url = v || '';
      const preview = h('div', { style: { width: '120px', height: '90px', borderRadius: '12px', background: 'var(--grey-tint)', overflow: 'hidden' } }, url ? h('img', { src: url, style: { width: '100%', height: '100%', objectFit: 'cover' } }) : null);
      const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp' });
      file.addEventListener('change', async () => {
        const f0 = file.files[0];
        if (!f0) return;
        try {
          const r = await post('/admin/upload', await fileToBase64(await shrinkImage(f0)));
          url = r.url;
          fill(preview, h('img', { src: url, style: { width: '100%', height: '100%', objectFit: 'cover' } }));
          toast('Fotografia carregada.');
        } catch (e) { toast(e.message); }
      });
      input = h('div', { class: 'row' }, preview, h('div', { class: 'stack' }, file, h('button', { type: 'button', class: 'btn sm ghost', onclick: () => { url = ''; fill(preview); } }, 'Remover')));
      getters[key] = () => url;
      items.push(h('div', { class: 'field full' }, h('span', {}, label), input));
      continue;
    } else {
      input = h('input', { type: type === 'number' ? 'number' : type === 'date' ? 'date' : 'text', step: type === 'number' ? 'any' : null, value: v ?? '' });
      if (key === 'id' && row && spec.textId) input.readOnly = true;
      getters[key] = () => input.value;
    }
    items.push(fieldEl(label, input, opts.hint, opts.full));
  }
  return { el: h('div', { class: 'form-grid' }, items), values: () => Object.fromEntries(Object.entries(getters).map(([k, g]) => [k, g()])) };
}

// Reduz fotografias grandes antes de carregar (poupa dados móveis).
function shrinkImage(file, max = 1400) {
  return new Promise((resolve) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      if (scale === 1 && file.size < 900e3) return resolve(file);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => resolve(new File([b], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })), 'image/jpeg', 0.82);
    };
    img.onerror = () => resolve(file);
    img.src = URL.createObjectURL(file);
  });
}

async function crudView(res) {
  const spec = CRUD[res];
  const rows = await get('/admin/' + res);
  let q = '';
  const tbody = h('tbody');
  const draw = () => {
    const shown = rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q));
    fill(tbody, shown.length ? shown.map((r) => h('tr', { onclick: () => edit(r) }, spec.cols.map(([k, , type]) => h('td', {},
      type === 'bool' ? (Number(r[k]) ? '✓' : '—')
        : type === 'img' ? (r[k] ? h('img', { src: r[k], alt: '', style: { width: '44px', height: '34px', objectFit: 'cover', borderRadius: '6px' } }) : '')
          : h('span', { class: 'clip' }, r[k] ?? '')))))
      : h('tr', {}, h('td', { colspan: spec.cols.length, class: 'muted' }, 'Sem registos.')));
  };
  draw();

  async function edit(row) {
    const form = await buildForm(spec, row);
    const close = drawer(row ? 'Editar' : 'Novo registo', spec.note ? h('div', { class: 'banner-test' }, spec.note) : null, form.el,
      h('div', { class: 'row', style: { gap: '8px' } },
        h('button', { class: 'btn primary grow', onclick: async () => {
          try {
            if (row) await put(`/admin/${res}/${encodeURIComponent(row.id)}`, form.values());
            else await post('/admin/' + res, form.values());
            toast('Guardado.'); close(); route();
          } catch (e) { toast(e.message); }
        } }, 'Guardar'),
        row ? h('button', { class: 'btn ghost', style: { color: 'var(--red-dk)' }, onclick: async () => {
          if (!confirm('Apagar este registo? Não pode ser desfeito.')) return;
          await del(`/admin/${res}/${encodeURIComponent(row.id)}`); toast('Apagado.'); close(); route();
        } }, icon('trash', 16), 'Apagar') : null));
  }

  const csvInput = h('input', { type: 'file', accept: '.csv,text/csv', class: 'sr', id: 'csv-' + res });
  csvInput.addEventListener('change', async () => {
    const f = csvInput.files[0];
    if (!f) return;
    try {
      const r = await post('/admin/import/' + res, { csv: await f.text() });
      toast(`Importados: ${r.created}` + (r.errors.length ? ` · ${r.errors.length} com erro` : ''));
      if (r.errors.length) drawer('Linhas com erro', h('pre', { class: 'small', style: { whiteSpace: 'pre-wrap' } }, r.errors.join('\n')));
      route();
    } catch (e) { toast(e.message); }
  });
  const template = () => {
    const cols = spec.fields.filter(([k]) => k !== '§').map(([k]) => k);
    const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + cols.join(',') + '\r\n'], { type: 'text/csv' })), download: `modelo-${res}.csv` });
    a.click();
  };

  return shell(res, spec.title,
    h('div', { class: 'row wrap', style: { gap: '8px' } },
      h('button', { class: 'btn primary sm', onclick: () => edit(null) }, icon('plus', 16), 'Novo')),
    spec.note ? h('div', { class: 'banner-test', style: { marginBottom: '12px' } }, spec.note) : null,
    h('div', { class: 'toolbar' },
      h('input', { class: 'input', placeholder: 'Filtrar…', 'aria-label': 'Filtrar', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } }),
      h('span', { class: 'small muted' }, `${rows.length} registos`),
      h('span', { class: 'grow' }),
      h('label', { for: 'csv-' + res, class: 'btn sm outline' }, icon('upload', 16), 'Importar CSV'), csvInput,
      h('a', { class: 'btn sm outline', href: `/api/admin/export/${res}` }, icon('download', 16), 'Exportar CSV'),
      h('button', { class: 'btn sm ghost', onclick: template }, 'Modelo CSV')),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, spec.cols.map(([, l]) => h('th', {}, l)))), tbody)));
}

// ------------------------------------------------------------------ resumo
async function resumo() {
  const s = stats;
  const card = (href, n, l, alert) => h('a', { class: 'stat' + (alert && n ? ' alert' : ''), href }, h('div', { class: 'n' }, String(n ?? 0)), h('div', { class: 'l' }, l));
  const maxDay = Math.max(1, ...s.daily.map((d) => d.n));
  const maxSearch = Math.max(1, ...s.topSearches.map((d) => d.n));
  return shell('resumo', 'Resumo', null,
    s.sampleRows ? h('div', { class: 'banner-test row', style: { marginBottom: '14px' } }, icon('info', 18),
      h('span', { class: 'grow' }, `Há ${s.sampleRows} registos de exemplo (fornecedores, produtos, locais, promoções). Substitua-os pelos reais ou apague-os em Definições.`)) : null,
    h('div', { class: 'stats' },
      card('#mensagens', s.chatsWaiting, 'conversas à espera', true), card('#cotacoes', s.quotesNew, 'cotações novas', true),
      card('#parceiros', s.partnersPending, 'parceiros por aprovar', true), card('#carga', s.freightOpen, 'pedidos de frete novos', true),
      card('#visitas', s.visitsPending, 'visitas por marcar', true), card('#assistencia', s.serviceOpen, 'pedidos de assistência por tratar', true), card('#rastreio', s.shipmentsAttention, 'envios a precisar de atenção', true), card('#reservas', s.bookingsPending, 'reservas de contentor por confirmar', true),
      card('#pedidos', s.ordersActive, 'pedidos em curso'), card('#utilizadores', s.users, `clientes (+${s.users7} esta semana)`),
      card('#suppliers', s.suppliers, 'fornecedores activos'), card('#products', s.products, 'produtos no showroom')),
    h('div', { class: 'panels' },
      h('div', { class: 'panel' }, h('h2', {}, 'Utilizadores activos (14 dias)'),
        s.daily.length ? h('div', { class: 'bars', style: { marginBottom: '22px' } }, s.daily.map((d) => h('div', { style: { height: `${(d.n / maxDay) * 100}%` }, title: `${d.d}: ${d.n}` }, h('span', {}, d.d.slice(8))))) : h('div', { class: 'muted small' }, 'Ainda sem dados.')),
      h('div', { class: 'panel' }, h('h2', {}, 'O que os clientes procuram (30 dias)'),
        s.topSearches.length ? s.topSearches.map((x) => h('div', { class: 'hbar' }, h('span', { style: { width: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, x.q),
          h('div', { class: 'b', style: { width: `${(x.n / maxSearch) * 60}%` } }), h('span', { class: 'muted' }, String(x.n)))) : h('div', { class: 'muted small' }, 'Ainda sem pesquisas.')),
      h('div', { class: 'panel' }, h('h2', {}, 'Perguntas sem resposta automática'),
        h('div', { class: 'xs muted', style: { marginBottom: '8px' } }, `O assistente respondeu sozinho ${s.botAnswered} vezes nos últimos 30 dias. Acrescente estas perguntas em Assistente.`),
        s.botMisses.length ? s.botMisses.map((x) => h('div', { class: 'small', style: { padding: '5px 0', borderTop: '1px solid var(--line-2)' } }, x.q)) : h('div', { class: 'muted small' }, 'Nenhuma.')),
      h('div', { class: 'panel' }, h('h2', {}, 'Últimas cotações'),
        s.recentQuotes.length ? s.recentQuotes.map((q) => h('a', { href: '#cotacoes', class: 'row between small', style: { padding: '6px 0', borderTop: '1px solid var(--line-2)', textDecoration: 'none', color: 'inherit' } },
          h('span', { class: 'grow' }, h('strong', {}, q.title), ' · ', q.user_name), statusBadge(Q_STATUS, q.status))) : h('div', { class: 'muted small' }, 'Ainda sem cotações.')),
      h('div', { class: 'panel' }, h('h2', {}, 'Ecrãs mais vistos (30 dias)'),
        s.screens.length ? s.screens.map((x) => h('div', { class: 'row between small', style: { padding: '3px 0' } }, h('span', {}, x.screen), h('span', { class: 'muted' }, String(x.n)))) : h('div', { class: 'muted small' }, 'Ainda sem dados.')),
      h('div', { class: 'panel' }, h('h2', {}, 'Clientes por país'),
        s.countries?.length ? s.countries.map((x) => h('div', { class: 'row between small', style: { padding: '3px 0' } }, h('span', {}, `${countryOf(x.country).flag} ${countryOf(x.country).name}`), h('strong', {}, String(x.n)))) : h('div', { class: 'muted small' }, '—')),
      h('div', { class: 'panel' }, h('h2', {}, 'Clientes por plano'),
        s.plans.length ? s.plans.map((x) => h('div', { class: 'row between small', style: { padding: '3px 0' } }, h('span', {}, x.plan), h('strong', {}, String(x.n)))) : h('div', { class: 'muted small' }, '—'))));
}

// ------------------------------------------------------------------ mensagens
async function mensagens(params) {
  const convs = await get('/admin/conversations');
  const activeId = Number(params.get('c')) || convs[0]?.id;
  const list = h('div', { class: 'conv-list' }, convs.length ? convs.map((c) => h('button', { class: 'conv' + (c.id === activeId ? ' on' : ''), onclick: () => { location.hash = 'mensagens?c=' + c.id; } },
    h('div', { class: 'nm' }, c.user_name, c.needs_human ? h('span', { class: 'badge red' }, 'à espera') : null, c.unread_admin ? h('span', { class: 'badge gold' }, String(c.unread_admin)) : null),
    h('div', { class: 'lm' }, c.last_body || ''), h('div', { class: 'xs muted' }, c.last_message_at ? fmtDate(c.last_message_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')))
    : h('div', { class: 'muted small', style: { padding: '16px' } }, 'Ainda sem conversas.'));
  let thread = h('div', { class: 'thread' }, h('div', { class: 'muted small', style: { padding: '20px' } }, 'Escolha uma conversa.'));
  if (activeId) {
    const r = await get('/admin/conversations/' + activeId);
    let last = 0;
    const msgs = h('div', { class: 'msgs' });
    const add = (arr) => {
      for (const m of arr) {
        if (m.id <= last) continue;
        last = m.id;
        msgs.appendChild(h('div', { class: 'msg ' + m.sender }, h('div', { class: 'who' }, m.sender === 'bot' ? 'Assistente automático' : m.sender === 'admin' ? (m.sender_name || 'Equipa') : r.conversation.user_name),
          m.body, h('div', { class: 'when' }, fmtDate(m.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))));
      }
      msgs.scrollTop = msgs.scrollHeight;
    };
    add(r.messages);
    const ta = h('textarea', { placeholder: `Responder a ${r.conversation.user_name}…`, 'aria-label': 'Resposta' });
    const send = async () => {
      if (!ta.value.trim()) return;
      try { const x = await post('/admin/conversations/' + activeId, { body: ta.value }); ta.value = ''; add([x.message]); } catch (e) { toast(e.message); }
    };
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); });
    const c = r.conversation;
    thread = h('div', { class: 'thread' },
      h('div', { class: 'row between', style: { padding: '12px 14px', borderBottom: '1px solid var(--line)' } },
        h('div', {}, h('strong', {}, c.user_name), h('div', { class: 'xs muted' }, [c.user_email, c.user_phone, `idioma: ${c.user_lang}`].filter(Boolean).join(' · '))),
        h('div', { class: 'row', style: { gap: '6px' } }, waLink(c.user_phone, `Olá ${c.user_name.split(' ')[0]}, é a equipa Ponte.`, c.user_country),
          h('button', { class: 'btn sm outline', onclick: async () => { await put('/admin/conversations/' + activeId, { needs_human: !c.needs_human }); route(); } }, c.needs_human ? 'Marcar como resolvida' : 'Marcar à espera'))),
      msgs,
      h('div', { class: 'compose' }, ta, h('button', { class: 'btn primary', onclick: send }, icon('send', 16), 'Enviar')),
      h('div', { class: 'xs muted', style: { padding: '0 14px 10px' } }, 'Ctrl+Enter envia. O cliente vê a resposta no chat da app.'));
    clearInterval(pollTimer);
    pollTimer = setInterval(async () => {
      if (document.hidden || !document.body.contains(msgs)) return;
      try { const x = await get(`/admin/conversations/${activeId}?after=${last}`); add(x.messages); } catch { /* ignorar */ }
    }, 5000);
  }
  return shell('mensagens', 'Mensagens', null, h('div', { class: 'inbox' }, list, thread));
}

// ------------------------------------------------------------------ cotações
async function cotacoes() {
  const rows = await get('/admin/quotes');
  const open = async (q) => {
    const supOpts = await SUPPLIER_OPTS();
    const ph = await get(`/admin/quotes/${q.id}/photos`);
    const photosBox = ph.length ? h('div', { class: 'row wrap', style: { gap: '8px' } }, ph.map((d) => h('a', { href: `/api/documents/${d.id}`, target: '_blank' },
      h('img', { src: `/api/documents/${d.id}`, alt: d.name, style: { width: '96px', height: '96px', objectFit: 'cover', borderRadius: '10px' } })))) : null;
    const status = h('select', {}, Q_STATUS.map(([v, l]) => h('option', { value: v, selected: v === q.status }, l)));
    const sup = h('select', {}, h('option', { value: '' }, '— por definir —'), supOpts.map(([v, l]) => h('option', { value: v, selected: v === q.supplier_id }, l)));
    const price = h('input', { value: q.quoted_price || '', placeholder: 'Ex.: 23 USD/un. FOB · total 4 600 USD' });
    const resp = h('textarea', { rows: 6, placeholder: 'Proposta para o cliente: preço, prazo, condições de pagamento, amostra…' });
    resp.value = q.response || '';
    const close = drawer(`Cotação #${q.id}`,
      h('div', { class: 'card stack' },
        h('div', { class: 'h3' }, q.title),
        h('div', { class: 'small' }, [q.quantity && `Quantidade: ${q.quantity}`, q.target_price && `Preço-alvo: ${q.target_price}`, q.destination && `Destino: ${q.destination}`].filter(Boolean).join(' · ')),
        q.details ? h('div', { class: 'small pre' }, q.details) : null,
        q.product_name ? h('div', { class: 'xs muted' }, `Produto: ${q.product_name}`) : null,
        h('div', { class: 'xs muted' }, `Cliente: ${q.user_name} · ${q.user_email}${q.user_phone ? ' · ' + q.user_phone : ''} · ${fmtDate(q.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}`)),
      q.supplier_company ? h('div', { class: 'card tight private small' }, h('strong', {}, 'Fornecedor (privado): '), q.supplier_company) : null,
      photosBox,
      waLink(q.user_phone, `Olá ${q.user_name.split(' ')[0]}, é a equipa Ponte sobre o seu pedido "${q.title}".`, q.user_country),
      h('div', { class: 'form-grid' }, fieldEl('Estado', status), fieldEl('Fornecedor', sup), fieldEl('Preço proposto', price, null, true), fieldEl('Resposta ao cliente', resp, 'Ao escolher "Proposta enviada", o cliente vê a resposta e pode aceitar.', true)),
      h('div', { class: 'row wrap', style: { gap: '8px' } },
        h('button', { class: 'btn primary grow', onclick: async () => {
          await put('/admin/quotes/' + q.id, { status: status.value, supplier_id: sup.value, quoted_price: price.value, response: resp.value });
          toast('Cotação actualizada.'); close(); refreshStats().then(route);
        } }, 'Guardar'),
        h('button', { class: 'btn outline', onclick: async () => { const r = await post(`/admin/quotes/${q.id}/order`, {}); toast('Pedido criado.'); close(); location.hash = 'pedidos?o=' + r.id; } }, icon('box', 16), 'Criar pedido'),
        h('a', { class: 'btn ghost', href: '#mensagens', onclick: async (e) => { e.preventDefault(); const cs = await get('/admin/conversations'); const c = cs.find((x) => x.user_email === q.user_email); close(); location.hash = c ? 'mensagens?c=' + c.id : 'mensagens'; } }, icon('chat', 16), 'Conversa')));
  };
  return shell('cotacoes', 'Cotações', null,
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['#', 'Pedido', 'Cliente', 'Quantidade', 'Destino', 'Fornecedor', 'Estado', 'Data'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.length ? rows.map((q) => h('tr', { onclick: () => open(q) },
        h('td', {}, String(q.id)), h('td', {}, h('span', { class: 'clip' }, q.title)), h('td', {}, q.user_name), h('td', {}, q.quantity || ''), h('td', {}, q.destination || ''),
        h('td', {}, q.supplier_company || q.supplier_title || '—'), h('td', {}, statusBadge(Q_STATUS, q.status)), h('td', {}, fmtDate(q.created_at))))
        : h('tr', {}, h('td', { colspan: 8, class: 'muted' }, 'Ainda sem pedidos de cotação.'))))));
}

// ------------------------------------------------------------------ pedidos
async function pedidos(params) {
  const rows = await get('/admin/orders');
  const open = (o) => {
    let step = o.status_step;
    const steps = h('div', { class: 'steps' });
    const drawSteps = () => fill(steps, ORDER_STEPS.map((l, i) => h('button', { type: 'button', class: i === step ? 'on' : i < step ? 'done' : '', onclick: () => { step = i; drawSteps(); } }, `${i + 1}. ${l}`)));
    drawSteps();
    const title = h('input', { value: o.title });
    const routeIn = h('input', { value: o.route || '' });
    const note = h('textarea', { rows: 3 }); note.value = o.client_note || '';
    const internal = h('textarea', { rows: 3 }); internal.value = o.internal_note || '';
    const ev = h('input', { placeholder: 'Ex.: Amostra aprovada pelo cliente por vídeo' });
    const total = h('input', { type: 'number', step: 'any', value: o.total_usd ?? '' });
    const planSel = h('select', {}, [['fases', 'Protegido por fases'], ['total', 'Pagamento total']].map(([v, l]) => h('option', { value: v, selected: v === o.payment_plan }, l)));
    const dep = h('input', { type: 'number', step: 'any', value: o.deposit_pct ?? 30 });
    const file = h('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx' });
    const vis = h('input', { type: 'checkbox', checked: true });
    const docs = h('div', { class: 'list' }, o.documents.length ? o.documents.map((d) => h('div', { class: 'list-item' }, icon('doc', 18),
      h('a', { class: 'grow', href: `/api/documents/${d.id}`, target: '_blank' }, d.name), d.visible_to_client ? h('span', { class: 'badge green' }, 'cliente vê') : h('span', { class: 'badge grey' }, 'interno'),
      h('button', { class: 'icon-btn ghost', 'aria-label': 'Apagar documento', onclick: async () => { if (confirm('Apagar documento?')) { await del('/admin/documents/' + d.id); toast('Apagado.'); close(); route(); } } }, icon('trash', 16))))
      : h('div', { class: 'small muted', style: { padding: '10px 0' } }, 'Sem documentos.'));
    const close = drawer(`Pedido ${o.code}`,
      h('div', { class: 'small muted' }, `Cliente: ${o.user_name} · ${o.user_email}`),
      o.kind === 'compra' ? h('div', { class: 'card stack small' },
        h('strong', {}, `Compra online · ${o.delivery_mode === 'china' ? 'receber na China' : 'entregar no país do cliente'} · pagamento: ${o.payment_status || '—'}`),
        o.delivery_address ? h('div', {}, o.delivery_address) : null,
        o.items.map((i) => h('div', { class: 'row between' }, h('span', {}, `${i.qty} × ${i.name}${i.color ? ' · ' + i.color : ''}${i.size ? ' · ' + i.size : ''}`), h('span', {}, i.unit_price ? `${(i.unit_price * i.qty).toFixed(2)} ${i.currency}` : 'a confirmar'))),
        o.total_usd ? h('div', { class: 'row between' }, h('strong', {}, 'Total artigos'), h('strong', {}, `${o.total_usd.toFixed(2)} USD`)) : null) : null,
      h('div', { class: 'field' }, h('span', {}, 'Etapa actual'), steps),
      h('div', { class: 'form-grid' }, fieldEl('Título', title), fieldEl('Rota', routeIn), fieldEl('Nota para o cliente', note, 'Aparece no topo do pedido, na app.', true),
        fieldEl('Registo desta actualização', ev, 'Fica no histórico que o cliente vê.', true), fieldEl('Notas internas', internal, 'Só a equipa vê.', true),
        fieldEl('Valor total (USD)', total, 'Necessário para o cliente pagar na app.'), fieldEl('Plano de pagamento', planSel), fieldEl('Sinal (%)', dep)),
      h('div', { class: 'small' }, `Pagamentos: sinal ${o.deposit_paid ? '✓ pago' : 'por pagar'} · restante ${o.balance_paid ? '✓ pago' : 'por pagar'} · estado: ${o.payment_status || '—'}`),
      h('button', { class: 'btn primary', onclick: async () => {
        await put('/admin/orders/' + o.id, { status_step: step, title: title.value, route: routeIn.value, client_note: note.value, internal_note: internal.value, event_note: ev.value,
          total_usd: total.value, payment_plan: planSel.value, deposit_pct: dep.value });
        toast('Pedido actualizado.'); close(); route();
      } }, 'Guardar'),
      h('h3', { class: 'h3' }, 'Rastreio'),
      h('div', { class: 'row wrap', style: { gap: '8px' } },
        o.shipments.map((x) => h('a', { class: 'btn sm outline', href: '#rastreio?s=' + x.id }, icon('ship', 16), `${x.ref} · ${x.phase_label}`)),
        h('a', { class: 'btn sm primary', href: '#rastreio?novo=1&order=' + o.id }, icon('plus', 16), 'Criar envio para este pedido'),
        h('a', { class: 'btn sm outline', href: `#equipamentos?novo=1&order=${o.id}&email=${encodeURIComponent(o.user_email)}&name=${encodeURIComponent(o.title)}` }, icon('gear', 16), 'Registar como equipamento (pós-venda)')),
      h('h3', { class: 'h3' }, 'Documentos'), docs,
      h('div', { class: 'card stack' }, file, h('label', { class: 'check' }, vis, 'Visível para o cliente'),
        h('button', { class: 'btn outline', onclick: async () => {
          if (!file.files[0]) return toast('Escolha um ficheiro.');
          try { await post(`/admin/orders/${o.id}/documents`, { ...(await fileToBase64(file.files[0])), visible_to_client: vis.checked }); toast('Documento carregado.'); close(); route(); } catch (e) { toast(e.message); }
        } }, icon('upload', 16), 'Carregar documento')),
      h('h3', { class: 'h3' }, 'Histórico'),
      h('div', { class: 'small' }, o.events.map((e) => h('div', { style: { padding: '4px 0', borderTop: '1px solid var(--line-2)' } }, `${fmtDate(e.created_at)} · ${ORDER_STEPS[e.step]}${e.note ? ' — ' + e.note : ''}`))));
  };
  const create = () => {
    const email = h('input', { type: 'email', placeholder: 'email do cliente' });
    const title = h('input', { placeholder: 'Ex.: 200 cadeiras de escritório' });
    const routeIn = h('input', { placeholder: 'Ex.: Foshan → Porto de Luanda' });
    const close = drawer('Novo pedido', h('div', { class: 'form-grid' }, fieldEl('Email do cliente', email, null, true), fieldEl('Título', title, null, true), fieldEl('Rota', routeIn, null, true)),
      h('button', { class: 'btn primary', onclick: async () => {
        try { const r = await post('/admin/orders', { user_email: email.value, title: title.value, route: routeIn.value }); close(); location.hash = 'pedidos?o=' + r.id; } catch (e) { toast(e.message); }
      } }, 'Criar'));
  };
  const target = rows.find((o) => String(o.id) === params.get('o'));
  if (target) setTimeout(() => open(target), 50);
  return shell('pedidos', 'Pedidos', h('button', { class: 'btn primary sm', onclick: create }, icon('plus', 16), 'Novo pedido'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Código', 'Pedido', 'Cliente', 'Rota', 'Etapa', 'Actualizado'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.length ? rows.map((o) => h('tr', { onclick: () => open(o) }, h('td', {}, o.code), h('td', {}, o.kind === 'compra' ? h('span', {}, h('span', { class: 'badge gold' }, 'online'), ' ', o.title) : o.title), h('td', {}, o.user_name), h('td', {}, o.route || ''),
        h('td', {}, h('span', { class: 'badge ' + (o.status_step >= 6 ? 'green' : 'gold') }, `${o.status_step + 1}. ${ORDER_STEPS[o.status_step]}`)), h('td', {}, fmtDate(o.updated_at))))
        : h('tr', {}, h('td', { colspan: 6, class: 'muted' }, 'Ainda sem pedidos. Crie a partir de uma cotação ou com "Novo pedido".'))))));
}

// ------------------------------------------------------------------ rastreio
async function rastreio(params) {
  const [rows, meta] = await Promise.all([get('/admin/shipments'), get('/admin/tracking-meta')]);
  const sel = (opts, v, empty = '—') => h('select', {}, h('option', { value: '' }, empty), opts.map(([val, lab]) => h('option', { value: val, selected: String(val) === String(v ?? '') }, lab)));
  const portOpts = (kinds) => meta.ports.filter((p) => kinds.includes(p.kind)).map((p) => [p.code, `${p.name} (${p.code})`]);

  const open = (s) => {
    const f = {
      title: h('input', { value: s?.raw_title || '' , placeholder: 'Opcional: usa o título do pedido' }),
      order_id: sel(meta.orders.map((o) => [o.id, `${o.code} · ${o.title} · ${o.user_name}`]), s ? s.order_id : params.get('order')),
      group_id: sel(meta.groups.map((g) => [g.id, `${g.title} (${g.status})`]), s?.group_id),
      mode: sel([['mar', 'Marítimo'], ['aereo', 'Aéreo'], ['courier', 'Courier'], ['estrada', 'Rodoviário']], s?.mode || 'mar', 'Marítimo'),
      carrier: sel(meta.carriers.map((c) => [c.id, c.name + (c.url ? '' : ' (sem link directo)')]), s?.carrier),
      container_no: h('input', { value: s?.container_no || '', placeholder: 'Ex.: CMAU1234567' }),
      bl_no: h('input', { value: s?.bl_no || '' }), booking_no: h('input', { value: s?.booking_no || '' }),
      tracking_no: h('input', { value: s?.tracking_no || '', placeholder: 'Guia aérea ou de courier' }),
      vessel: h('input', { value: s?.vessel || '' }), voyage: h('input', { value: s?.voyage || '' }),
      origin_port: sel(portOpts(['mar', 'aereo', 'terra']), s?.origin_port), transship_port: sel(portOpts(['mar', 'aereo']), s?.transship_port, 'Sem transbordo'),
      dest_port: sel(portOpts(['mar', 'aereo']), s?.dest_port),
      etd: h('input', { type: 'date', value: s?.etd || '' }), atd: h('input', { type: 'date', value: s?.atd || '' }),
      eta: h('input', { type: 'date', value: s?.eta || '' }), ata: h('input', { type: 'date', value: s?.ata || '' }),
      notes: h('textarea', { rows: 2 }),
    };
    f.notes.value = s?.notes || '';
    const values = () => Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    const form = h('div', { class: 'form-grid' },
      fieldEl('Pedido', f.order_id, 'O cliente do pedido vê o rastreio.', true), fieldEl('Ou contentor partilhado', f.group_id, 'Todos os clientes com reserva vêem o rastreio.', true),
      fieldEl('Título', f.title, null, true), fieldEl('Transporte', f.mode), fieldEl('Transportadora', f.carrier),
      fieldEl('Nº do contentor', f.container_no), fieldEl('Nº do BL', f.bl_no), fieldEl('Nº de reserva (booking)', f.booking_no), fieldEl('Nº da guia (aéreo/courier)', f.tracking_no),
      fieldEl('Navio / voo', f.vessel), fieldEl('Viagem', f.voyage),
      fieldEl('Origem', f.origin_port), fieldEl('Transbordo', f.transship_port), fieldEl('Destino', f.dest_port), h('div'),
      fieldEl('Partida prevista (ETD)', f.etd), fieldEl('Partida real', f.atd), fieldEl('Chegada prevista (ETA)', f.eta, 'Se mudar, os clientes são avisados do atraso.'), fieldEl('Chegada real', f.ata),
      fieldEl('Notas internas', f.notes, null, true));

    // Registar etapa
    let code = 'nota';
    const chips = h('div', { class: 'steps' });
    const drawChips = () => fill(chips, meta.milestones.map((m) => h('button', { type: 'button', class: m.code === code ? 'on' : '', onclick: () => { code = m.code; drawChips(); } }, m.label)));
    drawChips();
    const evPort = sel(meta.ports.map((p) => [p.code, p.name]), '', 'Local (porto, aeroporto…)');
    const evLoc = h('input', { placeholder: 'Ou escreva o local' });
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    const evWhen = h('input', { type: 'datetime-local', value: now });
    const evNote = h('input', { placeholder: 'Ex.: Contentor selado, 38 volumes' });
    const evNotify = h('input', { type: 'checkbox', checked: true });
    const events = s ? h('div', { class: 'small' }, s.events.map((e) => h('div', { class: 'row between', style: { padding: '6px 0', borderTop: '1px solid var(--line-2)' } },
      h('span', {}, `${fmtDate(e.happened_at)} · ${e.label}${e.location ? ' — ' + e.location : ''}${e.note ? ' · ' + e.note : ''}${e.source !== 'equipa' ? ` (${e.source})` : ''}`),
      h('button', { class: 'icon-btn ghost', 'aria-label': 'Apagar etapa', onclick: async () => { if (!confirm('Apagar esta etapa?')) return; await del(`/admin/shipments/${s.id}/events/${e.id}`); toast('Apagada.'); close(); location.hash = 'rastreio?s=' + s.id; route(); } }, icon('trash', 16))))) : null;

    const close = drawer(s ? `Envio ${s.ref}` : 'Novo envio',
      s ? h('div', { class: 'card stack' },
        h('div', { class: 'row between' }, h('strong', {}, `${s.phase_label}${s.eta ? ' · chegada prevista ' + fmtDate(s.eta) : ''}`), s.delayed ? h('span', { class: 'badge red' }, `Atraso ${s.delay_days || ''} d`) : null),
        h('div', { class: 'small muted' }, `${s.users} cliente(s) acompanham este envio`),
        h('div', { class: 'row wrap', style: { gap: '8px' } },
          h('button', { class: 'btn sm outline', onclick: () => { navigator.clipboard?.writeText(`${location.origin}/#/t/${s.share_token}`); toast('Link de partilha copiado.'); } }, icon('copy', 16), 'Copiar link público'),
          h('a', { class: 'btn sm outline', href: `/#/t/${s.share_token}`, target: '_blank' }, icon('arrow', 16), 'Ver como cliente'),
          s.carrier_url ? h('a', { class: 'btn sm outline', href: s.carrier_url, target: '_blank', rel: 'noopener' }, icon('globe', 16), 'Site da transportadora') : null)) : null,
      s ? h('div', { class: 'card stack' }, h('h3', { class: 'h3' }, 'Registar etapa'), chips,
        h('div', { class: 'form-grid' }, fieldEl('Local', evPort), fieldEl('Local (texto)', evLoc), fieldEl('Data e hora', evWhen), fieldEl('Nota para o cliente', evNote)),
        h('label', { class: 'check' }, evNotify, 'Avisar os clientes (mensagem na app e WhatsApp, se activo)'),
        h('button', { class: 'btn primary', onclick: async () => {
          try {
            await post(`/admin/shipments/${s.id}/events`, { code, port: evPort.value, location: evLoc.value, happened_at: evWhen.value.replace('T', ' ') + ':00', note: evNote.value, notify: evNotify.checked });
            toast('Etapa registada.'); close(); location.hash = 'rastreio?s=' + s.id; route();
          } catch (e) { toast(e.message); }
        } }, 'Registar etapa'),
        h('h3', { class: 'h3' }, 'Histórico'), events) : null,
      h('h3', { class: 'h3' }, 'Dados do envio'), form,
      h('div', { class: 'row', style: { gap: '8px' } },
        h('button', { class: 'btn primary grow', onclick: async () => {
          try {
            if (s) await put('/admin/shipments/' + s.id, values());
            else { const r = await post('/admin/shipments', values()); location.hash = 'rastreio?s=' + r.id; }
            toast('Guardado.'); close(); route();
          } catch (e) { toast(e.message); }
        } }, s ? 'Guardar dados' : 'Criar envio e avisar o cliente'),
        s ? h('button', { class: 'btn ghost', style: { color: 'var(--red-dk)' }, onclick: async () => { if (!confirm('Apagar este envio e o histórico?')) return; await del('/admin/shipments/' + s.id); toast('Apagado.'); close(); location.hash = 'rastreio'; route(); } }, icon('trash', 16), 'Apagar') : null));
  };
  const target = rows.find((r) => String(r.id) === params.get('s'));
  if (target) setTimeout(() => open(target), 50);
  if (params.get('novo')) setTimeout(() => open(null), 50);
  return shell('rastreio', 'Rastreio de envios', h('button', { class: 'btn primary sm', onclick: () => open(null) }, icon('plus', 16), 'Novo envio'),
    h('div', { class: 'banner-test', style: { marginBottom: '12px' } }, 'Cada etapa registada aparece ao cliente com o mapa e a data prevista, e gera um aviso. A etapa do pedido avança sozinha (embarque, chegada). '
      + (meta.webhook ? 'Integração automática activa: os eventos da transportadora chegam por /api/tracking/webhook.' : 'Pode ligar um serviço de rastreio automático (ver TRACKING_WEBHOOK_TOKEN no .env).')),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Ref.', 'Envio', 'Ligado a', 'Fase', 'Chegada prevista', 'Última etapa', 'Actualizado'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.length ? rows.map((s) => h('tr', { onclick: () => open(s) }, h('td', {}, s.ref), h('td', {}, s.title),
        h('td', {}, s.order ? s.order.code : s.group ? 'Contentor partilhado' : '—'),
        h('td', {}, h('span', { class: 'badge ' + (s.delayed || s.overdue ? 'red' : s.phase >= 5 ? 'green' : 'gold') }, s.phase_label + (s.delayed ? ' · atraso' : ''))),
        h('td', {}, s.eta ? fmtDate(s.eta) : '—'), h('td', {}, s.events[0] ? `${s.events[0].label} · ${fmtDate(s.events[0].happened_at)}` : '—'), h('td', {}, fmtDate(s.updated_at))))
        : h('tr', {}, h('td', { colspan: 7, class: 'muted' }, 'Ainda sem envios. Crie um quando a mercadoria sair do armazém.'))))));
}

// ------------------------------------------------------------------ assistência pós-venda
const SVC_ST = [['novo', 'Recebido'], ['diagnostico', 'Em diagnóstico com a fábrica'], ['proposta', 'Proposta enviada'], ['aceite', 'Aceite pelo cliente'], ['em_resolucao', 'Em resolução'], ['resolvido', 'Resolvido'], ['fechado', 'Fechado']];
const SVC_SOL = [['remota', 'Apoio remoto por vídeo'], ['peca', 'Envio de peça'], ['tecnico', 'Técnico parceiro local'], ['garantia', 'Garantia (reparação/troca)'], ['devolucao', 'Devolução à fábrica'], ['outro', 'Outra']];
const SVC_KIND = { avaria: 'Avaria', pecas: 'Peças', manutencao: 'Manutenção', instalacao: 'Instalação', duvida: 'Dúvida' };
async function assistencia(params) {
  const [rows, techs] = await Promise.all([get('/admin/service'), get('/admin/partners')]);
  const tecnicos = techs.filter((p) => p.type === 'tecnico' && p.status === 'aprovado');
  const open = (tk) => {
    const status = h('select', {}, SVC_ST.map(([v, l]) => h('option', { value: v, selected: v === tk.status }, l)));
    const sol = h('select', {}, h('option', { value: '' }, '—'), SVC_SOL.map(([v, l]) => h('option', { value: v, selected: v === tk.solution_type }, l)));
    const solution = h('textarea', { rows: 3, placeholder: 'O que a fábrica propõe, passos, prazo' }); solution.value = tk.solution || '';
    const quote = h('input', { type: 'number', step: 'any', value: tk.quote_usd ?? '' });
    const partner = h('select', {}, h('option', { value: '' }, '—'), tecnicos.map((p) => h('option', { value: p.id, selected: p.id === tk.partner_id }, `${p.company} · ${p.city || ''} ${p.country || ''}`)));
    const note = h('textarea', { rows: 2, placeholder: 'Mensagem para o cliente (fica no histórico e é enviada como aviso)' });
    const internal = h('textarea', { rows: 2 }); internal.value = tk.internal_note || '';
    const notify = h('input', { type: 'checkbox', checked: true });
    const close = drawer(`${tk.code} · ${SVC_KIND[tk.kind] || tk.kind}`,
      h('div', { class: 'card stack small' },
        h('div', { class: 'row between' }, h('strong', {}, tk.title), tk.urgency === 'parada' ? h('span', { class: 'badge red' }, 'MÁQUINA PARADA') : tk.urgency === 'limitada' ? h('span', { class: 'badge gold' }, 'com problemas') : null),
        h('div', {}, `${tk.user_name} · ${tk.user_email} · ${countryOf(tk.user_country).flag} ${countryOf(tk.user_country).name}`),
        waLink(tk.user_phone, `Olá ${String(tk.user_name || '').split(' ')[0]}, é a equipa Ponte sobre o pedido de assistência ${tk.code}.`, tk.user_country),
        tk.equipment ? h('div', {}, `Equipamento: ${tk.equipment.name} ${tk.equipment.model || ''} ${tk.equipment.serial_no ? '· S/N ' + tk.equipment.serial_no : ''} · ${tk.equipment.in_warranty ? 'dentro da garantia' : tk.equipment.in_warranty === false ? 'fora da garantia' : 'garantia por indicar'}`) : null,
        tk.error_code ? h('div', {}, `Código de erro: ${tk.error_code}`) : null,
        tk.description ? h('div', { class: 'pre' }, tk.description) : null,
        tk.parts ? h('div', { class: 'pre' }, h('strong', {}, 'Peças: '), tk.parts) : null,
        tk.photos.length ? h('div', { class: 'row wrap', style: { gap: '6px' } }, tk.photos.map((p) => h('a', { href: `/api/documents/${p.id}`, target: '_blank' }, h('img', { src: `/api/documents/${p.id}`, style: { width: '84px', height: '84px', objectFit: 'cover', borderRadius: '8px' } })))) : null),
      tk.supplier ? h('div', { class: 'card stack small', style: { background: 'var(--red-tint)' } }, h('strong', {}, 'Fábrica (só a equipa vê)'),
        h('div', {}, `${tk.supplier.public_code} · ${tk.supplier.company_name || ''}`), h('div', {}, [tk.supplier.contact_person, tk.supplier.phone, tk.supplier.wechat ? 'WeChat ' + tk.supplier.wechat : null, tk.supplier.email].filter(Boolean).join(' · '))) : null,
      h('div', { class: 'form-grid' }, fieldEl('Estado', status), fieldEl('Solução', sol), fieldEl('Descrição da solução', solution, 'O cliente vê.', true),
        fieldEl('Custo para o cliente (USD)', quote, 'Vazio se for garantia.'), fieldEl('Técnico parceiro', partner),
        fieldEl('Mensagem ao cliente', note, null, true), fieldEl('Notas internas', internal, 'Só a equipa vê.', true)),
      h('label', { class: 'check' }, notify, 'Avisar o cliente (mensagem na app e WhatsApp, se activo)'),
      h('div', { class: 'row wrap', style: { gap: '8px' } },
        h('button', { class: 'btn primary grow', onclick: async () => {
          try { await put('/admin/service/' + tk.id, { status: status.value, solution_type: sol.value, solution: solution.value, quote_usd: quote.value, partner_id: partner.value, note: note.value, internal_note: internal.value, notify: notify.checked }); toast('Guardado.'); close(); route(); } catch (e) { toast(e.message); }
        } }, 'Guardar'),
        tk.order ? h('a', { class: 'btn outline', href: '#pedidos?o=' + tk.order.id }, `Pedido ${tk.order.code}`)
          : h('button', { class: 'btn outline', onclick: async () => { try { const r = await post(`/admin/service/${tk.id}/order`, { total_usd: quote.value }); toast('Encomenda de peças criada.'); close(); location.hash = 'pedidos?o=' + r.id; } catch (e) { toast(e.message); } } }, icon('box', 16), 'Criar encomenda de peças')),
      h('h3', { class: 'h3' }, 'Histórico'),
      h('div', { class: 'small' }, tk.events.map((e) => h('div', { style: { padding: '5px 0', borderTop: '1px solid var(--line-2)' } }, `${fmtDate(e.created_at)} · ${e.author === 'cliente' ? 'Cliente' : 'Equipa'}${e.status ? ' · ' + (SVC_ST.find((x) => x[0] === e.status)?.[1] || e.status) : ''}${e.note ? ' — ' + e.note : ''}`))));
  };
  const target = rows.find((r) => String(r.id) === params.get('t'));
  if (target) setTimeout(() => open(target), 50);
  return shell('assistencia', 'Assistência pós-venda', h('a', { class: 'btn outline sm', href: '#equipamentos' }, icon('gear', 16), 'Equipamentos dos clientes'),
    h('div', { class: 'banner-test', style: { marginBottom: '12px' } }, 'Fluxo: receber → falar com a fábrica (fotos, vídeo, código de erro) → enviar proposta (remota, peça, técnico, garantia) → resolver. Peças: "Criar encomenda de peças" gera um pedido com pagamento e rastreio.'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Código', 'Tipo', 'Pedido', 'Cliente', 'Urgência', 'Estado', 'Actualizado'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.length ? rows.map((tk) => h('tr', { onclick: () => open(tk) }, h('td', {}, tk.code), h('td', {}, SVC_KIND[tk.kind] || tk.kind), h('td', {}, tk.title),
        h('td', {}, `${countryOf(tk.user_country).flag} ${tk.user_name || ''}`),
        h('td', {}, tk.urgency === 'parada' ? h('span', { class: 'badge red' }, 'parada') : tk.urgency === 'limitada' ? h('span', { class: 'badge gold' }, 'problemas') : '—'),
        h('td', {}, statusBadge(SVC_ST, tk.status)), h('td', {}, fmtDate(tk.updated_at))))
        : h('tr', {}, h('td', { colspan: 7, class: 'muted' }, 'Sem pedidos de assistência.'))))));
}

async function equipamentos(params) {
  const [rows, sups] = await Promise.all([get('/admin/equipment'), get('/admin/suppliers')]);
  const open = (e) => {
    const f = {
      user_email: h('input', { type: 'email', value: e?.user_email || params.get('email') || '' }),
      order_id: h('input', { type: 'number', value: e?.order_id || params.get('order') || '' }),
      name: h('input', { value: e?.name || params.get('name') || '' }), brand: h('input', { value: e?.brand || '' }), model: h('input', { value: e?.model || '' }),
      serial_no: h('input', { value: e?.serial_no || '' }), category: h('input', { value: e?.category || '' }),
      purchased_at: h('input', { type: 'date', value: e?.purchased_at || '' }), warranty_months: h('input', { type: 'number', value: e?.warranty_months ?? 12 }),
      maint_interval_days: h('input', { type: 'number', value: e?.maint_interval_days ?? '' }), voltage: h('input', { value: e?.voltage || '' }), power: h('input', { value: e?.power || '' }),
      wear_parts: h('textarea', { rows: 2 }), specs: h('textarea', { rows: 3 }),
      supplier_id: h('select', {}, h('option', { value: '' }, '—'), sups.map((s) => h('option', { value: s.id, selected: s.id === e?.supplier_id }, `${s.public_code} · ${s.company_name || s.public_title}`))),
    };
    f.wear_parts.value = e?.wear_parts || ''; f.specs.value = e?.specs || '';
    const vals = () => Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    const file = h('input', { type: 'file', accept: '.pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx' });
    const close = drawer(e ? e.name : 'Registar equipamento de cliente',
      e ? h('div', { class: 'small muted' }, `${e.user_name} · ${e.user_email}`) : null,
      h('div', { class: 'form-grid' },
        e ? null : fieldEl('Email do cliente', f.user_email), e ? null : fieldEl('N.º interno do pedido (opcional)', f.order_id),
        fieldEl('Nome *', f.name, null, true), fieldEl('Marca', f.brand), fieldEl('Modelo', f.model), fieldEl('N.º de série', f.serial_no), fieldEl('Categoria', f.category),
        fieldEl('Data de compra', f.purchased_at), fieldEl('Garantia (meses)', f.warranty_months), fieldEl('Manutenção a cada (dias)', f.maint_interval_days, 'Gera lembretes automáticos.'),
        fieldEl('Tensão', f.voltage), fieldEl('Potência', f.power), fieldEl('Fábrica (privado)', f.supplier_id, 'Para a equipa contactar a fábrica certa.', true),
        fieldEl('Peças de desgaste', f.wear_parts, null, true), fieldEl('Especificações', f.specs, null, true)),
      h('button', { class: 'btn primary', onclick: async () => {
        try { if (e) await put('/admin/equipment/' + e.id, vals()); else await post('/admin/equipment', vals()); toast('Guardado.'); close(); route(); } catch (err) { toast(err.message); }
      } }, e ? 'Guardar' : 'Registar e avisar o cliente'),
      e ? h('div', { class: 'card stack' }, h('strong', {}, 'Manual / lista de peças / certificado'), file,
        h('button', { class: 'btn outline', onclick: async () => {
          if (!file.files[0]) return toast('Escolha um ficheiro.');
          try { await post(`/admin/equipment/${e.id}/documents`, await fileToBase64(file.files[0])); toast('Documento carregado: o cliente já o vê.'); } catch (err) { toast(err.message); }
        } }, icon('upload', 16), 'Carregar para o cliente')) : null);
  };
  if (params.get('novo')) setTimeout(() => open(null), 50);
  return shell('equipamentos', 'Equipamentos dos clientes', h('button', { class: 'btn primary sm', onclick: () => open(null) }, icon('plus', 16), 'Registar equipamento'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Equipamento', 'Cliente', 'Modelo / série', 'Garantia', 'Próxima manutenção', 'Estado'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.length ? rows.map((e) => h('tr', { onclick: () => open(e) }, h('td', {}, e.name), h('td', {}, e.user_name), h('td', {}, [e.model, e.serial_no].filter(Boolean).join(' · ')),
        h('td', {}, e.warranty_until ? `${fmtDate(e.warranty_until)}${e.in_warranty ? '' : ' (expirada)'}` : '—'),
        h('td', {}, e.next_maint ? h('span', { class: 'badge ' + (e.maint_days < 0 ? 'red' : e.maint_days <= 7 ? 'gold' : 'green') }, fmtDate(e.next_maint)) : '—'),
        h('td', {}, e.status === 'avariado' ? h('span', { class: 'badge red' }, 'avariado') : e.status)))
        : h('tr', {}, h('td', { colspan: 6, class: 'muted' }, 'Ainda sem equipamentos registados.'))))));
}

// ------------------------------------------------------------------ carga
async function carga() {
  const rows = await get('/admin/freight');
  const open = (f) => {
    const status = h('select', {}, F_STATUS.map(([v, l]) => h('option', { value: v, selected: v === f.status }, l)));
    const resp = h('textarea', { rows: 6, placeholder: 'Proposta: transitário, preço, prazo, despacho incluído…' }); resp.value = f.response || '';
    const close = drawer(`Frete #${f.id}`,
      h('div', { class: 'card small stack' }, h('strong', {}, `${f.mode.toUpperCase()} · ${f.origin || ''} → ${f.destination || ''}`),
        h('div', {}, [f.volume_cbm && `${f.volume_cbm} m³`, f.weight_kg && `${f.weight_kg} kg`, f.incoterm, f.include_customs ? 'com despacho aduaneiro' : 'sem despacho'].filter(Boolean).join(' · ')),
        f.goods ? h('div', { class: 'pre' }, f.goods) : null, h('div', { class: 'xs muted' }, `Cliente: ${f.user_name} · ${f.user_email}${f.user_phone ? ' · ' + f.user_phone : ''}`)),
      h('div', { class: 'form-grid' }, fieldEl('Estado', status), fieldEl('Resposta ao cliente', resp, null, true)),
      h('button', { class: 'btn primary', onclick: async () => { await put('/admin/freight/' + f.id, { status: status.value, response: resp.value }); toast('Guardado.'); close(); refreshStats().then(route); } }, 'Guardar'));
  };
  return shell('carga', 'Pedidos de frete', null, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['#', 'Tipo', 'Rota', 'Volume / peso', 'Cliente', 'Estado', 'Data'].map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.length ? rows.map((f) => h('tr', { onclick: () => open(f) }, h('td', {}, String(f.id)), h('td', {}, f.mode.toUpperCase()), h('td', {}, `${f.origin || ''} → ${f.destination || ''}`),
      h('td', {}, [f.volume_cbm && `${f.volume_cbm} m³`, f.weight_kg && `${f.weight_kg} kg`].filter(Boolean).join(' · ')), h('td', {}, f.user_name), h('td', {}, statusBadge(F_STATUS, f.status)), h('td', {}, fmtDate(f.created_at))))
      : h('tr', {}, h('td', { colspan: 7, class: 'muted' }, 'Ainda sem pedidos de frete.'))))));
}

// ------------------------------------------------------------------ parceiros
async function parceiros() {
  const rows = await get('/admin/partners');
  const open = (p) => {
    const note = h('textarea', { rows: 3 }); note.value = p.admin_note || '';
    const services = h('textarea', { rows: 3 }); services.value = p.services || '';
    const listed = h('input', { type: 'checkbox', checked: !!p.listed });
    const save = async (status) => { await put('/admin/partners/' + p.id, { status, admin_note: note.value, services: services.value, listed: listed.checked }); toast('Guardado.'); close(); refreshStats().then(route); };
    const close = drawer(p.company,
      h('div', { class: 'card small stack' },
        h('div', {}, h('strong', {}, p.type), ' · ', statusBadge(P_STATUS, p.status)),
        h('div', {}, [p.contact_name, p.email, p.phone].filter(Boolean).join(' · ')),
        h('div', {}, [p.city, p.country].filter(Boolean).join(', ')),
        p.tax_id ? h('div', {}, `NUIT / registo: ${p.tax_id}`) : null, p.licence_no ? h('div', {}, `Licença: ${p.licence_no}`) : null,
        p.languages ? h('div', {}, `Idiomas: ${p.languages}`) : null),
      p.documents.length ? h('div', { class: 'list' }, p.documents.map((d) => h('a', { class: 'list-item', href: `/api/documents/${d.id}`, target: '_blank' }, icon('doc', 18), h('span', { class: 'grow' }, d.name)))) : h('div', { class: 'small muted' }, 'Sem documentos anexados.'),
      h('div', { class: 'form-grid' }, fieldEl('Serviços (mostrado aos clientes)', services, null, true), fieldEl('Nota interna', note, null, true)),
      h('label', { class: 'check' }, listed, 'Mostrar na lista de parceiros da app (apenas nome e serviços)'),
      h('div', { class: 'row wrap', style: { gap: '8px' } },
        h('button', { class: 'btn primary grow', onclick: () => save('aprovado') }, icon('check', 16), 'Aprovar'),
        h('button', { class: 'btn outline', onclick: () => save('recusado') }, 'Recusar'),
        h('button', { class: 'btn ghost', onclick: () => save(p.status) }, 'Guardar'),
        h('button', { class: 'btn ghost', style: { color: 'var(--red-dk)' }, onclick: async () => { if (confirm('Apagar este registo?')) { await del('/admin/partners/' + p.id); close(); route(); } } }, icon('trash', 16))));
  };
  return shell('parceiros', 'Parceiros', null, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['Empresa', 'Tipo', 'Cidade', 'Contacto', 'Estado', 'Data'].map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.length ? rows.map((p) => h('tr', { onclick: () => open(p) }, h('td', {}, p.company), h('td', {}, p.type), h('td', {}, [p.city, p.country].filter(Boolean).join(', ')),
      h('td', {}, p.email || ''), h('td', {}, statusBadge(P_STATUS, p.status)), h('td', {}, fmtDate(p.created_at))))
      : h('tr', {}, h('td', { colspan: 6, class: 'muted' }, 'Ainda sem registos de parceiros.'))))));
}

// ------------------------------------------------------------------ reservas de contentor
async function reservas() {
  const rows = await get('/admin/group_bookings');
  const open = (b) => {
    const st = h('select', {}, [['pendente', 'Pendente'], ['confirmado', 'Confirmada'], ['cancelado', 'Cancelada']].map(([v, l]) => h('option', { value: v, selected: v === b.status }, l)));
    const note = h('textarea', { rows: 3 }); note.value = b.admin_note || '';
    const close = drawer(`Reserva #${b.id}`,
      h('div', { class: 'card small stack' }, h('strong', {}, b.shipment_title), h('div', {}, `${b.cbm} m³ · ${b.goods || ''}`), h('div', { class: 'muted' }, `${b.user_name} · ${b.user_email}`)),
      waLink(b.user_phone, `Olá ${b.user_name.split(' ')[0]}, é a equipa Ponte sobre a sua reserva de ${b.cbm} m³ no contentor partilhado.`, b.user_country),
      h('div', { class: 'form-grid' }, fieldEl('Estado', st), fieldEl('Nota', note, null, true)),
      h('button', { class: 'btn primary', onclick: async () => { await put('/admin/group_bookings/' + b.id, { status: st.value, admin_note: note.value }); toast('Guardado.'); close(); refreshStats().then(route); } }, 'Guardar'));
  };
  const B = [['pendente', 'Pendente'], ['confirmado', 'Confirmada'], ['cancelado', 'Cancelada']];
  return shell('reservas', 'Reservas de contentor', h('a', { class: 'btn sm outline', href: '#group_shipments' }, 'Gerir contentores'),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Contentor', 'Cliente', 'm³', 'Mercadoria', 'Estado', 'Data'].map((x) => h('th', {}, x)))),
      h('tbody', {}, rows.length ? rows.map((b) => h('tr', { onclick: () => open(b) }, h('td', {}, b.shipment_title), h('td', {}, b.user_name), h('td', {}, String(b.cbm)), h('td', {}, h('span', { class: 'clip' }, b.goods || '')),
        h('td', {}, statusBadge(B, b.status)), h('td', {}, fmtDate(b.created_at)))) : h('tr', {}, h('td', { colspan: 6, class: 'muted' }, 'Ainda sem reservas.'))))));
}

// ------------------------------------------------------------------ visitas virtuais
async function visitas() {
  const rows = await get('/admin/visits');
  const V = [['pedido', 'Pedido'], ['marcado', 'Marcada'], ['feito', 'Feita'], ['cancelado', 'Cancelada']];
  const open = (v) => {
    const st = h('select', {}, V.map(([x, l]) => h('option', { value: x, selected: x === v.status }, l)));
    const when = h('input', { value: v.scheduled_at || '', placeholder: 'Ex.: 22/10, 16h China (hora local do cliente)' });
    const note = h('textarea', { rows: 3 }); note.value = v.admin_note || '';
    const close = drawer('Visita virtual',
      h('div', { class: 'card small stack' }, h('strong', {}, `${v.kind} · ${v.target || ''}`), v.supplier_company ? h('div', { class: 'private' }, `Fornecedor: ${v.supplier_company}`) : null,
        h('div', {}, `Preferência: ${v.preferred || '—'} · por ${v.channel}`), v.notes ? h('div', { class: 'pre' }, v.notes) : null, h('div', { class: 'muted' }, `${v.user_name} · ${v.user_email} · ${v.user_phone || ''}`)),
      waLink(v.user_phone, `Olá ${v.user_name.split(' ')[0]}, é a equipa Ponte. Vamos marcar a sua visita virtual: ${v.target || ''}.`, v.user_country),
      h('div', { class: 'form-grid' }, fieldEl('Estado', st), fieldEl('Data e hora', when), fieldEl('Nota para o cliente', note, null, true)),
      h('button', { class: 'btn primary', onclick: async () => { await put('/admin/visits/' + v.id, { status: st.value, scheduled_at: when.value, admin_note: note.value }); toast('Guardado.'); close(); refreshStats().then(route); } }, 'Guardar'));
  };
  return shell('visitas', 'Visitas virtuais', null, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ['Tipo', 'O quê', 'Cliente', 'Preferência', 'Canal', 'Estado'].map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.length ? rows.map((v) => h('tr', { onclick: () => open(v) }, h('td', {}, v.kind), h('td', {}, v.target || v.supplier_title || ''), h('td', {}, v.user_name),
      h('td', {}, v.scheduled_at || v.preferred || ''), h('td', {}, v.channel), h('td', {}, statusBadge(V, v.status)))) : h('tr', {}, h('td', { colspan: 6, class: 'muted' }, 'Ainda sem pedidos de visita.'))))));
}

// ------------------------------------------------------------------ clientes
async function utilizadores() {
  const [rows, plans] = await Promise.all([get('/admin/users'), get('/plans')]);
  let q = '';
  const tbody = h('tbody');
  const open = (u) => {
    const role = h('select', {}, [['client', 'Cliente'], ['admin', 'Equipa (administração)']].map(([v, l]) => h('option', { value: v, selected: v === u.role }, l)));
    const plan = h('select', {}, plans.map((p) => h('option', { value: p.id, selected: p.id === u.plan }, p.name)));
    const close = drawer(u.name,
      h('div', { class: 'card small stack' }, h('div', {}, [u.email, u.phone].filter(Boolean).join(' · ')), h('div', {}, [u.company, u.city].filter(Boolean).join(' · ')),
        h('div', {}, `Idioma: ${u.lang} · Interesses: ${(() => { try { return JSON.parse(u.interests).join(', '); } catch { return ''; } })()} · Viagem: ${u.travel_when || '—'}`),
        h('div', {}, `${u.quotes} cotações · ${u.orders} pedidos · desde ${fmtDate(u.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}`)),
      waLink(u.whatsapp || u.phone, `Olá ${u.name.split(' ')[0]}, é a equipa Ponte.`, u.country),
      h('div', { class: 'form-grid' }, fieldEl('Plano', plan), fieldEl('Perfil', role)),
      h('button', { class: 'btn primary', onclick: async () => { try { await put('/admin/users/' + u.id, { role: role.value, plan: plan.value }); toast('Guardado.'); close(); route(); } catch (e) { toast(e.message); } } }, 'Guardar'));
  };
  const draw = () => fill(tbody, rows.filter((u) => !q || `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(q)).map((u) => h('tr', { onclick: () => open(u) },
    h('td', {}, u.name), h('td', {}, `${countryOf(u.country).flag} ${countryOf(u.country).name}`), h('td', {}, u.email), h('td', {}, u.phone || ''), h('td', {}, u.plan), h('td', {}, u.role === 'admin' ? h('span', { class: 'badge solid' }, 'equipa') : 'cliente'),
    h('td', {}, String(u.quotes)), h('td', {}, fmtDate(u.created_at)))));
  draw();
  const add = () => {
    const name = h('input'); const email = h('input', { type: 'email' }); const pass = h('input', { type: 'text', value: Math.random().toString(36).slice(2, 12) });
    const role = h('select', {}, h('option', { value: 'admin' }, 'Equipa (administração)'), h('option', { value: 'client' }, 'Cliente'));
    const close = drawer('Adicionar conta', h('div', { class: 'form-grid' }, fieldEl('Nome', name, null, true), fieldEl('Email', email, null, true), fieldEl('Palavra-passe inicial', pass, 'Envie à pessoa e peça para mudar.', true), fieldEl('Perfil', role)),
      h('button', { class: 'btn primary', onclick: async () => { try { await post('/admin/users', { name: name.value, email: email.value, password: pass.value, role: role.value }); toast('Conta criada.'); close(); route(); } catch (e) { toast(e.message); } } }, 'Criar conta'));
  };
  return shell('utilizadores', 'Clientes e equipa', h('button', { class: 'btn primary sm', onclick: add }, icon('plus', 16), 'Adicionar conta'),
    h('div', { class: 'toolbar' }, h('input', { class: 'input', placeholder: 'Procurar nome, email, telefone…', oninput: (e) => { q = e.target.value.toLowerCase(); draw(); } }),
      h('span', { class: 'small muted' }, `${rows.length} contas`)),
    h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ['Nome', 'País', 'Email', 'Telefone', 'Plano', 'Perfil', 'Cotações', 'Desde'].map((x) => h('th', {}, x)))), tbody)));
}

// ------------------------------------------------------------------ definições
async function definicoes() {
  const s = await get('/admin/settings');
  const r = s.rates || {};
  const rate = (k) => h('input', { type: 'number', step: 'any', value: r[k] ?? '' });
  const inputs = Object.fromEntries(Object.keys(CURRENCIES).filter((c) => c !== 'USD').map((c) => [c, rate(c)]));
  const cur = h('input', { type: 'password', autocomplete: 'current-password' });
  const nw = h('input', { type: 'password', autocomplete: 'new-password' });
  return shell('definicoes', 'Definições', null,
    h('div', { class: 'panels' },
      h('div', { class: 'panel stack' }, h('h2', {}, 'Câmbio: quanto vale 1 USD em cada moeda'),
        h('div', { class: 'form-grid' }, Object.entries(inputs).map(([c, el]) => fieldEl(`1 USD = … ${c} (${CURRENCIES[c]})`, el))),
        h('div', { class: 'xs muted' }, 'Os preços dos produtos ficam em USD; a app mostra o valor aproximado na moeda de cada cliente.'),
        h('div', { class: 'xs muted' }, `Última actualização: ${r.updated_at || '—'}`),
        h('button', { class: 'btn primary', onclick: async () => { await put('/admin/settings', { rates: Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])) }); toast('Câmbio actualizado.'); route(); } }, 'Guardar câmbio')),
      h('div', { class: 'panel stack' }, h('h2', {}, 'A minha palavra-passe'), fieldEl('Palavra-passe actual', cur), fieldEl('Nova palavra-passe', nw, 'Pelo menos 8 caracteres.'),
        h('button', { class: 'btn primary', onclick: async () => { try { await patch('/me', { current_password: cur.value, password: nw.value }); toast('Palavra-passe alterada.'); cur.value = ''; nw.value = ''; } catch (e) { toast(e.message); } } }, 'Alterar')),
      h('div', { class: 'panel stack' }, h('h2', {}, 'Dados de exemplo'),
        h('p', { class: 'small', style: { margin: 0 } }, 'Apaga os fornecedores, produtos, locais, promoções e parceiros marcados como exemplo. Os feriados, feiras, saldos, planos e perguntas do assistente mantêm-se.'),
        h('button', { class: 'btn danger', onclick: async () => { if (!confirm('Apagar todos os dados de exemplo?')) return; await post('/admin/remove-samples'); toast('Dados de exemplo apagados.'); refreshStats().then(route); } }, icon('trash', 16), 'Apagar dados de exemplo')),
      h('div', { class: 'panel stack' }, h('h2', {}, 'Cópias de segurança'),
        h('p', { class: 'small', style: { margin: 0 } }, 'Exporte cada catálogo em CSV (botão "Exportar CSV" em cada secção). No servidor, a base de dados completa está no ficheiro data/ponte.db: copie a pasta data regularmente.'))));
}

// ------------------------------------------------------------------ entrada
function loginView(msg) {
  const email = h('input', { type: 'email', autocomplete: 'email' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password' });
  const err = h('div', { class: 'form-error', hidden: !msg }, msg || '');
  return h('div', { style: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' } },
    h('form', { class: 'card stack lg', style: { width: '100%', maxWidth: '380px' }, onsubmit: async (e) => {
      e.preventDefault();
      try { await post('/auth/login', { email: email.value, password: pass.value }); boot(); } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    } },
    h('div', { class: 'brand' }, logo(32), 'Ponte · Painel'),
    fieldEl('Email', email), fieldEl('Palavra-passe', pass), err, h('button', { class: 'btn primary block' }, 'Entrar')));
}

async function refreshStats() { try { stats = await get('/admin/stats'); } catch { /* ignorar */ } }

const VIEWS = { assistencia, equipamentos, rastreio, resumo, mensagens, cotacoes, pedidos, carga, parceiros, utilizadores, definicoes, reservas, visitas };

async function route() {
  clearInterval(pollTimer);
  document.querySelectorAll('.drawer-back').forEach((n) => n.remove());
  const [id, qs] = (location.hash.slice(1) || 'resumo').split('?');
  const params = new URLSearchParams(qs || '');
  try {
    const view = VIEWS[id] ? await VIEWS[id](params) : CRUD[id] ? await crudView(id) : await resumo();
    root.replaceChildren(view);
    document.title = `${view.querySelector('h1')?.textContent || 'Painel'} · Ponte`;
  } catch (e) {
    if (e.status === 401 || e.status === 403) return root.replaceChildren(loginView(e.status === 403 ? 'Esta conta não tem acesso ao painel.' : null));
    root.replaceChildren(h('div', { style: { padding: '40px' } }, 'Erro: ' + e.message));
  }
}

async function boot() {
  try { me = (await get('/me')).user; } catch { me = null; }
  if (!me || me.role !== 'admin') return root.replaceChildren(loginView(me ? 'Esta conta não tem acesso ao painel.' : null));
  await refreshStats();
  window.onhashchange = route;
  route();
  setInterval(async () => {
    if (document.hidden) return;
    const before = stats.chatsWaiting;
    await refreshStats();
    if (stats.chatsWaiting > before) toast('Nova mensagem de cliente.');
  }, 30000);
}

boot();
export { api };
