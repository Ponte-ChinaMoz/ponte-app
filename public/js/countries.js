// Países de língua portuguesa servidos pela Ponte. Usado pela app e pelo servidor (sem dependências).
// Cada país adapta: moeda, indicativo, portos/aeroportos de destino, meios de pagamento locais,
// alfândega, fuso horário e variante do português (pt-BR no Brasil).
// Os meios de pagamento são os mais usados em cada país; a integração real exige contrato com cada operador.

export const COUNTRIES = [
  {
    code: 'MZ', zh: '莫桑比克', py: 'Mòsāngbǐkè', hubs: 'Adis Abeba, Doha, Dubai, Nairobi ou Joanesburgo', airlines: [['LAM — Linhas Aéreas de Moçambique', 'https://www.lam.co.mz/']], cities: ['Maputo', 'Matola', 'Beira', 'Nampula', 'Nacala', 'Quelimane', 'Tete', 'Pemba', 'Inhambane', 'Xai-Xai', 'Chimoio', 'Lichinga'], name: 'Moçambique', flag: '🇲🇿', capital: 'Maputo', tz: 'Africa/Maputo', currency: 'MZN', dial: '258', variant: 'pt',
    mobile: /^8[2-7]\d{7}$/, ports: [['MPM', 'Porto de Maputo'], ['BEW', 'Porto da Beira'], ['MNC', 'Porto de Nacala']], airports: [['MPM', 'Maputo'], ['BEW', 'Beira'], ['APL', 'Nampula'], ['TET', 'Tete'], ['POL', 'Pemba']],
    pay: [
      { id: 'mpesa', name: 'M-Pesa', by: 'Vodacom', kind: 'carteira' },
      { id: 'emola', name: 'e-Mola', by: 'Movitel', kind: 'carteira' },
      { id: 'mkesh', name: 'mKesh', by: 'Tmcel', kind: 'carteira' },
      { id: 'cartao', name: 'Cartão Visa / Mastercard', kind: 'cartao' },
      { id: 'banco', name: 'Transferência bancária', kind: 'banco' },
    ],
    customs: 'Autoridade Tributária de Moçambique (Alfândegas)', vat: 16, sea: '30–45', air: '5–8',
  },
  {
    code: 'AO', zh: '安哥拉', py: 'Āngēlā', hubs: 'Adis Abeba, Dubai ou Doha', airlines: [['TAAG Angola Airlines', 'https://www.taag.com/']], cities: ['Luanda', 'Benguela', 'Lobito', 'Huambo', 'Lubango', 'Cabinda', 'Malanje', 'Moçâmedes', 'Soyo', 'Kuito'], name: 'Angola', flag: '🇦🇴', capital: 'Luanda', tz: 'Africa/Luanda', currency: 'AOA', dial: '244', variant: 'pt',
    mobile: /^9\d{8}$/, ports: [['AOLAD', 'Porto de Luanda'], ['AOLOB', 'Porto do Lobito']], airports: [['NBJ', 'Luanda']],
    pay: [
      { id: 'mcx_express', name: 'Multicaixa Express', by: 'EMIS', kind: 'carteira' },
      { id: 'mcx_ref', name: 'Pagamento por referência Multicaixa', kind: 'referencia' },
      { id: 'unitel_money', name: 'Unitel Money', by: 'Unitel', kind: 'carteira' },
      { id: 'afrimoney', name: 'Afrimoney', by: 'Africell', kind: 'carteira' },
      { id: 'cartao', name: 'Cartão Visa / Mastercard', kind: 'cartao' },
      { id: 'banco', name: 'Transferência bancária (IBAN)', kind: 'banco' },
    ],
    customs: 'Administração Geral Tributária (AGT) — Alfândegas', vat: 14, sea: '35–50', air: '5–9',
  },
  {
    code: 'BR', zh: '巴西', py: 'Bāxī', hubs: 'Dubai, Doha, Adis Abeba ou numa cidade europeia', cities: ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Brasília', 'Salvador', 'Fortaleza', 'Recife', 'Curitiba', 'Porto Alegre', 'Manaus', 'Belém', 'Goiânia', 'Campinas', 'Florianópolis', 'Vitória'], name: 'Brasil', flag: '🇧🇷', capital: 'Brasília', tz: 'America/Sao_Paulo', currency: 'BRL', dial: '55', variant: 'pt-BR',
    mobile: /^\d{2}9\d{8}$/, ports: [['BRSSZ', 'Porto de Santos'], ['BRPNG', 'Porto de Paranaguá'], ['BRITJ', 'Porto de Itajaí'], ['BRRIO', 'Porto do Rio de Janeiro']], airports: [['GRU', 'São Paulo'], ['GIG', 'Rio de Janeiro'], ['VCP', 'Campinas']],
    pay: [
      { id: 'pix', name: 'Pix', kind: 'instantaneo' },
      { id: 'boleto', name: 'Boleto bancário', kind: 'referencia' },
      { id: 'cartao', name: 'Cartão de crédito (parcelado)', kind: 'cartao' },
      { id: 'mercadopago', name: 'Mercado Pago', kind: 'carteira' },
      { id: 'picpay', name: 'PicPay', kind: 'carteira' },
    ],
    customs: 'Receita Federal do Brasil', vat: null, sea: '35–50', air: '5–10',
  },
  {
    code: 'CV', zh: '佛得角', py: 'Fódéjiǎo', hubs: 'Lisboa ou noutra cidade europeia', cities: ['Praia', 'Mindelo', 'Espargos', 'Santa Maria', 'Sal Rei', 'Assomada', 'São Filipe'], name: 'Cabo Verde', flag: '🇨🇻', capital: 'Praia', tz: 'Atlantic/Cape_Verde', currency: 'CVE', dial: '238', variant: 'pt',
    mobile: /^[59]\d{6}$/, ports: [['CVRAI', 'Porto da Praia'], ['CVMIN', 'Porto Grande (Mindelo)']], airports: [['RAI', 'Praia'], ['SID', 'Sal'], ['VXE', 'São Vicente']],
    pay: [
      { id: 'vinti4', name: 'Vinti4', by: 'SISP', kind: 'cartao' },
      { id: 'tmoney', name: 'T+ Money', by: 'Unitel T+', kind: 'carteira' },
      { id: 'mkesh_cv', name: 'mKesh', by: 'CV Móvel', kind: 'carteira' },
      { id: 'pagali', name: 'Pagali', kind: 'carteira' },
      { id: 'cartao', name: 'Cartão Visa / Mastercard', kind: 'cartao' },
      { id: 'banco', name: 'Transferência bancária', kind: 'banco' },
    ],
    customs: 'Direcção Nacional de Receitas do Estado — Alfândegas', vat: 15, sea: '40–55', air: '6–10',
  },
  {
    code: 'GW', zh: '几内亚比绍', py: 'Jǐnèiyà Bǐshào', hubs: 'Lisboa, Casablanca ou Adis Abeba', cities: ['Bissau', 'Bafatá', 'Gabú', 'Canchungo', 'Cacheu', 'Bolama'], name: 'Guiné-Bissau', flag: '🇬🇼', capital: 'Bissau', tz: 'Africa/Bissau', currency: 'XOF', dial: '245', variant: 'pt',
    mobile: /^9[5-6]\d{7}$/, ports: [['GWOXB', 'Porto de Bissau']], airports: [['OXB', 'Bissau']],
    pay: [
      { id: 'orange_money', name: 'Orange Money', by: 'Orange Bissau', kind: 'carteira' },
      { id: 'telecel', name: 'Carteira Telecel (ex-MTN MoMo)', by: 'Telecel', kind: 'carteira' },
      { id: 'cartao', name: 'Cartão Visa / Mastercard', kind: 'cartao' },
      { id: 'banco', name: 'Transferência bancária', kind: 'banco' },
    ],
    customs: 'Direcção-Geral das Alfândegas da Guiné-Bissau', vat: null, sea: '40–55', air: '6–10',
  },
  {
    code: 'PT', zh: '葡萄牙', py: 'Pútáoyá', hubs: 'Dubai, Doha, Istambul ou noutra cidade europeia', airlines: [['TAP Air Portugal', 'https://www.flytap.com/']], cities: ['Lisboa', 'Porto', 'Braga', 'Coimbra', 'Aveiro', 'Leiria', 'Setúbal', 'Faro', 'Funchal', 'Ponta Delgada'], name: 'Portugal', flag: '🇵🇹', capital: 'Lisboa', tz: 'Europe/Lisbon', currency: 'EUR', dial: '351', variant: 'pt',
    mobile: /^9\d{8}$/, ports: [['PTSIE', 'Porto de Sines'], ['PTLEI', 'Porto de Leixões'], ['PTLIS', 'Porto de Lisboa']], airports: [['LIS', 'Lisboa'], ['OPO', 'Porto'], ['FAO', 'Faro']],
    pay: [
      { id: 'mbway', name: 'MB WAY', kind: 'carteira' },
      { id: 'multibanco', name: 'Referência Multibanco', kind: 'referencia' },
      { id: 'cartao', name: 'Cartão Visa / Mastercard', kind: 'cartao' },
      { id: 'sepa', name: 'Transferência SEPA', kind: 'banco' },
      { id: 'paypal', name: 'PayPal', kind: 'carteira' },
    ],
    customs: 'Autoridade Tributária e Aduaneira (AT)', vat: 23, sea: '40–55', air: '4–8',
  },
  {
    code: 'ST', zh: '圣多美和普林西比', py: 'Shèngduōměi hé Pǔlínxībǐ', hubs: 'Lisboa ou Adis Abeba', cities: ['São Tomé', 'Trindade', 'Neves', 'Guadalupe', 'Santo António (Príncipe)'], name: 'São Tomé e Príncipe', flag: '🇸🇹', capital: 'São Tomé', tz: 'Africa/Sao_Tome', currency: 'STN', dial: '239', variant: 'pt',
    mobile: /^9\d{6}$/, ports: [['STTMS', 'Porto de São Tomé']], airports: [['TMS', 'São Tomé']],
    pay: [
      { id: 'banco', name: 'Transferência bancária (BISTP, Ecobank…)', kind: 'banco' },
      { id: 'remessa', name: 'Western Union / MoneyGram (nos bancos)', kind: 'banco' },
      { id: 'cartao', name: 'Cartão internacional Visa / Mastercard', kind: 'cartao' },
    ],
    customs: 'Direcção das Alfândegas de São Tomé e Príncipe', vat: null, sea: '45–60', air: '6–10',
  },
  {
    code: 'TL', zh: '东帝汶', py: 'Dōngdìwèn', hubs: 'Bali, Singapura ou Darwin', cities: ['Díli', 'Baucau', 'Maliana', 'Suai', 'Lospalos', 'Oecusse'], name: 'Timor-Leste', flag: '🇹🇱', capital: 'Díli', tz: 'Asia/Dili', currency: 'USD', dial: '670', variant: 'pt',
    mobile: /^7\d{7}$/, ports: [['TLDIL', 'Porto de Díli (Tibar)']], airports: [['DIL', 'Díli']],
    pay: [
      { id: 'mosan', name: 'Mosan', by: 'Telemor', kind: 'carteira' },
      { id: 'tpay', name: 'T-Pay', by: 'Telkomcel', kind: 'carteira' },
      { id: 'banco', name: 'Transferência bancária (BNCTL e outros)', kind: 'banco' },
      { id: 'cartao', name: 'Cartão Visa / Mastercard', kind: 'cartao' },
    ],
    customs: 'Alfândegas de Timor-Leste', vat: null, sea: '20–35', air: '3–7',
  },
];

