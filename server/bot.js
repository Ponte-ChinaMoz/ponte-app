// Assistente automático: compara a pergunta com as perguntas frequentes (FAQ) da base de dados.
// Algoritmo: normaliza o texto (minúsculas, sem acentos), pontua palavras-chave e semelhança
// de palavras com cada pergunta; acima de um limiar responde, abaixo passa à equipa humana.
import { all } from './db.js';

const STOP = new Set(('a o os as de do da dos das e em no na nos nas um uma para por com que como qual quais quando onde ' +
  'eu me meu minha se ser e é sao the to of and in on for is are how what where when do does can i my a an ' +
  'el la los las y en por para que como donde il lo gli di da per che come dove le les des du et pour est').split(' '));

export function normalize(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(text) {
  return normalize(text).split(' ').filter((w) => w.length > 1 && !STOP.has(w));
}

const HUMAN = /\b(lara|humano|humana|pessoa|agente|atendente|falar com|human|person|agent|someone|operador|antonio)\b/;

export function answer(text, lang = 'pt') {
  const norm = normalize(text);
  if (HUMAN.test(norm)) return { handoff: true, score: 1 };

  const langs = [lang, 'pt', 'en'];
  const rows = all('SELECT * FROM faq').filter((r) => langs.includes(r.lang));
  const words = new Set(tokens(text));
  let best = null;

  for (const r of rows) {
    let score = 0;
    for (const kw of String(r.keywords || '').split(',').map((k) => normalize(k)).filter(Boolean)) {
      if (kw.includes(' ') ? norm.includes(kw) : words.has(kw) || [...words].some((w) => w.length > 4 && w.startsWith(kw))) {
        score += kw.includes(' ') ? 3 : 2;
      }
    }
    const q = tokens(r.question);
    const overlap = q.filter((w) => words.has(w)).length;
    score += q.length ? (overlap / q.length) * 3 : 0;
    // Preferir o idioma do utilizador em caso de empate.
    if (r.lang === lang) score += 0.25;
    if (!best || score > best.score) best = { row: r, score };
  }

  if (best && best.score >= 2) {
    return { handoff: false, score: best.score, faqId: best.row.id, text: best.row.answer };
  }
  return { handoff: false, score: best ? best.score : 0, text: null };
}
