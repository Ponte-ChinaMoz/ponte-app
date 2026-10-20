// Dados iniciais. Tudo o que é exemplo fica marcado (is_sample = 1 ou "[Exemplo]") e pode ser
// apagado de uma vez no painel: Definições → "Apagar dados de exemplo".
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { all, get, run, tx, setSetting } from './db.js';
import { hashPassword } from './auth.js';
import { config } from './config.js';

function ensureAdmin() {
  if (get("SELECT id FROM users WHERE role = 'admin' LIMIT 1")) return;
  const password = config.adminPassword || crypto.randomBytes(9).toString('base64url');
  run("INSERT INTO users(name, email, password_hash, role) VALUES(?, ?, ?, 'admin')", config.adminName, config.adminEmail, hashPassword(password));
  if (!config.adminPassword) {
    const file = path.join(config.dataDir, 'admin-credenciais.txt');
    fs.writeFileSync(file, `Painel: /admin\nEmail: ${config.adminEmail}\nPalavra-passe: ${password}\n\nMude a palavra-passe depois de entrar e apague este ficheiro.\n`);
    console.log(`\n>>> Conta de administração criada: ${config.adminEmail} / ${password}\n>>> (guardado também em ${file})\n`);
  }
}

const FAQ = [
  // [quick, keywords, pergunta pt, resposta pt, pergunta en, resposta en]
  [1, 'visto,visa,carta convite,carta-convite,embaixada,invitation', 'Que visto preciso para ir à China?',
    'Para visitar feiras e fornecedores, o habitual é o visto de negócios (tipo M), pedido com uma carta-convite da feira ou de uma empresa chinesa. A equipa Ponte pode tratar da carta-convite no plano Viajante. Confirme sempre as regras em vigor junto da Embaixada da China em Maputo antes de comprar a viagem.',
    'Which visa do I need for China?',
    'To visit fairs and suppliers you normally need a business visa (type M), applied for with an invitation letter from the fair or a Chinese company. Ponte can arrange the invitation letter on the Traveller plan. Always confirm the current rules with the Chinese Embassy before booking.'],
  [1, 'pagar,pagamento,alipay,wechat pay,cartao,visa,mastercard,dinheiro,yuan,pay,payment,card,cash', 'Como pago as coisas na China?',
    'Quase tudo se paga por telemóvel com Alipay ou WeChat Pay, que já aceitam cartões Visa e Mastercard estrangeiros. Instale e associe o cartão antes de viajar. Leve também algum dinheiro em yuan (CNY) para mercados e pequenas despesas.',
    'How do I pay for things in China?',
    'Almost everything is paid by phone with Alipay or WeChat Pay, which accept foreign Visa and Mastercard cards. Install and link your card before you travel. Carry some yuan (CNY) cash for markets and small expenses.'],
  [1, 'whatsapp,google,internet,vpn,esim,sim,gmail,instagram,facebook,net', 'O WhatsApp e o Google funcionam na China?',
    'Não. Google, WhatsApp, Instagram e muitos serviços ocidentais estão bloqueados na rede chinesa. Use um eSIM internacional com roaming ou uma VPN, instalada e testada ANTES de partir (as lojas de VPN estão bloqueadas lá). Na China, os fornecedores falam por WeChat: instale-o também.',
    'Do WhatsApp and Google work in China?',
    'No. Google, WhatsApp, Instagram and many Western services are blocked on Chinese networks. Use an international roaming eSIM or a VPN, installed and tested BEFORE you leave (VPN stores are blocked there). Suppliers use WeChat, so install it too.'],
  [1, 'alojamento,hotel,ficar,dormir,hospedar,canton fair,feira,pazhou,accommodation,stay,sleep', 'Onde devo ficar durante a feira?',
    'Para a Canton Fair procure alojamento em Pazhou ou perto da Linha 8 do metro: chega à feira em poucos minutos. Tianhe é boa opção para negócios e Yuexiu para mercados grossistas. Reserve cedo, porque os preços sobem muito nas semanas da feira. Veja ofertas de parceiros em Promoções.',
    'Where should I stay during the fair?',
    'For the Canton Fair, stay in Pazhou or near Metro Line 8: you reach the fair in minutes. Tianhe suits business meetings and Yuexiu the wholesale markets. Book early: prices rise a lot during fair weeks. See partner offers under Promotions.'],
  [1, 'cotacao,cotar,preco,fornecedor,fabrica,comprar,encomenda,orcamento,quote,price,supplier,factory,buy', 'Como peço uma cotação a um fornecedor?',
    'Abra o produto ou o fornecedor e toque em "Pedir cotação via Ponte". Diga a quantidade, o preço-alvo e o destino. A Lara negoceia directamente com a fábrica e envia-lhe a proposta aqui na app, normalmente em poucos dias úteis.',
    'How do I request a quote from a supplier?',
    'Open the product or supplier and tap "Request a quote via Ponte". Give the quantity, target price and destination. Lara negotiates directly with the factory and sends you the proposal here in the app, usually within a few working days.'],
  [0, 'contacto do fornecedor,numero do fornecedor,nome da fabrica,contacto directo,supplier contact,factory name', 'Porque não vejo o contacto do fornecedor?',
    'A Ponte trabalha como o seu agente na China: verificamos as fábricas, negociamos em chinês, acompanhamos a produção e a qualidade. Por isso o contacto é feito através da nossa equipa. Nas visitas a fábricas e feiras, a Lara apresenta-o pessoalmente.',
    'Why can’t I see the supplier’s contact?',
    'Ponte acts as your agent in China: we verify factories, negotiate in Chinese and follow production and quality. That is why contact goes through our team. On factory and fair visits, Lara introduces you in person.'],
  [0, 'taxi,didi,uber,carro,motorista,taxista,cab,driver', 'Como apanho um táxi?',
    'Use a app DiDi (tem versão em inglês e aceita Alipay/WeChat). No Mapa da Ponte, cada local tem um cartão com a morada em chinês para mostrar ao motorista.',
    'How do I get a taxi?',
    'Use the DiDi app (English version, pays with Alipay/WeChat). In the Ponte Map, every place has a card with the address in Chinese to show the driver.'],
  [0, 'metro,metropolitano,autocarro,bus,subway,transporte,linha 8,bilhete,ticket,transport', 'Como uso o metro em Guangzhou?',
    'O metro de Guangzhou é rápido e barato. Pague com o código QR de transporte do Alipay ou WeChat, ou com o cartão Lingnan Pass. Para a Canton Fair use a Linha 8 (estações Xingangdong ou Pazhou). No Mapa da Ponte toque em "Transportes" para abrir a rota no Amap.',
    'How do I use the metro in Guangzhou?',
    'Guangzhou metro is fast and cheap. Pay with the transport QR code in Alipay or WeChat, or a Lingnan Pass card. For the Canton Fair use Line 8 (Xingangdong or Pazhou stations). In the Ponte Map tap "Transit" to open the route in Amap.'],
  [0, 'canton fair,feira de cantao,datas,quando,fase,feira,fair,dates,when', 'Quando é a Canton Fair?',
    'A Canton Fair acontece duas vezes por ano em Guangzhou: na primavera (abril–maio) e no outono (outubro–novembro), sempre em 3 fases por sectores, no complexo de Pazhou. Veja as datas e os sectores em Agenda → Feiras.',
    'When is the Canton Fair?',
    'The Canton Fair takes place twice a year in Guangzhou: spring (April–May) and autumn (October–November), always in 3 phases by sector, at the Pazhou complex. See dates and sectors under Agenda → Fairs.'],
  [0, 'ano novo chines,festa da primavera,fabricas fechadas,feriado,ferias,chinese new year,spring festival,holiday', 'As fábricas fecham no Ano Novo Chinês?',
    'Sim. Muitas fábricas param 2 a 4 semanas à volta da Festa da Primavera (janeiro/fevereiro) e a produção demora a retomar. Feche encomendas e embarques com antecedência. Veja todos os feriados em Agenda → Feriados.',
    'Do factories close for Chinese New Year?',
    'Yes. Many factories stop for 2 to 4 weeks around the Spring Festival (January/February) and production is slow to restart. Close orders and shipments well in advance. See all holidays under Agenda → Holidays.'],
  [0, 'enviar,carga,contentor,frete,navio,aereo,courier,grupagem,lcl,fcl,ship,shipping,freight,container', 'Como envio a mercadoria para o meu país?',
    'Pode enviar em contentor inteiro (FCL), em grupagem partilhada (LCL), por via aérea ou por courier para amostras, para qualquer país de língua portuguesa: Maputo, Beira, Nacala, Luanda, Lobito, Santos, Paranaguá, Praia, Mindelo, Bissau, Sines, Leixões, São Tomé ou Díli. Em "Enviar carga" peça uma cotação com volume, peso e destino e a equipa compara transitários parceiros.',
    'How do I ship goods to my country?',
    'You can ship a full container (FCL), shared consolidation (LCL), by air, or by courier for samples, to any Portuguese-speaking country. Under "Send cargo" request a quote with volume, weight and destination and the team compares partner forwarders.'],
  [0, 'alfandega,despacho,despachante,direitos,iva,impostos,pauta,customs,duty,tax,clearance', 'Quanto pago de alfândega?',
    'Depende da classificação pautal do produto. Use a calculadora em Ferramentas para uma estimativa (CIF + direitos + imposto do seu país) e peça a um despachante parceiro a confirmação para a sua mercadoria. Os documentos habituais são factura comercial, packing list, Bill of Lading e certificado de origem.',
    'How much will I pay in customs?',
    'It depends on the product’s tariff classification. Use the calculator in Tools for an estimate (CIF + duty + your country’s tax) and ask a partner customs broker to confirm for your goods. Usual documents: commercial invoice, packing list, Bill of Lading and certificate of origin.'],
  [0, 'amostra,amostras,sample,samples,qualidade,inspeccao,inspecao,quality,inspection', 'Posso ver amostras e controlar a qualidade?',
    'Sim. Antes da produção pedimos amostra (com fotos e vídeo) e, antes do pagamento final, fazemos inspecção de qualidade na fábrica. Tudo fica registado no seu pedido, em Perfil → Os meus pedidos.',
    'Can I see samples and check quality?',
    'Yes. Before production we request a sample (with photos and video) and before the final payment we run a quality inspection at the factory. Everything is logged in your order, under Profile → My orders.'],
  [0, 'plano,planos,preco do servico,quanto custa,subscricao,assinatura,plan,plans,subscription,cost', 'Quanto custa usar a Ponte?',
    'O plano Explorador é gratuito: guia, agenda, mapa e assistente. O plano Viajante inclui chat directo com a Lara durante a viagem e a carta-convite. O plano Negócios inclui o serviço completo de procurement. Veja os valores em Perfil → Planos.',
    'How much does Ponte cost?',
    'The Explorer plan is free: guide, agenda, map and assistant. The Traveller plan adds direct chat with Lara during your trip and the invitation letter. The Business plan includes the full procurement service. See prices under Profile → Plans.'],
  [0, 'emergencia,policia,ambulancia,bombeiros,hospital,doente,urgencia,emergency,police,ambulance,doctor', 'Quais são os números de emergência na China?',
    'Polícia 110 · Ambulância 120 · Bombeiros 119. Em Contactos úteis tem estes números com um toque e locais de saúde no Mapa.',
    'What are the emergency numbers in China?',
    'Police 110 · Ambulance 120 · Fire 119. Contacts has these one tap away, and health places are on the Map.'],
  [0, 'cambio,taxa,meticais,yuan,dolar,euro,converter,exchange,rate,currency', 'Qual é o câmbio?',
    'Em Ferramentas → Câmbio tem a conversão entre meticais, yuan, dólares, euros e rands, com a data da última actualização. São valores indicativos: confirme no seu banco.',
    'What is the exchange rate?',
    'In Tools → Exchange you can convert between meticais, yuan, dollars, euros and rand, with the date of the last update. They are indicative values: confirm with your bank.'],
  [0, 'horario,hora,quando responde,disponivel,hours,available,reply', 'Quando responde a equipa?',
    `A equipa Ponte responde no horário ${config.supportHours}. O assistente automático está sempre disponível.`,
    'When does the team reply?',
    `The Ponte team replies during ${config.supportHours}. The automatic assistant is always available.`],
];

