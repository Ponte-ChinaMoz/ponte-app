// Ponto de entrada da versão de demonstração (um só ficheiro HTML).
import './shims/globals.js';
import { boot, resetDemo, DEMO, setMode } from './runtime.js';

const MODE_KEY = 'ponte.demo.mode';
let mode = 'app';
try { mode = sessionStorage.getItem(MODE_KEY) === 'admin' ? 'admin' : 'app'; } catch { /* */ }
globalThis.PONTE_NO_MIC = true;
globalThis.PONTE_DEMO = true;

function switchTo(m) { try { sessionStorage.setItem(MODE_KEY, m); } catch { /* */ } location.hash = ''; location.reload(); }

function banner() {
  const bar = document.createElement('div');
  bar.className = 'demo-bar';
  const label = document.createElement('span');
  label.className = 'demo-label';
  label.textContent = mode === 'admin' ? 'Demonstração · painel da equipa' : 'Demonstração · os dados ficam só neste aparelho';
  const go = document.createElement('button');
  go.textContent = mode === 'admin' ? 'Abrir a app' : 'Painel da equipa';
  go.onclick = () => switchTo(mode === 'admin' ? 'app' : 'admin');
  const reset = document.createElement('button');
  reset.textContent = 'Repor';
  let armed = false;
  reset.onclick = async () => {
    if (!armed) { armed = true; reset.textContent = 'Tocar de novo para repor'; setTimeout(() => { armed = false; reset.textContent = 'Repor'; }, 4000); return; }
    reset.textContent = 'A repor…'; await resetDemo(); location.hash = ''; location.reload();
  };
  bar.append(label, go, reset);
  document.body.prepend(bar);
}

function splash() {
  const s = document.createElement('div');
  s.className = 'demo-splash';
  s.innerHTML = '<div class="demo-logo"></div><div>A preparar a Ponte…</div>';
  document.body.append(s);
  return s;
}

const sp = splash();
setMode(mode);
await boot();
sp.remove();
banner();
if (mode === 'admin') {
  document.getElementById('admin-css')?.setAttribute('media', 'all');
  document.body.classList.add('admin');
  const root = document.createElement('div');
  root.id = 'admin';
  document.body.append(root);
  await import('../public/js/admin.js');
} else {
  const main = document.createElement('main');
  main.id = 'app';
  main.setAttribute('aria-live', 'polite');
  document.body.append(main);
  await import('../public/js/app.js');
}
void DEMO;
