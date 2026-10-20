# Ponte — a ponte da lusofonia para a China

App instalável no telemóvel (PWA) com servidor, base de dados e painel de gestão para a equipa Ponte.
Feita para os países de língua portuguesa: Moçambique, Angola, Brasil, Cabo Verde, Guiné-Bissau, Portugal,
São Tomé e Príncipe e Timor-Leste (com inglês, espanhol, italiano, francês e chinês como opção).
Não precisa de nenhum pacote externo: só do **Node.js 22.13 ou mais recente**.

## O que inclui

**Feita para cada país lusófono:** o cliente escolhe o país no início e a app adapta a moeda (metical, kwanza, real,
escudo, franco CFA, euro, dobra, dólar), os portos e aeroportos de destino, os meios de pagamento locais (M-Pesa, e-Mola,
mKesh; Multicaixa Express, Unitel Money; Pix e boleto; Vinti4 e T+ Money; Orange Money; MB WAY e Multibanco; Mosan e
T-Pay; cartão e transferência em todos), a alfândega e o imposto, o indicativo de WhatsApp, o relógio duplo
(Guangzhou e a capital) e o **português do Brasil** para clientes brasileiros. Inclui o Fórum de Macau e apoio em português na China.

**Para o cliente (app):**
- Início com a viagem em 4 etapas (Preparar, Viajar, Comprar, Enviar), pesquisa por texto, voz ou fotografia.
- **Voz em toda a app:** microfone em todos os campos (ditado); botão redondo de **comandos por voz** em 6 línguas
  ("abrir o mapa", "falar com a Lara", "quero 200 cadeiras pretas até 40 dólares", "reservar 3 m³ no contentor",
  "traduz onde fica a casa de banho"); **leitura em voz alta** das respostas, do estado do pedido e das propostas.
  Os pagamentos nunca se fazem por voz: o comando só abre o ecrã, e o cliente confirma.
- **Identificar por fotografia:** o cliente fotografa um equipamento, móvel, ferramenta ou material e recebe o nome
  (também em chinês), a utilização, os materiais, uma estimativa das medidas, volume, peso e capacidade, as especificações
  típicas, a capacidade de produção (máquinas), o preço indicativo na China, dicas de qualidade, notas de importação,
  perguntas para o fornecedor, alternativas e artigos parecidos do catálogo. O passo seguinte é sempre pedir à equipa.
- **Catálogo com mega filtro:** estilo, preço, qualidade, durabilidade, peças sobresselentes, funcionamento,
  cores, materiais, tamanhos, prazo e encomenda mínima, com contagens em cada opção.
  Também inclui **pesquisa por frase** ("200 cadeiras pretas até 40 dólares"), **ordenação pelo perfil de estilo**,
  pesquisas guardadas, favoritos e comparação de até 3 artigos.
- **Fornecedores anónimos:** o cliente vê o perfil e a nota de fiabilidade, nunca o nome nem os contactos.
- **Cotações** com fotografias, **cesto e compra online** (entrega em Moçambique ou na China) e
  **pagamento protegido por fases** (sinal e o restante só depois da inspecção).
- **Pedidos** com linha de etapas e documentos, **contentor partilhado** (reserva de m³, primeiro os do seu país) e **frete e despacho**.
- **Rastreio da encomenda:** mapa da rota com a posição do navio, data prevista de chegada com contagem de dias,
  aviso de atraso, etapas (armazém, inspecção, porto, partida, transbordo, chegada, alfândega, entrega), ligação ao site
  da transportadora, link de partilha (sem preços), aviso no chat e por WhatsApp a cada etapa, e chegada no calendário.
  O pedido avança sozinho quando o contentor parte e chega. Rotas para os portos de todos os países lusófonos.
- **Assistência e pós-venda:** passaporte de cada equipamento (modelo, número de série, garantia, manuais, peças de
  desgaste), pedido de assistência com fotografias e voz (com prioridade se a máquina parou), diagnóstico com a fábrica
  feito pela equipa em chinês, proposta de solução (remota, peça, técnico local, garantia) que o cliente aceita na app,
  encomenda de peças com pagamento e rastreio, manutenção preventiva com lembretes automáticos, técnicos parceiros por país
  e avaliação do serviço. Na compra, o cliente pode pedir já o kit de peças, o manual em português e o arranque por vídeo.
- **Visita virtual** a fábricas e feiras, **chat** com assistente automático e passagem para a equipa.
- **Mapa** com rotas no Amap/Baidu e cartão em chinês para o taxista.
- **Agenda** de feiras, feriados chineses e saldos, **guia de estadia**, **contactos úteis**.
- **Ferramentas:** custo de importação, câmbio e frases com pronúncia. **Tradutor** para mandarim.
- **Voos e transportes**, **promoções e publicidade**, **registo de parceiros** (despachantes, transitários, fábricas…).
- 6 idiomas (PT, EN, ES, IT, FR, 中文) e funcionamento com pouca ou nenhuma rede.

