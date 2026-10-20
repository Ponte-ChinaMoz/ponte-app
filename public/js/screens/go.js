// Tradutor para mandarim e viagens (voos para a China e transportes dentro da China).
import { h, fill, icon, toast, sheet, field, segmented, topbar, copy } from '../ui.js';
import { t, lang, LANGS, countryInfo } from '../i18n.js';
import { post } from '../api.js';
import { state, go, requireLogin } from '../app.js';
import { ls } from './main.js';
import { phrases, speak } from './travel.js';
import { listen as voiceListen } from '../voice.js';

const SPEECH = { pt: 'pt-PT', en: 'en-GB', es: 'es-ES', it: 'it-IT', fr: 'fr-FR', zh: 'zh-CN' };
const BAIDU = { pt: 'pt', en: 'en', es: 'spa', it: 'it', fr: 'fra', zh: 'zh' };
const GOOGLE = { pt: 'pt', en: 'en', es: 'es', it: 'it', fr: 'fr', zh: 'zh-CN' };

export function speakIn(text, l) {
  if (l === 'zh') return speak(text);
  if (!('speechSynthesis' in window)) return toast(t('Este telefone não tem leitura em voz alta.'));
  const u = new SpeechSynthesisUtterance(text);
  u.lang = SPEECH[l];
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

export function showBig(text, l) {
  const el = h('div', { class: 'taxi', role: 'dialog', 'aria-label': t('Mostrar à outra pessoa') },
    h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, t('Mostrar à outra pessoa')),
    h('div', { class: 'cn', lang: l === 'zh' ? 'zh-CN' : l, style: { fontSize: text.length > 60 ? '26px' : '36px' } }, text),
    h('div', { class: 'row', style: { gap: '10px', marginTop: '20px' } },
      h('button', { class: 'btn light grow', onclick: () => speakIn(text, l) }, icon('speaker', 18), t('Ouvir')),
      h('button', { class: 'btn accent grow', onclick: () => el.remove() }, t('Fechar'))));
  document.body.appendChild(el);
}

