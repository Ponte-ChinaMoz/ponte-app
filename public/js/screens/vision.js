// Identificar por fotografia: o que é, para que serve, tamanho/capacidade estimados, materiais,
// especificações, capacidade de produção, preço indicativo, alternativas e artigos parecidos na Ponte.
// O cliente nunca recebe contactos de fornecedores: o passo seguinte é sempre pedir à equipa.
import { h, fill, icon, toast, topbar, field, copy } from '../ui.js';
import { t, lang, countryInfo, country } from '../i18n.js';
import { post } from '../api.js';
import { state, go } from '../app.js';
import { ls } from './main.js';
import { shrink } from './trade.js';
import { productTile } from './shop.js';
import { speakButton } from '../voice.js';
import { showBig, speakIn } from './go.js';

const section = (ic, title, ...body) => {
  const content = body.flat().filter(Boolean);
  if (!content.length) return null;
  return h('div', { class: 'card stack' }, h('div', { class: 'row', style: { gap: '10px' } }, h('span', { class: 'ic sm green' }, icon(ic, 18)), h('h2', { class: 'h3 grow' }, t(title))), ...content);
};
const bullets = (list) => (list?.length ? h('ul', { class: 'small', style: { margin: 0, paddingLeft: '18px', lineHeight: 1.7 } }, list.map((x) => h('li', {}, x))) : null);
const kv = (rows) => {
  const r = rows.filter(([, v]) => v);
  return r.length ? h('div', { class: 'kv' }, r.map(([k, v]) => [h('div', { class: 'xs muted' }, t(k)), h('div', { class: 'small', style: { fontWeight: 700 } }, v)])) : null;
};

