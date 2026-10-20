// Configuração lida das variáveis de ambiente (ver .env.example).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carrega um ficheiro .env simples, se existir (sem dependências).
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const config = {
  root,
  port: Number(process.env.PORT || 3000),
  dataDir: path.resolve(root, process.env.DATA_DIR || 'data'),
  publicDir: path.join(root, 'public'),
  adminEmail: process.env.ADMIN_EMAIL || 'admin@ponte.app',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminName: process.env.ADMIN_NAME || 'Equipa Ponte',
  // Mosaico do mapa. OpenStreetMap por omissão; pode trocar por um serviço acessível na China.
  mapTiles: process.env.MAP_TILES || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  mapAttribution: process.env.MAP_ATTRIBUTION || '© OpenStreetMap',
  // Pagamentos: "test" simula. Quando houver contrato com M-Pesa/e-Mola/mKesh/cartão, implementar em payments.js.
  paymentsMode: process.env.PAYMENTS_MODE || 'test',
  supportHours: process.env.SUPPORT_HOURS || '9h–18h, hora da China',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 8),
};