const HOLIDAYS_2027 = [
  ['Ano Novo', 'New Year’s Day', '元旦', '2027-01-01', '2027-01-03'],
  ['Festa da Primavera (Ano Novo Chinês)', 'Spring Festival', '春节', '2027-02-05', '2027-02-12'],
  ['Qingming', 'Qingming Festival', '清明节', '2027-04-03', '2027-04-05'],
  ['Dia do Trabalhador', 'Labour Day', '劳动节', '2027-05-01', '2027-05-05'],
  ['Barco-Dragão', 'Dragon Boat Festival', '端午节', '2027-06-09', '2027-06-09'],
  ['Festival da Lua', 'Mid-Autumn Festival', '中秋节', '2027-09-15', '2027-09-15'],
  ['Dia Nacional', 'National Day', '国庆节', '2027-10-01', '2027-10-07'],
];

const SALES = [
  ['3.8', 'Dia da Mulher', 'Women’s Day', '8 mar', 3, 'Beleza, cosmética e moda.', 'Beauty, cosmetics and fashion.'],
  ['618', 'Festival 618', '618 Festival', '18 jun', 6, 'O segundo maior evento de compras do ano; forte em electrónica.', 'The second-largest shopping event of the year; strong in electronics.'],
  ['9.9', 'Festival 9.9', '9.9 Festival', '1–9 set', 9, 'Descontos em bebidas e vinhos.', 'Discounts on wine and spirits.'],
  ['11.11', 'Dia dos Solteiros', 'Singles’ Day', '11 nov', 11, 'O maior evento de compras do mundo. Bons preços, logística congestionada.', 'The world’s biggest shopping event. Good prices, congested logistics.'],
  ['12.12', 'Duplo Doze', 'Double Twelve', '12 dez', 12, 'Saldos de fim de ano.', 'Year-end sales.'],
];

