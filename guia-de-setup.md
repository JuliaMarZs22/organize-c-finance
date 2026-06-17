# Organize-C Finance — Guia de Setup (atualizado)

Passo a passo para colocar tudo no ar do zero até o teste de ponta a ponta.

## Estrutura do projeto

```
organize-c-finance/
├── guia-de-setup.md
├── banco-caixa-inteligente.sql      ← rode no Supabase (auto-suficiente)
├── landing/
│   └── organize-c-finance.html
├── backend/                         ← Railway (3 serviços separados)
│   ├── .env.example                 ← ← NOVO: todas as variáveis documentadas
│   ├── cerebro-ia.js
│   ├── webhook-whatsapp.js
│   ├── provisionamento-guru.js
│   ├── sheets-sync.js
│   ├── drive-backend.js
│   └── package.json
└── app/                             ← Vercel
    ├── .env.example                 ← credenciais já preenchidas
    └── src/ (App.jsx, supabase.js, drive.js, main.jsx)
```

---

## Passo 1 — Banco (Supabase)

1. Crie um projeto em **supabase.com**.
2. Em **SQL Editor**, cole e rode **todo** o `banco-caixa-inteligente.sql`.
   O arquivo é auto-suficiente: inclui clientes, categorias, despesas_fixas,
   lancamentos, google_creds, admins e todas as políticas RLS.
3. Descomente e rode a última linha do SQL trocando pelo seu e-mail admin:
   ```sql
   insert into admins (email) values ('seu@email.com');
   ```
4. Em **Settings → API**, as credenciais já estão no `.env.example` de ambos os lados.

---

## Passo 2 — Chaves de IA

- **OpenAI**: platform.openai.com → API keys → `OPENAI_API_KEY`
- **Groq**: console.groq.com → API Keys → `GROQ_API_KEY` (camada gratuita)

---

## Passo 3 — WhatsApp (Meta Cloud API)

1. Em **developers.facebook.com**, crie um app Business e adicione o produto WhatsApp.
2. Em **WhatsApp → Getting Started**, copie o **Phone Number ID** e gere um token permanente via System User.
3. Invente um `WHATSAPP_VERIFY_TOKEN` (qualquer string).
4. O webhook URL será: `https://seu-servico.up.railway.app/webhook`

---

## Passo 4 — Google Cloud (para planilha no Drive)

1. Acesse **console.cloud.google.com**.
2. Crie um projeto e ative **Google Sheets API** e **Google Drive API**.
3. Em **Credenciais → Criar → ID do cliente OAuth (Web)**:
   - Origens autorizadas: `https://organize-c.finance` (ou seu domínio Vercel)
   - URIs de redirecionamento: adicione `postmessage`
4. As credenciais (`GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET`) já estão nos `.env.example`.

---

## Passo 5 — Railway (backend)

Suba **3 serviços separados** (cada um roda um arquivo diferente):

| Serviço Railway     | Arquivo de entrada          | Porta padrão |
|---------------------|-----------------------------|--------------|
| whatsapp-webhook    | `webhook-whatsapp.js`       | 3000         |
| guru-provisionamento| `provisionamento-guru.js`   | 3001         |
| drive-backend       | `drive-backend.js`          | 3002         |

Em cada serviço, configure as variáveis do `backend/.env.example`.
No `drive-backend`, set `ALLOWED_ORIGIN` para o domínio do seu painel Vercel.

**Dica Railway**: em cada serviço, ajuste o **Start command**:
```
node webhook-whatsapp.js    # serviço 1
node provisionamento-guru.js # serviço 2
node drive-backend.js        # serviço 3
```

---

## Passo 6 — Vercel (frontend)

1. Importe o repositório no Vercel apontando para a pasta `app/`.
2. Em **Settings → Environment Variables**, cadastre as 4 variáveis do `app/.env.example`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_BACKEND_URL` ← URL do `drive-backend` na Railway

---

## Passo 7 — Digital Manager Guru

1. Em Guru, vá em **Integrações → Webhooks** e aponte para:
   `https://seu-guru-servico.up.railway.app/webhook/guru`
2. Copie o token e cole em `GURU_TOKEN` no serviço Railway.
3. Crie o template de WhatsApp chamado `boas_vindas` em pt_BR com 4 variáveis:
   ```
   Oi {{1}}! 🎉 Sua conta no Organize-C Finance está pronta.
   Login: {{2}}  Senha: {{3}}
   Acesse: {{4}}
   Pra registrar um gasto ou venda, é só me mandar um áudio aqui. 💛
   ```

---

## Fluxo de ponta a ponta (teste)

1. Insira um cliente manualmente no Supabase (tabela `clientes`).
2. Envie uma mensagem de WhatsApp para o número da API.
3. O webhook responde com uma confirmação.
4. Confirme com "sim" — o lançamento aparece no banco e na planilha.
5. Acesse `https://seu-painel.vercel.app` e faça login com as credenciais.

---

## Privacidade

O número de WhatsApp é um **endpoint de API** (Meta Cloud API oficial).
Não há inbox aberto — as mensagens chegam direto no servidor, são interpretadas e descartadas.
Os dados financeiros ficam no **Drive do próprio cliente** (só ele acessa).
Os `refresh_token` do Google ficam na tabela `google_creds` sem política RLS para usuários
(só a `service_role` do backend acessa — nunca o front).
