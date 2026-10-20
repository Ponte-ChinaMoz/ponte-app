// Tradução automática. Funciona com DeepL (chave em DEEPL_API_KEY) ou com um servidor
// LibreTranslate (LIBRETRANSLATE_URL, e opcionalmente LIBRETRANSLATE_API_KEY).
// Sem nenhum configurado, a app usa as alternativas (Baidu Translate, frases prontas).
const cache = new Map();

const DEEPL_LANG = { pt: 'PT-PT', en: 'EN-GB', es: 'ES', it: 'IT', fr: 'FR', zh: 'ZH-HANS' };
const DEEPL_SRC = { pt: 'PT', en: 'EN', es: 'ES', it: 'IT', fr: 'FR', zh: 'ZH' };

export function translateProvider() {
  if (process.env.DEEPL_API_KEY) return 'deepl';
  if (process.env.LIBRETRANSLATE_URL) return 'libre';
  return null;
}

export async function translate(text, source, target) {
  const key = `${source}|${target}|${text}`;
  if (cache.has(key)) return cache.get(key);
  const provider = translateProvider();
  let out;
  if (provider === 'deepl') {
    const k = process.env.DEEPL_API_KEY;
    const host = k.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
    const body = new URLSearchParams({ text, target_lang: DEEPL_LANG[target] || 'EN-GB' });
    if (source && source !== 'auto' && DEEPL_SRC[source]) body.set('source_lang', DEEPL_SRC[source]);
    const r = await fetch(`${host}/v2/translate`, { method: 'POST', headers: { Authorization: `DeepL-Auth-Key ${k}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!r.ok) throw new Error(`DeepL ${r.status}`);
    const j = await r.json();
    out = { text: j.translations[0].text, detected: (j.translations[0].detected_source_language || '').toLowerCase().slice(0, 2), provider };
  } else if (provider === 'libre') {
    const r = await fetch(process.env.LIBRETRANSLATE_URL.replace(/\/$/, '') + '/translate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: source || 'auto', target: target === 'zh' ? 'zh' : target, format: 'text', api_key: process.env.LIBRETRANSLATE_API_KEY || undefined }),
    });
    if (!r.ok) throw new Error(`LibreTranslate ${r.status}`);
    const j = await r.json();
    out = { text: j.translatedText, detected: j.detectedLanguage?.language || source, provider };
  } else {
    return null;
  }
  if (cache.size > 2000) cache.delete(cache.keys().next().value);
  cache.set(key, out);
  return out;
}