// ------------------------------------------------------------------ tradutor
export function translator({ query = {} } = {}) {
  const mine = lang() === 'zh' ? 'pt' : lang();
  let dir = 'to'; // to = do meu idioma para chinês; from = de chinês para o meu idioma
  const history = ls.get('ponte.translations', []);
  const root = h('div', { class: 'screen' });
  const text = h('textarea', { class: 'input', 'data-novoice': '', rows: 4, style: { minHeight: '120px', padding: '14px', fontSize: '18px' } });
  const result = h('div');

  const src = () => (dir === 'to' ? mine : 'zh');
  const dst = () => (dir === 'to' ? 'zh' : mine);
  const langName = (c) => LANGS.find(([k]) => k === c)[1];

  function fallback(value) {
    const enc = encodeURIComponent(value);
    return h('div', { class: 'card stack' },
      h('div', { class: 'small' }, t('A tradução automática ainda não está activa neste servidor. Abra uma destas opções:')),
      h('div', { class: 'grid2' },
        h('a', { class: 'btn outline sm', href: `https://fanyi.baidu.com/#${BAIDU[src()]}/${BAIDU[dst()]}/${enc}`, target: '_blank', rel: 'noopener' }, 'Baidu Translate'),
        h('a', { class: 'btn outline sm', href: `https://translate.google.com/?sl=${GOOGLE[src()]}&tl=${GOOGLE[dst()]}&text=${enc}&op=translate`, target: '_blank', rel: 'noopener' }, t('Google (fora da China)'))),
      h('div', { class: 'xs muted' }, t('Na China, o Baidu Translate funciona sem VPN.')));
  }

  function showResult(out, value) {
    const l = dst();
    fill(result, h('div', { class: 'card green stack' },
      h('div', { class: 'kicker', style: { color: 'var(--gold)' } }, langName(l)),
      h('div', { lang: l === 'zh' ? 'zh-CN' : l, style: { fontSize: '26px', fontWeight: 700, lineHeight: 1.35 } }, out.text),
      h('div', { class: 'row wrap', style: { gap: '8px' } },
        h('button', { class: 'btn light sm', onclick: () => speakIn(out.text, l) }, icon('speaker', 16), t('Ouvir')),
        h('button', { class: 'btn light sm', onclick: () => copy(out.text) }, icon('copy', 16), t('Copiar')),
        h('button', { class: 'btn accent sm', onclick: () => showBig(out.text, l) }, icon('expand', 16), t('Mostrar'))),
      h('div', { class: 'xs', style: { color: '#BFDCD0' } }, value)));
    history.unshift({ src: src(), dst: l, in: value, out: out.text });
    ls.set('ponte.translations', history.slice(0, 15));
  }

  async function run() {
    const value = text.value.trim();
    if (!value) return;
    fill(result, h('div', { class: 'skel', style: { minHeight: '120px' } }));
    try {
      const out = await post('/translate', { text: value, source: src(), target: dst() });
      showResult(out, value);
    } catch (e) {
      if (e.status === 501) fill(result, fallback(value));
      else { fill(result); toast(e.message === 'offline' ? t('Sem ligação à internet.') : e.message); }
    }
  }

  async function listen() {
    const said = await voiceListen({ title: t('Fale em {l}', { l: langName(src()) }), lang: src() });
    if (said) { text.value = said; run(); }
  }

  function draw() {
    text.placeholder = dir === 'to' ? t('Escreva ou dite em {l}…', { l: langName(mine) }) : '请输入中文…';
    text.lang = dir === 'to' ? mine : 'zh-CN';
    fill(root,
      topbar(t('Tradutor')),
      h('div', { class: 'card row between', style: { padding: '10px 14px' } },
        h('strong', {}, langName(src())),
        h('button', { class: 'icon-btn', 'aria-label': t('Trocar idiomas'), onclick: () => { dir = dir === 'to' ? 'from' : 'to'; text.value = ''; fill(result); draw(); } }, icon('swap', 20)),
        h('strong', {}, langName(dst()))),
      text,
      h('div', { class: 'row', style: { gap: '8px' } },
        h('button', { class: 'btn primary grow', onclick: run }, t('Traduzir')),
        h('button', { class: 'btn outline', onclick: listen, 'aria-label': t('Falar') }, icon('mic', 18), t('Falar'))),
      result,
      dir === 'to' ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Frases prontas')),
        h('div', { class: 'list' }, phrases().map(([pt, cn, py]) => h('button', { class: 'list-item', onclick: () => showBig(cn, 'zh') },
          h('span', { class: 'grow' }, h('span', { class: 'd', style: { display: 'block' } }, t(pt)), h('span', { lang: 'zh-CN', style: { display: 'block', fontSize: '19px', fontWeight: 700 } }, cn), h('span', { class: 'd' }, py)),
          h('span', { class: 'chev' }, icon('expand', 16)))))) : null,
      history.length ? h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Recentes')),
        h('div', { class: 'list' }, history.slice(0, 6).map((x) => h('button', { class: 'list-item', onclick: () => showBig(x.out, x.dst) },
          h('span', { class: 'grow' }, h('span', { class: 'd', style: { display: 'block' } }, x.in), h('span', { style: { display: 'block', fontWeight: 700 } }, x.out)))))) : null);
  }
  draw();
  if (query.text) { text.value = query.text; setTimeout(run, 0); }
  return root;
}

// ------------------------------------------------------------------ voos e transportes
const FROM_ALL = [['MPM', 'Maputo'], ['NBJ', 'Luanda'], ['GRU', 'São Paulo'], ['LIS', 'Lisboa'], ['RAI', 'Praia'], ['OXB', 'Bissau'], ['TMS', 'São Tomé'], ['DIL', 'Díli'], ['JNB', 'Joanesburgo']];
const fromList = () => { const own = countryInfo().airports; return [...own, ...FROM_ALL.filter(([c]) => !own.some(([o]) => o === c))]; };
const TO = [['CAN', 'Guangzhou'], ['SZX', 'Shenzhen'], ['HKG', 'Hong Kong'], ['PVG', 'Xangai'], ['PEK', 'Pequim'], ['YIW', 'Yiwu']];

