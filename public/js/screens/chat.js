// Chat: assistente automático + conversa com a equipa Ponte (actualiza a cada 4 segundos).
import { h, icon, logo, toast } from '../ui.js';
import { t, lang } from '../i18n.js';
import { get, post } from '../api.js';
import { state, refreshUser } from '../app.js';
import { speakButton, say, readAloud, takeVoiceTurn, listen, canListen } from '../voice.js';

export async function chat({ query = {} } = {}) {
  const [first, faq] = await Promise.all([get('/chat'), get('/faq?lang=' + lang())]);
  let lastId = 0;
  let needsHuman = first.needs_human;
  let speakReplies = takeVoiceTurn(); // perguntou por voz → ouve a resposta
  const body = h('div', { class: 'chat-body', 'aria-live': 'polite' });
  const status = h('div', { class: 'xs muted' });
  const updateStatus = () => { status.textContent = needsHuman ? t('Equipa Ponte na conversa · {h}', { h: state.config.supportHours || '' }) : t('Respostas automáticas · equipa: {h}', { h: state.config.supportHours || '' }); };
  updateStatus();

  const timeOf = (iso) => new Date(iso.replace(' ', 'T') + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const addMsgs = (msgs, live = true) => {
    for (const m of msgs) {
      if (m.id <= lastId) continue;
      lastId = m.id;
      body.appendChild(h('div', { class: 'msg ' + m.sender },
        m.sender === 'admin' ? h('div', { class: 'who' }, m.sender_name || t('Equipa Ponte')) : null,
        m.body, h('div', { class: 'when' }, timeOf(m.created_at), m.sender !== 'user' ? speakButton(m.body) : null)));
      if (live && m.sender !== 'user' && (speakReplies || readAloud())) say(m.body);
    }
    body.scrollTop = body.scrollHeight;
  };
  addMsgs(first.messages, false);

  const input = h('textarea', { 'data-novoice': '', rows: 1, placeholder: t('Escreva a sua pergunta…'), 'aria-label': t('Mensagem'), class: 'input', style: { minHeight: '48px', maxHeight: '120px', padding: '12px 14px', resize: 'none' } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });

  async function send(text, byVoice = false) {
    if (byVoice) speakReplies = true;
    const value = (text ?? input.value).trim();
    if (!value) return;
    input.value = ''; input.style.height = '';
    try {
      const r = await post('/chat', { body: value });
      addMsgs(r.messages);
      needsHuman = r.needs_human; updateStatus();
    } catch (e) { toast(e.message === 'offline' ? t('Sem ligação. A mensagem não foi enviada.') : e.message); input.value = value; }
  }

  const quick = faq.filter((f) => f.quick).slice(0, 6);
  const foot = h('div', { class: 'chat-foot' },
    h('div', { class: 'chip-row', style: { margin: '0 -16px', padding: '0 16px 2px' } },
      quick.map((f) => h('button', { class: 'chip', style: { borderColor: 'var(--green-line)', color: 'var(--green)' }, onclick: () => send(f.question) }, f.question)),
      h('button', { class: 'chip', style: { background: 'var(--gold-tint)', borderColor: 'var(--gold-tint)' }, onclick: async () => {
        const r = await post('/chat/human'); addMsgs(r.messages); needsHuman = true; updateStatus();
      } }, icon('user', 14), t('Falar com a equipa'))),
    h('div', { class: 'row', style: { gap: '10px', alignItems: 'flex-end' } }, h('div', { class: 'grow' }, input),
      canListen() ? h('button', { class: 'icon-btn', style: { width: '48px', height: '48px', flexBasis: '48px', background: 'var(--green-tint)', color: 'var(--green)', border: 0 }, 'aria-label': t('Falar'),
        onclick: async () => { const said = await listen({ title: t('Diga a sua pergunta') }); if (said) send(said, true); } }, icon('mic', 22, 2)) : null,
      h('button', { class: 'icon-btn', style: { width: '48px', height: '48px', flexBasis: '48px', background: 'var(--green)', color: '#fff', border: 0 }, 'aria-label': t('Enviar'), onclick: () => send() }, icon('send', 20, 2))));

  const root = h('div', { class: 'chat' },
    h('div', { class: 'chat-head row' }, logo(40), h('div', { class: 'grow' }, h('h1', { class: 'h3', style: { fontSize: '16px' } }, t('Assistente e equipa Ponte')), status)),
    body, foot);

  // Actualização automática enquanto o chat está aberto.
  const timer = setInterval(async () => {
    if (document.hidden) return;
    try { const r = await get('/chat?after=' + lastId); if (r.messages.length) { addMsgs(r.messages); needsHuman = r.needs_human; updateStatus(); } } catch { /* offline */ }
  }, 4000);
  state.cleanup = () => clearInterval(timer);
  state.unread = 0;
  refreshUser();
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
  if (query.msg) setTimeout(() => send(query.msg, speakReplies), 0);
  return root;
}