const PLACES = [
  // categoria, nome, nome_cn, morada_cn, cidade, distrito, lat, lng, descricao, aproximado, exemplo
  ['feira', 'Complexo da Canton Fair (Pazhou)', '中国进出口商品交易会展馆', '广州市海珠区阅江中路382号', 'Guangzhou', 'Haizhu', 23.1063, 113.3652, 'Recinto da Canton Fair, CIFF e outras feiras. Metro Linha 8: Xingangdong ou Pazhou.', 1, 0],
  ['transporte', 'Aeroporto Internacional de Baiyun', '广州白云国际机场', '广州市白云区机场路', 'Guangzhou', 'Baiyun', 23.3924, 113.2988, 'Aeroporto principal de Guangzhou. Ligação por metro (Linha 3).', 1, 0],
  ['transporte', 'Estação Ferroviária Guangzhou Sul', '广州南站', '广州市番禺区石壁街道', 'Guangzhou', 'Panyu', 22.9886, 113.2690, 'Comboios rápidos para Shenzhen, Foshan e o resto da China.', 1, 0],
  ['zona', 'Lecong — mobiliário', '乐从家具城', '佛山市顺德区乐从镇', 'Foshan', 'Shunde', 22.952, 113.128, 'Uma das maiores zonas de mobiliário grossista da China.', 1, 0],
  ['zona', 'Shahe — vestuário grossista', '沙河服装批发市场', '广州市天河区沙河', 'Guangzhou', 'Tianhe', 23.158, 113.329, 'Mercados de roupa por grosso, muito cedo de manhã.', 1, 0],
  ['zona', 'Shiling — malas e couro', '狮岭皮具城', '广州市花都区狮岭镇', 'Guangzhou', 'Huadu', 23.462, 113.152, 'Centro de produção de malas e artigos de couro.', 1, 0],
  ['zona', 'Guzhen — iluminação', '古镇灯饰城', '中山市古镇镇', 'Zhongshan', 'Guzhen', 22.611, 113.190, 'Capital da iluminação: candeeiros, LED, iluminação pública.', 1, 0],
  ['mercado', 'Mercado Internacional de Yiwu', '义乌国际商贸城', '浙江省义乌市福田街道', 'Yiwu', 'Futian', 29.332, 120.103, 'O maior mercado de pequenos artigos do mundo. Comboio rápido desde Guangzhou.', 1, 0],
  ['hotel', '[Exemplo] Hotel parceiro em Pazhou', null, null, 'Guangzhou', 'Haizhu', 23.103, 113.371, 'Substitua por um hotel parceiro real no painel.', 1, 1],
  ['restaurante', '[Exemplo] Restaurante halal em Tianhe', null, null, 'Guangzhou', 'Tianhe', 23.135, 113.326, 'Substitua por um restaurante real no painel.', 1, 1],
  ['saude', '[Exemplo] Clínica internacional', null, null, 'Guangzhou', 'Tianhe', 23.125, 113.322, 'Substitua por uma clínica com atendimento em inglês.', 1, 1],
  ['dinheiro', '[Exemplo] Câmbio e ATM para cartões estrangeiros', null, null, 'Guangzhou', 'Tianhe', 23.132, 113.318, 'Substitua por um balcão real.', 1, 1],
];

