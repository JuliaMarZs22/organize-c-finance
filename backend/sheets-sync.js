// ============================================================
//  sheets-sync.js — mantém a planilha do cliente (no Drive dele)
//  sempre atualizada. Guarda um refresh_token por cliente e usa
//  ele pra escrever na planilha mesmo com o cliente offline.
//  Usado pelo backend (nunca pelo front).
//
//  Variáveis de ambiente:
//    GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
// ============================================================

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

// troca o "code" do OAuth pelos tokens (inclui o refresh_token que guardamos)
async function trocarCode(code) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: "postmessage", grant_type: "authorization_code",
    }),
  });
  return r.json(); // { access_token, refresh_token, ... }
}

// usa o refresh_token pra obter um access_token novo (válido ~1h)
async function tokenDeAcesso(refresh_token) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token, grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  return j.access_token;
}

// formata uma linha do lançamento (aceita os dois formatos: do banco ou do front)
const linha = (t) => [
  t.data || t.date,
  (t.tipo || t.type) === "entrada" ? "Entrada" : "Saída",
  t.categoria || t.category,
  t.descricao || t.desc,
  t.valor ?? t.amount,
];

// cria a planilha no Drive do cliente com cabeçalho + lançamentos atuais
async function criarPlanilha(access_token, nome, lancamentos = []) {
  const criar = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ properties: { title: `Organize-C Finance — ${nome}` } }),
  });
  const ss = await criar.json();
  const valores = [["Data", "Tipo", "Categoria", "Descrição", "Valor"], ...lancamentos.map(linha)];
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ss.spreadsheetId}/values/A1?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: valores }),
  });
  return ss.spreadsheetId;
}

// adiciona novas linhas no fim da planilha (o "continuous sync")
async function adicionarLinhas(access_token, planilhaId, linhas) {
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${planilhaId}/values/A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: linhas.map(linha) }),
  });
}

// ALTO NÍVEL: chamado depois de gravar lançamentos no banco.
// Se o cliente não conectou o Drive, simplesmente não faz nada.
async function sincronizar(supabase, clienteId, linhas) {
  const { data } = await supabase
    .from("google_creds")
    .select("refresh_token, planilha_id")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  if (!data?.refresh_token || !data?.planilha_id) return;
  const token = await tokenDeAcesso(data.refresh_token);
  if (token) await adicionarLinhas(token, data.planilha_id, linhas);
}

module.exports = { trocarCode, tokenDeAcesso, criarPlanilha, adicionarLinhas, sincronizar };
