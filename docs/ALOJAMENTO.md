# Pôr a Ponte online — passo a passo

A Ponte precisa de um servidor sempre ligado e de um endereço com **HTTPS** (o cadeado no navegador).
Sem HTTPS, o telefone não deixa instalar a app nem usar a localização e o microfone.

Há duas formas. Para o piloto com a Lara e alguns clientes, recomendo a **A**. Para quando houver clientes na China, a **B**.

---

## A) Render — a mais simples (sem instalar nada)

O Render é um serviço de alojamento que lê o código a partir do GitHub.

1. **Criar conta no GitHub** em github.com (gratuito).
2. **Criar um repositório privado** chamado `ponte-app` e carregar todos os ficheiros desta pasta
   (botão "Add file → Upload files"; arraste a pasta inteira, excepto `data` e `.env`).
3. **Criar conta no Render** em render.com, entrando com a conta do GitHub.
4. No Render: **New → Web Service** → escolha o repositório `ponte-app`.
   - Region: **Singapore** (mais perto da China e de Moçambique)
   - Runtime: **Docker** (o Render usa o `Dockerfile` incluído)
   - Plano: um plano pago básico. **O plano gratuito apaga os dados quando reinicia.**
5. Em **Disks**, adicione um disco: Mount path `/data`, 1 GB chega para começar.
6. Em **Environment**, acrescente as variáveis:
   - `ADMIN_EMAIL` = o email da Lara ou o seu
   - `ADMIN_PASSWORD` = uma palavra-passe forte
   - `SUPPORT_HOURS` = `9h–18h, hora da China`
7. Carregue em **Create Web Service**. Ao fim de alguns minutos fica com um endereço do tipo
   `https://ponte-app.onrender.com`.
8. (Opcional) Em **Settings → Custom Domain**, ligue um domínio seu, por exemplo `ponte.co.mz` ou `ponteapp.com`.

**Cada alteração ao código** carregada no GitHub é publicada automaticamente.

## B) Servidor próprio (VPS) em Hong Kong ou Singapura

É a melhor opção para quem usa a app dentro da China: fica mais rápido e com mais controlo.
Serve qualquer VPS Linux (Alibaba Cloud International, Tencent Cloud, DigitalOcean, Hetzner…) com 1 GB de RAM.

1. Compre um domínio e aponte-o (registo A) para o IP do servidor.
2. No servidor, instale o Docker (`curl -fsSL https://get.docker.com | sh`).
3. Copie esta pasta para o servidor, por exemplo para `/opt/ponte`.
4. Crie o ficheiro `.env` a partir do `.env.example` e acrescente uma linha `DOMAIN=o-seu-dominio.com`.
5. Arranque:
   ```bash
   cd /opt/ponte
   docker compose up -d --build
   ```
6. Abra `https://o-seu-dominio.com`. O certificado HTTPS é obtido automaticamente.

Cópias de segurança: copie a pasta `/opt/ponte/data` todos os dias (por exemplo, com um `cron` para outro servidor ou para a nuvem).

---

## Depois de estar online

1. Abra `https://o-seu-endereço/admin` e entre com o `ADMIN_EMAIL` e a `ADMIN_PASSWORD`.
2. Em **Definições**, mude a palavra-passe e actualize o câmbio.
3. Em **Clientes → Adicionar conta**, crie a conta da Lara (perfil "Equipa").
4. Carregue os fornecedores reais: **Fornecedores → Modelo CSV**, preencha no Excel, guarde como CSV e use **Importar CSV**.
   Faça o mesmo com os produtos e as fotografias.
5. Reveja as feiras, os feriados, as perguntas do assistente e os planos (preços).
6. Quando os dados reais estiverem carregados, use **Definições → Apagar dados de exemplo**.

## Instalar no telemóvel

- **Android (Chrome):** abra o endereço → aparece "Instalar a Ponte" no início, ou menu ⋮ → "Instalar app".
- **iPhone (Safari):** abra o endereço → botão Partilhar → "Adicionar ao ecrã principal".

Para enviar aos clientes: partilhe o endereço por WhatsApp. A instalação demora 10 segundos.

## Na China

- Teste a velocidade a partir da China com a Lara antes do lançamento.
- O mapa usa OpenStreetMap, que pode ser lento na China. Se for, mude `MAP_TILES` para um serviço acessível lá.
  As rotas abrem sempre no Amap, que funciona normalmente.
- A app não usa serviços Google, por isso funciona sem VPN.
- **Voz na China:** no Android, o ditado do telefone usa servidores Google e não funciona na China.
  Active o reconhecimento no servidor com `STT_URL` (um servidor Whisper próprio, ex.: faster-whisper)
  ou `OPENAI_API_KEY`. A app passa sozinha para o servidor quando o do telefone falha.
  No iPhone, o ditado do teclado (o microfone do teclado) funciona normalmente.
- **Identificar fotografias:** active com `VISION_URL`, `VISION_API_KEY` e `VISION_MODEL`. Para clientes na China,
  o Qwen-VL da Alibaba (`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`, modelo `qwen-vl-max`) é uma boa opção.
  Custo aproximado: alguns cêntimos de dólar por fotografia. Há um limite por cliente e por hora.

## Rastreio automático das transportadoras (opcional)

A equipa pode registar cada etapa no painel (Rastreio → envio → Registar etapa). Para que as etapas cheguem sozinhas,
contrate um serviço de rastreio de contentores que envie "webhooks", defina `TRACKING_WEBHOOK_TOKEN` e configure o envio para
`https://o-seu-endereço/api/tracking/webhook` com o cabeçalho `X-Ponte-Token`. O formato aceite está em `server/api.js`
(procure "tracking/webhook"): número do contentor, BL ou guia, e a lista de etapas com data e local.

## Experimentar sem alojamento

Há uma versão de demonstração num só ficheiro (`demo/`): abre no telemóvel por um link, com dados de exemplo, sem servidor.
Serve para mostrar a app a sócios e clientes. Para o piloto real, use o alojamento acima.

## Próximo passo: Play Store e App Store

Quando o piloto estiver validado, a mesma app pode ser publicada nas lojas com uma camada nativa (por exemplo, Capacitor).
São precisas as contas de programador da Google e da Apple, em nome da empresa.
