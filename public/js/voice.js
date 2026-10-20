// Voz: ditado em todos os campos, comandos por voz e leitura em voz alta.
// Dois motores de reconhecimento:
//   - "device": Web Speech API do telefone (rápido, grátis; no Android depende dos servidores Google → falha na China)
//   - "server": grava com MediaRecorder e envia para /api/stt (Whisper), funciona dentro da China
// Em "auto" usa o do telefone e, se este falhar por rede, passa sozinho para o servidor.
import { h, icon, toast, LOCALES } from './ui.js';
import { t, lang, locale } from './i18n.js';
import { post } from './api.js';
import { parseCommand } from './voice-commands.js';

export const voiceCfg = { stt: false };

const SR = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const canRecord = () => !!(window.MediaRecorder && navigator.mediaDevices?.getUserMedia);
export const pref = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
export const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignorar */ } };

export function engine() {
  if (globalThis.PONTE_NO_MIC) return null; // versão de demonstração: o microfone não está disponível
  const mode = pref('ponte.voiceEngine', 'auto');
  const server = voiceCfg.stt && canRecord();
  if (mode === 'server' && server) return 'server';
  if (mode === 'device' && SR()) return 'device';
  if (pref('ponte.sttFallback', '0') === '1' && server) return 'server';
  if (SR()) return 'device';
  if (server) return 'server';
  return null;
}
export const canListen = () => !!engine();

// ------------------------------------------------------------------ painel de escuta
let busy = false;

// Abre o painel "A ouvir…" e devolve o texto reconhecido (ou null se cancelado / nada ouvido).
export function listen({ title, hint, long = false, lang: l } = {}) {
  if (busy) return Promise.resolve(null);
  const eng = engine();
  if (!eng) { toast(t('Reconhecimento de voz indisponível neste navegador.')); return Promise.resolve(null); }
  busy = true;
  const code = l || lang();
  const live = h('div', { class: 'voice-live', 'aria-live': 'polite' }, hint || t('Fale agora…'));
  const orb = h('div', { class: 'voice-orb' }, icon('mic', 34, 2));
  const status = h('div', { class: 'xs muted' }, t('A ouvir…'));
  const doneBtn = h('button', { class: 'btn primary grow' }, t('Terminar'));
  const cancelBtn = h('button', { class: 'btn ghost grow' }, t('Cancelar'));
  const back = h('div', { class: 'voice-back' },
    h('div', { class: 'voice-panel', role: 'dialog', 'aria-label': title || t('A ouvir…') },
      h('div', { class: 'h3' }, title || t('A ouvir…')), orb, live, status,
      h('div', { class: 'row', style: { gap: '10px', width: '100%' } }, cancelBtn, doneBtn)));
  document.body.appendChild(back);

  return new Promise((resolve) => {
    let finished = false;
    const onHash = () => cancel();
    window.addEventListener('hashchange', onHash);
    const finish = (text) => {
      if (finished) return;
      finished = true; busy = false;
      window.removeEventListener('hashchange', onHash);
      back.remove();
      resolve(text ? text.trim() : null);
    };
    back.addEventListener('click', (e) => { if (e.target === back) cancel(); });
    let stop = () => {}; let cancel = () => finish(null);
    cancelBtn.onclick = () => cancel();
    doneBtn.onclick = () => stop();

    const startServer = async () => {
      status.textContent = t('A ouvir…') + ' · ' + t('servidor Ponte');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); } catch {
        toast(t('Autorize o microfone nas definições do navegador.')); return finish(null);
      }
      const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      const chunks = []; let aborted = false;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      // Detecção de silêncio: termina sozinho 1,6 s depois de a pessoa parar de falar.
      let actx, raf, heard = false, quietSince = 0;
      const t0 = Date.now();
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        const an = actx.createAnalyser(); an.fftSize = 1024;
        actx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2;
          const rms = Math.sqrt(sum / buf.length);
          orb.style.transform = `scale(${1 + Math.min(rms * 6, 0.45)})`;
          const now = Date.now();
          if (rms > 0.035) { heard = true; quietSince = 0; } else if (heard && !quietSince) quietSince = now;
          if (heard && quietSince && now - quietSince > 1600) return stop();
          if (!heard && now - t0 > 7000) return stop();
          if (now - t0 > (long ? 60000 : 25000)) return stop();
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch { /* sem detecção de silêncio: o utilizador carrega em Terminar */ }
      const cleanup = () => { cancelAnimationFrame(raf); try { actx?.close(); } catch { /* */ } stream.getTracks().forEach((tr) => tr.stop()); };
      rec.onstop = async () => {
        cleanup();
        if (aborted) return finish(null);
        const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
        if (blob.size < 1200) { toast(t('Não ouvi nada. Tente de novo.')); return finish(null); }
        orb.classList.add('thinking'); orb.style.transform = '';
        status.textContent = t('A transcrever…'); doneBtn.disabled = true;
        try {
          const audio = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = ko; r.readAsDataURL(blob); });
          const out = await post('/stt', { audio, mime: blob.type, lang: code });
          if (!out?.text) toast(t('Não percebi. Tente de novo ou escreva.'));
          finish(out?.text || null);
        } catch (e) {
          toast(e.message === 'offline' ? t('Sem ligação à internet.') : e.message);
          finish(null);
        }
      };
      stop = () => { if (rec.state === 'recording') rec.stop(); };
      cancel = () => { aborted = true; if (rec.state === 'recording') rec.stop(); else { cleanup(); finish(null); } };
      rec.start(250);
    };

    const startDevice = () => {
      const rec = new (SR())();
      rec.lang = code === lang() ? locale() : (LOCALES[code] || 'pt-PT');
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      let text = '', switched = false;
      orb.classList.add('pulse');
      rec.onresult = (e) => {
        text = Array.from(e.results).map((r) => r[0].transcript).join(' ');
        live.textContent = text;
      };
      rec.onerror = (e) => {
        if (['network', 'service-not-allowed', 'language-not-supported'].includes(e.error) && voiceCfg.stt && canRecord()) {
          // Sem acesso aos servidores Google (ex.: na China): passar para o servidor Ponte e lembrar.
          setPref('ponte.sttFallback', '1'); switched = true;
          orb.classList.remove('pulse');
          startServer();
        } else if (e.error === 'not-allowed') toast(t('Autorize o microfone nas definições do navegador.'));
        else if (e.error === 'no-speech') toast(t('Não ouvi nada. Tente de novo.'));
        else if (e.error === 'network') toast(t('O reconhecimento de voz precisa de internet. Tente escrever.'));
      };
      rec.onend = () => { if (!switched) finish(text || null); };
      stop = () => { try { rec.stop(); } catch { /* */ } };
      cancel = () => { switched = true; try { rec.abort(); } catch { /* */ } finish(null); };
      try { rec.start(); } catch { finish(null); }
    };

    if (eng === 'server') startServer(); else startDevice();
  });
}