const SUPPLIERS = [
  // categoria, titulo publico, cidade, distrito, descricao, moq, certificacoes, prazo, linguas
  ['Mobiliário', 'Fábrica de mobiliário de escritório e casa', 'Foshan', 'Lecong', 'Cadeiras, secretárias, sofás e mobiliário clássico e contemporâneo. Aceita personalização de cores e tecidos.', '10–50 unidades', 'ISO 9001', '30–45 dias', 'Inglês'],
  ['Têxtil', 'Confecção de fardamento e vestuário', 'Guangzhou', 'Baiyun', 'Uniformes escolares, fardamento de empresa, polos, ganga, bordado e estampagem.', '100–300 peças', '—', '20–30 dias', 'Inglês'],
  ['Energia', 'Painéis solares e iluminação solar', 'Shenzhen', 'Bao’an', 'Kits solares residenciais e comerciais, inversores, baterias de lítio e candeeiros solares.', '1–20 unidades', 'CE, IEC', '15–25 dias', 'Inglês'],
  ['Agro-indústria', 'Máquinas de processamento agrícola', 'Guangzhou', 'Panyu', 'Descascadoras, moinhos, secadores e linhas de embalamento.', '1 unidade', 'CE', '20–45 dias', 'Chinês (intérprete Ponte)'],
  ['Equipamentos', 'Câmaras frigoríficas modulares', 'Foshan', 'Shunde', 'Câmaras de frio e congelação em painel sandwich, com instalação remota.', '1 unidade', 'CE', '20–30 dias', 'Inglês'],
  ['Relógios e electrónica', 'Relógios e pequenos electrónicos', 'Shenzhen', 'Huaqiangbei', 'Relógios mecânicos, analógicos e digitais; rádios e pequenos aparelhos.', '50–100 unidades', 'CE, RoHS', '15–20 dias', 'Inglês'],
  ['Malas e calçado', 'Fábrica de malas e artigos de couro', 'Guangzhou', 'Shiling (Huadu)', 'Malas, mochilas e acessórios em couro e materiais técnicos.', '50–100 unidades', '—', '25–30 dias', 'Inglês'],
  ['Iluminação', 'Fábrica de iluminação decorativa', 'Zhongshan', 'Guzhen', 'Candeeiros e lustres de design, do clássico ao avant-garde.', '10–20 unidades', 'CE', '25–35 dias', 'Inglês'],
];

const PRODUCTS = [
  // fornecedor, nome, categoria, descricao, destaque, preco min, preco max, estilos, qualidade, durabilidade (anos), pecas, funcionamento, cores, materiais, tamanhos, minimo, prazo (dias), garantia
  [0, 'Cadeira de escritório ergonómica', 'Mobiliário', 'Encosto em rede, braços e altura reguláveis, base em nylon.', 1, 38, 55, 'minimalista,moderno', 4, 5, 'sim', 'manual', 'preto,cinzento', 'rede,nylon,metal', '', 50, 30, '2 anos'],
  [0, 'Secretária de escritório', 'Mobiliário', 'Tampo em melamina, estrutura metálica, passa-cabos.', 0, 70, 95, 'minimalista,escandinavo', 3, 8, 'limitado', 'manual', 'branco,madeira natural', 'melamina,metal', '140 cm,160 cm', 20, 30, '1 ano'],
  [0, 'Cadeirão gótico em veludo', 'Mobiliário', 'Encosto alto trabalhado, estrutura em madeira maciça, veludo.', 1, 180, 260, 'gótico,clássico', 4, 15, 'limitado', 'manual', 'preto,vermelho', 'veludo,madeira maciça', '', 10, 40, '2 anos'],
  [0, 'Cómoda vintage de 6 gavetas', 'Mobiliário', 'Acabamento envelhecido, puxadores em latão.', 0, 150, 210, 'vintage,rústico', 4, 20, 'nao', 'manual', 'castanho,madeira natural', 'madeira maciça,latão', '', 10, 45, '1 ano'],
  [0, 'Sofá Chesterfield 3 lugares', 'Mobiliário', 'Capitoné clássico, pele genuína, pés em madeira.', 1, 420, 600, 'clássico,luxo', 5, 15, 'sim', 'manual', 'castanho,verde', 'couro,madeira maciça', '2 lugares,3 lugares', 5, 45, '3 anos'],
  [1, 'Polo bordado com logótipo', 'Têxtil', 'Algodão piqué 220 g, bordado de logótipo incluído.', 1, 3.5, 5.5, 'clássico,desportivo', 3, 2, 'nao', '', 'branco,azul,preto,vermelho', 'algodão', 'S,M,L,XL,XXL', 300, 25, ''],
  [1, 'Uniforme escolar completo', 'Têxtil', 'Camisa, calça ou saia e gravata.', 0, 7, 11, 'clássico', 3, 2, 'nao', '', 'azul,branco,cinzento', 'poliéster,algodão', '6-8 anos,10-12 anos,14-16 anos', 300, 30, ''],
  [1, 'Casaco vintage de ganga', 'Têxtil', 'Lavagem stone-wash, botões metálicos.', 0, 12, 16, 'vintage', 4, 5, 'nao', '', 'azul', 'ganga', 'S,M,L,XL', 100, 30, ''],
  [2, 'Kit solar 5 kW', 'Energia', 'Painéis monocristalinos, inversor híbrido e bateria de lítio.', 1, 1900, 2600, '', 4, 10, 'sim', 'solar,digital', '', 'alumínio,vidro', '5 kW', 1, 20, '5 anos'],
  [2, 'Candeeiro solar de rua LED', 'Energia', 'Painel integrado, sensor de movimento, 12 h de autonomia.', 0, 45, 70, 'minimalista', 3, 5, 'sim', 'solar', 'cinzento', 'alumínio', '60 W,100 W', 20, 20, '2 anos'],
  [3, 'Descascadora de milho', 'Agro-indústria', 'Capacidade média, motor eléctrico ou a diesel.', 1, 650, 900, '', 3, 10, 'sim', 'mecânico,eléctrico', '', 'aço', '', 1, 30, '1 ano'],
  [3, 'Moinho manual de cereais', 'Agro-indústria', 'Mós ajustáveis, para milho, mapira e café.', 0, 35, 50, 'rústico', 3, 15, 'sim', 'manual,mecânico', '', 'ferro fundido', '', 10, 20, '1 ano'],
  [4, 'Câmara frigorífica modular 20 m³', 'Equipamentos', 'Painel de 100 mm, unidade de frio e controlador digital.', 0, 5500, 7800, '', 4, 12, 'sim', 'eléctrico,digital', 'branco', 'painel sandwich,aço inox', '20 m³', 1, 25, '2 anos'],
  [5, 'Relógio mecânico automático', 'Relógios', 'Movimento automático, vidro de safira, 5 ATM.', 1, 28, 45, 'clássico,vintage', 4, 15, 'sim', 'mecânico,analógico', 'prateado,dourado', 'aço inox,vidro safira', '40 mm,42 mm', 50, 20, '2 anos'],
  [5, 'Relógio digital desportivo', 'Relógios', 'Cronómetro, alarme, luz, resistente à água.', 0, 4, 7, 'desportivo,moderno', 3, 4, 'limitado', 'digital', 'preto,azul,vermelho', 'silicone,plástico', '', 100, 15, '1 ano'],
  [5, 'Rádio analógico retro', 'Electrónica', 'FM/AM com sintonia de ponteiro e Bluetooth.', 0, 9, 14, 'vintage', 3, 6, 'limitado', 'analógico', 'castanho,bege', 'madeira,plástico', '', 50, 20, '1 ano'],
  [6, 'Mala de couro clássica', 'Malas', 'Couro de vaca curtido, forro em algodão, fecho metálico.', 1, 25, 40, 'clássico,luxo', 5, 10, 'sim', '', 'castanho,preto', 'couro', 'M,L', 50, 30, '1 ano'],
  [6, 'Mochila minimalista impermeável', 'Malas', 'Compartimento para portátil, tecido técnico.', 0, 9, 14, 'minimalista,moderno', 4, 5, 'nao', '', 'preto,cinzento,verde', 'poliéster', '20 L,30 L', 100, 25, ''],
  [7, 'Candeeiro avant-garde em espiral', 'Iluminação', 'Estrutura escultórica em espiral com LED integrado.', 1, 65, 90, 'avant-garde,moderno', 4, 10, 'sim', 'eléctrico', 'dourado,preto', 'metal,vidro', '', 20, 25, '2 anos'],
  [7, 'Lustre gótico em ferro forjado', 'Iluminação', 'Lustre de 8 braços, acabamento envelhecido.', 0, 120, 180, 'gótico,clássico', 4, 20, 'sim', 'eléctrico', 'preto', 'ferro forjado', '6 braços,8 braços', 10, 35, '2 anos'],
];