// Quem vive noutro país (diáspora lusófona) escolhe "Outro país": vê opções internacionais.
export const OTHER = {
  code: 'XX', hubs: 'Adis Abeba, Doha ou Dubai', cities: [], name: 'Outro país', flag: '🌍', capital: '', tz: 'UTC', currency: 'USD', dial: '', variant: 'pt', mobile: null, ports: [['MPM', 'Porto de Maputo'], ['AOLAD', 'Porto de Luanda'], ['BRSSZ', 'Porto de Santos'], ['PTSIE', 'Porto de Sines']], airports: [],
  pay: [{ id: 'cartao', name: 'Cartão Visa / Mastercard', kind: 'cartao' }, { id: 'banco', name: 'Transferência internacional (SWIFT)', kind: 'banco' }, { id: 'paypal', name: 'PayPal', kind: 'carteira' }],
  customs: 'Alfândegas do país de destino', vat: null, sea: '30–60', air: '4–10',
};

// Carteiras que pedem o número de telefone do cliente.
export const PHONE_WALLETS = new Set(['mpesa', 'emola', 'mkesh', 'mcx_express', 'unitel_money', 'afrimoney', 'tmoney', 'mkesh_cv', 'orange_money', 'telecel', 'mosan', 'tpay', 'mbway']);

