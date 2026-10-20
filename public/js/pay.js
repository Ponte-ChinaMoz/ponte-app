// Escolha do meio de pagamento, adaptada ao país do cliente (carteiras móveis, Pix, MB WAY, referências…).
import { h, field } from './ui.js';
import { t, countryInfo } from './i18n.js';
import { state } from './app.js';
import { PHONE_WALLETS } from './countries.js';

const HELP = {
  referencia: 'Recebe uma referência para pagar no multibanco, no banco ou na app do banco.',
  instantaneo: 'Recebe um código Pix (copia e cola ou QR) para pagar na app do banco.',
  banco: 'Recebe os dados bancários da Ponte e envia o comprovativo no chat.',
  cartao: 'O pagamento por cartão abre a página segura do processador de pagamentos. A Ponte não guarda dados do cartão.',
};

// Devolve { el, value() } — value() = { method, phone }
export function payPicker(onChange) {
  const methods = countryInfo().pay;
  let method = methods[0].id;
  const phone = h('input', { type: 'tel', inputmode: 'tel', value: state.user?.whatsapp || state.user?.phone || '', placeholder: countryInfo().dial ? `+${countryInfo().dial} …` : '' });
  const el = h('div', { class: 'stack' });
  const draw = () => {
    const m = methods.find((x) => x.id === method);
    el.replaceChildren(
      h('div', { class: 'pay-grid' }, methods.map((x) => h('button', { type: 'button', class: 'pay-opt' + (x.id === method ? ' on' : ''), 'aria-pressed': x.id === method ? 'true' : 'false',
        onclick: () => { method = x.id; draw(); onChange?.(method); } }, h('strong', {}, x.name), x.by ? h('span', { class: 'xs muted' }, x.by) : null))),
      PHONE_WALLETS.has(method) ? field(t('Número {w}', { w: m.name }), phone) : h('div', { class: 'xs muted' }, t(HELP[m.kind] || HELP.banco)));
  };
  draw();
  return { el, value: () => ({ method, phone: phone.value }) };
}