**Para a equipa (painel em `/admin`):** resumo com estatísticas e alertas (incluindo clientes por país); rastreio de envios (etapas, datas, link público); assistência pós-venda (com o contacto real da fábrica, só para a equipa) e equipamentos dos clientes; mensagens; cotações (com o fornecedor real);
pedidos (etapas, documentos, valores e pagamentos); carga; contentores e reservas; visitas; parceiros; clientes;
catálogo privado de fornecedores e produtos; feiras, feriados, saldos, locais, promoções, perguntas do assistente e planos;
importação e exportação em CSV (Excel); câmbio; botão WhatsApp directo para cada cliente.

## Experimentar no computador

```bash
cp .env.example .env        # e mude ADMIN_PASSWORD
npm start                   # abre em http://localhost:3000  ·  painel: http://localhost:3000/admin
npm test                    # 28 testes automáticos (anonimato, pagamentos, filtros, permissões…)
```

No primeiro arranque a base de dados é criada com **dados de exemplo** (marcados como "Exemplo").
Substitua-os pelos reais no painel, ou apague-os em **Definições → Apagar dados de exemplo**.

## Pôr online e instalar no telemóvel

Siga **[docs/ALOJAMENTO.md](docs/ALOJAMENTO.md)**: tem o passo a passo, sem precisar de saber programar.

## Activar serviços externos (opcional)

| Serviço | Como activar | Sem activar |
|---|---|---|
| Tradução automática | `DEEPL_API_KEY` ou `LIBRETRANSLATE_URL` no `.env` | Abre o Baidu Translate e mostra frases prontas |
| Avisos por WhatsApp | `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_ID` (WhatsApp Business da Meta) | Ficam registados; a equipa usa o botão WhatsApp do painel |
| Pagamentos reais | Contrato com os operadores de cada país (M-Pesa, Multicaixa Express, Pix, MB WAY…) e um processador de cartões; implementar em `server/api.js` (função `payOrder`) e `PAYMENTS_MODE=live` | Modo de teste: tudo é simulado |
| Voz dentro da China | `STT_URL` (Whisper próprio) ou `OPENAI_API_KEY` | Usa o reconhecimento do telefone (no Android não funciona na China sem VPN) |
| Identificar fotografias | `VISION_URL` + `VISION_API_KEY` + `VISION_MODEL` (OpenAI, Qwen-VL, Claude…) ou `OPENAI_API_KEY` | A fotografia segue para a equipa, que responde |
| Rastreio automático | `TRACKING_WEBHOOK_TOKEN` + um serviço de rastreio de contentores que envie as etapas | A equipa regista as etapas no painel (1 minuto por etapa) |
| Mapa na China | `MAP_TILES` com um serviço de mosaicos acessível na China | OpenStreetMap (pode ser lento na China) |

## Versão de demonstração (sem alojamento)

`demo/` gera um único ficheiro HTML com a app, o painel e o próprio servidor a correr dentro do navegador
(base de dados SQLite guardada no telemóvel, dados de exemplo e conta de demonstração):

```bash
cd demo && npm install && node build.mjs     # cria demo/dist/ponte-demo.html
```

Na demonstração não há microfone, os mapas mostram só o contorno dos continentes e os dados ficam apenas nesse aparelho.

## Estrutura

```
server/            servidor (Node.js, sem dependências)
  index.js         servidor HTTP e ficheiros estáticos
  api.js           todas as rotas da API
  db.js            base de dados SQLite e migrações
  catalog.js       mega filtro, facetas, compatibilidade e pesquisa por frase
  bot.js           assistente automático (perguntas frequentes)
  translate.js     tradução (DeepL / LibreTranslate)
  notify.js        avisos por WhatsApp
  stt.js           voz → texto no servidor (Whisper)
  tracking.js      rastreio: transportadoras, portos, rotas, posição e atrasos
  vision.js        reconhecimento visual de fotografias
  seed.js          dados iniciais e de exemplo
public/            app do cliente (index.html) e painel (admin.html)
  js/screens/      ecrãs da app (vision.js = identificar por fotografia)
  js/voice.js      ditado, comandos e leitura em voz alta
  js/countries.js  países lusófonos: moeda, portos, pagamentos, alfândega, indicativos
  js/pay.js        escolha do meio de pagamento conforme o país
  js/voice-commands.js  interpretação dos comandos de voz
  sw.js            modo offline
i18n/              tabelas de tradução (editar e correr `python3 i18n/build.py`)
test/              testes automáticos
demo/              versão de demonstração num só ficheiro HTML
```

## Cópias de segurança

Toda a informação está na pasta definida em `DATA_DIR` (ficheiro `ponte.db` e pasta `uploads`).
Copie essa pasta regularmente. No painel, cada secção também exporta CSV.

## Limitações desta versão

- Os pagamentos estão em modo de teste até haver contrato com os operadores.
- As notificações no telemóvel são dentro da app (e por WhatsApp quando activado); notificações push com a app fechada ficam para a próxima fase.
- Os conteúdos (nomes de produtos, descrições, perguntas do assistente) estão em português e inglês; a interface está nos 6 idiomas.
- Os meios de pagamento de cada país estão prontos na app, mas cada um exige contrato com o operador antes de cobrar a sério.
- Os endereços de rastreio das transportadoras e as taxas de IVA indicadas são de referência: confirme-os periodicamente.
- As datas das feiras e dos feriados de 2027 são previsões: confirme e actualize no painel.
- Antes de abrir ao público, peça a um programador uma revisão de segurança e defina os termos de utilização e de privacidade.
