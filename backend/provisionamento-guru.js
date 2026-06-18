// ============================================================
//  provisionamento-guru.js — porta de entrada (Meta Cloud API)
//  Quando o Digital Manager Guru aprova uma compra, cria a conta
//  do cliente no Supabase e manda o WhatsApp de boas-vindas com o
//  acesso. A planilha NÃO nasce aqui: ela é criada quando o cliente
//  conecta o Google no painel (no Drive dele), pra você nunca
//  precisar tocar nos dados financeiros dele.
//
//  Como o boas-vindas é uma mensagem iniciada pela empresa, a Meta
//  exige um TEMPLATE aprovado (crie um chamado "boas_vindas", em
//  pt_BR, com 4 variáveis no corpo: {{1}} nome, {{2}} login,
//  {{3}} senha, {{4}} link). Sugestão de corpo:
//    "Oi {{1}}! 🎉 Sua conta no Organize-C Finance está pronta.
//     Login: {{2}}  Senha: {{3}}
//     Acesse: {{4}}
//     Pra registrar um gasto ou venda, é só me mandar um áudio aqui. 💛"
//
//  Variáveis de ambiente:
//    GURU_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY
//    WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, GRAPH_VERSION
//    PAINEL_URL
//
//  Rode antes no Supabase (complementa a tabela clientes):
//    alter table clientes add column if not exists email text;
//    alter table clientes add column if not exists plano text;
//    alter table clientes add column if not exists status text default 'ativo';
//    alter table clientes add column if not exists planilha_url text;
// ============================================================

const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const {
  GURU_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_KEY,
  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, GRAPH_VERSION = "v21.0",
  PAINEL_URL = "https://organize-c.finance/login", PORT = 3001,
} = process.env;

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const app = express();
app.use(express.json({ limit: "5mb" }));

const soDigitos = (s) => (s || "").replace(/\D/g, "");
const senhaAleatoria = () => Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);

// boas-vindas via TEMPLATE (mensagem iniciada pela empresa)
async function enviarBoasVindas(to, nome, login, senha) {
  await fetch(`${GRAPH}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name: "boas_vindas", language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [
          { type: "text", text: nome },
          { type: "text", text: login },
          { type: "text", text: senha },
          { type: "text", text: PAINEL_URL },
        ] }],
      },
    }),
  });
}

app.post("/webhook/guru", async (req, res) => {
  res.sendStatus(200);
  try {
    const b = req.body;
    if (b.api_token !== GURU_TOKEN) return;           // valida origem
    if (b.webhook_type !== "transaction") return;

    const email = b.contact?.email;
    const nome = b.contact?.name || "Cliente";
    const telefone = b.contact?.phone_number
      ? soDigitos("55" + (b.contact.phone_local_code || "") + b.contact.phone_number)
      : null;

    if (["refunded", "chargeback", "canceled"].includes(b.status)) {
      if (email) await supabase.from("clientes").update({ status: "cancelado" }).eq("email", email);
      return;
    }
    if (b.status !== "approved" || !email) return;

    const dias = b.subscription?.charged_every_days || 0;
    const plano = dias >= 300 ? "anual" : dias > 0 ? "mensal" : "anual";

    const { data: existente } = await supabase.from("clientes").select("id").eq("email", email).maybeSingle();
    if (existente) {                                  // renovação: reativa em silêncio
      await supabase.from("clientes").update({ status: "ativo", plano }).eq("id", existente.id);
      return;
    }

    const senha = senhaAleatoria();
    const { data: user, error } = await supabase.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error) { console.error("createUser:", error.message); return; }

    await supabase.from("clientes").insert({
      id: user.user.id, nome, email, telefone, tipo: "empreendedor", plano, status: "ativo",
    });

    await enviarBoasVindas(telefone, nome.split(" ")[0], email, senha);
  } catch (e) {
    console.error("erro no provisionamento:", e);
  }
});

app.get("/", (_q, r) => r.send("Organize-C Finance — provisionamento online"));
app.listen(PORT, () => console.log(`provisionamento ouvindo na porta ${PORT}`));
