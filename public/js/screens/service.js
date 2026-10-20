// Assistência e pós-venda: equipamentos do cliente (passaporte), avarias, peças sobresselentes,
// manutenção preventiva e técnicos parceiros no país do cliente.
import { h, fill, icon, toast, topbar, field, empty, fmtDate, fmtMoney, segmented } from '../ui.js';
import { t, countryInfo } from '../i18n.js';
import { get, post, patch } from '../api.js';
import { state, go, rerender } from '../app.js';
import { shrink } from './trade.js';
import { speakButton } from '../voice.js';

export const SVC_STEPS = [['novo', 'Recebido'], ['diagnostico', 'Diagnóstico com a fábrica'], ['proposta', 'Proposta de solução'], ['em_resolucao', 'Em resolução'], ['resolvido', 'Resolvido']];
const STATUS = { novo: ['Recebido', 'gold'], diagnostico: ['Em diagnóstico', 'gold'], proposta: ['Proposta pronta', 'red'], aceite: ['Aceite', 'green'], em_resolucao: ['Em resolução', 'gold'], resolvido: ['Resolvido', 'green'], fechado: ['Fechado', 'grey'] };
const KINDS = [['avaria', 'Avaria', 'warn'], ['pecas', 'Peças', 'gear'], ['manutencao', 'Manutenção', 'tool'], ['instalacao', 'Instalação', 'box'], ['duvida', 'Dúvida', 'chat']];
const SOLUTIONS = { remota: 'Apoio remoto por vídeo com a fábrica', peca: 'Envio de peça', tecnico: 'Técnico parceiro no seu país', garantia: 'Reparação ou troca na garantia', devolucao: 'Devolução à fábrica', outro: 'Outra solução' };
const stepIndex = (s) => ({ novo: 0, diagnostico: 1, proposta: 2, aceite: 3, em_resolucao: 3, resolvido: 4, fechado: 4 }[s] ?? 0);

function warrantyBadge(e) {
  if (e.in_warranty === null) return h('span', { class: 'badge grey' }, t('Garantia por indicar'));
  return e.in_warranty ? h('span', { class: 'badge green' }, t('Garantia até {d}', { d: fmtDate(e.warranty_until, { day: 'numeric', month: 'short', year: 'numeric' }) }))
    : h('span', { class: 'badge grey' }, t('Fora de garantia'));
}
function maintText(e) {
  if (!e.next_maint) return null;
  if (e.maint_days < 0) return [t('Manutenção em atraso ({n} dias)', { n: -e.maint_days }), 'red'];
  if (e.maint_days === 0) return [t('Manutenção hoje'), 'red'];
  return [t('Próxima manutenção em {n} dias', { n: e.maint_days }), e.maint_days <= 7 ? 'gold' : 'green'];
}

export function equipmentCard(e) {
  const m = maintText(e);
  return h('a', { class: 'card stack', href: `#/equipment/${e.id}`, style: { textDecoration: 'none', color: 'inherit' } },
    h('div', { class: 'row between top' },
      h('span', { class: 'row', style: { gap: '10px' } }, h('span', { class: 'ic sm ' + (e.status === 'avariado' ? 'red' : 'green') }, icon('gear', 18)),
        h('span', {}, h('span', { class: 'h3', style: { display: 'block' } }, e.name), h('span', { class: 'xs muted' }, [e.brand, e.model, e.serial_no ? 'S/N ' + e.serial_no : null].filter(Boolean).join(' · ') || t('Sem modelo indicado')))),
      e.status === 'avariado' ? h('span', { class: 'badge red' }, t('Avariado')) : e.open_tickets ? h('span', { class: 'badge gold' }, t('{n} pedido(s) aberto(s)', { n: e.open_tickets })) : null),
    h('div', { class: 'row wrap', style: { gap: '6px' } }, warrantyBadge(e), m ? h('span', { class: 'badge ' + m[1] }, m[0]) : null));
}

