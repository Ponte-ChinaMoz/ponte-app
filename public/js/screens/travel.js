// Viagem: mapa com rotas, agenda (feriados/feiras/saldos), guia de estadia, contactos e ferramentas.
import { h, fill, icon, toast, sheet, segmented, chips, empty, topbar, fmtDate, fmtRange, fmtMoney, copy, LOCALES, convert } from '../ui.js';
import { t, lang, pick, countryInfo } from '../i18n.js';
import { CURRENCIES } from '../countries.js';
import { get } from '../api.js';
import { state, go } from '../app.js';
import { ls } from './main.js';

// ------------------------------------------------------------------ mapa
const PLACE_CATS = [
  ['', 'Todos', 'pin', '#0F5C48'], ['feira', 'Feiras', 'fair', '#0F5C48'], ['zona', 'Zonas industriais', 'factory', '#6B4A0E'],
  ['mercado', 'Mercados', 'market', '#6B4A0E'], ['transporte', 'Transportes', 'train', '#24322D'], ['hotel', 'Hotéis', 'hotel', '#A32E21'],
  ['restaurante', 'Restaurantes', 'food', '#A32E21'], ['saude', 'Saúde', 'health', '#C23A2B'], ['dinheiro', 'Câmbio e ATM', 'money', '#24322D'],
];
const catInfo = (c) => PLACE_CATS.find((x) => x[0] === c) || PLACE_CATS[0];

