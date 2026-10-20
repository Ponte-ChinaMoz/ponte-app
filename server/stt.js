// Reconhecimento de voz no servidor (para funcionar dentro da China, onde o ditado do Chrome Android
// depende dos servidores Google). Usa qualquer serviço compatível com a API Whisper da OpenAI:
//   - Servidor próprio (faster-whisper-server, whisper.cpp, LocalAI, Speaches…): STT_URL=https://.../v1
//   - OpenAI: OPENAI_API_KEY (ou STT_API_KEY) sem STT_URL
//   - Groq e outros compatíveis: STT_URL + STT_API_KEY + STT_MODEL
// Sem configuração, a app usa o reconhecimento do próprio telefone (Web Speech API).

const LANG = { pt: 'pt', en: 'en', es: 'es', it: 'it', fr: 'fr', zh: 'zh' };

export function sttProvider() {
  if (process.env.STT_URL) return 'whisper';
  if (process.env.OPENAI_API_KEY || process.env.STT_API_KEY) return 'openai';
  return null;
}

const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };

export async function transcribe(buf, mime, lang) {
  const provider = sttProvider();
  if (!provider) return null;
  const base = (process.env.STT_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const key = process.env.STT_API_KEY || process.env.OPENAI_API_KEY || '';
  const type = String(mime || 'audio/webm').split(';')[0];
  const form = new FormData();
  form.set('file', new Blob([buf], { type }), `voz.${EXT[type] || 'webm'}`);
  form.set('model', process.env.STT_MODEL || 'whisper-1');
  if (LANG[lang]) form.set('language', LANG[lang]);
  form.set('response_format', 'json');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST', body: form, signal: ctrl.signal,
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
    if (!r.ok) throw new Error(`STT ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    return { text: String(j.text || '').trim(), provider };
  } finally {
    clearTimeout(timer);
  }
}
