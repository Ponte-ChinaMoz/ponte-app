// Interpretação de comandos de voz → destino na app. Sem dependências do navegador (testável no servidor).
// Cada regra tem palavras-chave em PT, EN, ES, IT, FR e ZH. A primeira que corresponder ganha;
// se nenhuma corresponder, a frase é tratada como pesquisa no catálogo ("quero 200 cadeiras pretas…").

export function normalizeVoice(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

const has = (t, words) => words.some((w) => (/[一-鿿]/.test(w) ? t.includes(w) : new RegExp(`(^| )${w}`).test(t)));

// Texto depois de uma palavra-gatilho ("traduz bom dia" → "bom dia"), devolvido com os acentos originais.
function after(raw, words) {
  const zh = String(raw).match(/(?:翻译|问)[:：\s]*(.+)$/);
  if (zh) return zh[1].trim();
  const t = normalizeVoice(raw);
  for (const w of words) {
    const m = t.match(new RegExp(`(?:^| )${w}\\w*(?: (?:para|para o|em|to|in|al|en|a))?(?: (?:chines|mandarim|chinese|chino|cinese|chinois))?(?: (?:que|se|o|a))? (.+)$`));
    if (m) {
      const n = m[1].split(' ').length;
      const rawWords = String(raw).trim().replace(/[?!.。？！]+$/, '').split(/\s+/);
      return rawWords.slice(-n).join(' ');
    }
  }
  return '';
}

const RULES = [
  { id: 'translate', words: ['traduz', 'traducao', 'tradutor', 'translate', 'traduce', 'tradurre', 'traduis', 'traduire', '翻译'],
    go: (t, raw) => { const x = after(raw, ['traduz', 'translate', 'traduce', 'traduci', 'traduis', 'traduire']); return x ? `#/translate?text=${encodeURIComponent(x)}` : '#/translate'; } },
  { id: 'emergency', words: ['emergencia', 'policia', 'ambulancia', 'bombeiros', 'hospital', 'emergency', 'police', 'ambulance', 'urgencia', 'polizia', 'urgence', '急救', '报警', '医院'], go: () => '#/contacts?tab=saude' },
  { id: 'ask', words: ['pergunta', 'perguntar', 'diz a', 'diga a', 'ask', 'pregunta', 'chiedi', 'demande'],
    go: (t, raw) => { const x = after(raw, ['pergunta a lara', 'pergunta a equipa', 'pergunta', 'perguntar a lara', 'diz a lara', 'diga a lara', 'ask lara', 'ask the team', 'ask', 'pregunta', 'chiedi', 'demande']); return `#/chat${x ? '?msg=' + encodeURIComponent(x) : ''}`; } },
  { id: 'service', words: ['avaria', 'avariou', 'estragou', 'parou', 'conserto', 'consertar', 'reparar', 'reparacao', 'assistencia', 'tecnico', 'garantia', 'manutencao', 'peca', 'pecas', 'sobresselente', 'repair', 'broken', 'warranty', 'maintenance', 'spare', 'averia', 'repuesto', 'guasto', 'ricambi', 'panne', 'piece', '维修', '坏了', '配件', '保修'],
    go: (t) => (/(peca|sobresselente|spare|repuesto|ricambi|piece|配件)/.test(t) ? '#/service/new?kind=pecas' : /(manutencao|maintenance|tecnico)/.test(t) ? '#/service/new?kind=manutencao' : /(avaria|avariou|estragou|parou|broken|averia|guasto|panne|坏了)/.test(t) ? '#/service/new?kind=avaria' : '#/service') },
  { id: 'track', words: ['rastre', 'tracking', 'track', 'onde esta o (meu )?contentor', 'onde esta a (minha )?(encomenda|carga|mercadoria)', 'quando chega', 'onde esta', 'where is', 'donde esta', 'dove', 'ou est', 'navio', 'chegada', 'seguimiento', 'rastrear', 'tracciamento', 'spedizione', 'suivi', 'ou est mon', '物流', '跟踪', '到哪了', '什么时候到'], go: () => '#/track' },
  { id: 'chat', words: ['falar com', 'lara', 'equipa', 'chat', 'mensage', 'ajuda', 'assistente', 'talk to', 'team', 'help', 'hablar con', 'equipo', 'ayuda', 'parlare', 'aiuto', 'parler', 'aide', 'equipe', '客服', '团队', '聊天'], go: () => '#/chat' },
  { id: 'directions', words: ['como chego', 'como chegar', 'como vou', 'direc', 'rota', 'caminho', 'how do i get', 'directions', 'como llego', 'come arrivo', 'itineraire', '怎么去', '路线'],
    go: (t) => (has(t, ['feira', 'fair', 'feria', 'fiera', 'salon', '展会']) ? '#/map?cat=feira' : has(t, ['hotel', '酒店']) ? '#/map?cat=hotel' : has(t, ['aeroporto', 'airport', 'aeropuerto', 'aeroporto', 'aeroport', '机场', 'comboio', 'estacao', 'train', 'station']) ? '#/map?cat=transporte' : '#/map') },
  { id: 'taxi', words: ['taxi', 'didi', 'motorista', 'driver', 'chauffeur', '出租车', '司机'], go: () => '#/map' },
  { id: 'restaurants', words: ['restaurante', 'comer', 'jantar', 'almocar', 'restaurant', 'food', 'eat', 'ristorante', 'mangiare', 'manger', '餐厅', '吃饭'], go: () => '#/map?cat=restaurante' },
  { id: 'hotels', words: ['hotel', 'dormir', 'alojamento', 'hospedar', 'accommodation', 'alojamiento', 'alloggio', 'hebergement', '酒店', '住宿'], go: () => '#/map?cat=hotel' },
  { id: 'money', words: ['cambio', 'converter', 'dolar', 'yuan', 'metica', 'exchange', 'currency', 'cambiar', 'change', '汇率'], go: () => '#/tools?tab=cambio' },
  { id: 'cost', words: ['custo de import', 'quanto custa importar', 'alfandega', 'direitos', 'customs', 'import cost', 'aduana', 'dogana', 'douane', '关税'], go: () => '#/tools' },
  { id: 'phrases', words: ['frase', 'phrase', '常用语'], go: () => '#/tools?tab=frases' },
  { id: 'flights', words: ['voo', 'aviao', 'bilhete', 'passagem', 'comboio', 'flight', 'plane', 'ticket', 'train', 'vuelo', 'billete', 'tren', 'volo', 'biglietto', 'treno', 'vol', 'billet', '机票', '航班', '火车', '高铁'],
    go: (t) => (has(t, ['comboio', 'train', 'tren', 'treno', '火车', '高铁']) ? '#/travel?tab=china' : '#/travel') },
  { id: 'groups', words: ['contentor partilhado', 'partilhar contentor', 'grupagem', 'metros cubicos', 'shared container', 'contenedor compartido', 'container condiviso', 'conteneur partage', '拼箱', 'reservar'],
    go: (t, raw) => { const m = String(raw).normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').match(/(\d+(?:[.,]\d+)?) ?(?:m3|metros? cubicos?|cubic|cbm|方)/); return m ? `#/groups?m3=${m[1].replace(',', '.')}` : '#/groups'; } },
  { id: 'freight', words: ['enviar carga', 'frete', 'despacho', 'despachante', 'transitario', 'contentor', 'navio', 'freight', 'shipping', 'cargo', 'flete', 'spedizione', 'fret', '运费', '海运', '货运'], go: () => '#/freight' },
  { id: 'visit', words: ['visita', 'videochamada', 'video', 'ver a fabrica', 'visit', 'video call', 'videollamada', 'videochiamata', 'visio', '视频'], go: () => '#/visit' },
  { id: 'pay', words: ['pagar', 'pagamento', 'sinal', 'pay', 'payment', 'deposit', 'pago', 'pagare', 'payer', '付款', '支付'], go: () => '#/orders' },
  { id: 'orders', words: ['meus pedidos', 'minhas encomendas', 'encomenda', 'pedido', 'my orders', 'order', 'mis pedidos', 'ordini', 'commande', '订单'], go: () => '#/orders' },
  { id: 'quotes', words: ['cotac', 'proposta', 'orcamento', 'quote', 'proposal', 'cotizacion', 'preventiv', 'devis', '报价'], go: () => '#/quotes' },
  { id: 'cart', words: ['cesto', 'carrinho', 'cart', 'basket', 'cesta', 'carrello', 'panier', '购物车'], go: () => '#/cart' },
  { id: 'favorites', words: ['favorit', 'comparar', 'compare', 'confront', 'comparer', '收藏', '对比'], go: () => '#/favorites' },
  { id: 'photo', words: ['fotografia', 'foto', 'identificar', 'o que e isto', 'que objecto', 'que maquina', 'photo', 'camera', 'identify', 'what is this', 'que es esto', 'cos e questo', 'qu est ce que', '拍照', '照片', '识别', '这是什么'], go: () => '#/identify' },
  { id: 'holidays', words: ['feriado', 'ano novo chines', 'holiday', 'chinese new year', 'festivo', 'festivita', 'ferie', '节假日', '春节'], go: () => '#/agenda?tab=feriados' },
  { id: 'sales', words: ['saldos', 'promocoes de compras', '11 11', 'onze onze', '618', 'sales', 'rebajas', 'saldi', 'soldes', '促销'], go: () => '#/agenda?tab=saldos' },
  { id: 'fairs', words: ['feira', 'canton', 'fair', 'feria', 'fiera', 'salon', '展会', '广交会'], go: () => '#/agenda?tab=feiras' },
  { id: 'promos', words: ['promoc', 'desconto', 'oferta', 'promotion', 'discount', 'descuento', 'sconto', 'remise', '优惠'], go: () => '#/promos' },
  { id: 'guide', words: ['guia', 'checklist', 'visto', 'vpn', 'internet', 'guide', 'visa', 'guida', '指南', '签证'], go: () => '#/guide' },
  { id: 'contacts', words: ['contacto', 'telefone', 'contact', 'contatti', '联系'], go: () => '#/contacts' },
  { id: 'suppliers', words: ['fornecedor', 'fabrica', 'supplier', 'factory', 'proveedor', 'fornitor', 'fournisseur', 'usine', '供应商', '工厂'], go: () => '#/suppliers' },
  { id: 'style', words: ['meu estilo', 'o meu gosto', 'my style', 'mi estilo', 'mio stile', 'mon style', '我的风格'], go: () => '#/prefs' },
  { id: 'partner', words: ['ser parceiro', 'parceria', 'anunciar', 'partner', 'advertise', 'socio', 'anunciar', 'partenaire', '合作'], go: () => '#/partner' },
  { id: 'language', words: ['idioma', 'lingua', 'language', 'lengua', 'langue', '语言'], go: () => '#/settings' },
  { id: 'map', words: ['mapa', 'map', 'mappa', 'carte', '地图'], go: () => '#/map' },
  { id: 'profile', words: ['perfil', 'minha conta', 'profile', 'account', 'cuenta', 'profilo', 'profil', 'compte', '我的'], go: () => '#/profile' },
  { id: 'explore', words: ['explorar', 'servicos', 'explore', 'services', 'servicios', 'servizi', '服务'], go: () => '#/explore' },
  { id: 'home', words: ['inicio', 'pagina inicial', 'home', 'casa', 'accueil', '首页'], go: () => '#/' },
];

// Mesmo numa frase de compra ('quero um voo', 'preciso de traduzir'), estas intenções ganham ao catálogo.
const STRONG = new Set(['translate', 'emergency', 'ask', 'chat', 'directions', 'flights', 'groups', 'freight', 'visit', 'pay', 'cart', 'taxi', 'restaurants', 'hotels', 'photo', 'track', 'service']);

// Devolve { id, hash } — o ecrã para onde ir.
export function parseCommand(raw) {
  const t = normalizeVoice(raw);
  if (!t) return null;
  // Frases de compra com números ou preço vão directas ao catálogo (mesmo que digam "fábrica" ou "pedido").
  const shopping = /\b(quero|preciso|procuro|comprar|want|need|buy|quiero|necesito|voglio|cerco|je veux|acheter)\b/.test(t) && !/\b(falar|pergunta|talk|ask)\b/.test(t);
  for (const r of RULES) {
    if (shopping && !STRONG.has(r.id)) continue;
    if (has(t, r.words)) return { id: r.id, hash: r.go(t, raw) };
  }
  return { id: 'catalog', hash: `#/catalog?voice=${encodeURIComponent(String(raw).trim())}` };
}