let leafletLoading = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletLoading) return leafletLoading;
  const demo = globalThis.PONTE_ASSETS?.leaflet; // versão de demonstração: Leaflet do CDN, CSS já incluído
  leafletLoading = new Promise((resolve, reject) => {
    if (!demo) {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = '/vendor/leaflet/leaflet.css';
      document.head.appendChild(css);
    }
    const s = document.createElement('script');
    s.src = demo || '/vendor/leaflet/leaflet.js';
    s.onload = () => resolve(window.L);
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return leafletLoading;
}

// Contorno dos continentes (só na demonstração, onde os mosaicos do mapa não carregam).
export function landLayer(L) {
  const land = globalThis.PONTE_ASSETS?.land;
  return land ? L.geoJSON(land, { interactive: false, style: { color: '#9DB8AC', weight: 1, fillColor: '#E4EDE7', fillOpacity: 1 } }) : null;
}

function distanceKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

let myPos = null;

// Ligações que abrem a rota já pronta nas apps de mapas usadas na China (aceitam coordenadas WGS84).
export function routeLinks(p) {
  const name = encodeURIComponent(p.name_cn || p.name);
  const from = myPos ? `&from=${myPos.lng},${myPos.lat},${encodeURIComponent(t('A minha localização'))}` : '';
  const amap = (mode) => `https://uri.amap.com/navigation?to=${p.lng},${p.lat},${name}${from}&mode=${mode}&coordinate=wgs84&callnative=1&src=ponte`;
  return {
    walk: amap('walk'), car: amap('car'), bus: amap('bus'), ride: amap('ride'),
    baidu: `https://api.map.baidu.com/marker?location=${p.lat},${p.lng}&title=${name}&content=${encodeURIComponent(p.address_cn || p.city || '')}&output=html&coord_type=wgs84&src=webapp.ponte`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`,
  };
}

function taxiCard(p) {
  const el = h('div', { class: 'taxi', role: 'dialog', 'aria-label': t('Mostrar ao taxista') },
    h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Mostrar ao taxista')),
    h('div', { class: 'cn', lang: 'zh-CN' }, p.name_cn || p.name),
    p.address_cn ? h('div', { class: 'addr', lang: 'zh-CN' }, p.address_cn) : null,
    h('div', { class: 'cn', lang: 'zh-CN', style: { fontSize: '22px', color: '#BFCBC5' } }, '师傅，请带我去这个地址，谢谢！'),
    h('div', { class: 'small', style: { color: '#BFCBC5' } }, t('"Por favor, leve-me a esta morada. Obrigado!"')),
    h('button', { class: 'btn accent block', style: { marginTop: '20px' }, onclick: () => el.remove() }, t('Fechar')));
  document.body.appendChild(el);
}

function placeSheet(p) {
  const links = routeLinks(p);
  const info = catInfo(p.category);
  const dist = myPos && p.lat ? distanceKm(myPos, p) : null;
  sheet(h('div', { class: 'stack lg' },
    h('div', { class: 'row top' }, h('span', { class: 'ic', style: { background: info[3], color: '#fff' } }, icon(info[2], 20)),
      h('div', { class: 'grow' }, h('h2', { class: 'h2' }, p.name), p.name_cn ? h('div', { class: 'small', lang: 'zh-CN' }, p.name_cn) : null,
        h('div', { class: 'xs muted' }, [p.district, p.city, dist !== null ? `${dist < 10 ? dist.toFixed(1) : Math.round(dist)} km` : null].filter(Boolean).join(' · ')))),
    p.description ? h('p', { class: 'small', style: { margin: 0 } }, p.description) : null,
    p.approximate ? h('div', { class: 'xs muted' }, t('Localização aproximada: confirme o ponto exacto na app de mapas.')) : null,
    p.lat ? [
      h('div', { class: 'h3' }, t('Como chegar')),
      h('div', { class: 'mode-row' },
        [['walk', 'walk', 'A pé'], ['car', 'car', 'Carro'], ['bus', 'bus', 'Transportes'], ['ride', 'bike', 'Bicicleta']].map(([k, ic, label]) =>
          h('a', { class: 'mode', href: links[k], target: '_blank', rel: 'noopener' }, icon(ic, 22), t(label)))),
      h('div', { class: 'xs muted' }, t('Abre a rota no Amap (高德地图), a app de mapas mais usada na China.')),
      h('div', { class: 'grid2' },
        h('a', { class: 'btn outline sm', href: links.baidu, target: '_blank', rel: 'noopener' }, 'Baidu Maps'),
        h('a', { class: 'btn outline sm', href: links.google, target: '_blank', rel: 'noopener' }, t('Google (fora da China)'))),
    ] : null,
    p.name_cn || p.address_cn ? h('button', { class: 'btn primary block', onclick: () => taxiCard(p) }, icon('car', 18), t('Mostrar ao taxista (DiDi / táxi)')) : null,
    p.address_cn ? h('button', { class: 'btn ghost block', onclick: () => copy(`${p.name_cn || ''} ${p.address_cn}`) }, icon('copy', 18), t('Copiar morada em chinês')) : null,
    p.phone ? h('a', { class: 'btn ghost block', href: `tel:${p.phone}` }, icon('phone', 18), p.phone) : null));
}

export async function map({ query, state: st }) {
  const cat = query.cat || '';
  const all = await get('/places');
  let list = cat ? all.filter((p) => p.category === cat) : all;
  if (myPos) list = [...list].sort((a, b) => (a.lat ? distanceKm(myPos, a) : 1e9) - (b.lat ? distanceKm(myPos, b) : 1e9));
  const mapEl = h('div', { class: 'mapbox', role: 'region', 'aria-label': t('Mapa') });
  const root = h('div', { class: 'screen flush', style: { paddingTop: 0, gap: 0 } },
    h('div', { style: { position: 'relative' } }, mapEl,
      h('div', { class: 'row', style: { position: 'absolute', top: 'calc(12px + var(--safe-t))', left: '16px', right: '16px', zIndex: 500 } },
        h('h1', { class: 'card tight display grow', style: { fontSize: '18px', margin: 0, boxShadow: '0 2px 8px rgba(0,0,0,.15)' } }, t('Mapa e rotas')),
        h('button', { class: 'icon-btn', style: { boxShadow: '0 2px 8px rgba(0,0,0,.15)' }, 'aria-label': t('Usar a minha localização'), onclick: locate }, icon('locate', 20)))),
    h('div', { class: 'map-wrap' },
      chips(PLACE_CATS.filter(([c]) => !c || all.some((p) => p.category === c)).map(([c, label]) => [c, t(label)]), cat, (v) => go('#/map' + (v ? '?cat=' + v : ''))),
      list.length ? h('div', { class: 'list' }, list.map((p) => {
        const info = catInfo(p.category);
        const d = myPos && p.lat ? distanceKm(myPos, p) : null;
        return h('button', { class: 'list-item', onclick: () => placeSheet(p) },
          h('span', { class: 'ic sm', style: { background: info[3], color: '#fff' } }, icon(info[2], 18)),
          h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, p.name),
            h('span', { class: 'd', style: { display: 'block' } }, [p.city, p.district, d !== null ? `${d < 10 ? d.toFixed(1) : Math.round(d)} km` : null].filter(Boolean).join(' · '))),
          h('span', { class: 'chev' }, icon('chevron', 16)));
      })) : empty('pin', t('Sem locais nesta categoria.')),
      h('div', { style: { height: '8px' } })));

  async function locate() {
    if (!navigator.geolocation) return toast(t('Localização indisponível neste telefone.'));
    toast(t('A procurar a sua localização…'));
    navigator.geolocation.getCurrentPosition(
      (pos) => { myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude }; go('#/map' + (cat ? '?cat=' + cat : '') + (cat ? '&' : '?') + 'r=' + Date.now()); },
      () => toast(t('Não foi possível obter a localização. Verifique as permissões.')), { enableHighAccuracy: true, timeout: 10000 });
  }

  // Desenhar o mapa depois de o ecrã estar visível.
  requestAnimationFrame(async () => {
    try {
      const L = await loadLeaflet();
      if (!document.body.contains(mapEl)) return;
      const pts = list.filter((p) => p.lat && p.lng);
      const m = L.map(mapEl, { zoomControl: false, attributionControl: true }).setView([23.13, 113.32], 10);
      landLayer(L)?.addTo(m);
      L.tileLayer(st.config.mapTiles || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: st.config.mapAttribution || '© OpenStreetMap' }).addTo(m);
      L.control.zoom({ position: 'bottomright' }).addTo(m);
      const bounds = [];
      for (const p of pts) {
        const info = catInfo(p.category);
        const marker = L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: '', html: `<div class="pin" style="background:${info[3]}"><span>•</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] }),
          title: p.name, keyboard: true,
        }).addTo(m);
        marker.on('click', () => placeSheet(p));
        bounds.push([p.lat, p.lng]);
      }
      if (myPos) {
        L.circleMarker([myPos.lat, myPos.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2F6FED', fillOpacity: 1 }).addTo(m);
        bounds.push([myPos.lat, myPos.lng]);
      }
      if (bounds.length > 1) m.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
      else if (bounds.length === 1) m.setView(bounds[0], 13);
      st.cleanup = () => m.remove();
    } catch {
      mapEl.replaceChildren(h('div', { class: 'empty' }, t('O mapa não carregou. A lista de locais continua disponível abaixo.')));
    }
  });

  if (query.place) {
    const p = all.find((x) => String(x.id) === query.place);
    if (p) setTimeout(() => placeSheet(p), 300);
  }
  return root;
}

