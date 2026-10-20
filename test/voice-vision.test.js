// Testes da voz (comandos, reconhecimento no servidor) e do reconhecimento visual de fotografias.
// Usa um serviço falso compatível com a API OpenAI para não depender da internet.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCommand } from '../public/js/voice-commands.js';
import { extractJson, sanitizeVision } from '../server/vision.js';

const PORT = 3990 + Math.floor(Math.random() * 9);
const MOCK = PORT + 1000;
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-vv-'));
let server, mock, lastVision = null, lastStt = null;

const FAKE = {
  name: 'Cadeira de escritório ergonómica', name_zh: '人体工学办公椅', kind: 'mobília', category: 'Mobiliário',
  summary: 'Cadeira giratória com apoio lombar.', uses: ['escritório', 'call center'], materials: ['malha', 'nylon'], colors: ['preto'],
  styles: ['moderno'], mechanism: 'mecânico',
  size: { dimensions: '65 × 65 × 110–120 cm', volume: null, weight: '13–16 kg', capacity: 'até 120 kg', basis: 'proporção com o chão' },
  specs: [{ label: 'Pistão', value: 'classe 3' }, { label: 'Base', value: 'nylon 320 mm' }, 'lixo'],
  production_capacity: null, price_usd: { min: 28, max: 55, unit: 'unidade', note: 'FOB' }, moq: '50 unidades',
  search_terms: ['cadeira escritório', 'cadeira'], search_terms_zh: ['办公椅'],
  alternatives: [{ name: 'Cadeira de malha simples', why: 'mais barata', price_hint: 'mais barato' }],
  ask_supplier: ['Certificação do pistão?'], confidence: 1.7, caveats: null,
};

class Client {
  constructor() { this.cookie = ''; }
  async post(p, body) {
    const res = await fetch(BASE + '/api' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: JSON.stringify(body) });
    const set = res.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
}
const user = new Client();

before(async () => {
  mock = http.createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    if (req.url === '/v1/chat/completions') {
      lastVision = { auth: req.headers.authorization, body: JSON.parse(raw.toString()) };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ choices: [{ message: { content: 'Aqui está:\n```json\n' + JSON.stringify(FAKE) + '\n```' } }] }));
    }
    if (req.url === '/v1/audio/transcriptions') {
      lastStt = { type: req.headers['content-type'], size: raw.length, text: raw.toString('latin1') };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ text: ' abrir o mapa ' }));
    }
    res.writeHead(404); res.end();
  }).listen(MOCK);
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_PASSWORD: 'AdminTeste123', OPENAI_API_KEY: '',
      VISION_URL: `http://localhost:${MOCK}/v1`, VISION_API_KEY: 'chave-visao', VISION_MODEL: 'modelo-teste',
      STT_URL: `http://localhost:${MOCK}/v1`, STT_API_KEY: 'chave-voz' }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/health')).ok) break; } catch { /* a arrancar */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal((await user.post('/auth/register', { name: 'Voz', email: 'voz@teste.mz', password: 'senha12345' })).status, 200);
});

after(() => { server?.kill(); mock?.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('comandos por voz levam ao ecrã certo, em várias línguas', () => {
  const cases = {
    'Abrir o mapa': '#/map', 'Falar com a Lara': '#/chat', 'Onde está o meu pedido?': '#/track', 'os meus pedidos': '#/orders', 'onde está o meu contentor': '#/track', 'Como chego à feira?': '#/map?cat=feira',
    'reservar 3 m³ no contentor': '#/groups?m3=3', 'reservar 2,5 metros cúbicos': '#/groups?m3=2.5', 'pagar o sinal': '#/orders',
    'preciso de um voo para Guangzhou': '#/travel', 'open the map': '#/map', '我要去展会怎么去': '#/map?cat=feira', 'ver o cesto': '#/cart',
    'o que é isto?': '#/identify', 'abre as feiras': '#/agenda?tab=feiras', 'chama a polícia': '#/contacts?tab=saude',
  };
  for (const [said, hash] of Object.entries(cases)) assert.equal(parseCommand(said).hash, hash, said);
  assert.equal(parseCommand('Traduz onde fica a casa de banho').hash, '#/translate?text=' + encodeURIComponent('onde fica a casa de banho'));
  assert.equal(parseCommand('pergunta à Lara se a fábrica aceita amostras').hash, '#/chat?msg=' + encodeURIComponent('a fábrica aceita amostras'));
  // Frases de compra vão para o catálogo (mesmo com "dólares")
  assert.equal(parseCommand('Quero 200 cadeiras pretas até 40 dólares').id, 'catalog');
  assert.equal(parseCommand(''), null);
});

test('voz no servidor: transcreve e valida o áudio', async () => {
  const cfg = await (await fetch(BASE + '/api/config')).json();
  assert.equal(cfg.stt, true);
  assert.equal(cfg.vision, true);
  const audio = Buffer.alloc(4000, 7).toString('base64');
  const r = await user.post('/stt', { audio, mime: 'audio/webm;codecs=opus', lang: 'pt' });
  assert.equal(r.status, 200);
  assert.equal(r.data.text, 'abrir o mapa');
  assert.match(lastStt.type, /multipart\/form-data/);
  assert.match(lastStt.text, /name="language"\r\n\r\npt/);
  assert.equal((await user.post('/stt', { audio: 'abc', mime: 'audio/webm' })).status, 400);
  assert.equal((await user.post('/stt', { audio, mime: 'text/html' })).status, 400);
});

test('reconhecimento visual: identifica, limpa a resposta e sugere artigos do catálogo', async () => {
  const image = 'data:image/jpeg;base64,' + Buffer.alloc(3000, 1).toString('base64');
  const r = await user.post('/vision', { image, lang: 'en', note: 'para escritório' });
  assert.equal(r.status, 200);
  const v = r.data.result;
  assert.equal(v.name, FAKE.name);
  assert.equal(v.confidence, 1);                          // limitado a 0–1
  assert.equal(v.specs.length, 2);                        // entradas inválidas removidas
  assert.equal(v.size.capacity, 'até 120 kg');
  assert.ok(r.data.similar.length > 0, 'deve sugerir cadeiras do catálogo');
  assert.ok(r.data.similar.every((p) => !JSON.stringify(p).includes('Empresa')), 'sem dados privados do fornecedor');
  // O pedido ao modelo leva a imagem, a língua e a chave
  assert.equal(lastVision.auth, 'Bearer chave-visao');
  assert.equal(lastVision.body.model, 'modelo-teste');
  assert.match(lastVision.body.messages[0].content, /English/);
  assert.equal(lastVision.body.messages[1].content[1].image_url.url, image);
  // Só imagens
  assert.equal((await user.post('/vision', { image: 'data:text/html;base64,PGI+' })).status, 400);
});

test('extracção do JSON do modelo é robusta', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(extractJson('sem json'), null);
  assert.equal(sanitizeVision(null), null);
  const s = sanitizeVision({ name: 'x'.repeat(500), price_usd: { min: 'abc' }, alternatives: ['texto solto', { name: 'Ok' }] });
  assert.equal(s.name.length, 120);
  assert.equal(s.price_usd, null);
  assert.deepEqual(s.alternatives.map((a) => a.name), ['Ok']);
});