// ------------------------------------------------------------------ início da assistência
export async function serviceHome() {
  const [eqs, tickets, techs] = state.user ? await Promise.all([get('/equipment'), get('/service'), get('/partners?type=tecnico')]) : [[], [], await get('/partners?type=tecnico')];
  const ci = countryInfo();
  const mine = techs.filter((p) => [ci.code, ci.name].includes(p.country));
  const action = (kind, ic, title, desc, color) => h('a', { class: 'big-action' + (color === 'red' ? ' green' : ''), href: state.user ? `#/service/new?kind=${kind}` : '#/login?next=' + encodeURIComponent('/service/new?kind=' + kind) },
    h('span', { class: 'ic ' + (color === 'red' ? 'glass' : color) }, icon(ic)),
    h('span', {}, h('span', { class: 't', style: { display: 'block' } }, t(title)), h('span', { class: 'd', style: { display: 'block' } }, t(desc))));
  const open = tickets.filter((x) => !['resolvido', 'fechado'].includes(x.status));
  return h('div', { class: 'screen' },
    topbar(t('Assistência e pós-venda')),
    h('div', { class: 'card dark stack' },
      h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Depois da compra')),
      h('div', { class: 'h2', style: { color: '#fff' } }, t('A fábrica está na China. A Ponte fala com ela por si.')),
      h('div', { class: 'small', style: { color: '#BFCBC5' } }, t('Avarias, peças, garantia e manutenção: a equipa em Guangzhou trata com a fábrica em chinês e encontra a solução no seu país.'))),
    h('div', { class: 'stack' },
      action('avaria', 'warn', 'Tenho uma avaria', 'Fotografe, descreva ou fale. Prioridade se a máquina parou.', 'red'),
      action('pecas', 'gear', 'Preciso de peças', 'Pela referência ou por fotografia da peça.', 'gold'),
      action('manutencao', 'tool', 'Manutenção ou técnico', 'Plano de manutenção e técnicos no seu país.', 'green')),
    open.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Pedidos em curso')), open.map(ticketRow)) : null,
    h('div', { class: 'stack' },
      h('div', { class: 'row between' }, h('h2', { class: 'h2' }, t('Os meus equipamentos')), state.user ? h('a', { class: 'link', href: '#/equipment/new' }, icon('plus', 14), ' ', t('Registar')) : null),
      eqs.length ? eqs.map(equipmentCard) : h('div', { class: 'card stack' },
        h('div', { class: 'small' }, t('Registe as máquinas e aparelhos que comprou: fica com o passaporte de cada um (modelo, número de série, garantia, manual e peças) e recebe lembretes de manutenção.')),
        h('a', { class: 'btn outline', href: state.user ? '#/equipment/new' : '#/login?next=/equipment/new' }, icon('plus', 16), t('Registar equipamento')))),
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Como funciona')),
      h('div', { class: 'list' }, [
        ['camera', 'Descreva e fotografe', 'A máquina, a chapa de características, o código de erro. Pode falar em vez de escrever.'],
        ['translate', 'A Ponte fala com a fábrica', 'Em chinês, com o engenheiro da fábrica. Diagnóstico por fotografias ou videochamada.'],
        ['tool', 'Recebe a solução', 'Apoio remoto, peça enviada por courier, técnico parceiro no seu país ou reparação na garantia.'],
        ['ship', 'Acompanha até resolver', 'Peças com rastreio e histórico da máquina sempre consigo.'],
      ].map(([ic, a, b]) => h('div', { class: 'list-item' }, h('span', { class: 'ic sm green' }, icon(ic, 18)),
        h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, t(a)), h('span', { class: 'd', style: { display: 'block' } }, t(b)))))) ),
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, `${ci.flag} ${t('Técnicos parceiros')}`),
      mine.length ? h('div', { class: 'list' }, mine.map((p) => h('div', { class: 'list-item' }, h('span', { class: 'ic sm gold' }, icon('tool', 18)),
        h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, p.company), h('span', { class: 'd', style: { display: 'block' } }, [p.city, p.services].filter(Boolean).join(' · '))))))
        : h('div', { class: 'small muted' }, t('Ainda não temos técnicos parceiros em {p}. A equipa resolve por apoio remoto e envio de peças.', { p: t(ci.name) })),
      h('a', { class: 'link', href: '#/partner?type=tecnico' }, t('É técnico? Registe-se como parceiro'))),
    tickets.length > open.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Pedidos anteriores')), tickets.filter((x) => !open.includes(x)).map(ticketRow)) : null);
}

