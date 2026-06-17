# Organize-C Finance — Guia de Setup

Passo a passo pra colocar tudo no ar. No fim, o ciclo completo funciona: alguém assina → recebe o WhatsApp → manda um áudio → o lançamento cai no banco e na planilha do Drive dele.

## Estrutura do projeto
```
organize-c-finance/
├── guia-de-setup.md                 ← este arquivo
├── banco-caixa-inteligente.sql      ← schema do banco
├── landing/
│   └── organize-c-finance.html      ← página de vendas
├── backend/                         ← serviços Node (Railway)
│   ├── cerebro-ia.js                ← interpreta a frase (GPT)
│   ├── webhook-whatsapp.js          ← recebe/responde no WhatsApp (Meta Cloud API)
│   ├── provisionamento-guru.js      ← cria a conta quando alguém compra
│   ├── sheets-sync.js               ← sincroniza a planilha do Drive
│   ├── drive-backend.js             ← conecta o Drive do cliente
│   └── package.json
└── app/                             ← painel do cliente + admin (Vercel)
    ├── index.html, package.json, vite.config.js, .env.example
    └── src/ (App.jsx, supabase.js, drive.js, main.jsx)
```

## Visão geral das peças

| Peça | Serviço | Pra quê |
|---|---|---|
| Banco | Supabase | clientes e lançamentos |
| IA (interpretar) | OpenAI (gpt-4o-mini) | "gastei 30" → lançamento |
| Transcrição | Groq (Whisper) | áudio → texto |
| WhatsApp | **Meta Cloud API (oficial)** | recebe e envia, sem inbox pra ler |
| Drive | Google Cloud | planilha no Drive do cliente |
| Servidores | Railway | rodam o `backend/` |
| Site/Painel | Vercel | landing + `app/` |
| Checkout | Digital Manager Guru | dispara o provisionamento |

---

## Passo 1 — Banco (Supabase)
1. Crie um projeto em **supabase.com**.
2. Em **SQL Editor**, rode todo o `banco-caixa-inteligente.sql`.
3. Rode também este bloco (complementos do provisionamento, tokens do Google e admin):
```sql
-- complementa a tabela clientes
alter table clientes add column if not exists email text;
alter table clientes add column if not exists plano text;
alter table clientes add column if not exists status text default 'ativo';
alter table clientes add column if not exists planilha_url text;

-- tokens do Google (TRANCADO: sem policy = só a service role acessa)
create table if not exists google_creds (
  cliente_id uuid primary key references clientes(id) on delete cascade,
  refresh_token text,
  planilha_id text
);
alter table google_creds enable row level security;

-- admins (quem enxerga todos os clientes)
create table if not exists admins (email text primary key);
alter table admins enable row level security;
create policy "cada um vê o próprio admin" on admins for select
  using (email = auth.jwt()->>'email');
insert into admins (email) values ('SEU-EMAIL-ADMIN@dominio.com');
create policy "admin lê todos os clientes" on clientes for select
  using (exists (select 1 from admins a where a.email = auth.jwt()->>'email'));
```
4. Em **Settings → API**, copie a **Project URL**, a **anon public** (pro front) e a **service_role** (pro backend — secreta).

---

## Passo 2 — Chaves de IA
- **OpenAI**: platform.openai.com → API keys → `OPENAI_API_KEY`. Adicione billing (gpt-4o-mini é baratíssimo).
- **Groq**: console.groq.com → API Keys → `GROQ_API_KEY` (tem camada gratuita).

---

## Passo 3 — WhatsApp (Meta Cloud API oficial)
O número vira um endpoint de API — não há um WhatsApp pra ninguém abrir e ler as conversas.

1. Em **developers.facebook.com**, crie um app (tipo Business) e adicione o produto **WhatsApp**.
2. Conecte/registre o número do produto. Anote o **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`).
3. Gere um **token permanente**: no **Business Manager → Usuários → Usuários do sistema**, crie um System User, dê acesso ao app de WhatsApp e gere um token (`WHATSAPP_TOKEN`). Não use o token temporário de 24h.
4. Configure o **Webhook**:
   - URL de callback: `https://SEU-SERVICO-WHATSAPP/webhook`
   - Token de verificação: invente um e use o mesmo em `WHATSAPP_VERIFY_TOKEN`.
   - Assine o campo **messages**.
5. **Verificação do WhatsApp Business** (com CNPJ) no Business Manager — leva alguns dias. É o requisito que garante o número oficial.
6. Crie o **template `boas_vindas`** (Gerenciador do WhatsApp → Modelos de mensagem), idioma **pt_BR**, com 4 variáveis no corpo. Sugestão:
   > Oi {{1}}! 🎉 Sua conta no Organize-C Finance está pronta.
   > Login: {{2}}  Senha: {{3}}
   > Acesse: {{4}}
   > Pra registrar um gasto ou venda, é só me mandar um áudio aqui. 💛
   > As respostas do bot (confirmação, "salvo!") são livres — só o boas-vindas precisa de template, porque parte de você.

