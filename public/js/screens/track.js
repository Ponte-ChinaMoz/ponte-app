// Rastreio de encomendas: lista dos envios do cliente, detalhe com mapa da rota, posição,
// previsão de chegada, atrasos, etapas, ligação à transportadora e link de partilha.
import { h, fill, icon, toast, topbar, empty, fmtDate, copy, LOCALES } from '../ui.js';
import { t, lang, locale } from '../i18n.js';
import { get } from '../api.js';
import { state, go } from '../app.js';
import { loadLeaflet, landLayer } from './travel.js';
import { speakButton } from '../voice.js';

const PHASES = ['Em preparação', 'No porto de origem', 'Em viagem', 'Chegada e alfândega', 'Em entrega', 'Entregue'];
const MODE = { mar: ['ship', 'Marítimo'], aereo: ['plane', 'Aéreo'], courier: ['truck', 'Courier'], estrada: ['truck', 'Rodoviário'] };

const etaText = (s) => {
  if (s.phase >= 5) return t('Entregue');
  if (s.phase >= 3) return s.ata ? t('Chegou a {d}', { d: fmtDate(s.ata, { day: 'numeric', month: 'long' }) }) : t('Chegou ao destino');
  if (!s.eta) return t('Data de chegada a confirmar');
  const d = fmtDate(s.eta, { day: 'numeric', month: 'long' });
  if (s.days_left === null || s.days_left === undefined) return t('Chegada prevista: {d}', { d });
  if (s.days_left < 0) return t('Previsto para {d} · a confirmar com a transportadora', { d });
  if (s.days_left === 0) return t('Chegada prevista hoje');
  return s.days_left === 1 ? t('Chega amanhã · {d}', { d }) : t('Chega em {n} dias · {d}', { n: s.days_left, d });
};

function progressBar(s, dark) {
  const pct = Math.round((s.phase >= 3 ? 1 : s.phase === 2 ? s.progress : 0) * 100);
  return h('div', { class: 'trk-bar' + (dark ? ' dark' : '') },
    h('div', { class: 'trk-line' }, h('div', { class: 'trk-fill', style: { width: pct + '%' } }),
      h('span', { class: 'trk-ship', style: { left: `calc(${pct}% - 14px)` } }, icon(MODE[s.mode]?.[0] || 'ship', 16, 2))),
    h('div', { class: 'row between xs', style: { fontWeight: 700, marginTop: '16px', gap: '12px' } },
      h('span', {}, typeof s.origin === 'string' ? s.origin : s.origin?.name), h('span', {}, typeof s.destination === 'string' ? s.destination : s.destination?.name)));
}

// Cartão pequeno (lista, início, pedido)
export function trackCard(s) {
  return h('a', { class: 'card stack', href: `#/track/${s.id}`, style: { textDecoration: 'none', color: 'inherit' } },
    h('div', { class: 'row between' },
      h('span', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'ic sm green' }, icon(MODE[s.mode]?.[0] || 'ship', 18)),
        h('span', {}, h('span', { class: 'xs muted', style: { fontWeight: 800, display: 'block' } }, s.ref), h('span', { class: 'h3' }, s.title))),
      h('span', { class: 'badge ' + (s.delayed ? 'red' : s.phase >= 5 ? 'green' : 'gold') }, s.delayed ? t('Atrasado') : t(s.phase_label))),
    progressBar(s),
    h('div', { class: 'row between small' }, h('strong', {}, etaText(s)), h('span', { class: 'chev' }, icon('chevron', 16))),
    s.last ? h('div', { class: 'xs muted' }, `${t('Última actualização')}: ${t(s.last.label)}${s.last.location ? ' · ' + s.last.location : ''} · ${fmtDate(s.last.happened_at)}`) : null);
}

