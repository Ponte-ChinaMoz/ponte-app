// Reconhecimento visual: identifica objectos, equipamentos, mobília, ferramentas e materiais numa fotografia
// e devolve nome, utilização, materiais, estimativa de tamanho/capacidade, especificações, capacidade de produção
// (máquinas), termos de pesquisa em chinês para os fornecedores e alternativas.
//
// Funciona com qualquer modelo de visão compatível com a API "chat/completions" da OpenAI:
//   - OpenAI:                 VISION_API_KEY (ou OPENAI_API_KEY), VISION_MODEL=gpt-4o-mini
//   - Alibaba Qwen-VL (acessível na China): VISION_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
//                                            VISION_MODEL=qwen-vl-max  VISION_API_KEY=...
//   - Claude (Anthropic):     VISION_URL=https://api.anthropic.com/v1  VISION_MODEL=claude-sonnet-...  VISION_API_KEY=...
//   - Servidor próprio (Ollama, vLLM, LM Studio): VISION_URL=http://.../v1  VISION_MODEL=qwen2.5-vl
// Sem configuração, a app oferece enviar a fotografia à equipa e pesquisa por imagem no Baidu.

const LANG_NAME = { pt: 'português europeu', en: 'English', es: 'español', it: 'italiano', fr: 'français', zh: '简体中文' };

export function visionProvider() {
  if (process.env.VISION_URL || process.env.VISION_API_KEY) return 'custom';
  if (process.env.OPENAI_API_KEY) return 'openai';
  return null;
}

export function visionPrompt(lang, styles, country = 'Moçambique') {
  return `És o especialista de procurement da Ponte, uma empresa que compra na China (Guangzhou, Foshan, Yiwu, Shenzhen) para clientes dos países de língua portuguesa (Moçambique, Angola, Brasil, Cabo Verde, Guiné-Bissau, Portugal, São Tomé e Príncipe, Timor-Leste). Este cliente está em ${country}.
Analisa a fotografia e identifica o objecto principal (equipamento, máquina, mobília, ferramenta, material, peça, electrodoméstico, artigo de consumo…).
Responde APENAS com um objecto JSON válido, sem texto à volta, com os textos em ${LANG_NAME[lang] || 'português europeu'} (excepto os campos *_zh, em chinês simplificado):
{
 "name": "nome comum e preciso do objecto",
 "name_zh": "nome em chinês usado pelos fornecedores (1688/Alibaba)",
 "kind": "equipamento|máquina|mobília|ferramenta|material|peça|electrodoméstico|vestuário|artigo|outro",
 "category": "categoria comercial curta (ex.: Mobiliário, Ferramentas, Energia solar, Cozinha industrial)",
 "summary": "1-2 frases: o que é e para que serve",
 "uses": ["utilizações principais"],
 "materials": ["materiais prováveis"],
 "colors": ["cores visíveis"],
 "styles": ["estilos desta lista que se apliquem: ${styles.join(', ')}"],
 "mechanism": "manual|mecânico|eléctrico|digital|analógico|hidráulico|pneumático|a gás|solar|não se aplica",
 "size": {"dimensions": "estimativa em cm, ex.: 60 × 45 × 90 cm", "volume": "litros ou ml se fizer sentido, senão null", "weight": "g ou kg estimado", "capacity": "capacidade de uso (ex.: 5 L, 20 kg de carga, 4 lugares) ou null", "basis": "em que te baseaste para estimar (objectos de referência, proporções)"},
 "specs": [{"label": "especificação típica (potência, tensão, pressão, espessura, rotação…)", "value": "valor ou intervalo típico"}],
 "production_capacity": "para máquinas ou linhas de produção: produção típica por hora/dia; senão null",
 "power": "consumo/alimentação típicos (ex.: 220 V 50 Hz, 1,5 kW) ou null",
 "quality_tips": ["como distinguir boa e má qualidade neste artigo"],
 "spare_parts": "peças de desgaste ou sobresselentes a encomendar junto, ou null",
 "price_usd": {"min": número, "max": número, "unit": "unidade", "note": "preço de fábrica indicativo na China, sem frete"},
 "moq": "encomenda mínima típica",
 "search_terms": ["3-5 termos curtos para pesquisar no catálogo, no idioma da resposta"],
 "search_terms_zh": ["2-4 termos em chinês para 1688/Alibaba"],
 "alternatives": [{"name": "alternativa ou variante", "why": "quando escolher", "price_hint": "mais barato/igual/mais caro"}],
 "ask_supplier": ["perguntas a fazer ao fornecedor antes de comprar"],
 "import_notes": "notas para importar para ${country} (certificação, tensão e ficha eléctrica do país, frágil, volume no contentor…) ou null",
 "confidence": 0.0-1.0,
 "caveats": "o que não é possível saber pela fotografia"
}
Se houver vários objectos, foca-te no principal e menciona os outros em "caveats". Se não for possível identificar, usa confidence baixa e explica em "caveats". Os tamanhos e preços são estimativas: indica intervalos realistas.`;
}

