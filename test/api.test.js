// Testes automáticos da API: `npm test`
// Arranca um servidor com uma base de dados temporária e verifica as regras mais importantes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-test-'));
let server;

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body) {
    const res = await fetch(BASE + '/api' + p, {
      method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0];
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  put(p, b = {}) { return this.req('PUT', p, b); }
}

const adminC = new Client();
const userC = new Client();
const otherC = new Client();
const PRIVATE = ['company_name', 'contact_person', 'wechat', 'internal_notes', 'commission_pct', 'address', '[EXEMPLO] Empresa'];

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_EMAIL: 'admin@teste.mz', ADMIN_PASSWORD: 'AdminTeste123' }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/health')).ok) break; } catch { /* ainda a arrancar */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal((await adminC.post('/auth/login', { email: 'admin@teste.mz', password: 'AdminTeste123' })).status, 200);
  assert.equal((await userC.post('/auth/register', { name: 'Cliente Teste', email: 'cliente@teste.mz', password: 'senha12345', phone: '841234567' })).status, 200);
  assert.equal((await otherC.post('/auth/register', { name: 'Outro', email: 'outro@teste.mz', password: 'senha12345' })).status, 200);
});

after(() => { server?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('os contactos dos fornecedores nunca chegam ao cliente', async () => {
  const endpoints = ['/suppliers', '/suppliers/PNT-EX1', '/products', '/products/1', '/catalog', '/search?q=cadeira', '/home', '/categories'];
  for (const e of endpoints) {
    const { status, data } = await userC.get(e);
    assert.equal(status, 200, e);
    const s = JSON.stringify(data);
    for (const k of PRIVATE) assert.ok(!s.includes(k), `${e} expõe ${k}`);
  }
  await userC.post('/quotes', { product_id: 1, quantity: '100' });
  const q = JSON.stringify((await userC.get('/quotes')).data);
  for (const k of PRIVATE) assert.ok(!q.includes(k), `/quotes expõe ${k}`);
});

test('rotas de administração recusam clientes e visitantes', async () => {
  assert.equal((await new Client().get('/admin/stats')).status, 401);
  assert.equal((await userC.get('/admin/stats')).status, 403);
  assert.equal((await userC.get('/admin/suppliers')).status, 403);
  assert.equal((await adminC.get('/admin/stats')).status, 200);
});

test('palavra-passe errada é recusada e não revela a conta', async () => {
  const r = await new Client().post('/auth/login', { email: 'cliente@teste.mz', password: 'errada123' });
  assert.equal(r.status, 401);
  assert.equal(r.data.error, 'Email ou palavra-passe incorrectos.');
});

test('mega filtro: estilos, preço e facetas', async () => {
  const { data } = await userC.get('/catalog?styles=' + encodeURIComponent('gótico') + '&price_max=200');
  assert.ok(data.total >= 1);
  for (const p of data.items) {
    assert.ok(p.styles.includes('gótico'));
    assert.ok(p.price_min <= 200);
  }
  assert.ok(data.facets.styles.some((f) => f.value === 'vintage'), 'faceta disjuntiva mostra outros estilos');
});

test('pesquisa por frase converte em filtros', async () => {
  const { data } = await userC.get('/catalog/parse?text=' + encodeURIComponent('200 cadeiras pretas até 40 dólares estilo minimalista'));
  assert.equal(data.price_max, 40);
  assert.equal(data.qty, 200);
  assert.deepEqual(data.filters.colors, ['preto']);
  assert.deepEqual(data.filters.styles, ['minimalista']);
  assert.equal(data.q, 'cadeiras');
});

test('compatibilidade com o perfil ordena os resultados', async () => {
  const prefs = encodeURIComponent(JSON.stringify({ styles: ['gótico'], budget_max: 300 }));
  const { data } = await userC.get(`/catalog?for_me=1&prefs=${prefs}`);
  assert.ok(data.items[0].styles.includes('gótico'));
  assert.ok(data.items[0].match >= data.items[data.items.length - 1].match);
});

test('assistente responde a perguntas frequentes e passa à equipa quando não sabe', async () => {
  const a = await userC.post('/chat', { body: 'O WhatsApp funciona na China?' });
  assert.equal(a.data.messages[1].sender, 'bot');
  assert.match(a.data.messages[1].body, /VPN|eSIM/);
  const b = await userC.post('/chat', { body: 'xpto abc qwerty' });
  assert.equal(b.data.needs_human, true);
});

test('compra online com pagamento protegido por fases', async () => {
  const c = await userC.post('/checkout', { items: [{ product_id: 14, qty: 50 }], delivery_mode: 'mocambique', address: 'Maputo', payment_plan: 'fases', pay_now: true, method: 'mpesa', phone: '841234567' });
  assert.equal(c.status, 200);
  assert.equal(c.data.payment.stage, 'sinal');
  const id = c.data.id;
  assert.equal((await userC.post(`/orders/${id}/pay`, { stage: 'restante', method: 'mpesa', phone: '841234567' })).status, 400, 'restante antes da inspecção');
  assert.equal((await otherC.post(`/orders/${id}/pay`, { stage: 'restante', method: 'mpesa', phone: '841234567' })).status, 404, 'outro cliente não paga pedidos alheios');
  await adminC.put(`/admin/orders/${id}`, { status_step: 4 });
  const r = await userC.post(`/orders/${id}/pay`, { stage: 'restante', method: 'emola', phone: '861234567' });
  assert.equal(r.status, 200);
  const o = (await userC.get(`/orders/${id}`)).data;
  assert.equal(o.payment_status, 'pago');
});

test('quantidade mínima é respeitada no cesto', async () => {
  const c = await userC.post('/checkout', { items: [{ product_id: 14, qty: 2 }], delivery_mode: 'china', address: 'Hotel em Pazhou' });
  assert.equal(c.status, 400);
});

test('contentor partilhado não aceita mais do que a capacidade', async () => {
  const g = (await userC.get('/groups')).data[0];
  assert.equal((await userC.post(`/groups/${g.id}/join`, { cbm: g.free_cbm + 1 })).status, 400);
  assert.equal((await userC.post(`/groups/${g.id}/join`, { cbm: 2 })).status, 200);
});

test('documentos só são visíveis para o dono', async () => {
  const q = await userC.post('/quotes', { title: 'Foto', photos: [{ name: 'a.png', mime: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }] });
  assert.equal(q.status, 200);
  const photos = (await adminC.get(`/admin/quotes/${q.data.id}/photos`)).data;
  assert.equal(photos.length, 1);
  const doc = photos[0].id;
  assert.equal((await fetch(`${BASE}/api/documents/${doc}`, { headers: { Cookie: userC.cookie } })).status, 200);
  assert.equal((await fetch(`${BASE}/api/documents/${doc}`, { headers: { Cookie: otherC.cookie } })).status, 403);
});

test('importação CSV de fornecedores', async () => {
  const csv = 'public_title;category;city;company_name;phone\nFábrica de teste;Têxtil;Guangzhou;Empresa Real Lda;123\n;Sem título;;;\n';
  const r = await adminC.post('/admin/import/suppliers', { csv });
  assert.equal(r.data.created, 1);
  assert.equal(r.data.errors.length, 1);
  const pub = JSON.stringify((await userC.get('/suppliers?q=teste')).data);
  assert.ok(pub.includes('Fábrica de teste'));
  assert.ok(!pub.includes('Empresa Real Lda'));
});

test('pedidos que alteram dados exigem JSON (protecção CSRF)', async () => {
  const res = await fetch(BASE + '/api/quotes', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: userC.cookie }, body: 'title=x' });
  assert.equal(res.status, 415);
});