// ------------------------------------------------------------------ lista
export async function trackList() {
  const list = state.user ? await get('/tracking') : [];
  const code = h('input', { placeholder: t('Link ou código de rastreio'), 'aria-label': t('Link ou código de rastreio'), autocapitalize: 'off' });
  const openCode = (e) => {
    e.preventDefault();
    const v = code.value.trim();
    if (!v) return;
    const m = v.match(/#\/t\/([\w-]+)/) || v.match(/^([\w-]{6,})$/);
    const mine = list.find((s) => [s.ref].includes(v.toUpperCase()));
    if (mine) return go(`#/track/${mine.id}`);
    if (m) return go(`#/t/${m[1]}`);
    toast(t('Código não encontrado.'));
  };
  const live = list.filter((s) => s.phase < 5);
  const done = list.filter((s) => s.phase >= 5);
  return h('div', { class: 'screen' },
    topbar(t('Rastrear encomendas')),
    h('form', { class: 'search', role: 'search', onsubmit: openCode }, icon('route', 20), code, h('button', { class: 'btn sm primary' }, t('Ver'))),
    !state.user ? h('div', { class: 'card stack' }, h('div', { class: 'small' }, t('Entre na sua conta para ver os seus envios. Recebeu um link de rastreio? Cole-o acima.')),
      h('a', { class: 'btn primary', href: '#/login?next=/track' }, t('Entrar'))) : null,
    live.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('A caminho')), live.map(trackCard)) : null,
    state.user && !list.length ? empty('ship', t('Ainda não tem envios a caminho. Quando a sua encomenda sair da fábrica, aparece aqui com o mapa e a data de chegada.')) : null,
    done.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Entregues')), done.map(trackCard)) : null,
    h('a', { class: 'card tight row', href: '#/t/exemplo', style: { textDecoration: 'none', color: 'inherit', background: 'var(--green-tint)', border: 0 } },
      h('span', { class: 'ic sm green' }, icon('ship', 18)), h('span', { class: 'grow small' }, h('strong', {}, t('Ver um exemplo')), h('br'), t('Contentor de demonstração a caminho de Maputo')), h('span', { class: 'chev' }, icon('chevron', 16))));
}

// ------------------------------------------------------------------ detalhe
export async function trackDetail({ params }) {
  return detail(await get('/tracking/' + Number(params.id)), false);
}
export async function trackPublic({ params }) {
  return detail(await get('/track/' + encodeURIComponent(params.token)), true);
}

function ics(s) {
  const d = s.eta.replace(/-/g, '');
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ponte//PT', 'BEGIN:VEVENT', `UID:ponte-trk-${s.ref}@ponte.app`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d}`, `SUMMARY:${t('Chegada prevista')}: ${s.title} (${s.ref})`, `DESCRIPTION:${s.destination.name}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([body], { type: 'text/calendar' })), download: `chegada-${s.ref}.ics` });
  a.click();
}