function ticketRow(x) {
  const [label, color] = STATUS[x.status] || [x.status, 'grey'];
  return h('a', { class: 'card tight row', href: `#/service/${x.id}`, style: { textDecoration: 'none', color: 'inherit' } },
    h('span', { class: 'ic sm ' + (x.urgency === 'parada' ? 'red' : 'grey') }, icon((KINDS.find((k) => k[0] === x.kind) || KINDS[0])[2], 18)),
    h('span', { class: 'grow' }, h('span', { class: 'h3', style: { display: 'block', fontSize: '15px' } }, x.title), h('span', { class: 'xs muted' }, `${x.code} · ${fmtDate(x.updated_at)}`)),
    h('span', { class: 'badge ' + color }, t(label)));
}

// ------------------------------------------------------------------ registar / editar equipamento
export async function equipmentForm({ query }) {
  const orders = await get('/orders').catch(() => []);
  const editing = query.id ? await get('/equipment/' + Number(query.id)) : null;
  const f = {
    name: h('input', { value: editing?.name || '', placeholder: t('Ex.: Máquina de blocos QT4-40') }),
    brand: h('input', { value: editing?.brand || '' }), model: h('input', { value: editing?.model || '' }),
    serial_no: h('input', { value: editing?.serial_no || '', placeholder: t('Na chapa de características') }),
    purchased_at: h('input', { type: 'date', value: editing?.purchased_at || '' }),
    warranty_months: h('input', { type: 'number', inputmode: 'numeric', min: 0, value: editing?.warranty_months ?? 12 }),
    maint_interval_days: h('select', {}, [['', 'Sem plano'], [30, 'Todos os meses'], [90, 'De 3 em 3 meses'], [180, 'De 6 em 6 meses'], [365, 'Uma vez por ano']]
      .map(([v, l]) => h('option', { value: v, selected: String(editing?.maint_interval_days ?? '') === String(v) }, t(l)))),
    voltage: h('input', { value: editing?.voltage || '', placeholder: '220 V · 50 Hz' }),
    wear_parts: h('textarea', { placeholder: t('Ex.: correias, filtros, moldes, rolamentos') }),
    location: h('input', { value: editing?.location || '', placeholder: t('Ex.: Fábrica da Matola') }),
    order_id: h('select', {}, h('option', { value: '' }, t('Não comprado pela Ponte')), orders.map((o) => h('option', { value: o.id, selected: String(o.id) === String(query.order || editing?.order_id || '') }, `${o.code} · ${o.title}`))),
  };
  f.wear_parts.value = editing?.wear_parts || '';
  const photos = [];
  const photoList = h('div', { class: 'row wrap', style: { gap: '8px' } });
  const photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr', id: 'eqphoto' });
  photoInput.addEventListener('change', async () => {
    for (const file of photoInput.files) { if (photos.length >= 3) break; const s = await shrink(file); photos.push(s); photoList.appendChild(h('img', { src: s.data, alt: '', class: 'thumb' })); }
    photoInput.value = '';
  });
  const btn = h('button', { class: 'btn primary block' }, editing ? t('Guardar') : t('Registar equipamento'));
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
      if (editing) { await patch('/equipment/' + editing.id, body); go(`#/equipment/${editing.id}`); }
      else { const r = await post('/equipment', { ...body, photos }); toast(t('Equipamento registado.')); go(`#/equipment/${r.id}`); }
    } catch (e) { toast(e.message); btn.disabled = false; }
  };
  return h('div', { class: 'screen' },
    topbar(editing ? t('Editar equipamento') : t('Registar equipamento')),
    h('div', { class: 'card tight row', style: { background: 'var(--green-tint)', border: 0 } }, icon('camera', 18),
      h('span', { class: 'small grow' }, t('Dica: fotografe a chapa de características (a etiqueta metálica com modelo, número de série e tensão). É o que a fábrica pede primeiro.'))),
    editing ? null : h('div', { class: 'stack' }, h('label', { for: 'eqphoto', class: 'btn outline block', style: { borderStyle: 'dashed' } }, icon('camera', 18), t('Fotografar a máquina e a chapa')), photoInput, photoList),
    field(t('Nome do equipamento'), f.name),
    h('div', { class: 'grid2' }, field(t('Marca'), f.brand), field(t('Modelo'), f.model)),
    field(t('Número de série'), f.serial_no),
    field(t('Comprado através da Ponte?'), f.order_id),
    h('div', { class: 'grid2' }, field(t('Data de compra'), f.purchased_at), field(t('Garantia (meses)'), f.warranty_months)),
    field(t('Manutenção preventiva'), f.maint_interval_days, t('Recebe um lembrete antes de cada manutenção.')),
    field(t('Peças de desgaste'), f.wear_parts),
    h('div', { class: 'grid2' }, field(t('Tensão / potência'), f.voltage), field(t('Onde está'), f.location)),
    btn);
}