// ------------------------------------------------------------------ agenda
function icsFor(fair) {
  const d = (s) => s.replace(/-/g, '');
  const end = new Date((fair.end_date || fair.start_date) + 'T12:00:00Z');
  end.setUTCDate(end.getUTCDate() + 1);
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ponte//PT', 'BEGIN:VEVENT', `UID:ponte-fair-${fair.id}@ponte.app`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`, `DTSTART;VALUE=DATE:${d(fair.start_date)}`,
    `DTEND;VALUE=DATE:${end.toISOString().slice(0, 10).replace(/-/g, '')}`, `SUMMARY:${fair.name}`,
    `LOCATION:${[fair.venue, fair.city].filter(Boolean).join(', ')}`, `DESCRIPTION:${(fair.sectors || '').replace(/\n/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
  a.download = `${fair.name.replace(/[^\p{L}\p{N}]+/gu, '-')}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function agenda({ query }) {
  const tab = ['feriados', 'feiras', 'saldos'].includes(query.tab) ? query.tab : 'feiras';
  const sector = query.sector || '';
  const nav = (o) => go('#/agenda?' + new URLSearchParams({ tab, ...o }));
  const box = (top, big, bg = 'var(--gold-tint)', color = 'var(--ink)') => h('div', { style: { flex: '0 0 60px', height: '60px', borderRadius: '14px', background: bg, color, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
    h('span', { style: { fontSize: '11px', fontWeight: 800 } }, top), h('span', { class: 'display', style: { fontSize: '18px' } }, big));
  const today = new Date().toISOString().slice(0, 10);
  let content;

  if (tab === 'feriados') {
    const list = await get('/holidays');
    content = [
      h('div', { class: 'card red row top' }, icon('warn', 24, 2),
        h('div', {}, h('div', { style: { fontWeight: 800 } }, t('Ano Novo Chinês: fábricas param')),
          h('div', { class: 'small', style: { color: 'var(--red-tint)', marginTop: '4px' } }, t('Muitas fábricas fecham 2 a 4 semanas à volta da Festa da Primavera. Feche encomendas e embarques com antecedência.')))),
      list.map((x) => h('div', { class: 'card tight row', style: { opacity: x.end_date < today ? 0.55 : 1 } },
        box(fmtDate(x.start_date, { month: 'short' }).toUpperCase(), fmtDate(x.start_date, { day: 'numeric' }), x.name_cn === '春节' || x.name_cn === '国庆节' ? 'var(--red-tint)' : 'var(--grey-tint)'),
        h('div', { class: 'grow' }, h('div', { class: 'h3' }, pick(x, 'name')), h('div', { class: 'xs muted' }, [x.name_cn, x.start_date === x.end_date ? fmtDate(x.start_date) : `${fmtDate(x.start_date)} – ${fmtDate(x.end_date)}`].filter(Boolean).join(' · '))),
        x.official ? h('span', { class: 'badge green' }, t('Oficial')) : h('span', { class: 'badge gold' }, t('Previsão')))),
      h('p', { class: 'xs muted', style: { margin: 0 } }, t('Datas previstas até à publicação do calendário oficial pelo Governo chinês (normalmente em Novembro). A equipa actualiza a app.')),
    ];
  } else if (tab === 'feiras') {
    const list = await get('/fairs');
    const sectors = [...new Set(list.flatMap((f) => (f.tags || '').split(',').map((s) => s.trim()).filter(Boolean)))];
    const shown = list.filter((f) => (f.end_date || f.start_date) >= today && (!sector || (f.tags || '').includes(sector)));
    content = [
      chips([['', t('Todas')], ...sectors.map((s) => [s, t(s)])], sector, (v) => nav(v ? { sector: v } : {})),
      shown.length ? shown.map((f) => {
        const live = f.start_date <= today && (f.end_date || f.start_date) >= today;
        return h('div', { class: 'card stack' },
          h('div', { class: 'row top' }, box(fmtDate(f.start_date, { month: 'short' }).toUpperCase(), fmtDate(f.start_date, { day: 'numeric' }), live ? 'var(--green)' : 'var(--gold-tint)', live ? '#fff' : 'var(--ink)'),
            h('div', { class: 'grow' }, h('div', { class: 'h3' }, f.name), h('div', { class: 'small muted' }, f.sectors || ''),
              h('div', { class: 'xs muted', style: { fontWeight: 600, marginTop: '2px' } }, [f.venue, f.city].filter(Boolean).join(' · ')),
              h('div', { class: 'xs', style: { fontWeight: 700, marginTop: '2px' } }, fmtRange(f.start_date, f.end_date, true) + (f.confirmed ? '' : ' · ' + t('a confirmar'))))),
          live ? h('span', { class: 'badge green' }, t('A decorrer agora')) : null,
          h('div', { class: 'row wrap', style: { gap: '8px' } },
            h('button', { class: 'btn sm outline', onclick: () => icsFor(f) }, icon('calendar', 16), t('Adicionar ao calendário')),
            f.place_id ? h('a', { class: 'btn sm outline', href: `#/map?place=${f.place_id}` }, icon('pin', 16), t('Como chegar')) : null,
            h('a', { class: 'btn sm outline', href: `#/visit?fair=${f.id}` }, icon('video', 16), t('Visita virtual')),
            h('a', { class: 'btn sm primary', href: '#/plans' }, t('Ir com a equipa Ponte'))));
      }) : empty('fair', t('Sem feiras previstas neste sector.')),
      h('p', { class: 'xs muted', style: { margin: 0 } }, t('Datas indicativas: confirme sempre no site oficial de cada feira.')),
    ];
  } else {
    const list = await get('/sales');
    content = [
      h('div', { class: 'card dark' }, h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Porque importa')),
        h('div', { class: 'small', style: { marginTop: '6px' } }, t('Nos grandes saldos online os fornecedores baixam preços, mas a logística congestiona. Bom para amostras e lotes pequenos; mau para prazos apertados.'))),
      list.map((s) => h('div', { class: 'card tight row' }, box(s.date_label || '', s.tag, 'var(--red-tint)', 'var(--red-dk)'),
        h('div', { class: 'grow' }, h('div', { class: 'h3' }, pick(s, 'name')), h('div', { class: 'xs muted' }, pick(s, 'description'))))),
    ];
  }
  return h('div', { class: 'screen' },
    topbar(t('Agenda China')),
    segmented([['feiras', t('Feiras')], ['feriados', t('Feriados')], ['saldos', t('Saldos')]], tab, (v) => go('#/agenda?tab=' + v)),
    content);
}

// ------------------------------------------------------------------ guia de estadia
const CHECK = [
  ['visto', 'Visto e carta-convite', 'A equipa Ponte pode emitir a carta-convite da feira.'],
  ['pay', 'Alipay e WeChat Pay', 'Associe o seu cartão Visa ou Mastercard antes de viajar.'],
  ['net', 'eSIM ou VPN', 'Google e WhatsApp não funcionam sem eles. Instale antes de partir.'],
  ['apps', 'Apps essenciais', 'Amap (mapas), DiDi (táxi), WeChat, Trip.com, tradutor offline.'],
  ['cash', 'Algum dinheiro em yuan', 'Para mercados e pequenas despesas.'],
  ['ponte', 'Ponte instalada no telefone', 'Guia, contactos e mapas disponíveis mesmo com pouca rede.'],
];

export function guide() {
  const done = ls.get('ponte.checklist', {});
  const root = h('div', { class: 'screen' });
  const draw = () => {
    const n = CHECK.filter(([id]) => done[id]).length;
    fill(root,
      topbar(t('Guia de estadia')),
      h('div', { class: 'card stack' },
        h('div', { class: 'row between' }, h('h2', { class: 'h2' }, t('Antes de partir')), h('span', { class: 'xs', style: { fontWeight: 800, color: 'var(--green)' } }, t('{a} de {b}', { a: n, b: CHECK.length }))),
        h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--grey-tint)', overflow: 'hidden' } }, h('div', { style: { height: '6px', width: `${(n / CHECK.length) * 100}%`, background: 'var(--green)' } })),
        h('div', {}, CHECK.map(([id, title, sub]) => h('label', { class: 'list-item', style: { cursor: 'pointer' } },
          h('input', { type: 'checkbox', checked: !!done[id], style: { width: '24px', height: '24px', accentColor: 'var(--green)', flex: '0 0 24px' }, onchange: (e) => { done[id] = e.target.checked; ls.set('ponte.checklist', done); draw(); } }),
          h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, t(title)), h('span', { class: 'd', style: { display: 'block' } }, t(sub))))))),
      h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Onde ficar')),
        h('div', { class: 'hscroll' },
          [['Pazhou', 'Ao lado da Canton Fair. Ideal em semana de feira.', 'var(--green)'], ['Tianhe', 'Centro de negócios, metro para tudo.', 'var(--gold-dk)'], ['Yuexiu', 'Mercados grossistas e comunidade africana.', 'var(--red-dk)']]
            .map(([n2, d, bg]) => h('a', { class: 'card', href: '#/map?cat=hotel', style: { background: bg, borderColor: bg, color: '#fff', flexBasis: '210px' } },
              h('div', { style: { fontWeight: 800 } }, n2), h('div', { class: 'small', style: { opacity: 0.9, marginTop: '4px' } }, t(d)))))),
      h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Comer bem')),
        h('div', { class: 'row wrap', style: { gap: '8px' } }, ['Cantonesa · dim sum', 'Halal', 'Africana', 'Portuguesa e macaense'].map((c) => h('span', { class: 'chip' }, t(c)))),
        h('a', { class: 'link', href: '#/map?cat=restaurante' }, t('Ver restaurantes no mapa'))),
      h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Regras de ouro para comprar')),
        h('ol', { class: 'small', style: { margin: 0, paddingLeft: '18px', lineHeight: 1.7 } },
          ['Peça sempre amostra antes da produção.', 'Pague por fases: sinal, e o restante depois da inspecção.', 'Confirme tudo por escrito: medidas, cores, embalagem, prazo.', 'Evite fechar encomendas perto do Ano Novo Chinês.', 'Use um agente que fale chinês e esteja no local.']
            .map((x) => h('li', {}, t(x))))),
      // Lusofonia na China
      h('div', { class: 'card green stack' },
        h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Lusofonia na China')),
        h('h2', { class: 'h2', style: { color: '#fff' } }, t('Macau, a porta lusófona')),
        h('p', { class: 'small', style: { color: '#D6E9E1', margin: 0 } }, t('Em Macau o português é língua oficial e há serviços, restaurantes e associações de todos os países lusófonos. Fica a cerca de 2 horas de Guangzhou de comboio e autocarro, ou pela ponte Hong Kong–Zhuhai–Macau.')),
        h('p', { class: 'small', style: { color: '#D6E9E1', margin: 0 } }, t('O Fórum de Macau promove o comércio entre a China e os países de língua portuguesa: acompanhe as missões empresariais e feiras que organiza.')),
        h('a', { class: 'btn light sm', href: 'https://www.forumchinaplp.org.mo/', target: '_blank', rel: 'noopener' }, icon('globe', 16), t('Fórum de Macau'))),
      h('div', { class: 'card stack' }, h('h2', { class: 'h2' }, t('Falar português em Guangzhou')),
        h('p', { class: 'small muted', style: { margin: 0 } }, t('A equipa Ponte fala português e mandarim. Peça um intérprete para a feira, a fábrica ou o banco, e conheça outros empresários lusófonos nas missões da Ponte.')),
        h('a', { class: 'btn outline sm', href: '#/chat?msg=' + encodeURIComponent(t('Preciso de um intérprete de português-mandarim.')) }, t('Pedir intérprete'))),
      h('a', { class: 'btn outline block', href: '#/contacts' }, icon('phone', 18), t('Contactos úteis')));
  };
  draw();
  return root;
}

