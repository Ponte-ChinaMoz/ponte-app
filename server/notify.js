// Avisos para o cliente por WhatsApp (WhatsApp Business Cloud API, da Meta).
// Activa-se com WHATSAPP_TOKEN e WHATSAPP_PHONE_ID. Sem configuração, fica só registado.
// Nota: fora de uma conversa iniciada pelo cliente nas últimas 24 h, a Meta exige mensagens
// "template" aprovadas; defina WHATSAPP_TEMPLATE para usar um template com um parâmetro de texto.
import { run } from './db.js';
import { normalizePhone } from '../public/js/countries.js';

export function whatsappEnabled() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

export function normalizeMzPhone(raw) {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (/^8[2-7]\d{7}$/.test(d)) d = '258' + d;
  return /^\d{9,15}$/.test(d) ? d : null;
}

export async function notifyUser(user, text) {
  if (!user || !user.notify_whatsapp) return { sent: false, reason: 'desactivado' };
  const to = normalizePhone(user.whatsapp || user.phone, user.country || 'MZ');
  if (!to) return { sent: false, reason: 'sem número' };
  const body = `Ponte: ${text}`;
  if (!whatsappEnabled()) {
    run('INSERT INTO events(user_id, type, meta) VALUES(?, ?, ?)', user.id, 'whatsapp_pendente', JSON.stringify({ to, text: body.slice(0, 300) }));
    return { sent: false, reason: 'não configurado' };
  }
  const payload = process.env.WHATSAPP_TEMPLATE
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: process.env.WHATSAPP_TEMPLATE, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'pt_PT' }, components: [{ type: 'body', parameters: [{ type: 'text', text: text.slice(0, 900) }] }] } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body } };
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    run('INSERT INTO events(user_id, type, meta) VALUES(?, ?, ?)', user.id, r.ok ? 'whatsapp_enviado' : 'whatsapp_erro', JSON.stringify({ to, status: r.status }));
    return { sent: r.ok };
  } catch (e) {
    run('INSERT INTO events(user_id, type, meta) VALUES(?, ?, ?)', user.id, 'whatsapp_erro', JSON.stringify({ to, error: String(e.message).slice(0, 200) }));
    return { sent: false, reason: 'erro' };
  }
}
