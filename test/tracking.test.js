// Testes do rastreio: permissões, link público, etapas que avançam o pedido, avisos, atrasos e integração automática.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildRoute, computeShipment, guessCode, pathLength } from '../server/tracking.js';

const PORT = 3800 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-trk-'));
const HOOK = 'segredo-de-teste-123';
let server;

class Client {
  constructor() { this.cookie = ''; }
  async req(method, p, body, headers = {}) {
    const res = await fetch(BASE + '/api' + p, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const set = res.headers.get('set-cookie'); if (set) this.cookie = set.split(';')[0];
    const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  }
  get(p) { return this.req('GET', p); }
  post(p, b = {}, hd) { return this.req('POST', p, b, hd); }
  put(p, b = {}) { return this.req('PUT', p, b); }
}
const adminC = new Client(), userC = new Client(), otherC = new Client(), anon = new Client();
let orderId, shipId;

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ADMIN_EMAIL: 'admin@trk.mz', ADMIN_PASSWORD: 'AdminTeste123', TRACKING_WEBHOOK_TOKEN: HOOK }, stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/health')).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 100)); }
  assert.equal((await adminC.post('/auth/login', { email: 'admin@trk.mz', password: 'AdminTeste123' })).status, 200);
  assert.equal((await userC.post('/auth/register', { name: 'Cliente', email: 'cli@trk.mz', password: 'senha12345' })).status, 200);
  assert.equal((await otherC.post('/auth/register', { name: 'Outro', email: 'out@trk.mz', password: 'senha12345' })).status, 200);
  orderId = (await adminC.post('/admin/orders', { user_email: 'cli@trk.mz', title: '200 cadeiras', route: 'Foshan → Maputo' })).data.id;
});
after(() => { server?.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('exemplo público funciona e não mostra dados internos', async () => {
  const r = await anon.get('/track/exemplo');
  assert.equal(r.status, 200);
  assert.equal(r.data.phase_label, 'Em viagem');
  assert.ok(r.data.delayed && r.data.delay_days === 3);
  assert.ok(r.data.position && r.data.path.length > 5);
  for (const k of ['bl_no', 'share_token', 'order', 'group', 'notes']) assert.equal(r.data[k], undefined, k);
  assert.equal((await anon.get('/track/nao-existe')).status, 404);
});

test('a equipa cria o envio; só o dono do pedido o vê', async () => {
  const r = await adminC.post('/admin/shipments', { order_id: orderId, mode: 'mar', carrier: 'maersk', container_no: 'msku 1234567', origin_port: 'NSA', dest_port: 'MPM', etd: '2026-11-01', eta: '2026-12-05' });
  assert.equal(r.status, 200);
  shipId = r.data.id;
  const mine = await userC.get('/tracking');
  assert.equal(mine.data.length, 1);
  const d = await userC.get('/tracking/' + shipId);
  assert.equal(d.data.container_no, 'MSKU1234567');
  assert.equal(d.data.carrier_url, 'https://www.maersk.com/tracking/MSKU1234567');
  assert.equal((await otherC.get('/tracking/' + shipId)).status, 404);
  assert.equal((await anon.get('/tracking/' + shipId)).status, 401);
  assert.equal((await userC.get('/admin/shipments')).status, 403);
  // o pedido mostra o rastreio
  assert.equal((await userC.get('/orders/' + orderId)).data.shipments[0].id, shipId);
});

test('etapa "partida" avança o pedido para embarque e avisa o cliente no chat', async () => {
  const r = await adminC.post(`/admin/shipments/${shipId}/events`, { code: 'partida', port: 'NSA', happened_at: '2026-11-02 18:00:00', note: 'Navio Exemplo' });
  assert.equal(r.status, 200);
  assert.equal(r.data.phase, 2);
  const o = await userC.get('/orders/' + orderId);
  assert.equal(o.data.status_step, 5);
  const chat = await userC.get('/chat');
  assert.ok(chat.data.messages.some((m) => m.sender_name === 'Rastreio Ponte' && m.body.includes('Partiu')));
  const s = await userC.get('/tracking/' + shipId);
  assert.equal(s.data.atd, '2026-11-02');
});

test('mudar a data prevista guarda a original e mostra o atraso', async () => {
  await adminC.put('/admin/shipments/' + shipId, { eta: '2026-12-09' });
  const s = await userC.get('/tracking/' + shipId);
  assert.equal(s.data.eta_original, '2026-12-05');
  assert.equal(s.data.delay_days, 4);
  assert.ok(s.data.delayed);
  const chat = await userC.get('/chat');
  assert.ok(chat.data.messages.some((m) => /atraso de 4 dias/.test(m.body)));
});

test('integração automática: token obrigatório, eventos da transportadora interpretados', async () => {
  assert.equal((await anon.post('/tracking/webhook', { container_no: 'MSKU1234567', status: 'Discharged' })).status, 401);
  const r = await anon.post('/tracking/webhook', { container_no: 'MSKU1234567', events: [{ status: 'Vessel arrived / Discharged at Maputo', date: '2026-12-08 07:00:00', port: 'MPM' }] }, { 'X-Ponte-Token': HOOK });
  assert.equal(r.status, 200);
  assert.equal(r.data.added, 1);
  // repetir o mesmo evento não duplica
  const again = await anon.post('/tracking/webhook', { container_no: 'MSKU1234567', events: [{ status: 'Vessel arrived / Discharged at Maputo', date: '2026-12-08 07:00:00', port: 'MPM' }] }, { 'X-Ponte-Token': HOOK });
  assert.equal(again.data.added, 0);
  const s = await userC.get('/tracking/' + shipId);
  assert.equal(s.data.phase, 3);
  assert.equal(s.data.events[0].code, 'chegada');
  assert.equal((await userC.get('/orders/' + orderId)).data.status_step, 6);
});

test('rotas e posição estimada', () => {
  const r = buildRoute({ mode: 'mar', origin_port: 'NSA', transship_port: 'DUR', dest_port: 'MPM' });
  assert.deepEqual(r.stops, ['NSA', 'DUR', 'MPM']);
  assert.ok(r.path.every(([a, b]) => Number.isFinite(a) && Number.isFinite(b)));
  assert.ok(pathLength(r.path) > 10000 && pathLength(r.path) < 16000);
  const now = new Date('2026-11-16T12:00:00Z');
  const c = computeShipment({ mode: 'mar', origin_port: 'NSA', dest_port: 'MPM', atd: '2026-11-01', eta: '2026-12-01' }, [{ id: 1, code: 'partida', happened_at: '2026-11-01 10:00:00' }], now);
  assert.equal(c.phase, 2);
  assert.ok(c.progress > 0.45 && c.progress < 0.55);
  assert.ok(c.position.estimated);
  assert.equal(guessCode('Gate out / delivered to consignee'), 'entregue');
  assert.equal(guessCode('Loaded on vessel'), 'partida');
  assert.equal(guessCode('Customs hold'), 'alfandega');
});
