// Ambiente "Node" mínimo para o servidor da Ponte correr no navegador (versão de demonstração).
import { Buffer } from 'buffer';
globalThis.Buffer = globalThis.Buffer || Buffer;
globalThis.process = globalThis.process || {
  env: { ADMIN_EMAIL: 'equipa@ponte.demo', ADMIN_PASSWORD: 'ponte2026', ADMIN_NAME: 'Lara · Equipa Ponte', DATA_DIR: '/data', PAYMENTS_MODE: 'test' },
  argv: [], platform: 'browser', versions: {}, cwd: () => '/',
};
// O polyfill "buffer" não conhece "base64url" (usado nos tokens de sessão e de partilha).
const toStr = Buffer.prototype.toString;
Buffer.prototype.toString = function (enc, ...rest) {
  if (enc === 'base64url') return toStr.call(this, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return toStr.call(this, enc, ...rest);
};
