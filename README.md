# Organize-C Finance

Gestão financeira por WhatsApp para empreendedores e autônomos de renda irregular. O cliente manda um áudio ("vendi 10 mil em 5x", "gastei 30 no almoço"), a IA interpreta e organiza num dashboard e numa planilha no Drive dele.

## Por onde começar
👉 Abra o **`guia-de-setup.md`** — é o passo a passo completo, na ordem certa, do zero até o teste de ponta a ponta.

## O que tem aqui
- **`banco-caixa-inteligente.sql`** — o banco de dados (Supabase).
- **`landing/`** — a página de vendas (com os planos mensal e anual).
- **`backend/`** — os serviços Node (WhatsApp via Meta Cloud API, interpretação por GPT, provisionamento via Guru, sincronização da planilha). Sobe na Railway.
- **`app/`** — o painel do cliente + painel admin (React/Vite). Sobe na Vercel.

## Como as peças se ligam
1. Cliente compra na **landing** (checkout Guru).
2. O **provisionamento** cria a conta e manda o acesso por WhatsApp.
3. O cliente manda áudio → o **webhook** transcreve (Groq), interpreta (GPT), confirma e grava.
4. O dado aparece no **dashboard** e, se ele conectou o Google, na **planilha do Drive dele**.

Privacidade: o número do WhatsApp é API-only (ninguém abre conversa pra ler), e os dados financeiros ficam no Drive do cliente. Detalhes na seção "Privacidade" do guia.