export const countryOf = (code) => COUNTRIES.find((c) => c.code === code) || (code === 'XX' ? OTHER : COUNTRIES[0]);

// Moedas que a app mostra (o câmbio é actualizado pela equipa no painel).
export const CURRENCIES = {
  MZN: 'Metical', AOA: 'Kwanza', BRL: 'Real', CVE: 'Escudo cabo-verdiano', XOF: 'Franco CFA', EUR: 'Euro', STN: 'Dobra', USD: 'Dólar', CNY: 'Yuan', ZAR: 'Rand',
};

// Indicativo + número local → formato internacional só com dígitos (para WhatsApp). null se não for válido.
export function normalizePhone(raw, countryCode = 'MZ') {
  let d = String(raw || '').replace(/[^\d+]/g, '');
  if (!d) return null;
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else {
    const c = countryOf(countryCode);
    const local = d.replace(/^0/, '');
    if (c.dial && c.mobile && c.mobile.test(local)) d = c.dial + local;
    // Sem indicativo e sem formato local válido: só aceita se já começar por um indicativo lusófono.
    else if (!(d.length >= 10 && COUNTRIES.some((x) => d.startsWith(x.dial) && x.mobile?.test(d.slice(x.dial.length))))) return null;
  }
  return /^\d{9,15}$/.test(d) ? d : null;
}

// Preposições com nomes de países: "de Brasil" → "do Brasil", "em Guiné-Bissau" → "na Guiné-Bissau".
const ART = [['Brasil', 'o'], ['Guiné-Bissau', 'a']];
export function fixPrep(s, br = false) {
  let o = String(s);
  for (const [n, a] of ART) {
    const m = a === 'o' ? { de: 'do', em: 'no', para: 'para o', ate: br ? 'até o' : 'até ao', a: 'ao' } : { de: 'da', em: 'na', para: 'para a', ate: 'até à', a: 'à' };
    o = o.replace(new RegExp(`(^|[^\\p{L}])(de|em|para|até|a) (${n})`, 'giu'), (x, pre, p, name) => {
      const k = p.toLowerCase() === 'até' ? 'ate' : p.toLowerCase();
      const rep = m[k];
      return pre + (p[0] === p[0].toUpperCase() ? rep[0].toUpperCase() + rep.slice(1) : rep) + ' ' + name;
    });
  }
  return o;
}

// Hora local numa cidade (para "agora em Guangzhou · agora em Luanda").
export function timeIn(tz, locale = 'pt-PT', date = new Date()) {
  try { return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: tz }); } catch { return ''; }
}