// ------------------------------------------------------------------ passaporte do equipamento
export async function equipmentView({ params }) {
  const e = await get('/equipment/' + Number(params.id));
  const m = maintText(e);
  const kv = (k, v) => (v ? [h('div', { class: 'xs muted' }, t(k)), h('div', { class: 'small', style: { fontWeight: 700 } }, v)] : null);
  const LOG = { manutencao: ['tool', 'Manutenção'], avaria: ['warn', 'Avaria'], peca: ['gear', 'Peça'], reparacao: ['check', 'Reparação'], nota: ['info', 'Nota'] };
  return h('div', { class: 'screen' },
    topbar(e.name, { right: h('a', { class: 'icon-btn', href: `#/equipment/new?id=${e.id}`, 'aria-label': t('Editar') }, icon('edit', 18)) }),
    h('div', { class: 'card green stack' },
      h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Passaporte do equipamento')),
      h('div', { class: 'h2', style: { color: '#fff' } }, e.name),
      h('div', { class: 'small', style: { color: '#D6E9E1' } }, [e.brand, e.model].filter(Boolean).join(' · ') || t('Modelo por indicar')),
      h('div', { class: 'row wrap', style: { gap: '6px' } }, warrantyBadge(e), m ? h('span', { class: 'badge ' + m[1] }, m[0]) : null, e.status === 'avariado' ? h('span', { class: 'badge red' }, t('Avariado')) : null)),
    h('div', { class: 'grid3' },
      h('a', { class: 'card tight center', href: `#/service/new?kind=avaria&equipment=${e.id}`, style: { textDecoration: 'none', color: 'var(--red-dk)' } }, icon('warn', 22), h('div', { class: 'xs', style: { fontWeight: 800 } }, t('Avaria'))),
      h('a', { class: 'card tight center', href: `#/service/new?kind=pecas&equipment=${e.id}`, style: { textDecoration: 'none', color: 'var(--gold-dk)' } }, icon('gear', 22), h('div', { class: 'xs', style: { fontWeight: 800 } }, t('Peças'))),
      h('a', { class: 'card tight center', href: `#/service/new?kind=manutencao&equipment=${e.id}`, style: { textDecoration: 'none', color: 'var(--green)' } }, icon('tool', 22), h('div', { class: 'xs', style: { fontWeight: 800 } }, t('Técnico')))),
    e.maint_interval_days ? h('div', { class: 'card stack' },
      h('div', { class: 'row between' }, h('h2', { class: 'h3' }, t('Manutenção preventiva')), m ? h('span', { class: 'badge ' + m[1] }, m[0]) : null),
      h('div', { class: 'small muted' }, t('A cada {n} dias · última: {d}', { n: e.maint_interval_days, d: e.last_maint_at ? fmtDate(e.last_maint_at) : t('nunca registada') })),
      e.wear_parts ? h('div', { class: 'small' }, h('strong', {}, t('Verificar') + ': '), e.wear_parts) : null,
      h('button', { class: 'btn outline', onclick: async () => { await post(`/equipment/${e.id}/maintenance`, {}); toast(t('Manutenção registada.')); rerender(); } }, icon('check', 16), t('Registar manutenção feita hoje'))) : null,
    h('div', { class: 'card stack' }, h('h2', { class: 'h3' }, t('Dados técnicos')),
      h('div', { class: 'kv' }, kv('Número de série', e.serial_no), kv('Compra', e.purchased_at ? fmtDate(e.purchased_at, { day: 'numeric', month: 'long', year: 'numeric' }) : null),
        kv('Garantia', e.warranty_months ? t('{n} meses', { n: e.warranty_months }) : null), kv('Tensão / potência', [e.voltage, e.power].filter(Boolean).join(' · ')),
        kv('Onde está', e.location), kv('Pedido', e.order ? e.order.code : null)),
      e.specs ? h('div', { class: 'small pre' }, e.specs) : null),
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Manuais e documentos')),
      e.documents.length ? h('div', { class: 'list' }, e.documents.map((d) => h('a', { class: 'list-item', href: `/api/documents/${d.id}`, target: '_blank', rel: 'noopener' },
        h('span', { class: 'ic sm green' }, icon(d.mime?.startsWith('image/') ? 'image' : 'doc', 18)), h('span', { class: 'grow t' }, d.name), h('span', { class: 'chev' }, icon('download', 16)))))
        : h('div', { class: 'small muted' }, t('A equipa pode pedir à fábrica o manual e a lista de peças, e traduzi-los para português.')),
      e.documents.some((d) => /manual/i.test(d.name)) ? null : h('a', { class: 'btn ghost sm', href: '#/chat?msg=' + encodeURIComponent(t('Pode pedir à fábrica o manual em português de: {n}?', { n: [e.name, e.model].filter(Boolean).join(' ') })) }, t('Pedir manual em português'))),
    e.tickets.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Pedidos de assistência')), e.tickets.map(ticketRow)) : null,
    e.log.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Histórico')),
      h('div', { class: 'trk-events' }, e.log.map((l) => h('div', { class: 'trk-ev' }, h('span', { class: 'ic sm grey' }, icon((LOG[l.kind] || LOG.nota)[0], 16)),
        h('div', { class: 'grow' }, h('div', { class: 'h3', style: { fontSize: '15px' } }, t((LOG[l.kind] || LOG.nota)[1])), h('div', { class: 'xs muted' }, fmtDate(l.created_at, { day: 'numeric', month: 'short', year: 'numeric' })),
          l.note ? h('div', { class: 'small' }, l.note) : null))))) : null);
}