const PROMOS = [
  ['Tarifa especial na semana da feira', '[Exemplo] Hotel parceiro em Pazhou', 'Alojamento', '-%', 'PONTE-FEIRA', 'Semana da Canton Fair', 'Desconto para utilizadores Ponte.', 1],
  ['Transfer do aeroporto de Baiyun', '[Exemplo] Empresa de transfer', 'Transporte', 'Grátis', 'PONTE-BAIYUN', 'Plano Viajante', 'Transfer incluído no plano Viajante.', 0],
  ['Amostras com portes reduzidos', '[Exemplo] Fornecedor verificado', 'Fornecedores', '-%', 'AMOSTRA-MZ', 'Até ao fim do mês', 'Portes de courier reduzidos para amostras.', 0],
  ['Grupagem mensal para Maputo', '[Exemplo] Transitário parceiro', 'Carga', 'LCL', 'GRUPO-MPM', 'Fecho mensal', 'Partilhe um contentor e pague só o volume usado.', 1],
];

function fairs() {
  const pazhou = get("SELECT id FROM places WHERE name LIKE 'Complexo da Canton Fair%'")?.id || null;
  return [
    ['Canton Fair — Outono · Fase 1', 'Guangzhou', 'Complexo de Pazhou', '2026-10-15', '2026-10-19', 'Electrónica, maquinaria, ferragens, veículos e equipamentos', 'Equipamentos,Electrónica', pazhou],
    ['Canton Fair — Outono · Fase 2', 'Guangzhou', 'Complexo de Pazhou', '2026-10-23', '2026-10-27', 'Casa, decoração, presentes e materiais de construção', 'Mobiliário,Casa', pazhou],
    ['Canton Fair — Outono · Fase 3', 'Guangzhou', 'Complexo de Pazhou', '2026-10-31', '2026-11-04', 'Têxteis, vestuário, calçado, malas e escritório', 'Têxtil', pazhou],
    ['CIFF Guangzhou — Feira do Móvel', 'Guangzhou', 'Pazhou', '2027-03-18', '2027-03-21', 'Mobiliário de casa, escritório e hotelaria', 'Mobiliário', pazhou],
    ['Interzum Guangzhou', 'Guangzhou', 'Pazhou', '2027-03-28', '2027-03-31', 'Componentes, ferragens e maquinaria para mobiliário', 'Mobiliário,Equipamentos', pazhou],
    ['Canton Fair — Primavera · Fase 1', 'Guangzhou', 'Complexo de Pazhou', '2027-04-15', '2027-04-19', 'Electrónica, maquinaria, ferragens, veículos e equipamentos', 'Equipamentos,Electrónica', pazhou],
    ['Canton Fair — Primavera · Fase 2', 'Guangzhou', 'Complexo de Pazhou', '2027-04-23', '2027-04-27', 'Casa, decoração, presentes e materiais de construção', 'Mobiliário,Casa', pazhou],
    ['Canton Fair — Primavera · Fase 3', 'Guangzhou', 'Complexo de Pazhou', '2027-05-01', '2027-05-05', 'Têxteis, vestuário, calçado, malas e escritório', 'Têxtil', pazhou],
  ];
}

