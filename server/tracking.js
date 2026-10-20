// Rastreio de encomendas e contentores: transportadoras, portos, rotas marítimas/aéreas,
// etapas do transporte, posição estimada, previsão de chegada e atrasos.
// Sem dependências: o cálculo é feito no servidor e a app só desenha.

// ------------------------------------------------------------------ transportadoras
// {n} é substituído pelo número (contentor, BL ou guia). Confirme os endereços de tempos a tempos:
// as transportadoras mudam os sites. Sem endereço, a app mostra o número para copiar.
export const CARRIERS = [
  { id: 'maersk', name: 'Maersk', mode: 'mar', url: 'https://www.maersk.com/tracking/{n}' },
  { id: 'msc', name: 'MSC', mode: 'mar', url: 'https://www.msc.com/en/track-a-shipment?agencyPath=msc&trackingNumber={n}' },
  { id: 'cmacgm', name: 'CMA CGM', mode: 'mar', url: 'https://www.cma-cgm.com/ebusiness/tracking/search?SearchBy=Container&Reference={n}' },
  { id: 'cosco', name: 'COSCO Shipping', mode: 'mar', url: 'https://elines.coscoshipping.com/ebusiness/cargoTracking?trackingType=CONTAINER&number={n}' },
  { id: 'hapag', name: 'Hapag-Lloyd', mode: 'mar', url: 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html?container={n}' },
  { id: 'one', name: 'ONE (Ocean Network Express)', mode: 'mar', url: null },
  { id: 'evergreen', name: 'Evergreen', mode: 'mar', url: null },
  { id: 'pil', name: 'PIL (Pacific International Lines)', mode: 'mar', url: null },
  { id: 'oocl', name: 'OOCL', mode: 'mar', url: null },
  { id: 'ethiopian', name: 'Ethiopian Cargo', mode: 'aereo', url: null },
  { id: 'qatar', name: 'Qatar Airways Cargo', mode: 'aereo', url: null },
  { id: 'emirates', name: 'Emirates SkyCargo', mode: 'aereo', url: null },
  { id: 'kenya', name: 'Kenya Airways Cargo', mode: 'aereo', url: null },
  { id: 'dhl', name: 'DHL Express', mode: 'courier', url: 'https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}' },
  { id: 'fedex', name: 'FedEx', mode: 'courier', url: 'https://www.fedex.com/fedextrack/?trknbr={n}' },
  { id: 'ups', name: 'UPS', mode: 'courier', url: 'https://www.ups.com/track?tracknum={n}' },
  { id: 'sf', name: 'SF Express', mode: 'courier', url: 'https://t.17track.net/en#nums={n}' },
  { id: 'ems', name: 'EMS / China Post', mode: 'courier', url: 'https://t.17track.net/en#nums={n}' },
  { id: 'outro', name: 'Outra / transitário da Ponte', mode: null, url: null },
];

// ------------------------------------------------------------------ portos e aeroportos
export const PORTS = {
  NSA: { name: 'Porto de Nansha (Guangzhou)', lat: 22.66, lng: 113.68, kind: 'mar', region: 'cn_sul' },
  SHK: { name: 'Porto de Shekou (Shenzhen)', lat: 22.47, lng: 113.88, kind: 'mar', region: 'cn_sul' },
  YTN: { name: 'Porto de Yantian (Shenzhen)', lat: 22.57, lng: 114.27, kind: 'mar', region: 'cn_sul' },
  HKG: { name: 'Porto de Hong Kong', lat: 22.31, lng: 114.13, kind: 'mar', region: 'cn_sul' },
  XMN: { name: 'Porto de Xiamen', lat: 24.45, lng: 118.07, kind: 'mar', region: 'cn_leste' },
  NGB: { name: 'Porto de Ningbo', lat: 29.93, lng: 121.85, kind: 'mar', region: 'cn_leste' },
  SHA: { name: 'Porto de Xangai (Yangshan)', lat: 30.62, lng: 122.07, kind: 'mar', region: 'cn_leste' },
  SIN: { name: 'Singapura', lat: 1.26, lng: 103.84, kind: 'mar' },
  CMB: { name: 'Colombo (Sri Lanka)', lat: 6.95, lng: 79.84, kind: 'mar' },
  PLU: { name: 'Port Louis (Maurícias)', lat: -20.15, lng: 57.49, kind: 'mar' },
  DUR: { name: 'Durban (África do Sul)', lat: -29.87, lng: 31.03, kind: 'mar' },
  MPM: { name: 'Porto de Maputo', lat: -25.97, lng: 32.56, kind: 'mar', region: 'mz' },
  BEW: { name: 'Porto da Beira', lat: -19.83, lng: 34.84, kind: 'mar', region: 'mz' },
  MNC: { name: 'Porto de Nacala', lat: -14.54, lng: 40.67, kind: 'mar', region: 'mz' },
  // Lusofonia (portos)
  AOLAD: { name: 'Porto de Luanda', lat: -8.79, lng: 13.25, kind: 'mar', region: 'atl' },
  AOLOB: { name: 'Porto do Lobito', lat: -12.34, lng: 13.56, kind: 'mar', region: 'atl' },
  BRSSZ: { name: 'Porto de Santos', lat: -23.98, lng: -46.30, kind: 'mar', region: 'atl' },
  BRPNG: { name: 'Porto de Paranaguá', lat: -25.50, lng: -48.51, kind: 'mar', region: 'atl' },
  BRITJ: { name: 'Porto de Itajaí', lat: -26.90, lng: -48.65, kind: 'mar', region: 'atl' },
  BRRIO: { name: 'Porto do Rio de Janeiro', lat: -22.89, lng: -43.19, kind: 'mar', region: 'atl' },
  CVRAI: { name: 'Porto da Praia', lat: 14.91, lng: -23.50, kind: 'mar', region: 'atl' },
  CVMIN: { name: 'Porto Grande (Mindelo)', lat: 16.89, lng: -24.99, kind: 'mar', region: 'atl' },
  GWOXB: { name: 'Porto de Bissau', lat: 11.85, lng: -15.58, kind: 'mar', region: 'atl' },
  PTSIE: { name: 'Porto de Sines', lat: 37.95, lng: -8.87, kind: 'mar', region: 'atl' },
  PTLEI: { name: 'Porto de Leixões', lat: 41.18, lng: -8.70, kind: 'mar', region: 'atl' },
  PTLIS: { name: 'Porto de Lisboa', lat: 38.70, lng: -9.17, kind: 'mar', region: 'atl' },
  STTMS: { name: 'Porto de São Tomé', lat: 0.35, lng: 6.73, kind: 'mar', region: 'atl' },
  TLDIL: { name: 'Porto de Díli (Tibar)', lat: -8.57, lng: 125.47, kind: 'mar', region: 'tl' },
  // pontos de passagem (não aparecem como paragem)
  IOW: { name: 'Oceano Índico', lat: -30, lng: 48, kind: 'mar', hidden: true },
  CAP: { name: 'Cabo da Boa Esperança', lat: -35.2, lng: 18.3, kind: 'mar', hidden: true },
  // Lusofonia (aeroportos)
  NBJ: { name: 'Aeroporto de Luanda (AIAAN)', lat: -9.04, lng: 13.48, kind: 'aereo', region: 'atl' },
  GRU: { name: 'Aeroporto de São Paulo (Guarulhos)', lat: -23.43, lng: -46.47, kind: 'aereo', region: 'atl' },
  GIG: { name: 'Aeroporto do Rio de Janeiro (Galeão)', lat: -22.81, lng: -43.25, kind: 'aereo', region: 'atl' },
  LIS: { name: 'Aeroporto de Lisboa', lat: 38.77, lng: -9.13, kind: 'aereo', region: 'atl' },
  OPO: { name: 'Aeroporto do Porto', lat: 41.24, lng: -8.68, kind: 'aereo', region: 'atl' },
  RAI: { name: 'Aeroporto da Praia', lat: 14.92, lng: -23.49, kind: 'aereo', region: 'atl' },
  SID: { name: 'Aeroporto do Sal', lat: 16.74, lng: -22.95, kind: 'aereo', region: 'atl' },
  OXB: { name: 'Aeroporto de Bissau', lat: 11.89, lng: -15.65, kind: 'aereo', region: 'atl' },
  TMS: { name: 'Aeroporto de São Tomé', lat: 0.38, lng: 6.71, kind: 'aereo', region: 'atl' },
  DIL: { name: 'Aeroporto de Díli', lat: -8.55, lng: 125.52, kind: 'aereo', region: 'tl' },
  CAN: { name: 'Aeroporto de Guangzhou Baiyun', lat: 23.39, lng: 113.30, kind: 'aereo', region: 'cn_sul' },
  SZX: { name: 'Aeroporto de Shenzhen', lat: 22.64, lng: 113.81, kind: 'aereo', region: 'cn_sul' },
  ADD: { name: 'Adis Abeba', lat: 8.98, lng: 38.80, kind: 'aereo' },
  DOH: { name: 'Doha', lat: 25.27, lng: 51.61, kind: 'aereo' },
  DXB: { name: 'Dubai', lat: 25.25, lng: 55.36, kind: 'aereo' },
  NBO: { name: 'Nairobi', lat: -1.32, lng: 36.93, kind: 'aereo' },
  JNB: { name: 'Joanesburgo', lat: -26.13, lng: 28.24, kind: 'aereo' },
  MPA: { name: 'Aeroporto de Maputo', lat: -25.92, lng: 32.57, kind: 'aereo', region: 'mz' },
  GZW: { name: 'Armazém Ponte (Guangzhou)', lat: 23.13, lng: 113.26, kind: 'terra', region: 'cn_sul' },
};

// Pontos de passagem no mar (para a linha não atravessar terra). Chave: "DE>PARA".
const SEA = {
  'cn_sul>SIN': [[21.6, 114.4], [15, 113], [8, 109.5], [3, 106]],
  'cn_leste>SIN': [[27, 122.6], [24, 119.6], [21.6, 116.5], [15, 113], [8, 109.5], [3, 106]],
  'SIN>CMB': [[2.8, 101], [5.9, 96.5], [5.8, 85]],
  'SIN>PLU': [[2.8, 101], [5.9, 96.5], [0, 85], [-10, 70]],
  'CMB>PLU': [[-5, 72], [-15, 62]],
  'PLU>MPM': [[-27, 46], [-27.6, 40], [-26.6, 35]],
  'PLU>DUR': [[-27, 46], [-31, 36]],
  'PLU>BEW': [[-11.5, 50], [-14, 45], [-19.5, 37.5]],
  'PLU>MNC': [[-11.5, 50], [-14.5, 42]],
  'DUR>MPM': [[-28.5, 33.3], [-26.3, 33.1]],
  'DUR>BEW': [[-27, 34], [-24, 36.5], [-21, 36.5]],
  'DUR>MNC': [[-27, 34], [-24, 36.5], [-17, 41]],
  // Para o Atlântico (Angola, Brasil, Cabo Verde, Guiné-Bissau, São Tomé, Portugal): pelo Cabo da Boa Esperança
  'SIN>IOW': [[2.8, 101], [5.9, 96.5], [0, 85], [-15, 68]],
  'CMB>IOW': [[-5, 72], [-18, 60]],
  'PLU>IOW': [], 'IOW>CAP': [[-35, 30]], 'IOW>DUR': [[-31, 36]], 'PLU>CAP': [[-27, 46], [-35, 30]], 'DUR>CAP': [[-34.6, 26]],
  'CAP>AOLAD': [[-30, 12], [-17, 10.5]], 'CAP>AOLOB': [[-30, 12], [-17, 11]],
  'CAP>BRSSZ': [[-33, 0], [-28, -30]], 'CAP>BRPNG': [[-33, 0], [-29, -35]], 'CAP>BRITJ': [[-33, 0], [-29.5, -38]], 'CAP>BRRIO': [[-33, 0], [-25, -35]],
  'CAP>CVRAI': [[-30, 10], [-15, 5], [0, -3], [8, -17], [14.4, -22.6]], 'CAP>CVMIN': [[-30, 10], [-15, 5], [0, -3], [8, -17], [16, -24]],
  'CAP>GWOXB': [[-30, 10], [-15, 5], [0, -3], [8, -17], [11, -16.6]],
  'CAP>STTMS': [[-30, 10], [-15, 7], [-2, 6.5]],
  'CAP>PTSIE': [[-30, 10], [-15, 5], [0, -3], [8, -17], [20, -21], [32, -14], [37, -9.6]],
  'CAP>PTLIS': [[-30, 10], [-15, 5], [0, -3], [8, -17], [20, -21], [32, -14], [38.5, -9.8]],
  'CAP>PTLEI': [[-30, 10], [-15, 5], [0, -3], [8, -17], [20, -21], [32, -14], [40, -10]],
  // Para Timor-Leste: Mar do Sul da China, Sulu, Celebes, estreito de Macáçar
  'cn_sul>TLDIL': [[18, 115.5], [10, 116], [7.6, 117.1], [5.5, 119.5], [1, 119], [-3, 118], [-6.5, 119], [-7.8, 122.5], [-8.3, 125]],
  'cn_leste>TLDIL': [[24, 119.6], [20, 117], [10, 116], [7.6, 117.1], [5.5, 119.5], [1, 119], [-3, 118], [-6.5, 119], [-7.8, 122.5], [-8.3, 125]],
};

const P = (code) => PORTS[code] ? [PORTS[code].lat, PORTS[code].lng] : null;
const keyOf = (code) => PORTS[code]?.region?.startsWith('cn') ? PORTS[code].region : code;

function seaLeg(a, b) {
  const pts = SEA[`${keyOf(a)}>${b}`] || SEA[`${a}>${b}`];
  if (pts) return pts;
  const rev = SEA[`${b}>${keyOf(a)}`] || SEA[`${b}>${a}`];
  return rev ? [...rev].reverse() : [];
}

// Rota completa (lista de [lat, lng]) e as paragens com nome.
export function buildRoute(s) {
  const o = PORTS[s.origin_port] ? s.origin_port : (s.mode === 'aereo' || s.mode === 'courier' ? 'CAN' : 'NSA');
  const d = PORTS[s.dest_port] ? s.dest_port : (s.mode === 'aereo' || s.mode === 'courier' ? 'MPA' : 'MPM');
  const t = PORTS[s.transship_port] ? s.transship_port : null;
  const stops = [o, ...(t ? [t] : []), d];
  if (s.mode === 'aereo' || s.mode === 'courier' || s.mode === 'estrada') {
    return { stops, path: stops.map(P) };
  }
  // Marítimo. Moçambique: China → Singapura → (Colombo) → Maurícias → (Durban) → destino.
  // Atlântico: … → Oceano Índico → (Maurícias/Durban) → Cabo da Boa Esperança → destino. Timor: directo.
  const region = PORTS[d].region;
  let chain;
  if (region === 'tl') chain = [o, d];
  else if (region === 'atl') {
    chain = [o, 'SIN'];
    if (t === 'CMB') chain.push('CMB');
    chain.push(t === 'PLU' ? 'PLU' : 'IOW');
    if (t === 'DUR') chain.push('DUR');
    chain.push('CAP', d);
  } else {
    chain = [o, 'SIN'];
    if (t === 'CMB') chain.push('CMB');
    chain.push('PLU');
    if (t === 'DUR') chain.push('DUR');
    chain.push(d);
  }
  const path = [P(o)];
  for (let i = 1; i < chain.length; i++) {
    path.push(...seaLeg(chain[i - 1], chain[i]));
    // Singapura e Maurícias são pontos de passagem (só "paragem" quando são transbordo)
    path.push(P(chain[i]));
  }
  return { stops, path };
}

// ------------------------------------------------------------------ distâncias e posição
const R = 6371;
const rad = (x) => (x * Math.PI) / 180;
export function km(a, b) {
  const dLat = rad(b[0] - a[0]); const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function pathLength(path) { let s = 0; for (let i = 1; i < path.length; i++) s += km(path[i - 1], path[i]); return s; }

// Ponto a uma fracção f (0–1) do caminho.
export function pointAt(path, f) {
  if (!path.length) return null;
  if (f <= 0) return path[0];
  const total = pathLength(path);
  let target = total * Math.min(1, f);
  for (let i = 1; i < path.length; i++) {
    const seg = km(path[i - 1], path[i]);
    if (target <= seg) {
      const k = seg ? target / seg : 0;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * k, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * k];
    }
    target -= seg;
  }
  return path[path.length - 1];
}

// ------------------------------------------------------------------ etapas
// [código, rótulo, ícone, fase]  — fases: 0 preparação · 1 no porto · 2 em viagem · 3 chegada e alfândega · 4 entrega · 5 entregue
export const MILESTONES = [
  ['reserva', 'Reserva de espaço confirmada', 'calendar', 0],
  ['recolha', 'Recolhido no fornecedor', 'truck', 0],
  ['armazem', 'Recebido no armazém em Guangzhou', 'box', 0],
  ['inspeccao', 'Inspeccionado e fotografado', 'shield', 0],
  ['carregado', 'Carregado no contentor', 'box', 0],
  ['porto_origem', 'Entregue no porto de origem', 'pin', 1],
  ['partida', 'Partiu', 'ship', 2],
  ['transbordo', 'Em transbordo', 'swap', 2],
  ['chegada', 'Chegou ao destino', 'pin', 3],
  ['alfandega', 'Em desalfandegamento', 'doc', 3],
  ['libertado', 'Libertado pela alfândega', 'check', 4],
  ['entrega', 'Saiu para entrega', 'truck', 4],
  ['entregue', 'Entregue', 'check', 5],
  ['atraso', 'Atraso', 'warn', -1],
  ['nota', 'Actualização', 'info', -1],
];
export const PHASES = ['Em preparação', 'No porto de origem', 'Em viagem', 'Chegada e alfândega', 'Em entrega', 'Entregue'];
export const milestone = (code) => MILESTONES.find((m) => m[0] === code) || MILESTONES[MILESTONES.length - 1];

// Interpreta estados em texto livre (vindos de uma transportadora ou agregador).
export function guessCode(text) {
  const t = String(text || '').toLowerCase();
  if (/deliver|entregue|pod\b|empty return/.test(t)) return 'entregue';
  if (/out for delivery|em entrega|saiu para entrega/.test(t)) return 'entrega';
  if (/released|libertad|customs clear/.test(t)) return 'libertado';
  if (/customs|alf[aâ]ndega|despacho/.test(t)) return 'alfandega';
  if (/transship|transbordo/.test(t)) return 'transbordo';
  if (/arriv|discharg|chegou|descarreg/.test(t)) return 'chegada';
  if (/depart|sailed|loaded on (board|vessel)|partiu|embarcad|flight/.test(t)) return 'partida';
  if (/gate in|terminal|porto/.test(t)) return 'porto_origem';
  if (/stuff|loaded|carregad/.test(t)) return 'carregado';
  if (/delay|atras/.test(t)) return 'atraso';
  return 'nota';
}

const day = 864e5;
const parseDate = (s) => (s ? new Date(String(s).length === 10 ? s + 'T12:00:00Z' : String(s).replace(' ', 'T') + (/[zZ+]/.test(String(s).slice(10)) ? '' : 'Z')) : null);

export function carrierUrl(s) {
  const c = CARRIERS.find((x) => x.id === s.carrier);
  const n = c?.mode === 'courier' ? (s.tracking_no || s.container_no) : (s.container_no || s.bl_no || s.tracking_no);
  return c?.url && n ? c.url.replace('{n}', encodeURIComponent(n)) : null;
}

// Vista calculada de um envio: fase, progresso, posição estimada, atraso, dias até chegar.
export function computeShipment(s, events, now = new Date()) {
  const { stops, path } = buildRoute(s);
  const evs = [...events].sort((a, b) => String(a.happened_at).localeCompare(String(b.happened_at)) || a.id - b.id);
  let phase = 0;
  for (const e of evs) phase = Math.max(phase, milestone(e.code)[3]);
  if (s.ata) phase = Math.max(phase, 3);
  if (s.atd) phase = Math.max(phase, 2);
  const start = parseDate(s.atd || s.etd);
  const end = parseDate(s.ata || s.eta);
  let progress = phase >= 3 ? 1 : 0;
  if (phase === 2 && start && end && end > start) progress = Math.max(0.02, Math.min(0.97, (now - start) / (end - start)));
  // Posição: o último evento com coordenadas, se for recente; senão estimada pela data.
  const lastGeo = [...evs].reverse().find((e) => e.lat !== null && e.lat !== undefined && e.lng !== null && e.lng !== undefined);
  let position = null, estimated = true;
  if (phase >= 3) { position = P(stops[stops.length - 1]); estimated = false; }
  else if (phase === 2) position = pointAt(path, progress);
  else position = P(stops[0]);
  if (lastGeo && phase < 3 && (!start || parseDate(lastGeo.happened_at) >= new Date(now - 3 * day))) { position = [lastGeo.lat, lastGeo.lng]; estimated = false; }
  const eta = parseDate(s.eta);
  const etaOrig = parseDate(s.eta_original || s.eta);
  const delayDays = eta && etaOrig ? Math.round((eta - etaOrig) / day) : 0;
  const daysLeft = phase >= 3 || !eta ? null : Math.round((eta - now) / day);
  const total = pathLength(path);
  return {
    stops: stops.map((c) => ({ code: c, name: PORTS[c].name, lat: PORTS[c].lat, lng: PORTS[c].lng })),
    path, phase, phase_label: PHASES[phase], progress: Math.round(progress * 1000) / 1000,
    position: position ? { lat: position[0], lng: position[1], estimated } : null,
    delay_days: delayDays > 0 ? delayDays : 0, delayed: delayDays > 1 || evs.some((e) => e.code === 'atraso' && phase < 3 && parseDate(e.happened_at) > new Date(now - 14 * day)),
    days_left: daysLeft, overdue: daysLeft !== null && daysLeft < 0,
    distance_km: Math.round(total), remaining_km: phase === 2 ? Math.round(total * (1 - progress)) : phase >= 3 ? 0 : Math.round(total),
    carrier_url: carrierUrl(s), carrier_name: CARRIERS.find((c) => c.id === s.carrier)?.name || s.carrier_name || null,
    events: evs.reverse().map((e) => ({ id: e.id, code: e.code, label: e.label || milestone(e.code)[1], icon: milestone(e.code)[2], location: e.location, lat: e.lat, lng: e.lng, happened_at: e.happened_at, note: e.note, source: e.source })),
  };
}

// Fase mínima do pedido (0–6) que corresponde à fase do transporte.
export function orderStepFor(phase) {
  if (phase >= 3) return 6;
  if (phase >= 1) return 5;
  return null;
}