// ------------------------------------------------------------------ contactos
const APPS = [
  ['Alipay · WeChat Pay', 'Pagamentos. Associe um Visa ou Mastercard estrangeiro.', 'card'],
  ['Amap (高德地图)', 'O melhor mapa na China, com saídas do metro. Mude para inglês nas definições.', 'pin'],
  ['DiDi', 'Táxis, com interface em inglês.', 'car'],
  ['Trip.com', 'Comboios, voos e hotéis em inglês; aceita cartão estrangeiro.', 'train'],
  ['WeChat', 'É por aqui que os fornecedores comunicam.', 'chat'],
  ['Baidu Translate · Pleco', 'Tradução por câmara e voz. Descarregue o pacote offline.', 'translate'],
  ['VPN ou eSIM', 'Instale e teste antes de partir: as lojas de VPN estão bloqueadas na China.', 'lock'],
];

export async function contacts({ query }) {
  const tab = query.tab || 'apps';
  const places = await get('/places');
  const em = (n, label) => h('a', { class: 'card red', href: `tel:${n}`, style: { textAlign: 'center', padding: '12px 6px', textDecoration: 'none' } },
    h('div', { class: 'display', style: { fontSize: '26px' } }, n), h('div', { class: 'xs', style: { fontWeight: 700 } }, t(label)));
  const placeRows = (cats) => {
    const list = places.filter((p) => cats.includes(p.category));
    return list.length ? h('div', { class: 'list' }, list.map((p) => h('a', { class: 'list-item', href: `#/map?place=${p.id}` }, h('span', { class: 'ic sm grey' }, icon(catInfo(p.category)[2], 18)),
      h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, p.name), h('span', { class: 'd' }, [p.district, p.city].filter(Boolean).join(' · '))),
      p.phone ? h('span', { class: 'badge green' }, p.phone) : h('span', { class: 'chev' }, icon('chevron', 16))))) : empty('pin', t('A equipa ainda não adicionou locais nesta categoria.'));
  };
  const sections = {
    apps: h('div', { class: 'list' }, APPS.map(([n, d, ic]) => h('div', { class: 'list-item' }, h('span', { class: 'ic sm green' }, icon(ic, 18)),
      h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, n), h('span', { class: 'd', style: { display: 'block' } }, t(d)))))),
    saude: placeRows(['saude']),
    dinheiro: placeRows(['dinheiro']),
    transporte: placeRows(['transporte']),
    ajuda: h('div', { class: 'list' },
      h('a', { class: 'list-item', href: '#/chat' }, h('span', { class: 'ic sm red' }, icon('chat', 18)), h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, t('Equipa Ponte em Guangzhou')), h('span', { class: 'd' }, t('Procurement e apoio local · {h}', { h: state.config.supportHours || '' })))),
      h('a', { class: 'list-item', href: '#/freight' }, h('span', { class: 'ic sm gold' }, icon('truck', 18)), h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, t('Transitários e despachantes')), h('span', { class: 'd' }, t('Carga para {p}', { p: countryInfo().ports.map(([, n]) => n.replace(/^Porto (de |do |da )?/, '')).join(', ') })))),
      h('div', { class: 'list-item' }, h('span', { class: 'ic sm grey' }, icon('fair', 18)), h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, countryInfo().capital ? t('Embaixada da China em {c}', { c: countryInfo().capital }) : t('Embaixada da China no seu país')), h('span', { class: 'd' }, t('Vistos e cartas-convite')))),
      h('div', { class: 'list-item' }, h('span', { class: 'ic sm grey' }, icon('fair', 18)), h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, countryInfo().code === 'XX' ? t('Representação do seu país na China') : t('Representação de {p} na China', { p: t(countryInfo().name) })), h('span', { class: 'd' }, t('Pequim · consulte o contacto actualizado antes de viajar')))),
      h('a', { class: 'list-item', href: 'https://www.forumchinaplp.org.mo/', target: '_blank', rel: 'noopener' }, h('span', { class: 'ic sm green' }, icon('globe', 18)), h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, t('Fórum de Macau')), h('span', { class: 'd' }, t('Cooperação económica entre a China e os países de língua portuguesa'))), h('span', { class: 'chev' }, icon('arrow', 16)))),
  };
  return h('div', { class: 'screen' },
    topbar(t('Contactos úteis')),
    h('div', { class: 'grid3' }, em('110', 'Polícia'), em('120', 'Ambulância'), em('119', 'Bombeiros')),
    chips([['apps', t('Apps essenciais')], ['saude', t('Saúde')], ['dinheiro', t('Dinheiro')], ['transporte', t('Transportes')], ['ajuda', t('Ajuda')]], tab, (v) => go('#/contacts?tab=' + v)),
    sections[tab] || sections.apps,
    h('div', { class: 'card dark row' }, icon('download', 22), h('div', { class: 'small' }, t('Com a Ponte instalada, estes contactos ficam disponíveis mesmo sem internet.'))));
}