function detail(s, pub) {
  const mapEl = h('div', { class: 'mapbox trk-map', role: 'region', 'aria-label': t('Mapa da rota') });
  const shareUrl = s.share_token ? `${location.origin}/#/t/${s.share_token}` : location.href;
  const shareText = `${t('Acompanhe o envio')} ${s.title} (${s.ref}): ${shareUrl}`;
  const spoken = () => `${s.title}. ${t(s.phase_label)}. ${etaText(s)}.${s.delayed && s.delay_days ? ' ' + t('Atraso de {n} dias.', { n: s.delay_days }) : ''}${s.events[0] ? ' ' + t('Última actualização') + ': ' + t(s.events[0].label) + (s.events[0].location ? ', ' + s.events[0].location : '') + '.' : ''}`;
  const kv = (k, v, copyable) => (v ? [h('div', { class: 'xs muted' }, t(k)), h('div', { class: 'small row', style: { fontWeight: 700, gap: '6px' } }, v,
    copyable ? h('button', { class: 'say-btn', 'aria-label': t('Copiar'), onclick: () => copy(v) }, icon('copy', 14)) : null)] : null);

  const root = h('div', { class: 'screen' },
    topbar(s.ref, { right: speakButton(spoken, { cls: 'icon-btn' }) }),
    pub ? h('div', { class: 'card tight row', style: { background: 'var(--green-tint)', border: 0 } }, icon('shield', 18),
      h('span', { class: 'small grow' }, t('Rastreio partilhado pela Ponte. Sem preços nem documentos.'))) : null,
    s.is_sample ? h('div', { class: 'banner-test' }, t('Exemplo de demonstração: dados fictícios.')) : null,
    // Estado
    h('div', { class: 'card green stack' },
      h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, [t(MODE[s.mode]?.[1] || ''), s.carrier_name].filter(Boolean).join(' · ')),
      h('div', { class: 'h2', style: { color: '#fff' } }, s.title),
      h('div', { class: 'row between', style: { alignItems: 'flex-end' } },
        h('div', {}, h('div', { class: 'display', style: { fontSize: '26px' } }, t(s.phase_label)),
          h('div', { class: 'small', style: { color: '#D6E9E1' } }, etaText(s))),
        s.delayed ? h('span', { class: 'badge red' }, s.delay_days ? t('Atraso de {n} dias', { n: s.delay_days }) : t('Atrasado')) : null),
      progressBar(s, true),
      s.phase === 2 && s.remaining_km ? h('div', { class: 'xs', style: { color: '#D6E9E1' } }, t('Faltam cerca de {n} km de {t} km', { n: s.remaining_km.toLocaleString(), t: s.distance_km.toLocaleString() })) : null),
    // Mapa
    h('div', { class: 'card flush', style: { overflow: 'hidden', padding: 0 } }, mapEl,
      s.position?.estimated && s.phase === 2 ? h('div', { class: 'xs muted', style: { padding: '8px 14px' } }, t('Posição estimada pela data de partida e de chegada. A posição exacta está no site da transportadora.')) : null),
    // Fases
    h('div', { class: 'trk-phases' }, PHASES.map((p, i) => h('div', { class: 'trk-ph ' + (i < s.phase ? 'done' : i === s.phase ? 'now' : '') }, h('span', { class: 'dot' }), h('span', {}, t(p))))),
    // Dados do transporte
    h('div', { class: 'card stack' }, h('h2', { class: 'h3' }, t('Transporte')),
      h('div', { class: 'kv' },
        kv('Transportadora', s.carrier_name), kv('Navio / voo', [s.vessel, s.voyage].filter(Boolean).join(' · ')),
        kv('Contentor', s.container_no, true), pub ? null : kv('Conhecimento (BL)', s.bl_no, true), kv('Guia', s.tracking_no, true),
        kv('Origem', s.origin.name), s.stops.length > 2 ? kv('Transbordo', s.stops.slice(1, -1).map((x) => x.name).join(', ')) : null, kv('Destino', s.destination.name),
        kv('Partida', s.atd ? fmtDate(s.atd, { day: 'numeric', month: 'long' }) : s.etd ? fmtDate(s.etd, { day: 'numeric', month: 'long' }) + ' (' + t('prevista') + ')' : null),
        kv('Chegada prevista', s.eta ? fmtDate(s.eta, { day: 'numeric', month: 'long', year: 'numeric' }) + (s.eta_original && s.eta_original !== s.eta ? ` (${t('inicial')}: ${fmtDate(s.eta_original, { day: 'numeric', month: 'short' })})` : '') : null)),
      s.carrier_url ? h('a', { class: 'btn outline block', href: s.carrier_url, target: '_blank', rel: 'noopener' }, icon('globe', 18), t('Ver no site da transportadora')) : null),
    // Etapas
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Histórico do envio')),
      s.events.length ? h('div', { class: 'trk-events' }, s.events.map((e, i) => h('div', { class: 'trk-ev' + (i === 0 ? ' first' : '') + (e.code === 'atraso' ? ' warn' : '') },
        h('span', { class: 'ic sm ' + (e.code === 'atraso' ? 'red' : i === 0 ? 'green' : 'grey') }, icon(e.icon, 16)),
        h('div', { class: 'grow' },
          h('div', { class: 'h3', style: { fontSize: '15px' } }, t(e.label)),
          h('div', { class: 'xs muted' }, [new Date(String(e.happened_at).replace(' ', 'T') + 'Z').toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), e.location].filter(Boolean).join(' · ')),
          e.note ? h('div', { class: 'small', style: { marginTop: '2px' } }, e.note) : null))))
        : h('div', { class: 'small muted' }, t('As etapas aparecem aqui à medida que a equipa e a transportadora as registam.'))),
    // Acções
    h('div', { class: 'grid2' },
      h('button', { class: 'btn primary', onclick: async () => {
        if (navigator.share) { try { await navigator.share({ title: `Ponte · ${s.ref}`, text: shareText, url: shareUrl }); return; } catch { /* cancelado */ } }
        copy(shareUrl);
      } }, icon('share', 18), t('Partilhar')),
      h('a', { class: 'btn outline', href: `https://wa.me/?text=${encodeURIComponent(shareText)}`, target: '_blank', rel: 'noopener' }, icon('whatsapp', 18), 'WhatsApp')),
    s.eta && s.phase < 3 ? h('button', { class: 'btn ghost block', onclick: () => ics(s) }, icon('calendar', 18), t('Pôr a chegada no calendário')) : null,
    !pub && s.order ? h('a', { class: 'btn ghost block', href: `#/order/${s.order.id}` }, icon('box', 18), t('Ver o pedido {c}', { c: s.order.code })) : null,
    !pub ? h('a', { class: 'btn outline block', href: '#/chat?msg=' + encodeURIComponent(`${t('Pergunta sobre o envio')} ${s.ref}: `) }, icon('chat', 18), t('Perguntar à equipa sobre este envio')) : null,
    pub && !state.user ? h('a', { class: 'btn accent block', href: '#/welcome' }, t('Conhecer a Ponte')) : null);

  // Mapa: rota feita (verde), por fazer (tracejado), paragens e posição actual
  requestAnimationFrame(async () => {
    try {
      const L = await loadLeaflet();
      if (!mapEl.isConnected) return;
      const m = L.map(mapEl, { zoomControl: false, attributionControl: true, worldCopyJump: false });
      landLayer(L)?.addTo(m);
      L.tileLayer(state.config.mapTiles || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: state.config.mapAttribution || '© OpenStreetMap' }).addTo(m);
      const pts = s.path;
      // dividir a rota na posição actual
      let cut = pts.length;
      if (s.position && s.phase === 2) {
        let best = 0, bd = Infinity;
        pts.forEach((p, i) => { const d = (p[0] - s.position.lat) ** 2 + (p[1] - s.position.lng) ** 2; if (d < bd) { bd = d; best = i; } });
        cut = best + 1;
      } else if (s.phase < 2) cut = 1;
      const donePts = s.phase >= 3 ? pts : [...pts.slice(0, cut), ...(s.position && s.phase === 2 ? [[s.position.lat, s.position.lng]] : [])];
      const todoPts = s.phase >= 3 ? [] : [...(s.position && s.phase === 2 ? [[s.position.lat, s.position.lng]] : [pts[0]]), ...pts.slice(cut)];
      if (donePts.length > 1) L.polyline(donePts, { color: '#0F5C48', weight: 4 }).addTo(m);
      if (todoPts.length > 1) L.polyline(todoPts, { color: '#0F5C48', weight: 3, dashArray: '6 8', opacity: 0.6 }).addTo(m);
      for (const st of s.stops) L.circleMarker([st.lat, st.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#E8B04B', fillOpacity: 1 }).addTo(m).bindTooltip(st.name);
      if (s.position) {
        L.marker([s.position.lat, s.position.lng], { icon: L.divIcon({ className: '', html: `<div class="trk-pin">${icon(MODE[s.mode]?.[0] || 'ship', 18, 2).outerHTML}</div>`, iconSize: [36, 36], iconAnchor: [18, 18] }) })
          .addTo(m).bindTooltip(s.position.estimated ? t('Posição estimada') : t('Última posição'));
      }
      m.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
    } catch { mapEl.replaceChildren(h('div', { class: 'small muted', style: { padding: '20px' } }, t('Mapa indisponível sem internet.'))); }
  });
  return root;
}