// ------------------------------------------------------------------ novo pedido de assistência
export async function serviceNew({ query }) {
  const eqs = await get('/equipment');
  let kind = KINDS.some((k) => k[0] === query.kind) ? query.kind : 'avaria';
  let urgency = 'limitada';
  const eqSel = h('select', {}, h('option', { value: '' }, t('Não está na lista')), eqs.map((e) => h('option', { value: e.id, selected: String(e.id) === String(query.equipment || '') }, e.name + (e.model ? ' · ' + e.model : ''))));
  const title = h('input', { placeholder: t('Ex.: A máquina não liga / faz barulho / dá erro E04') });
  const desc = h('textarea', { rows: 4, placeholder: t('O que aconteceu, quando começou, o que já tentou. Pode tocar no microfone e falar.') });
  const errCode = h('input', { placeholder: t('Ex.: E04, ALM 12') });
  const parts = h('textarea', { rows: 3, placeholder: t('Uma peça por linha: nome ou referência e quantidade') });
  const photos = [];
  const photoList = h('div', { class: 'row wrap', style: { gap: '8px' } });
  const photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr', id: 'svcphoto', multiple: true });
  photoInput.addEventListener('change', async () => {
    for (const file of photoInput.files) { if (photos.length >= 4) break; const s = await shrink(file); photos.push(s); photoList.appendChild(h('img', { src: s.data, alt: '', class: 'thumb' })); }
    photoInput.value = '';
  });
  const root = h('div', { class: 'screen' });
  const draw = () => {
    const urg = (id, ic, label, sub) => h('button', { type: 'button', class: 'card row', style: { textAlign: 'left', cursor: 'pointer', borderWidth: '2px', borderColor: urgency === id ? (id === 'parada' ? 'var(--red)' : 'var(--green)') : '' }, onclick: () => { urgency = id; draw(); } },
      h('span', { class: 'ic sm ' + (id === 'parada' ? 'red' : id === 'limitada' ? 'gold' : 'green') }, icon(ic, 18)), h('span', { class: 'grow' }, h('span', { class: 'h3', style: { display: 'block', fontSize: '15px' } }, t(label)), h('span', { class: 'xs muted' }, t(sub))));
    const btn = h('button', { class: 'btn primary block' }, t('Enviar à equipa Ponte'));
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        const r = await post('/service', { kind, urgency: kind === 'avaria' ? urgency : 'normal', equipment_id: eqSel.value, title: title.value, description: desc.value, error_code: errCode.value, parts: parts.value, photos });
        toast(t('Pedido {c} enviado.', { c: r.code }));
        go(`#/service/${r.id}`);
      } catch (e) { toast(e.message); btn.disabled = false; }
    };
    fill(root,
      topbar(t('Pedido de assistência')),
      segmented(KINDS.slice(0, 3).map(([id, l]) => [id, t(l)]), kind, (v) => { kind = v; draw(); }),
      field(t('Equipamento'), eqSel, eqs.length ? null : t('Registe o equipamento para guardar o histórico e a garantia.')),
      kind === 'avaria' ? h('div', { class: 'stack' }, h('div', { class: 'h3' }, t('A máquina está…')),
        urg('parada', 'warn', 'Parada', 'Não funciona: resposta prioritária.'),
        urg('limitada', 'gear', 'A funcionar com problemas', 'Barulho, erro, perda de rendimento.'),
        urg('normal', 'chat', 'Só tenho uma dúvida', 'Configuração, uso, manutenção.')) : null,
      field(kind === 'pecas' ? t('Que peças precisa?') : t('Resumo'), kind === 'pecas' ? parts : title),
      kind === 'pecas' ? field(t('Resumo (opcional)'), title) : null,
      field(t('Descrição'), desc),
      kind === 'avaria' ? field(t('Código de erro no ecrã (se houver)'), errCode) : null,
      h('div', { class: 'stack' },
        h('label', { for: 'svcphoto', class: 'btn outline block', style: { borderStyle: 'dashed' } }, icon('camera', 18), kind === 'pecas' ? t('Fotografar a peça e a chapa da máquina') : t('Fotografar o problema (até 4 fotos)')),
        photoInput, photoList,
        h('div', { class: 'xs muted' }, t('Tem um vídeo da máquina a funcionar? Envie-o depois pelo chat ou WhatsApp: ajuda muito o engenheiro da fábrica.'))),
      h('a', { class: 'link', href: '#/identify' }, icon('camera', 14), ' ', t('Não sabe o nome da peça? Identifique-a por fotografia')),
      btn);
  };
  draw();
  return root;
}