// ------------------------------------------------------------------ ferramentas
// Frases para negociar; a pergunta sobre o envio usa o país do utilizador.
export const phrases = () => PHRASES.map((p) => (p[0] === 'Pode enviar para Moçambique?' && countryInfo().zh
  ? [`Pode enviar para ${countryInfo().name}?`, `可以发货到${countryInfo().zh}吗？`, `kěyǐ fāhuò dào ${countryInfo().py} ma`] : p));
export const PHRASES = [
  ['Quanto custa?', '多少钱？', 'duōshao qián'],
  ['Pode fazer um preço melhor?', '能便宜一点吗？', 'néng piányi yìdiǎn ma'],
  ['Qual é a quantidade mínima?', '最小起订量是多少？', 'zuìxiǎo qǐdìngliàng shì duōshao'],
  ['Quero uma amostra.', '我要样品。', 'wǒ yào yàngpǐn'],
  ['Quanto tempo demora a produção?', '生产需要多长时间？', 'shēngchǎn xūyào duō cháng shíjiān'],
  ['Pode enviar para Moçambique?', '可以发货到莫桑比克吗？', 'kěyǐ fāhuò dào Mòsāngbǐkè ma'],
  ['Obrigado!', '谢谢！', 'xièxie'],
  ['Não como carne de porco.', '我不吃猪肉。', 'wǒ bù chī zhūròu'],
];