// Extrai o primeiro objecto JSON de uma resposta (alguns modelos acrescentam ```json … ```).
export function extractJson(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'); const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

const arr = (x, n = 8) => (Array.isArray(x) ? x : x ? [x] : []).map((v) => (typeof v === 'string' ? v.slice(0, 200) : v)).slice(0, n);
const txt = (x, n = 400) => (x === null || x === undefined || x === 'null' ? null : String(x).slice(0, n));

// Limpa e limita o que vem do modelo (nunca confiar na forma exacta).
export function sanitizeVision(j) {
  if (!j || typeof j !== 'object') return null;
  const size = j.size && typeof j.size === 'object' ? j.size : {};
  const price = j.price_usd && typeof j.price_usd === 'object' ? j.price_usd : null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    name: txt(j.name, 120) || '?', name_zh: txt(j.name_zh, 80), kind: txt(j.kind, 40), category: txt(j.category, 60),
    summary: txt(j.summary, 500), uses: arr(j.uses).map(String), materials: arr(j.materials).map(String), colors: arr(j.colors).map(String),
    styles: arr(j.styles).map(String), mechanism: txt(j.mechanism, 40),
    size: { dimensions: txt(size.dimensions, 120), volume: txt(size.volume, 80), weight: txt(size.weight, 80), capacity: txt(size.capacity, 120), basis: txt(size.basis, 300) },
    specs: arr(j.specs, 12).filter((s) => s && typeof s === 'object').map((s) => ({ label: txt(s.label, 80), value: txt(s.value, 160) })).filter((s) => s.label && s.value),
    production_capacity: txt(j.production_capacity, 200), power: txt(j.power, 120),
    quality_tips: arr(j.quality_tips, 6).map(String), spare_parts: txt(j.spare_parts, 300),
    price_usd: price && (num(price.min) !== null || num(price.max) !== null) ? { min: num(price.min), max: num(price.max), unit: txt(price.unit, 40), note: txt(price.note, 200) } : null,
    moq: txt(j.moq, 80),
    search_terms: arr(j.search_terms, 6).map(String), search_terms_zh: arr(j.search_terms_zh, 5).map(String),
    alternatives: arr(j.alternatives, 5).filter((a) => a && typeof a === 'object').map((a) => ({ name: txt(a.name, 100), why: txt(a.why, 240), price_hint: txt(a.price_hint, 60) })).filter((a) => a.name),
    ask_supplier: arr(j.ask_supplier, 6).map(String), import_notes: txt(j.import_notes, 400),
    confidence: Math.max(0, Math.min(1, num(j.confidence) ?? 0.5)), caveats: txt(j.caveats, 400),
  };
}

export async function identify(dataUrl, lang, styles, note, country) {
  if (!visionProvider()) return null;
  const base = (process.env.VISION_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const key = process.env.VISION_API_KEY || process.env.OPENAI_API_KEY || '';
  const model = process.env.VISION_MODEL || 'gpt-4o-mini';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({
        model, max_tokens: 1800, temperature: 0.2,
        messages: [
          { role: 'system', content: visionPrompt(lang, styles, country) },
          { role: 'user', content: [
            { type: 'text', text: note ? `Informação do cliente: ${String(note).slice(0, 300)}` : 'Identifica o objecto desta fotografia.' },
            { type: 'image_url', image_url: { url: dataUrl } },
          ] },
        ],
      }),
    });
    if (!r.ok) throw new Error(`Visão ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const content = j.choices?.[0]?.message?.content;
    const textOut = Array.isArray(content) ? content.map((c) => c.text || '').join('') : content;
    return sanitizeVision(extractJson(textOut));
  } finally {
    clearTimeout(timer);
  }
}
