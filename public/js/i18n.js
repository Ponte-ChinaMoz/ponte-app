// Traduções: o texto em português é a chave; os outros idiomas estão em translations.js.
import { DICT } from './translations.js';
import { countryOf, COUNTRIES, fixPrep } from './countries.js';

export const LANGS = [
  ['pt', 'Português', 'PT'], ['en', 'English', 'EN'], ['es', 'Español', 'ES'],
  ['it', 'Italiano', 'IT'], ['fr', 'Français', 'FR'], ['zh', '中文', '中'],
];

function initial() {
  try { const s = localStorage.getItem('ponte.lang'); if (s && DICT[s] !== undefined) return s; } catch { /* ignorar */ }
  return 'pt';
}
let current = initial();

export const lang = () => current;
export function setLang(l) {
  if (!LANGS.some(([c]) => c === l)) return;
  current = l;
  try { localStorage.setItem('ponte.lang', l); } catch { /* ignorar */ }
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : l;
}
document.documentElement.lang = current === 'zh' ? 'zh-CN' : current;

// País do utilizador (adapta moeda, portos, pagamentos e a variante do português).
function initialCountry() {
  try { const c = localStorage.getItem('ponte.country'); if (c) return c; } catch { /* ignorar */ }
  return guessCountry();
}
// Palpite pelo fuso horário / idioma do telefone (o utilizador confirma no início).
export function guessCountry() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const byTz = COUNTRIES.find((c) => c.tz === tz);
    if (byTz) return byTz.code;
    if (/^America\/(Sao_Paulo|Recife|Fortaleza|Bahia|Manaus|Belem|Cuiaba|Porto_Velho|Boa_Vista|Rio_Branco|Maceio|Araguaina|Campo_Grande|Santarem|Noronha)/.test(tz)) return 'BR';
    const nl = (navigator.language || '').toLowerCase();
    if (nl === 'pt-br') return 'BR';
    if (nl === 'pt-pt') return 'PT';
  } catch { /* ignorar */ }
  return 'MZ';
}
let currentCountry = initialCountry();
export const country = () => currentCountry;
export const countryInfo = () => countryOf(currentCountry);
export function setCountry(c) {
  currentCountry = c;
  try { localStorage.setItem('ponte.country', c); } catch { /* ignorar */ }
}
// Locale para datas, números e voz.
export function locale() {
  if (current === 'pt') return countryInfo().variant === 'pt-BR' ? 'pt-BR' : 'pt-PT';
  return { en: 'en-GB', es: 'es-ES', it: 'it-IT', fr: 'fr-FR', zh: 'zh-CN' }[current] || 'pt-PT';
}

// Português do Brasil: o texto base é português europeu/africano; estas trocas adaptam-no.
// [palavra ou expressão (regex), substituição]. Respeita maiúscula inicial.
const BR_WORDS = [
  ['ao ecrã principal', 'à tela inicial'], ['ecrã principal', 'tela inicial'], ['no ecrã', 'na tela'], ['do ecrã', 'da tela'], ['ao ecrã', 'à tela'], ['o ecrã', 'a tela'], ['rastreio', 'rastreamento'],
  ['telemóveis', 'celulares'], ['telemóvel', 'celular'], ['ecrãs', 'telas'], ['ecrã', 'tela'], ['equipas', 'equipes'], ['equipa', 'equipe'],
  ['registos', 'cadastros'], ['registo', 'cadastro'], ['contentores', 'contêineres'], ['contentor', 'contêiner'], ['autocarros?', 'ônibus'],
  ['comboios', 'trens'], ['comboio', 'trem'], ['palavras-passe', 'senhas'], ['palavra-passe', 'senha'], ['utilizadores', 'usuários'], ['utilizador', 'usuário'],
  ['ficheiros', 'arquivos'], ['ficheiro', 'arquivo'], ['partilha(r|do|da|dos|das|m)?', (e) => 'compartilha' + (e || '')], ['moradas', 'endereços'], ['morada', 'endereço'],
  ['cestos', 'carrinhos'], ['cesto', 'carrinho'], ['contact(o|os|ar|e)', (e) => 'contat' + e], ['desalfandegamento', 'desembaraço aduaneiro'],
  ['casa de banho', 'banheiro'], ['pequeno-almoço', 'café da manhã'], ['frigoríficos?', 'geladeira'], ['sumo', 'suco'], ['descarregar', 'baixar'],
  ['excepto', 'exceto'], ['facto', 'fato'], ['óptim(o|a|os|as)', (e) => 'ótim' + e], ['carregue', 'toque'], ['telefone fixo', 'telefone fixo'],
];
// Grafia antes do Acordo (usada em Moçambique/Angola) → grafia brasileira.
const BR_PARTS = [
  [/actuali/gi, 'atuali'], [/\bactua(l|is)/gi, (m, e) => 'atua' + e], [/inspecç/gi, 'inspeç'], [/inspecc/gi, 'inspec'], [/direcç/gi, 'direç'], [/direcc/gi, 'direc'],
  [/selecç/gi, 'seleç'], [/selecc/gi, 'selec'], [/objecto/gi, 'objeto'], [/projecto/gi, 'projeto'], [/\bacç(ão|ões)/gi, (m, e) => 'aç' + e], [/colecç/gi, 'coleç'],
  [/A (ouvir|transcrever|analisar|carregar|preparar|enviar)…/g, (m, v) => ({ ouvir: 'Ouvindo…', transcrever: 'Transcrevendo…', analisar: 'Analisando…', carregar: 'Carregando…', preparar: 'Preparando…', enviar: 'Enviando…' }[v])],
  [/está a (\p{L}+)ar\b/gu, (m, v) => `está ${v}ando`], [/estão a (\p{L}+)ar\b/gu, (m, v) => `estão ${v}ando`],
];
const keepCase = (orig, rep) => (orig[0] && orig[0] !== orig[0].toLowerCase() ? rep[0].toUpperCase() + rep.slice(1) : rep);
const BR = [
  ...BR_WORDS.map(([w, rep]) => [new RegExp(`(?<![\\p{L}-])${w}(?![\\p{L}-])`, 'giu'), (m, g1) => keepCase(m, typeof rep === 'function' ? rep(g1) : rep)]),
  ...BR_PARTS.map(([re, rep]) => [re, (m, ...a) => keepCase(m, typeof rep === 'function' ? rep(m, ...a) : rep)]),
];
const brCache = new Map();
function toBR(s) {
  if (brCache.has(s)) return brCache.get(s);
  let o = s;
  for (const [re, rep] of BR) o = o.replace(re, rep);
  brCache.set(s, o);
  return o;
}

export function t(key, vars) {
  let s = key;
  if (current !== 'pt') s = DICT[current]?.[key] ?? DICT.en?.[key] ?? key;
  else if (countryInfo().variant === 'pt-BR') s = toBR(s);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  if (current === 'pt' && vars) s = fixPrep(s, countryInfo().variant === 'pt-BR');
  return s;
}

// Escolhe o campo traduzido de um registo (ex.: name_pt / name_en).
export function pick(row, base) {
  return (current === 'pt' ? row[`${base}_pt`] : row[`${base}_${current}`] || row[`${base}_en`]) || row[`${base}_pt`] || '';
}