export function speak(text) {
  if (!('speechSynthesis' in window)) return toast(t('Este telefone não tem leitura em voz alta.'));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.85;
  const v = speechSynthesis.getVoices().find((x) => /zh[-_]CN/i.test(x.lang));
  if (v) u.voice = v;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export async function tools({ query }) {
  const tab = ['custo', 'cambio', 'frases'].includes(query.tab) ? query.tab : 'custo';
  const rates = await get('/rates');
  const root = h('div', { class: 'screen' });
  const input = (v, attrs = {}) => h('input', { class: 'input', type: 'number', inputmode: 'decimal', min: 0, step: 'any', value: v, ...attrs });

  let body;
  if (tab === 'custo') {
    const ci = countryInfo();
    const s = { fob: 10000, freight: 2500, rate: 20, ...ls.get('ponte.calc', {}) };
    if (s.country !== ci.code) { s.vat = ci.vat ?? 0; s.country = ci.code; }
    const fob = input(s.fob, { 'aria-label': t('Valor da mercadoria (FOB) em USD') });
    const fr = input(s.freight, { 'aria-label': t('Frete até {p} em USD', { p: t(ci.name) }) });
    const vatIn = input(s.vat, { 'aria-label': t('Imposto sobre o consumo (%)') });
    const localCur = state.user?.currency || ci.currency;
    const out = h('div', { class: 'stack' });
    const rateBtns = h('div', { class: 'row wrap', style: { gap: '6px' } });
    const calc = () => {
      const F = Number(fob.value) || 0, R = Number(fr.value) || 0;
      const V = Number(vatIn.value) || 0;
      const ins = F * 0.01, cif = F + R + ins, duty = cif * s.rate / 100, vat = (cif + duty) * V / 100, total = cif + duty + vat;
      ls.set('ponte.calc', { fob: F, freight: R, rate: s.rate, vat: V, country: ci.code });
      const local = localCur !== 'USD' ? convert(total, 'USD', localCur, rates) : null;
      const line = (l, v) => h('div', { class: 'row between small', style: { padding: '5px 0' } }, h('span', { class: 'muted' }, t(l)), h('span', { style: { fontWeight: 700 } }, fmtMoney(v, 'USD')));
      rateBtns.replaceChildren(...[0, 2.5, 5, 7.5, 20].map((r) => h('button', { class: 'chip' + (r === s.rate ? ' on' : ''), onclick: () => { s.rate = r; calc(); } }, `${String(r).replace('.', ',')}%`)));
      out.replaceChildren(
        line('Seguro estimado (1%)', ins), line('Valor CIF', cif), line('Direitos aduaneiros', duty), line(t('Imposto sobre o consumo ({n}%)', { n: V }), vat),
        h('div', { class: 'card green row between' }, h('span', { style: { fontWeight: 700 } }, t('Custo estimado no porto')),
          h('span', { style: { textAlign: 'right' } }, h('span', { class: 'display', style: { fontSize: '22px', display: 'block' } }, fmtMoney(total, 'USD')),
            local ? h('span', { class: 'xs', style: { color: '#D6E9E1' } }, '≈ ' + fmtMoney(local, localCur)) : null)));
    };
    fob.addEventListener('input', calc); fr.addEventListener('input', calc); vatIn.addEventListener('input', calc);
    calc();
    body = h('div', { class: 'card stack lg' },
      h('h2', { class: 'h2' }, t('Quanto custa importar?')),
      h('div', { class: 'field' }, h('span', {}, t('Valor da mercadoria (FOB) em USD')), fob),
      h('div', { class: 'field' }, h('span', {}, t('Frete até {p} em USD', { p: t(ci.name) })), fr),
      h('div', { class: 'field' }, h('span', {}, t('Taxa de direitos aduaneiros')), rateBtns),
      h('div', { class: 'field' }, h('span', {}, t('Imposto sobre o consumo (%)')), vatIn,
        h('span', { class: 'hint' }, ci.code === 'BR' ? t('No Brasil, os impostos de importação (II, IPI, PIS/COFINS e ICMS) dependem do produto e do estado: use a taxa total indicada pelo despachante.')
          : ci.vat ? t('Taxa geral do IVA em {p}: {n}% (confirme a taxa do seu produto).', { p: t(ci.name), n: ci.vat }) : t('Indique a taxa aplicável no seu país.'))),
      h('div', { class: 'xs muted' }, t('Alfândega: {a}', { a: ci.customs })),
      out,
      h('p', { class: 'xs muted', style: { margin: 0 } }, t('Estimativa indicativa. Não inclui honorários do despachante, taxas portuárias nem outras taxas. A taxa certa depende da classificação pautal: confirme com um despachante.')),
      h('a', { class: 'btn outline block', href: '#/freight' }, t('Pedir cotação real')));
  } else if (tab === 'cambio') {
    const mine = state.user?.currency || countryInfo().currency;
    const curs = [...new Set([mine, 'CNY', 'USD', 'EUR', ...Object.keys(CURRENCIES)])].filter((c) => c === 'USD' || rates[c]);
    const st = ls.get('ponte.fx', { amount: 1000, from: 'CNY' });
    const amt = input(st.amount, { 'aria-label': t('Valor') });
    const from = h('select', { class: 'input', 'aria-label': t('Moeda') }, curs.map((c) => h('option', { selected: c === st.from }, c)));
    const out = h('div', { class: 'list' });
    const calc = () => {
      const a = Number(amt.value) || 0;
      ls.set('ponte.fx', { amount: a, from: from.value });
      out.replaceChildren(...curs.filter((c) => c !== from.value).map((c) => h('div', { class: 'list-item' + (c === mine ? ' mine' : '') },
        h('span', { class: 'ic sm ' + (c === mine ? 'green' : 'grey'), style: { fontWeight: 800, fontSize: '11px' } }, c), h('span', { class: 'grow t' }, fmtMoney(convert(a, from.value, c, rates), c)),
        h('span', { class: 'xs muted' }, t(CURRENCIES[c] || '')))));
    };
    amt.addEventListener('input', calc); from.addEventListener('change', calc);
    calc();
    body = [h('div', { class: 'card stack lg' }, h('h2', { class: 'h2' }, t('Câmbio')), h('div', { class: 'row' }, h('div', { class: 'grow' }, amt), h('div', { style: { width: '110px' } }, from))),
      out, h('p', { class: 'xs muted', style: { margin: 0 } }, t('Taxas indicativas actualizadas pela equipa em {d}. Confirme no seu banco.', { d: rates.updated_at ? fmtDate(rates.updated_at, { day: 'numeric', month: 'long', year: 'numeric' }) : '—' }))];
  } else {
    body = h('div', { class: 'list' }, phrases().map(([pt, cn, py]) => h('div', { class: 'list-item' },
      h('span', { class: 'grow' }, h('span', { class: 'd', style: { display: 'block' } }, t(pt)), h('span', { lang: 'zh-CN', style: { display: 'block', fontSize: '20px', fontWeight: 700 } }, cn), h('span', { class: 'd' }, py)),
      h('button', { class: 'icon-btn', style: { border: 0, background: 'var(--green-tint)', color: 'var(--green)' }, 'aria-label': t('Ouvir pronúncia'), onclick: () => speak(cn) }, icon('speaker', 20)))));
  }
  root.append(topbar(t('Ferramentas')),
    segmented([['custo', t('Custo de importação')], ['cambio', t('Câmbio')], ['frases', t('Frases')]], tab, (v) => go('#/tools?tab=' + v)), body);
  return root;
}

export { LOCALES, lang };