function thumb(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = 96; c.height = 96; const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 96, 96); resolve(c.toDataURL('image/jpeg', 0.6)); };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function identify() {
  const root = h('div', { class: 'screen' });
  const out = h('div', { class: 'stack lg' });
  const note = h('input', { placeholder: t('Opcional: o que sabe sobre o objecto (ex.: "máquina de fazer blocos")') });
  let photo = null;
  const preview = h('div');
  const history = ls.get('ponte.identified', []);

  const camera = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'sr', id: 'vcam' });
  const gallery = h('input', { type: 'file', accept: 'image/*', class: 'sr', id: 'vgal' });
  const pick = async (input) => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    photo = await shrink(f, 1024);
    fill(preview, h('img', { src: photo.data, alt: t('Fotografia'), class: 'vision-photo' }));
    analyse();
  };
  camera.addEventListener('change', () => pick(camera));
  gallery.addEventListener('change', () => pick(gallery));

  function toTeam(r) {
    const details = r ? [
      r.name_zh ? `${r.name} (${r.name_zh})` : r.name,
      r.size?.dimensions ? `${t('Medidas')}: ${r.size.dimensions}` : null,
      r.size?.capacity ? `${t('Capacidade')}: ${r.size.capacity}` : null,
      r.size?.volume ? `${t('Volume')}: ${r.size.volume}` : null,
      r.materials?.length ? `${t('Materiais')}: ${r.materials.join(', ')}` : null,
      r.colors?.length ? `${t('Cores')}: ${r.colors.join(', ')}` : null,
      r.production_capacity ? `${t('Capacidade de produção')}: ${r.production_capacity}` : null,
      r.power ? `${t('Alimentação')}: ${r.power}` : null,
      ...(r.specs || []).map((s) => `${s.label}: ${s.value}`),
    ].filter(Boolean).join('\n') : note.value;
    try { sessionStorage.setItem('ponte.identify', JSON.stringify({ photo, title: r?.name || note.value || t('Procurar artigo da fotografia'), details })); } catch { /* foto demasiado grande: segue sem ela */ }
    go('#/quote?from=identify');
  }

  function fallback(msg) {
    fill(out, h('div', { class: 'card stack' },
      h('div', { class: 'h3' }, msg || t('O reconhecimento automático ainda não está activo neste servidor.')),
      h('div', { class: 'small muted' }, t('A equipa Ponte identifica o artigo pela fotografia e encontra a fábrica que o produz.')),
      h('button', { class: 'btn primary block', onclick: () => toTeam(null) }, icon('send', 18), t('Enviar a fotografia à equipa'))));
  }

  async function analyse() {
    if (!photo) return;
    fill(out, h('div', { class: 'card stack', style: { alignItems: 'center', textAlign: 'center' } },
      h('div', { class: 'voice-orb thinking', style: { width: '64px', height: '64px' } }, icon('camera', 26, 2)),
      h('div', { class: 'h3' }, t('A analisar a fotografia…')),
      h('div', { class: 'xs muted' }, t('Identificar o objecto, materiais, tamanho e especificações. Demora alguns segundos.'))));
    try {
      const r = await post('/vision', { image: photo.data, lang: lang(), note: note.value, country: country() });
      show(r.result, r.similar);
      const th = await thumb(photo.data);
      history.unshift({ name: r.result.name, zh: r.result.name_zh, th, at: Date.now() });
      ls.set('ponte.identified', history.slice(0, 10));
    } catch (e) {
      if (e.status === 501) fallback();
      else if (e.message === 'offline') fallback(t('Sem ligação à internet.'));
      else fallback(e.message);
    }
  }

  function show(r, similar) {
    const conf = Math.round((r.confidence ?? 0.5) * 100);
    const priceText = r.price_usd ? `${r.price_usd.min ?? '?'}–${r.price_usd.max ?? '?'} USD${r.price_usd.unit ? ' / ' + r.price_usd.unit : ''}` : null;
    const spoken = () => [r.name, r.summary,
      r.size?.dimensions ? `${t('Medidas')}: ${r.size.dimensions}` : '', r.size?.capacity ? `${t('Capacidade')}: ${r.size.capacity}` : '',
      r.size?.volume ? `${t('Volume')}: ${r.size.volume}` : '', r.size?.weight ? `${t('Peso')}: ${r.size.weight}` : '',
      r.production_capacity ? `${t('Capacidade de produção')}: ${r.production_capacity}` : '', priceText ? `${t('Preço indicativo na China')}: ${priceText}` : ''].filter(Boolean).join('. ');

    fill(out,
      h('div', { class: 'card green stack' },
        h('div', { class: 'row between top' },
          h('div', { class: 'grow' },
            h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, [r.kind, r.category].filter(Boolean).join(' · ')),
            h('div', { class: 'display', style: { fontSize: '24px', lineHeight: 1.2 } }, r.name),
            r.name_zh ? h('button', { class: 'link', style: { color: '#fff', padding: 0, fontSize: '18px' }, lang: 'zh-CN', onclick: () => showBig(r.name_zh, 'zh') }, r.name_zh, ' ', icon('expand', 14)) : null),
          speakButton(spoken, { cls: 'icon-btn' })),
        r.summary ? h('div', { class: 'small', style: { color: '#D6E9E1' } }, r.summary) : null,
        h('div', {}, h('div', { class: 'row between xs', style: { color: '#D6E9E1', fontWeight: 700, marginBottom: '4px' } }, h('span', {}, t('Confiança')), h('span', {}, conf + '%')),
          h('div', { style: { height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,.2)', overflow: 'hidden' } }, h('div', { style: { height: '6px', width: conf + '%', background: conf >= 70 ? 'var(--gold)' : '#E8875B' } }))),
        h('div', { class: 'grid2' },
          h('button', { class: 'btn accent', onclick: () => toTeam(r) }, t('Pedir cotação')),
          h('button', { class: 'btn light', onclick: () => go('#/catalog?q=' + encodeURIComponent(r.search_terms?.[0] || r.name)) }, t('Ver no catálogo')))),

      section('ruler', 'Tamanho e capacidade (estimativa)', kv([['Medidas', r.size?.dimensions], ['Volume', r.size?.volume], ['Peso', r.size?.weight], ['Capacidade', r.size?.capacity]]),
        r.size?.basis ? h('div', { class: 'xs muted' }, r.size.basis) : null),
      section('check', 'Para que serve', bullets(r.uses)),
      section('box', 'Materiais e acabamento', kv([['Materiais', r.materials?.join(', ')], ['Cores', r.colors?.join(', ')], ['Estilo', r.styles?.map((s) => t(s)).join(', ')], ['Funcionamento', r.mechanism]]),
        r.styles?.length ? h('button', { class: 'link', style: { padding: 0 }, onclick: () => go('#/catalog?styles=' + encodeURIComponent(r.styles.join(','))) }, t('Ver artigos neste estilo')) : null),
      section('factory', 'Especificações típicas', kv([...(r.specs || []).map((s) => [s.label, s.value]), ['Capacidade de produção', r.production_capacity], ['Alimentação', r.power]])),
      section('tag', 'Preço indicativo na China', priceText ? h('div', { class: 'display', style: { fontSize: '22px' } }, priceText) : null,
        r.price_usd?.note ? h('div', { class: 'xs muted' }, r.price_usd.note) : null, r.moq ? h('div', { class: 'small' }, t('Encomenda mínima típica') + ': ' + r.moq) : null),
      section('shield', 'Como verificar a qualidade', bullets(r.quality_tips), r.spare_parts ? h('div', { class: 'small' }, h('strong', {}, t('Peças sobresselentes') + ': '), r.spare_parts) : null),
      section('truck', t('Importar para {p}', { p: t(countryInfo().name === 'Outro país' ? 'o seu país' : countryInfo().name) }), r.import_notes ? h('div', { class: 'small' }, r.import_notes) : null),
      section('chat', 'Perguntas a fazer ao fornecedor', bullets(r.ask_supplier)),
      r.alternatives?.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Outras opções')),
        h('div', { class: 'list' }, r.alternatives.map((a) => h('button', { class: 'list-item', onclick: () => go('#/catalog?q=' + encodeURIComponent(a.name)) },
          h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, a.name), a.why ? h('span', { class: 'd', style: { display: 'block' } }, a.why) : null),
          a.price_hint ? h('span', { class: 'badge grey' }, a.price_hint) : null, h('span', { class: 'chev' }, icon('chevron', 16)))))) : null,
      h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Parecidos no catálogo Ponte')),
        similar?.length ? h('div', { class: 'grid2' }, similar.map(productTile))
          : h('div', { class: 'small muted' }, t('Ainda não temos este artigo no catálogo. A equipa encontra-o por si.'))),
      r.name_zh ? h('div', { class: 'card tight row' }, h('span', { class: 'grow small' }, t('Nome em chinês para mostrar numa loja ou mercado:'), ' ', h('strong', { lang: 'zh-CN' }, r.name_zh)),
        h('button', { class: 'icon-btn ghost', 'aria-label': t('Ouvir'), onclick: () => speakIn(r.name_zh, 'zh') }, icon('speaker', 18)),
        h('button', { class: 'icon-btn ghost', 'aria-label': t('Copiar'), onclick: () => copy(r.name_zh) }, icon('copy', 18))) : null,
      h('div', { class: 'xs muted', style: { textAlign: 'center' } }, (r.caveats ? r.caveats + ' ' : '') + t('Valores estimados pela fotografia: a equipa confirma com o fornecedor antes de qualquer compra.')),
      h('button', { class: 'btn primary block', onclick: () => toTeam(r) }, icon('send', 18), t('Pedir à equipa que encontre e cote')));
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  fill(root,
    topbar(t('Identificar por fotografia')),
    h('div', { class: 'card stack', style: { background: 'var(--green-tint)', border: 0 } },
      h('div', { class: 'small' }, t('Fotografe um equipamento, móvel, ferramenta ou material. A Ponte diz o que é, para que serve, o tamanho e a capacidade aproximados, as especificações e outras opções.'))),
    h('div', { class: 'grid2' },
      h('label', { for: 'vcam', class: 'btn primary', style: { minHeight: '64px' } }, icon('camera', 20), t('Tirar fotografia')),
      h('label', { for: 'vgal', class: 'btn outline', style: { minHeight: '64px' } }, icon('image', 20), t('Escolher da galeria'))),
    camera, gallery,
    field(t('Pista (opcional)'), note, t('Ajuda a identificar: marca, uso ou medida que conhece.')),
    preview, out,
    history.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Identificados recentemente')),
      h('div', { class: 'list' }, history.map((x) => h('button', { class: 'list-item', onclick: () => go('#/catalog?q=' + encodeURIComponent(x.name)) },
        x.th ? h('img', { src: x.th, alt: '', style: { width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover' } }) : h('span', { class: 'ic sm grey' }, icon('camera', 18)),
        h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, x.name), x.zh ? h('span', { class: 'd', lang: 'zh-CN' }, x.zh) : null),
        h('span', { class: 'chev' }, icon('chevron', 16)))))) : null);
  if (!state.config.vision) out.appendChild(h('div', { class: 'xs muted', style: { textAlign: 'center' } }, t('Modo sem reconhecimento automático: a fotografia é enviada à equipa.')));
  return root;
}
