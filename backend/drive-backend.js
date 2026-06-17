// ============================================================
//  drive-backend.js — endpoints do Drive do cliente.
//  /drive/conectar : recebe o "code" do Google, cria a planilha
//                    no Drive do cliente e guarda o refresh token.
//  /drive/sync     : sincroniza lançamentos manuais feitos na tela.
//  Pode rodar como serviço próprio OU ter as rotas coladas no
//  webhook-whatsapp.js (mesmo app Express).
//
//  Variáveis de ambiente:
//    SUPABASE_URL, SUPABASE_SERVICE_KEY
//    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// ============================================================

const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { trocarCode, criarPlanilha, sincronizar } = require("./sheets-sync");

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, PORT = 3002 } = process.env;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(express.json());
// libera o front (Vercel) a chamar este backend
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "authorization, content-type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// identifica o cliente pelo token do Supabase que o front manda
async function clienteDoToken(req) {
  const jwt = (req.headers.authorization || "").replace("Bearer ", "");
  const { data } = await supabase.auth.getUser(jwt);
  return data?.user || null;
}

// CONECTAR: troca o code, cria a planilha e salva o refresh token
app.post("/drive/conectar", async (req, res) => {
  try {
    const user = await clienteDoToken(req);
    if (!user) return res.status(401).json({ erro: "não autorizado" });

    const tokens = await trocarCode(req.body.code);
    if (!tokens.refresh_token) return res.status(400).json({ erro: "Reautorize concedendo o acesso (sem refresh_token)." });

    const { data: perfil } = await supabase.from("clientes").select("nome").eq("id", user.id).maybeSingle();
    const { data: lanc } = await supabase.from("lancamentos")
      .select("data, tipo, categoria, descricao, valor").eq("cliente_id", user.id).order("data");

    const planilhaId = await criarPlanilha(tokens.access_token, perfil?.nome || "Cliente", lanc || []);
    const url = `https://docs.google.com/spreadsheets/d/${planilhaId}`;

    await supabase.from("google_creds").upsert({ cliente_id: user.id, refresh_token: tokens.refresh_token, planilha_id: planilhaId });
    await supabase.from("clientes").update({ planilha_url: url }).eq("id", user.id);
    res.json({ planilha_url: url });
  } catch (e) { console.error(e); res.status(500).json({ erro: "falhou ao conectar" }); }
});

// SYNC manual (chamado pelo front depois de um lançamento na tela)
app.post("/drive/sync", async (req, res) => {
  try {
    const user = await clienteDoToken(req);
    if (!user) return res.status(401).json({ erro: "não autorizado" });
    await sincronizar(supabase, user.id, req.body.linhas || []);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ erro: "falhou" }); }
});

app.get("/", (_q, r) => r.send("drive-backend online"));
app.listen(PORT, () => console.log(`drive-backend na porta ${PORT}`));
