// Testes da adaptação aos países lusófonos e da assistência pós-venda.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizePhone, countryOf, COUNTRIES } from '../public/js/countries.js';

const PORT = 3700 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-luso-'));
let server;

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body) {
    const res = await fetch(BASE + '/api' + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}) { return this.req('POST', p, b); }
  put(p, b = {}) { return this.req('PUT', p, b); }
  patch(p, b = {}) { return this.req('PATCH', p, b); }
}
const adminC = new Client(), ao = new Client(), br = new Client(), other = new Client();
const img = { name: 'foto.jpg', mime: 'image/jpeg', data: 'data:image/jpeg;base64,' + Buffer.alloc(800, 3).toString('base64') };

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_EMAIL: 'admin@luso.pt', ADMIN_PASSWORD: 'AdminTeste123' }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); }
  assert.equal((await adminC.post('/auth/login', { email: 'admin@luso.pt', password: 'AdminTeste123' })).status, 200);
  assert.equal((await ao.post('/auth/register', { name: 'Kiala', email: 'kiala@ao.test', password: 'senha12345', country: 'AO' })).status, 200);
  assert.equal((await br.post('/auth/register', { name: 'Ana', email: 'ana@br.test', password: 'senha12345', country: 'BR' })).status, 200);
  assert.equal((await other.post('/auth/register', { name: 'Outro', email: 'o@x.test', password: 'senha12345' })).status, 200);
});
after(() => { server?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('o país define a moeda e os contentores aparecem primeiro para esse país', async () => {
  const me = (await ao.get('/me')).data.user;
  assert.equal(me.country, 'AO');
  assert.equal(me.currency, 'AOA');
  const groups = (await ao.get('/groups')).data;
  assert.equal(groups[0].dest_country, 'AO');
  assert.equal((await br.get('/groups')).data[0].dest_country, 'BR');
  // mudar de país muda a moeda
  await other.patch('/me', { country: 'PT' });
  assert.equal((await other.get('/me')).data.user.currency, 'EUR');
});

test('câmbio em várias moedas', async () => {
  const r = (await ao.get('/rates')).data;
  for (const c of ['MZN', 'AOA', 'BRL', 'CVE', 'XOF', 'EUR', 'STN', 'CNY']) assert.ok(r[c] > 0, c);
  assert.equal(r.USD, 1);
});

test('só aceita meios de pagamento do país do cliente', async () => {
  // Angola: M-Pesa não existe; Multicaixa Express com número angolano é aceite
  assert.equal((await ao.post('/payments', { plan_id: 'viajante', method: 'mpesa', phone: '841234567' })).status, 400);
  assert.equal((await ao.post('/payments', { plan_id: 'viajante', method: 'unitel_money', phone: '841234567' })).status, 400);
  assert.equal((await ao.post('/payments', { plan_id: 'viajante', method: 'unitel_money', phone: '923456789' })).status, 200);
  // Brasil: Pix sem número
  assert.equal((await br.post('/payments', { plan_id: 'viajante', method: 'pix' })).status, 200);
  assert.equal((await br.post('/payments', { plan_id: 'viajante', method: 'mbway', phone: '912345678' })).status, 400);
});

test('indicativos de cada país para WhatsApp', () => {
  assert.equal(normalizePhone('84 123 4567', 'MZ'), '258841234567');
  assert.equal(normalizePhone('923 456 789', 'AO'), '244923456789');
  assert.equal(normalizePhone('11 91234-5678', 'BR'), '5511912345678');
  assert.equal(normalizePhone('912 345 678', 'PT'), '351912345678');
  assert.equal(normalizePhone('+238 991 2345', 'MZ'), '2389912345');
  assert.equal(countryOf('ZZ').code, 'MZ');
  assert.equal(COUNTRIES.length, 8);
});

test('assistência: equipamento, avaria com fotos, proposta, peças com encomenda', async () => {
  const eq = await ao.post('/equipment', { name: 'Máquina de blocos', model: 'QT4-40', serial_no: 'SN123', purchased_at: new Date().toISOString().slice(0, 10), warranty_months: 12, maint_interval_days: 90, photos: [img] });
  assert.equal(eq.status, 200);
  const view = (await ao.get('/equipment/' + eq.data.id)).data;
  assert.equal(view.in_warranty, true);
  assert.equal(view.maint_days, 90);
  assert.equal(view.documents.length, 1);
  // outro cliente não vê
  assert.equal((await br.get('/equipment/' + eq.data.id)).status, 404);

  const tk = await ao.post('/service', { kind: 'avaria', urgency: 'parada', equipment_id: eq.data.id, title: 'Não liga', description: 'Parou ontem', error_code: 'E04', photos: [img] });
  assert.equal(tk.status, 200);
  assert.match(tk.data.code, /^AS-/);
  assert.equal((await ao.get('/equipment/' + eq.data.id)).data.status, 'avariado');
  const t1 = (await ao.get('/service/' + tk.data.id)).data;
  assert.equal(t1.under_warranty, 1);
  assert.equal(t1.photos.length, 1);
  assert.equal(t1.internal_note, undefined);
  assert.equal((await br.get('/service/' + tk.data.id)).status, 404);

  // equipa envia proposta → cliente avisado no chat → aceita
  assert.equal((await adminC.put('/admin/service/' + tk.data.id, { status: 'proposta', solution_type: 'peca', solution: 'Trocar o relé do motor', quote_usd: 45, note: 'A fábrica confirmou o diagnóstico.', internal_note: 'segredo' })).status, 200);
  const chat = (await ao.get('/chat')).data.messages;
  assert.ok(chat.some((m) => m.sender_name === 'Assistência Ponte' && /proposta/.test(m.body)));
  assert.equal((await ao.get('/service/' + tk.data.id)).data.internal_note, undefined);
  assert.equal((await ao.post(`/service/${tk.data.id}/accept`)).status, 200);
  // encomenda de peças
  const ord = await adminC.post(`/admin/service/${tk.data.id}/order`, {});
  assert.equal(ord.status, 200);
  const o = (await ao.get('/orders/' + ord.data.id)).data;
  assert.equal(o.total_usd, 45);
  assert.match(o.route, /Angola/);
  // resolvido → máquina volta a activa; avaliação
  await adminC.put('/admin/service/' + tk.data.id, { status: 'resolvido', note: 'Relé trocado.' });
  assert.equal((await ao.get('/equipment/' + eq.data.id)).data.status, 'activo');
  assert.equal((await ao.post(`/service/${tk.data.id}/rate`, { rating: 5 })).status, 200);
  // pedido de peças sem descrição nem foto é recusado
  assert.equal((await ao.post('/service', { kind: 'pecas', title: 'x' })).status, 400);
});