---

## Passo 4 — Subir o backend (Railway)
Suba a pasta `backend/` num repositório. Na Railway, crie **três serviços** a partir dele:
- **whatsapp** → start `npm run whatsapp` → a URL dele vai no webhook da Meta (Passo 3.4)
- **provisionamento** → start `npm run provisionamento` → a URL dele vai no webhook do Guru (Passo 5)
- **drive** → start `npm run drive` → a URL dele vira o `VITE_BACKEND_URL` do app

Em cada serviço, preencha as variáveis (resumo no fim). Os três podem dividir as mesmas variáveis.

---

## Passo 5 — Checkout (Digital Manager Guru)
1. Pegue o **api_token** do Guru → `GURU_TOKEN`.
2. Configure o **Webhook de Transações** apontando pra `https://SEU-SERVICO-PROVISIONAMENTO/webhook/guru`.
3. **Importante:** deixe o **telefone/WhatsApp obrigatório** no checkout — é dele que sai o número pro boas-vindas.

---

## Passo 6 — Google (planilha no Drive do cliente)
1. No **Google Cloud Console**, crie um projeto e ative **Google Sheets API** e **Google Drive API**.
2. Configure a **tela de consentimento OAuth** (Externo) e publique.
3. Crie uma credencial **ID do cliente OAuth → Aplicativo da Web**:
   - **Origens JavaScript autorizadas**: a URL do app na Vercel (e `http://localhost:5173` pra testar).
4. Copie o **ID do cliente** (`VITE_GOOGLE_CLIENT_ID` no front e `GOOGLE_CLIENT_ID` no backend) e o **segredo** (`GOOGLE_CLIENT_SECRET` no backend).
> Escopo `drive.file`: o app só mexe na planilha que ele cria — o resto do Drive do cliente fica intocado.

---

## Passo 7 — App (Vercel)
1. Suba a pasta `app/` num repositório.
2. Na Vercel: **New Project → Import**. Framework **Vite** (detecta sozinho).
3. Em **Environment Variables**, cadastre: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_CLIENT_ID`, `VITE_BACKEND_URL` (a URL do serviço **drive**).
4. Deploy. Coloque a URL final nas Origens autorizadas do Google (Passo 6).
> Pra você acessar o **admin**, crie um usuário no Supabase (Authentication → Add user) com o e-mail que está na tabela `admins` e faça login normalmente.

---

## Passo 8 — Teste de ponta a ponta
1. Faça uma compra (real ou teste) num link de checkout → você recebe o **WhatsApp de boas-vindas**.
2. Confirme que o cliente apareceu na tabela `clientes`.
3. Mande um áudio pro número: *"gastei 30 reais com almoço"* → o bot pede confirmação.
4. Responda *"confirma"* → "Salvo! ✅".
5. Veja a linha nova na tabela `lancamentos`.
6. No painel, conecte o Google Drive → a planilha nasce no Drive do cliente. Mande outro áudio → a planilha atualiza sozinha.

---

## Variáveis de ambiente (resumo)

**Backend** (`backend/`)
| Variável | Onde pegar |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Supabase → Settings → API |
| `OPENAI_API_KEY` | platform.openai.com |
| `GROQ_API_KEY` | console.groq.com |
| `WHATSAPP_TOKEN` | Meta → System User (token permanente) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta → WhatsApp → número |
| `WHATSAPP_VERIFY_TOKEN` | você inventa (igual no webhook) |
| `GRAPH_VERSION` | opcional (padrão v21.0) |
| `GURU_TOKEN` | painel do Guru |
| `PAINEL_URL` | URL do seu painel de login |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud |

**Front** (`app/`)
| Variável | Onde pegar |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Supabase (anon public) |
| `VITE_GOOGLE_CLIENT_ID` | Google Cloud |
| `VITE_BACKEND_URL` | URL do serviço **drive** na Railway |

---

## Privacidade (a promessa que dá pra cumprir)
- O número é **API-only**: não existe um WhatsApp pra ninguém abrir e ler as conversas.
- O servidor processa a mensagem pra IA interpretar e **descarta** (não guarda o conteúdo bruto). Configure OpenAI/Groq sem retenção.
- A planilha vive **no Drive do cliente**; o refresh token fica trancado (tabela `google_creds`, só a service role).
- O painel admin só vê cadastro (nome, telefone, plano, status) — **não** os lançamentos.
> Promessa honesta: *"Seus dados ficam no seu Drive. Nosso sistema só escreve neles pra te servir, não mantemos cópia das suas conversas e ninguém abre suas finanças."*

## Custos
Por cliente ativo/mês, somando transcrição + IA + WhatsApp, fica em poucos reais — as conversas iniciadas pelo cliente são gratuitas na janela de 24h, e gpt-4o-mini + Groq custam frações de centavo por lançamento. Margem altíssima dentro da assinatura.