export function trips({ query }) {
  const tab = query.tab === 'china' ? 'china' : 'voos';
  const root = h('div', { class: 'screen' });
  const saved = ls.get('ponte.trip', { from: countryInfo().airports[0]?.[0] || 'MPM', to: 'CAN', date: '', back: '', pax: 1 });
  if (!countryInfo().airports.some(([c]) => c === saved.from) && countryInfo().airports[0]) saved.from = countryInfo().airports[0][0];
  const from = h('select', {}, fromList().map(([c, n]) => h('option', { value: c, selected: c === saved.from }, `${n} (${c})`)));
  const to = h('select', {}, TO.map(([c, n]) => h('option', { value: c, selected: c === saved.to }, `${n} (${c})`)));
  const date = h('input', { type: 'date', value: saved.date, min: new Date().toISOString().slice(0, 10) });
  const back = h('input', { type: 'date', value: saved.back });
  const pax = h('input', { type: 'number', min: 1, max: 9, value: saved.pax, inputmode: 'numeric' });
  const remember = () => ls.set('ponte.trip', { from: from.value, to: to.value, date: date.value, back: back.value, pax: Number(pax.value) || 1 });
  const yymmdd = (d) => (d ? d.slice(2).replace(/-/g, '') : '');

  const links = () => {
    remember();
    const q = `Flights from ${from.value} to ${to.value}${date.value ? ' on ' + date.value : ''}${back.value ? ' returning ' + back.value : ''}`;
    return {
      google: `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`,
      sky: `https://www.skyscanner.net/transport/flights/${from.value.toLowerCase()}/${to.value.toLowerCase()}/${yymmdd(date.value)}${back.value ? '/' + yymmdd(back.value) : ''}/?adultsv2=${Number(pax.value) || 1}`,
      trip: 'https://www.trip.com/flights/',
    };
  };
  const openLink = (k) => window.open(links()[k], '_blank', 'noopener');

  async function askTeam(kind, details) {
    if (!state.user) return requireLogin('/travel' + (tab === 'china' ? '?tab=china' : ''));
    try { await post('/chat/human', { body: `${kind}: ${details}` }); toast(t('Pedido enviado à equipa Ponte.')); go('#/chat'); } catch (e) { toast(e.message); }
  }

  const ext = (ic, title, desc, href, color = 'green') => h('a', { class: 'list-item', href, target: '_blank', rel: 'noopener' },
    h('span', { class: 'ic sm ' + color }, icon(ic, 18)), h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, title), h('span', { class: 'd', style: { display: 'block' } }, t(desc))),
    h('span', { class: 'chev' }, icon('arrow', 16)));

  const voos = [
    h('div', { class: 'card stack lg' },
      h('h2', { class: 'h2' }, t('Voos para a China')),
      h('div', { class: 'grid2' }, field(t('De'), from), field(t('Para'), to)),
      h('div', { class: 'grid2' }, field(t('Ida'), date), field(t('Volta (opcional)'), back)),
      field(t('Passageiros'), pax),
      h('div', { class: 'stack' },
        h('button', { class: 'btn primary block', onclick: () => openLink('google') }, icon('plane', 18), t('Comparar preços no Google Flights')),
        h('div', { class: 'grid2' }, h('button', { class: 'btn outline sm', onclick: () => openLink('sky') }, 'Skyscanner'), h('button', { class: 'btn outline sm', onclick: () => openLink('trip') }, 'Trip.com'))),
      h('div', { class: 'xs muted' }, t('A compra é feita no site escolhido.') + ' ' + t('Os voos de {p} para a China costumam ter escala em {h}.', { p: t(countryInfo().name), h: countryInfo().hubs }))),
    h('div', { class: 'card dark stack' },
      h('div', { style: { fontWeight: 800 } }, t('Prefere que tratemos de tudo?')),
      h('div', { class: 'small', style: { color: '#BFCBC5' } }, t('A equipa Ponte procura o melhor voo, hotel perto da feira e transfer do aeroporto.')),
      h('button', { class: 'btn accent', onclick: () => askTeam(t('Pedido de reserva de viagem'), `${from.value} → ${to.value}, ${date.value || t('data a definir')}${back.value ? ' / ' + back.value : ''}, ${pax.value} ${t('passageiro(s)')}`) }, t('Pedir reserva à equipa'))),
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Companhias aéreas')),
      h('div', { class: 'list' },
        ext('plane', 'Ethiopian Airlines', 'Escala em Adis Abeba', 'https://www.ethiopianairlines.com/'),
        ext('plane', 'Qatar Airways', 'Escala em Doha', 'https://www.qatarairways.com/'),
        ext('plane', 'Emirates', 'Escala no Dubai', 'https://www.emirates.com/'),
        countryInfo().code === 'MZ' ? ext('plane', 'Kenya Airways', 'Escala em Nairobi', 'https://www.kenya-airways.com/') : null,
        (countryInfo().airlines || []).map(([n, u]) => ext('plane', n, 'Companhia nacional', u)))),
  ];

  const china = [
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Comboios rápidos')),
      h('div', { class: 'list' },
        ext('train', 'Trip.com · Comboios', 'Bilhetes em inglês, aceita cartão estrangeiro.', 'https://www.trip.com/trains/china/'),
        ext('train', '12306 · China Railway', 'Site oficial dos caminhos-de-ferro chineses.', 'https://www.12306.cn/en/index.html')),
      h('div', { class: 'xs muted' }, t('Leve o passaporte: é o seu bilhete nas estações. Guangzhou Sul liga a Shenzhen, Foshan, Yiwu e Hong Kong.'))),
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Na cidade')),
      h('div', { class: 'list' },
        ext('car', 'DiDi', 'Táxis, com interface em inglês.', 'https://www.didiglobal.com/', 'gold'),
        h('a', { class: 'list-item', href: '#/map?cat=transporte' }, h('span', { class: 'ic sm gold' }, icon('bus', 18)),
          h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, t('Metro e autocarro')), h('span', { class: 'd', style: { display: 'block' } }, t('Rotas no Mapa da Ponte; pague com o código QR do Alipay ou WeChat.'))), h('span', { class: 'chev' }, icon('chevron', 16))),
        h('a', { class: 'list-item', href: '#/map' }, h('span', { class: 'ic sm gold' }, icon('pin', 18)),
          h('span', { class: 'grow' }, h('span', { class: 't', style: { display: 'block' } }, t('Mostrar morada ao taxista')), h('span', { class: 'd', style: { display: 'block' } }, t('Cada local do mapa tem a morada em chinês.'))), h('span', { class: 'chev' }, icon('chevron', 16))))),
    h('div', { class: 'stack' }, h('h2', { class: 'h2' }, t('Voos dentro da China')),
      h('div', { class: 'list' }, ext('plane', 'Trip.com · Voos', 'Voos domésticos com cartão estrangeiro.', 'https://www.trip.com/flights/'))),
    h('button', { class: 'btn outline block', onclick: () => askTeam(t('Pedido de transporte na China'), t('Preciso de ajuda com transporte (comboio, transfer ou carro com motorista).')) }, t('Pedir transfer ou carro com motorista')),
  ];

  fill(root, topbar(t('Voos e transportes')),
    segmented([['voos', t('Voos')], ['china', t('Na China')]], tab, (v) => go('#/travel' + (v === 'china' ? '?tab=china' : ''))),
    tab === 'voos' ? voos : china);
  return root;
}