// ------------------------------------------------------------------ acompanhar o pedido
export async function serviceView({ params }) {
  const tk = await get('/service/' + Number(params.id));
  const idx = stepIndex(tk.status);
  const [label, color] = STATUS[tk.status] || [tk.status, 'grey'];
  const msg = h('textarea', { rows: 2, placeholder: t('Acrescentar informação ou responder à equipa') });
  const spoken = () => `${tk.title}. ${t('Estado')}: ${t(label)}. ${tk.solution ? t('Proposta') + ': ' + tk.solution : ''}`;
  let stars = 0;
  return h('div', { class: 'screen' },
    topbar(tk.code, { right: speakButton(spoken, { cls: 'icon-btn' }) }),
    h('div', { class: 'card stack' },
      h('div', { class: 'row between top' }, h('div', { class: 'grow' }, h('div', { class: 'h2' }, tk.title), tk.equipment ? h('a', { class: 'small link', href: `#/equipment/${tk.equipment.id}`, style: { padding: 0 } }, tk.equipment.name) : null),
        h('span', { class: 'badge ' + color }, t(label))),
      tk.urgency === 'parada' ? h('div', { class: 'banner-test' }, t('Máquina parada: pedido prioritário.')) : null,
      tk.under_warranty === 1 ? h('span', { class: 'badge green' }, icon('shield', 12), ' ', t('Dentro da garantia')) : null,
      h('div', { class: 'timeline' }, SVC_STEPS.map(([, l], i) => h('div', { class: 'tl ' + (i < idx ? 'done' : i === idx ? 'now' : '') },
        h('div', { class: 'rail' }, h('span', { class: 'pt' }), i < SVC_STEPS.length - 1 ? h('span', { class: 'ln' }) : null),
        h('div', { class: 'txt' }, h('div', { class: 'h3', style: { color: i > idx ? 'var(--muted)' : '' } }, t(l))))))),
    tk.solution || tk.solution_type ? h('div', { class: 'card green stack' },
      h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Proposta da equipa Ponte')),
      tk.solution_type ? h('div', { class: 'h3', style: { color: '#fff' } }, t(SOLUTIONS[tk.solution_type] || tk.solution_type)) : null,
      tk.solution ? h('div', { class: 'small pre', style: { color: '#D6E9E1' } }, tk.solution) : null,
      tk.quote_usd ? h('div', { class: 'display', style: { fontSize: '22px' } }, fmtMoney(tk.quote_usd, 'USD')) : tk.under_warranty === 1 && tk.solution_type === 'garantia' ? h('div', { class: 'small' }, t('Sem custo: coberto pela garantia.')) : null,
      tk.partner ? h('div', { class: 'small', style: { color: '#D6E9E1' } }, t('Técnico: {n} ({c})', { n: tk.partner.company, c: tk.partner.city || '' })) : null,
      tk.status === 'proposta' ? h('button', { class: 'btn accent block', onclick: async () => { await post(`/service/${tk.id}/accept`); toast(t('Proposta aceite.')); rerender(); } }, t('Aceitar proposta')) : null,
      tk.order ? h('a', { class: 'btn light block', href: `#/order/${tk.order.id}` }, icon('box', 16), t('Pagar e acompanhar as peças ({c})', { c: tk.order.code })) : null) : null,
    tk.parts ? h('div', { class: 'card stack' }, h('h2', { class: 'h3' }, t('Peças pedidas')), h('div', { class: 'small pre' }, tk.parts)) : null,
    tk.description || tk.error_code ? h('div', { class: 'card stack' }, h('h2', { class: 'h3' }, t('O que nos disse')),
      tk.error_code ? h('div', { class: 'small' }, h('strong', {}, t('Código de erro') + ': '), tk.error_code) : null,
      tk.description ? h('div', { class: 'small pre' }, tk.description) : null) : null,
    tk.photos.length ? h('div', { class: 'row wrap', style: { gap: '8px' } }, tk.photos.map((p) => h('a', { href: `/api/documents/${p.id}`, target: '_blank', rel: 'noopener' }, h('img', { src: `/api/documents/${p.id}`, alt: '', class: 'thumb' })))) : null,
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Conversa e histórico')),
      h('div', { class: 'trk-events' }, [...tk.events].reverse().map((e) => h('div', { class: 'trk-ev' },
        h('span', { class: 'ic sm ' + (e.author === 'equipa' ? 'green' : 'grey') }, icon(e.author === 'equipa' ? 'chat' : 'user', 16)),
        h('div', { class: 'grow' }, h('div', { class: 'xs muted' }, `${e.author === 'equipa' ? t('Equipa Ponte') : t('Você')} · ${fmtDate(e.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`),
          e.status ? h('div', { class: 'h3', style: { fontSize: '14px' } }, t((STATUS[e.status] || [e.status])[0])) : null,
          e.note ? h('div', { class: 'small' }, e.note) : null)))),
      field(t('Mensagem'), msg),
      h('button', { class: 'btn outline', onclick: async () => {
        try { await post(`/service/${tk.id}/message`, { note: msg.value, reopen: ['resolvido', 'fechado'].includes(tk.status) }); toast(t('Mensagem enviada.')); rerender(); } catch (e) { toast(e.message); }
      } }, icon('send', 16), t('Enviar'))),
    ['resolvido', 'fechado'].includes(tk.status) && !tk.rating ? h('div', { class: 'card stack' }, h('h2', { class: 'h3' }, t('Como correu a assistência?')),
      h('div', { class: 'row', style: { gap: '6px' } }, [1, 2, 3, 4, 5].map((n) => h('button', { class: 'chip', onclick: async () => { stars = n; await post(`/service/${tk.id}/rate`, { rating: stars }); toast(t('Obrigado pela avaliação.')); rerender(); } }, '★'.repeat(n))))) : null);
}