export function seedContent() {
  tx(() => {
    for (const [i, f] of FAQ.entries()) {
      run('INSERT INTO faq(lang, question, answer, keywords, sort, quick) VALUES(?, ?, ?, ?, ?, ?)', 'pt', f[2], f[3], f[1], i, f[0]);
      run('INSERT INTO faq(lang, question, answer, keywords, sort, quick) VALUES(?, ?, ?, ?, ?, ?)', 'en', f[4], f[5], f[1], i, f[0]);
    }
    for (const h of HOLIDAYS_2027) {
      run('INSERT INTO holidays(year, name_pt, name_en, name_cn, start_date, end_date, official, note) VALUES(2027, ?, ?, ?, ?, ?, 0, ?)',
        h[0], h[1], h[2], h[3], h[4], 'Previsão. Confirmar quando o Conselho de Estado publicar o calendário oficial.');
    }
    for (const s of SALES) run('INSERT INTO sales_events(tag, name_pt, name_en, date_label, month, description_pt, description_en) VALUES(?, ?, ?, ?, ?, ?, ?)', ...s);
    for (const p of PLACES) run(`INSERT INTO places(category, name, name_cn, address_cn, city, district, lat, lng, description, approximate, is_sample)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, ...p);
    for (const f of fairs()) run(`INSERT INTO fairs(name, city, venue, start_date, end_date, sectors, tags, place_id, confirmed, notes)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, 0, 'Datas previstas: confirmar no site oficial.')`, ...f);
    const ids = SUPPLIERS.map((s, i) => run(`INSERT INTO suppliers(public_code, category, public_title, city, district, description, moq, certifications,
      lead_time, languages, verified, company_name, contact_person, phone, wechat, internal_notes, is_sample)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 1)`, `PNT-EX${i + 1}`, ...s,
    `[EXEMPLO] Empresa ${i + 1}`, '[contacto]', '[telefone]', '[wechat]', 'Dados de exemplo — substituir ou apagar.').lastInsertRowid);
    [[5, 4, 5, 12], [4, 4, 5, 9], [4, 5, 4, 6], [4, 3, 4, 3], [5, 4, 4, 5], [4, 4, 3, 7], [5, 5, 4, 10], [4, 4, 4, 4]].forEach((r, i) => {
      if (ids[i]) run('UPDATE suppliers SET rating_quality = ?, rating_delivery = ?, rating_comms = ?, orders_done = ? WHERE id = ?', r[0], r[1], r[2], r[3], ids[i]);
    });
    for (const p of PRODUCTS) run(`INSERT INTO products(supplier_id, name, category, description, featured, price_min, price_max, styles, quality,
      durability_years, spare_parts, mechanism, colors, materials, sizes, moq_qty, moq, lead_time_days, warranty, is_sample)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`, ids[p[0]], p[1], p[2], p[3], p[4], p[5], p[6], p[7] || null, p[8], p[9], p[10],
    p[11] || null, p[12] || null, p[13] || null, p[14] || null, p[15], `${p[15]} ${p[15] === 1 ? 'unidade' : 'unidades'}`, p[16], p[17] || null);
    for (const p of PROMOS) run(`INSERT INTO promotions(title, partner_name, category, badge, code, valid_label, description, sponsored, is_sample)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, 1)`, ...p);
    run(`INSERT INTO partners(type, company, city, country, languages, services, status, admin_note) VALUES
      ('transitario', '[Exemplo] Transitário Guangzhou', 'Guangzhou', 'China', 'Português, inglês, chinês', 'FCL e LCL para Maputo, Beira e Nacala', 'aprovado', 'EXEMPLO'),
      ('despachante', '[Exemplo] Despachante Maputo', 'Maputo', 'Moçambique', 'Português, inglês', 'Porto e aeroporto de Maputo', 'aprovado', 'EXEMPLO')`);
    run(`INSERT INTO plans(id, name, price_label, price_amount, currency, features, highlight, sort) VALUES
      ('explorador', 'Explorador', 'Grátis', 0, 'MZN', ?, 0, 1),
      ('viajante', 'Viajante', 'Preço a definir', 0, 'MZN', ?, 1, 2),
      ('negocios', 'Negócios', 'Preço a definir + comissão', 0, 'MZN', ?, 0, 3)`,
    JSON.stringify(['Guia de estadia e checklist', 'Agenda de feiras, feriados e saldos', 'Mapa, rotas e cartão para o taxista', 'Assistente automático']),
    JSON.stringify(['Tudo do Explorador', 'Chat directo com a Lara durante a viagem', '1 videochamada de preparação', 'Carta-convite para o visto', 'Cotações de fornecedores verificados']),
    JSON.stringify(['Tudo do Viajante', 'Procurement completo: cotações, amostras e negociação', 'Visitas a fábricas e feiras com a Lara', 'Inspecção de qualidade e embarque', 'Intérprete e transporte no local']));
    const adminId = get("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")?.id;
    const g1 = run(`INSERT INTO group_shipments(title, origin, destination, container, capacity_cbm, closes_at, departs_label, status, notes, is_sample)
      VALUES('[Exemplo] Contentor 40 pés · Guangzhou → Maputo', 'Armazém Ponte, Guangzhou', 'Porto de Maputo', '40 pés HC', 67, '2026-11-15', 'Segunda quinzena de Novembro', 'aberto',
      'A mercadoria é recebida no armazém, verificada e fotografada antes de carregar. Despacho aduaneiro opcional.', 1)`).lastInsertRowid;
    run(`INSERT INTO group_shipments(title, origin, destination, container, capacity_cbm, closes_at, departs_label, status, notes, is_sample)
      VALUES('[Exemplo] Contentor 20 pés · Guangzhou → Beira', 'Armazém Ponte, Guangzhou', 'Porto da Beira', '20 pés', 33, '2026-11-30', 'Início de Dezembro', 'aberto', 'Ideal para lotes pequenos.', 1)`);
    if (adminId) run("INSERT INTO group_bookings(shipment_id, user_id, cbm, goods, status, admin_note) VALUES(?, ?, 41, 'Reservas de exemplo', 'confirmado', 'EXEMPLO')", g1, adminId);
    setSetting('rates', { USD: 1, MZN: 63.9, AOA: 915, BRL: 5.5, CVE: 95, XOF: 565, EUR: 0.86, STN: 21.1, CNY: 7.15, ZAR: 17.8, updated_at: new Date().toISOString().slice(0, 10), note: 'Valores indicativos: actualize no painel.' });
  });
}

// Exemplo de rastreio: um contentor partilhado já a caminho de Maputo, com etapas e um atraso.
// O link público de demonstração é /#/t/exemplo
function seedTrackingSample() {
  if (get('SELECT id FROM shipments LIMIT 1') || !get('SELECT id FROM suppliers WHERE is_sample = 1 LIMIT 1')) return;
  const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const dt = (n, h = '10:00:00') => `${d(n)} ${h}`;
  tx(() => {
    const g = run(`INSERT INTO group_shipments(title, origin, destination, container, capacity_cbm, closes_at, departs_label, status, notes, is_sample)
      VALUES('[Exemplo] Contentor 40 pés · a caminho de Maputo', 'Armazém Ponte, Guangzhou', 'Porto de Maputo', '40 pés HC', 67, ?, 'Partiu', 'enviado', 'Contentor de exemplo para ver o rastreio.', 1)`, d(-20)).lastInsertRowid;
    const adminId = get("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")?.id;
    if (adminId) run("INSERT INTO group_bookings(shipment_id, user_id, cbm, goods, status, admin_note) VALUES(?, ?, 6, 'Exemplo: 120 cadeiras', 'confirmado', 'EXEMPLO')", g, adminId);
    const sh = run(`INSERT INTO shipments(ref, share_token, group_id, title, mode, carrier, container_no, bl_no, vessel, voyage, origin_port, transship_port, dest_port, etd, atd, eta, eta_original, notes, is_sample)
      VALUES('TR-EXEMPLO', 'exemplo', ?, 'Contentor partilhado de Outubro (exemplo)', 'mar', 'cmacgm', 'CMAU0000000', 'EXEMPLOBL001', 'CMA CGM Exemplo', '0FX1RS', 'NSA', 'PLU', 'MPM', ?, ?, ?, ?, 'Dados fictícios para demonstração.', 1)`,
      g, d(-14), d(-14), d(16), d(13)).lastInsertRowid;
    const ev = [
      ['reserva', null, null, null, dt(-24), 'Espaço reservado no navio.'],
      ['armazem', 'Armazém Ponte, Guangzhou', 23.13, 113.26, dt(-20), '38 volumes recebidos de 3 fornecedores.'],
      ['inspeccao', 'Armazém Ponte, Guangzhou', 23.13, 113.26, dt(-18), 'Fotografias e contagem enviadas a cada cliente.'],
      ['carregado', 'Armazém Ponte, Guangzhou', 23.13, 113.26, dt(-17), 'Contentor selado.'],
      ['porto_origem', 'Porto de Nansha (Guangzhou)', 22.66, 113.68, dt(-16), null],
      ['partida', 'Porto de Nansha (Guangzhou)', 22.66, 113.68, dt(-14, '18:30:00'), 'Navio CMA CGM Exemplo.'],
      ['nota', 'Singapura', 1.26, 103.84, dt(-8), 'Passou Singapura dentro do previsto.'],
      ['atraso', 'Oceano Índico', null, null, dt(-3), 'Congestionamento no porto de transbordo: chegada adiada 3 dias.'],
    ];
    for (const [code, loc, lat, lng, at, note] of ev) run('INSERT INTO shipment_events(shipment_id, code, location, lat, lng, happened_at, note, source) VALUES(?, ?, ?, ?, ?, ?, ?, ?)', sh, code, loc, lat, lng, at, note, 'equipa');
  });
}

// Lusofonia: país de destino dos contentores antigos e contentores de exemplo para Angola, Brasil e Cabo Verde.
function seedLusophone() {
  run(`UPDATE group_shipments SET dest_country = 'MZ' WHERE dest_country IS NULL AND (destination LIKE '%Maputo%' OR destination LIKE '%Beira%' OR destination LIKE '%Nacala%')`);
  // Perguntas do assistente sobre a lusofonia (acrescentadas também a bases de dados já existentes).
  const FAQ_LUSO = [
    ['pais,paises,angola,brasil,cabo verde,guine,portugal,sao tome,timor,mocambique,lusofonia,servem,country,countries', 'Para que países trabalha a Ponte?',
      'Para todos os países de língua portuguesa: Moçambique, Angola, Brasil, Cabo Verde, Guiné-Bissau, Portugal, São Tomé e Príncipe e Timor-Leste. Escolha o seu país em Perfil → País, idioma e moeda: a app adapta a moeda, os portos, os pagamentos e a alfândega.',
      'Which countries does Ponte serve?', 'All Portuguese-speaking countries: Mozambique, Angola, Brazil, Cape Verde, Guinea-Bissau, Portugal, São Tomé and Príncipe and Timor-Leste. Pick your country under Profile → Country, language and currency.'],
    ['meios de pagamento,carteira,m-pesa,emola,mkesh,multicaixa,unitel money,pix,boleto,mb way,multibanco,vinti4,orange money,mosan,t-pay,pagar a ponte', 'Como pago à Ponte no meu país?',
      'Com os meios mais usados em cada país: M-Pesa, e-Mola e mKesh em Moçambique; Multicaixa Express, referência Multicaixa e Unitel Money em Angola; Pix, boleto e cartão no Brasil; Vinti4 e T+ Money em Cabo Verde; Orange Money na Guiné-Bissau; MB WAY e Multibanco em Portugal; Mosan e T-Pay em Timor-Leste; transferência bancária em São Tomé e Príncipe. O cartão Visa/Mastercard funciona em todos.',
      'How do I pay Ponte from my country?', 'With the most used local methods: M-Pesa, e-Mola and mKesh in Mozambique; Multicaixa Express and Unitel Money in Angola; Pix, boleto and cards in Brazil; Vinti4 and T+ Money in Cape Verde; Orange Money in Guinea-Bissau; MB WAY and Multibanco in Portugal; Mosan and T-Pay in Timor-Leste; bank transfer in São Tomé and Príncipe. Visa/Mastercard works everywhere.'],
    ['macau,forum macau,portugues na china,falar portugues,lusofono,interprete', 'Há apoio em português na China?',
      'Sim. A equipa Ponte em Guangzhou fala português e mandarim, e pode acompanhá-lo como intérprete em feiras, fábricas e bancos. Em Macau o português é língua oficial e o Fórum de Macau promove o comércio entre a China e os países lusófonos. Veja o Guia de estadia.',
      'Is there support in Portuguese in China?', 'Yes. The Ponte team in Guangzhou speaks Portuguese and Mandarin and can act as your interpreter at fairs, factories and banks. In Macau, Portuguese is an official language and Forum Macao promotes trade between China and Portuguese-speaking countries.'],
  ];
  FAQ_LUSO.push(
    ['avaria,avariou,estragou,parou,conserto,reparacao,reparar,assistencia,tecnico,garantia,manutencao,broken,repair,warranty', 'A máquina avariou. O que faço?',
      'Abra Assistência na app e carregue em "Tenho uma avaria": descreva o problema, fotografe a máquina, a chapa de características e o código de erro. A equipa Ponte fala com a fábrica em chinês e propõe a solução: apoio remoto por vídeo, envio da peça, técnico parceiro no seu país ou reparação na garantia.',
      'My machine broke down. What do I do?', 'Open Service in the app and tap "I have a breakdown": describe the problem and photograph the machine, its rating plate and the error code. The Ponte team talks to the factory in Chinese and proposes a fix: remote video support, a spare part, a partner technician in your country or a warranty repair.'],
    ['pecas,peca,sobresselente,sobresselentes,spare,parts,acessorio,desgaste,filtro,correia,rolamento,motor', 'Como compro peças sobresselentes?',
      'Em Assistência → Preciso de peças: escreva a referência ou envie uma fotografia da peça e da chapa da máquina. A Ponte encontra a peça na fábrica de origem, envia por courier ou aéreo e acompanha o envio no Rastreio. Ao comprar uma máquina, peça logo o kit de peças de desgaste.',
      'How do I buy spare parts?', 'Under Service → I need parts: type the part number or send a photo of the part and the machine plate. Ponte finds it at the original factory, ships it by courier or air and you follow it in Tracking. When buying a machine, ask for the wear-parts kit straight away.'],
  );
  if (!get("SELECT id FROM partners WHERE type = 'tecnico' LIMIT 1") && get('SELECT id FROM suppliers WHERE is_sample = 1 LIMIT 1')) {
    run(`INSERT INTO partners(type, company, city, country, languages, services, status, admin_note) VALUES
      ('tecnico', '[Exemplo] Técnicos de máquinas industriais', 'Maputo', 'Moçambique', 'Português, inglês', 'Máquinas de blocos, moinhos, geradores, refrigeração', 'aprovado', 'EXEMPLO'),
      ('tecnico', '[Exemplo] Assistência técnica de equipamentos', 'Luanda', 'Angola', 'Português', 'Electrónica, painéis solares, equipamento de cozinha industrial', 'aprovado', 'EXEMPLO')`);
  }
  for (const [kw, q, a, qen, aen] of FAQ_LUSO) {
    if (get('SELECT id FROM faq WHERE question = ?', q)) continue;
    run('INSERT INTO faq(lang, question, answer, keywords, sort, quick) VALUES(?, ?, ?, ?, ?, ?)', 'pt', q, a, kw, 50, 0);
    run('INSERT INTO faq(lang, question, answer, keywords, sort, quick) VALUES(?, ?, ?, ?, ?, ?)', 'en', qen, aen, kw, 50, 0);
  }
  if (!get('SELECT id FROM suppliers WHERE is_sample = 1 LIMIT 1') || get("SELECT id FROM group_shipments WHERE dest_country IN ('AO', 'BR', 'CV') LIMIT 1")) return;
  const d = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const add = (title, dest, cc, cont, cap, closes, label, notes) => run(`INSERT INTO group_shipments(title, origin, destination, dest_country, container, capacity_cbm, closes_at, departs_label, status, notes, is_sample)
    VALUES(?, 'Armazém Ponte, Guangzhou', ?, ?, ?, ?, ?, ?, 'aberto', ?, 1)`, title, dest, cc, cont, cap, closes, label, notes);
  add('[Exemplo] Contentor 40 pés · Guangzhou → Luanda', 'Porto de Luanda', 'AO', '40 pés HC', 67, d(25), 'Daqui a cerca de um mês', 'Despacho aduaneiro em Luanda opcional, com despachante parceiro.');
  add('[Exemplo] Contentor 40 pés · Guangzhou → Santos', 'Porto de Santos', 'BR', '40 pés HC', 67, d(30), 'Daqui a cerca de um mês', 'Para importadores com RADAR activo. A equipa indica o despachante.');
  add('[Exemplo] Contentor 20 pés · Guangzhou → Praia', 'Porto da Praia', 'CV', '20 pés', 33, d(40), 'Daqui a cerca de 6 semanas', 'Ideal para lotes pequenos de comércio e restauração.');
}

export function ensureSeed() {
  ensureAdmin();
  if (!get('SELECT id FROM faq LIMIT 1')) seedContent();
  seedTrackingSample();
  seedLusophone();
}

// Execução directa: `npm run seed` recria os conteúdos (mantém utilizadores).
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  if (process.argv.includes('--force')) {
    run('DELETE FROM shipments');
    for (const t of ['faq', 'holidays', 'sales_events', 'fairs', 'products', 'suppliers', 'places', 'promotions', 'plans', 'group_shipments']) run(`DELETE FROM ${t}`);
    run("DELETE FROM partners WHERE company LIKE '[Exemplo]%'");
  }
  ensureSeed();
  console.log('Dados iniciais prontos:', all('SELECT (SELECT COUNT(*) FROM faq) faq, (SELECT COUNT(*) FROM fairs) fairs, (SELECT COUNT(*) FROM suppliers) suppliers')[0]);
}