// ------------------------------------------------------------------ ditado em qualquer campo
export async function dictateInto(el) {
  const text = await listen({ title: t('Dite o texto'), long: el.tagName === 'TEXTAREA', hint: el.placeholder || t('Fale agora…') });
  if (!text) return;
  const v = el.value;
  const start = el.selectionStart ?? v.length;
  const end = el.selectionEnd ?? v.length;
  const before = v.slice(0, start); const after = v.slice(end);
  const piece = (before && !/\s$/.test(before) ? ' ' : '') + text + (after && !/^\s/.test(after) ? ' ' : '');
  el.value = before + piece + after;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.focus();
  try { const p = (before + piece).length; el.setSelectionRange(p, p); } catch { /* */ }
}

const FIELDS = 'textarea, input[type=text], input[type=search], input:not([type])';

// Acrescenta um botão de microfone a cada campo de texto (excepto os marcados com data-novoice).
export function enhanceDictation(root = document.body) {
  if (!canListen()) return;
  for (const el of root.querySelectorAll(FIELDS)) {
    if (el.readOnly || el.disabled || el.closest('[data-novoice]') || el.parentElement?.classList.contains('voice-wrap')) continue;
    const wrap = h('span', { class: 'voice-wrap' + (el.tagName === 'TEXTAREA' ? ' ta' : '') });
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    wrap.appendChild(h('button', { type: 'button', class: 'dict-btn', tabindex: '-1', 'aria-label': t('Ditar'), onclick: (e) => { e.preventDefault(); dictateInto(el); } }, icon('mic', 16, 2)));
  }
}

export function watchDictation() {
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; enhanceDictation(document.body); });
  }).observe(document.body, { childList: true, subtree: true });
}

// ------------------------------------------------------------------ falar (texto → voz)
export const readAloud = () => pref('ponte.readAloud', '0') === '1';

export function say(text, l = lang()) {
  if (!('speechSynthesis' in window) || !text) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text).replace(/[*_#>`]/g, '').slice(0, 1200));
  u.lang = l === lang() ? locale() : (LOCALES[l] || l);
  const v = speechSynthesis.getVoices().find((x) => x.lang?.replace('_', '-').toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
  if (v) u.voice = v;
  u.rate = l === 'zh' ? 0.9 : 1;
  speechSynthesis.speak(u);
  return true;
}

// Botão pequeno "ouvir" para pôr ao lado de um texto.
export function speakButton(text, { label, cls = 'say-btn' } = {}) {
  if (!('speechSynthesis' in window)) return null;
  return h('button', { type: 'button', class: cls, 'aria-label': label || t('Ouvir'), title: label || t('Ouvir'),
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); say(typeof text === 'function' ? text() : text); } }, icon('speaker', 16), label ? ' ' + label : null);
}

// ------------------------------------------------------------------ comandos por voz (botão flutuante)
const EXAMPLES = ['«Abrir o mapa»', '«Falar com a Lara»', '«Quero 200 cadeiras pretas até 40 dólares»', '«Traduz onde fica a casa de banho»', '«Como chego à feira?»', '«Onde está o meu pedido?»'];

export function voiceFab(goFn) {
  const btn = h('button', { class: 'voice-fab', 'aria-label': t('Comando por voz'), title: t('Comando por voz') }, icon('mic', 26, 2));
  btn.onclick = async () => {
    const ex = EXAMPLES.map((x) => t(x));
    const text = await listen({ title: t('Diga o que precisa'), hint: t('Por exemplo:') + ' ' + ex.sort(() => Math.random() - 0.5).slice(0, 2).join(' · ') });
    if (!text) return;
    const cmd = parseCommand(text);
    if (!cmd) return;
    toast(`«${text}»` + (cmd.id === 'pay' ? ' · ' + t('Escolha o pedido e confirme o pagamento.') : ''));
    sessionStorage.setItem('ponte.voiceTurn', '1'); // quem pergunta por voz ouve a resposta em voz
    goFn(cmd.hash);
  };
  return btn;
}

// Verdadeiro uma única vez depois de um comando por voz (para ler a resposta em voz alta).
export function takeVoiceTurn() {
  try { const v = sessionStorage.getItem('ponte.voiceTurn') === '1'; sessionStorage.removeItem('ponte.voiceTurn'); return v; } catch { return false; }
}
