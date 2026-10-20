// Base de dados SQLite (módulo nativo do Node, sem dependências externas).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'uploads', 'public'), { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'uploads', 'private'), { recursive: true });

export const db = new DatabaseSync(path.join(config.dataDir, 'ponte.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client',          -- client | admin
  company TEXT,
  city TEXT,
  lang TEXT NOT NULL DEFAULT 'pt',
  currency TEXT NOT NULL DEFAULT 'MZN',
  plan TEXT NOT NULL DEFAULT 'explorador',
  interests TEXT NOT NULL DEFAULT '[]',
  travel_when TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

-- Fornecedores: os campos "privados" NUNCA saem para os clientes (ver publicSupplier em api.js).
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY,
  public_code TEXT NOT NULL UNIQUE,
  public_title TEXT NOT NULL,
  category TEXT NOT NULL,
  city TEXT,
  district TEXT,
  description TEXT,
  moq TEXT,
  certifications TEXT,
  lead_time TEXT,
  languages TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  visited_at TEXT,
  company_name TEXT,
  contact_person TEXT,
  phone TEXT,
  wechat TEXT,
  email TEXT,
  address TEXT,
  website TEXT,
  commission_pct REAL,
  internal_notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  price_min REAL,
  price_max REAL,
  price_currency TEXT NOT NULL DEFAULT 'USD',
  price_unit TEXT DEFAULT 'unidade',
  moq TEXT,
  image TEXT,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fairs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  venue TEXT,
  start_date TEXT,
  end_date TEXT,
  sectors TEXT,
  tags TEXT,
  website TEXT,
  place_id INTEGER REFERENCES places(id) ON DELETE SET NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY,
  year INTEGER NOT NULL,
  name_pt TEXT NOT NULL,
  name_en TEXT,
  name_cn TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  official INTEGER NOT NULL DEFAULT 0,
  note TEXT
);

CREATE TABLE IF NOT EXISTS sales_events (
  id INTEGER PRIMARY KEY,
  tag TEXT NOT NULL,
  name_pt TEXT NOT NULL,
  name_en TEXT,
  date_label TEXT,
  month INTEGER,
  description_pt TEXT,
  description_en TEXT
);

CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,       -- feira | zona | hotel | restaurante | saude | dinheiro | transporte | mercado | servico
  name TEXT NOT NULL,
  name_cn TEXT,
  address_cn TEXT,
  city TEXT,
  district TEXT,
  lat REAL,
  lng REAL,
  phone TEXT,
  description TEXT,
  hours TEXT,
  approximate INTEGER NOT NULL DEFAULT 0,
  is_sample INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  partner_name TEXT,
  category TEXT,
  badge TEXT,
  code TEXT,
  valid_label TEXT,
  description TEXT,
  link TEXT,
  sponsored INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  details TEXT,
  quantity TEXT,
  target_price TEXT,
  destination TEXT,
  status TEXT NOT NULL DEFAULT 'novo',   -- novo | em_analise | cotado | aceite | recusado | fechado
  response TEXT,
  quoted_price TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quote_id INTEGER REFERENCES quote_requests(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  route TEXT,
  status_step INTEGER NOT NULL DEFAULT 0,
  client_note TEXT,
  internal_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_events (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  step INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  owner_type TEXT NOT NULL,      -- order | partner
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  mime TEXT,
  file TEXT NOT NULL,
  size INTEGER,
  visible_to_client INTEGER NOT NULL DEFAULT 1,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS freight_requests (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL,            -- fcl | lcl | aereo | courier
  origin TEXT,
  destination TEXT,
  volume_cbm REAL,
  weight_kg REAL,
  incoterm TEXT,
  goods TEXT,
  include_customs INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'novo',
  response TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,            -- despachante | transitario | fornecedor | interprete | hotel | anunciante
  company TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,
  city TEXT,
  tax_id TEXT,
  licence_no TEXT,
  languages TEXT,
  services TEXT,
  status TEXT NOT NULL DEFAULT 'pendente',   -- pendente | aprovado | recusado
  listed INTEGER NOT NULL DEFAULT 1,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  needs_human INTEGER NOT NULL DEFAULT 0,
  unread_admin INTEGER NOT NULL DEFAULT 0,
  unread_user INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,          -- user | bot | admin
  sender_name TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faq (
  id INTEGER PRIMARY KEY,
  lang TEXT NOT NULL DEFAULT 'pt',
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT,
  sort INTEGER NOT NULL DEFAULT 0,
  quick INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_label TEXT,
  price_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'MZN',
  features TEXT NOT NULL DEFAULT '[]',
  highlight INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT,
  amount REAL,
  currency TEXT,
  method TEXT,
  phone TEXT,
  status TEXT NOT NULL,          -- teste | pendente | pago | falhado
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  type TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category, active);
CREATE INDEX IF NOT EXISTS idx_quotes_user ON quote_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, created_at);
`;

db.exec(SCHEMA);

// Migrações: novas colunas e tabelas acrescentadas sem perder dados existentes.
function addColumns(table, cols) {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, def] of cols) if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
}
addColumns('products', [
  ['styles', 'TEXT'],            // gótico, vintage, minimalista… (separados por vírgula)
  ['quality', 'INTEGER'],        // 1 a 5
  ['durability_years', 'REAL'],
  ['spare_parts', 'TEXT'],       // sim | limitado | nao
  ['mechanism', 'TEXT'],         // mecânico, manual, analógico, digital, eléctrico, solar…
  ['colors', 'TEXT'],
  ['materials', 'TEXT'],
  ['sizes', 'TEXT'],
  ['tags', 'TEXT'],
  ['warranty', 'TEXT'],
  ['certifications', 'TEXT'],
  ['lead_time_days', 'INTEGER'],
  ['moq_qty', 'INTEGER'],
  ['buy_online', 'INTEGER NOT NULL DEFAULT 1'],
]);
addColumns('users', [['prefs', "TEXT NOT NULL DEFAULT '{}'"], ['whatsapp', 'TEXT'], ['notify_whatsapp', 'INTEGER NOT NULL DEFAULT 0']]);
addColumns('suppliers', [
  ['rating_quality', 'INTEGER'], ['rating_delivery', 'INTEGER'], ['rating_comms', 'INTEGER'], ['orders_done', 'INTEGER NOT NULL DEFAULT 0'],
]);
addColumns('orders', [
  ['payment_plan', "TEXT NOT NULL DEFAULT 'fases'"], // fases | total
  ['deposit_pct', 'REAL NOT NULL DEFAULT 30'],
  ['deposit_paid', 'INTEGER NOT NULL DEFAULT 0'],
  ['balance_paid', 'INTEGER NOT NULL DEFAULT 0'],
]);
db.exec(`CREATE TABLE IF NOT EXISTS group_shipments (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  origin TEXT,
  destination TEXT,
  container TEXT,
  capacity_cbm REAL NOT NULL DEFAULT 60,
  price_per_cbm REAL,
  currency TEXT NOT NULL DEFAULT 'USD',
  closes_at TEXT,
  departs_label TEXT,
  status TEXT NOT NULL DEFAULT 'aberto',   -- aberto | fechado | enviado | entregue
  notes TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS group_bookings (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES group_shipments(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cbm REAL NOT NULL,
  goods TEXT,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | confirmado | cancelado
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                       -- fabrica | feira | mercado
  target TEXT,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  preferred TEXT,
  channel TEXT,                             -- whatsapp | wechat | app
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pedido',    -- pedido | marcado | feito | cancelado
  scheduled_at TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`);
addColumns('orders', [
  ['kind', "TEXT NOT NULL DEFAULT 'procurement'"], // procurement | compra
  ['delivery_mode', 'TEXT'],                       // mocambique | china
  ['delivery_address', 'TEXT'],
  ['total_usd', 'REAL'],
  ['payment_status', 'TEXT'],                      // por_confirmar | pendente | pago | teste
]);
db.exec(`CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  qty INTEGER NOT NULL,
  unit_price REAL,
  currency TEXT,
  color TEXT,
  size TEXT,
  notes TEXT
)`);

// Lusofonia: país do cliente e país de destino dos contentores partilhados.
addColumns('users', [['country', "TEXT NOT NULL DEFAULT 'MZ'"]]);
addColumns('group_shipments', [['dest_country', 'TEXT']]);

// Pós-venda: equipamentos dos clientes, pedidos de assistência (avarias, peças, manutenção) e histórico.
db.exec(`CREATE TABLE IF NOT EXISTS equipment (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  brand TEXT, model TEXT, serial_no TEXT, category TEXT,
  purchased_at TEXT, warranty_months INTEGER, voltage TEXT, power TEXT,
  specs TEXT, wear_parts TEXT,
  maint_interval_days INTEGER, last_maint_at TEXT, maint_notified_at TEXT,
  location TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'activo',       -- activo | avariado | inactivo
  created_by TEXT NOT NULL DEFAULT 'cliente',  -- cliente | equipa
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS equipment_log (
  id INTEGER PRIMARY KEY,
  equipment_id INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                          -- manutencao | avaria | peca | reparacao | nota
  note TEXT,
  author TEXT NOT NULL DEFAULT 'cliente',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS service_tickets (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  equipment_id INTEGER REFERENCES equipment(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'avaria',         -- avaria | pecas | manutencao | instalacao | duvida
  urgency TEXT NOT NULL DEFAULT 'normal',      -- parada | limitada | normal
  title TEXT NOT NULL,
  description TEXT, error_code TEXT, parts TEXT,
  status TEXT NOT NULL DEFAULT 'novo',         -- novo | diagnostico | proposta | aceite | em_resolucao | resolvido | fechado
  solution_type TEXT,                          -- remota | peca | tecnico | garantia | devolucao | outro
  solution TEXT, quote_usd REAL, under_warranty INTEGER,
  partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  rating INTEGER, internal_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS service_events (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  status TEXT, note TEXT,
  author TEXT NOT NULL DEFAULT 'equipa',       -- cliente | equipa
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_eq_user ON equipment(user_id);
CREATE INDEX IF NOT EXISTS idx_st_user ON service_tickets(user_id);`);
addColumns('suppliers', [['rating_aftersales', 'REAL']]);

// Rastreio: um envio (contentor, voo ou guia de courier) ligado a um pedido ou a um contentor partilhado.
db.exec(`CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY,
  ref TEXT NOT NULL UNIQUE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  group_id INTEGER REFERENCES group_shipments(id) ON DELETE SET NULL,
  title TEXT,
  mode TEXT NOT NULL DEFAULT 'mar',            -- mar | aereo | courier | estrada
  carrier TEXT, carrier_name TEXT,
  container_no TEXT, bl_no TEXT, booking_no TEXT, tracking_no TEXT,
  vessel TEXT, voyage TEXT,
  origin_port TEXT, transship_port TEXT, dest_port TEXT,
  etd TEXT, atd TEXT, eta TEXT, eta_original TEXT, ata TEXT,
  share_token TEXT NOT NULL UNIQUE,
  notes TEXT,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS shipment_events (
  id INTEGER PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT,
  location TEXT,
  lat REAL, lng REAL,
  happened_at TEXT NOT NULL DEFAULT (datetime('now')),
  note TEXT,
  source TEXT NOT NULL DEFAULT 'equipa',       -- equipa | transportadora | sistema
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ship_order ON shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_ship_group ON shipments(group_id);
CREATE INDEX IF NOT EXISTS idx_shev ON shipment_events(shipment_id);`);

// Pequenos utilitários
// undefined não é aceite pelo SQLite: converte-se em null.
const clean = (p) => p.map((v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
export const all = (sql, ...p) => db.prepare(sql).all(...clean(p));
export const get = (sql, ...p) => db.prepare(sql).get(...clean(p));
export const run = (sql, ...p) => db.prepare(sql).run(...clean(p));

export function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}
