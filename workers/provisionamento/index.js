// ============================================================
//  Cloudflare Worker — provisionamento de clientes
//
//  POST /webhook/guru   — Digital Manager Guru (venda aprovada)
//  POST /webhook/asaas  — Asaas (pagamento confirmado / cancelado)
//
//  Ao aprovar: cria usuário no Supabase Auth + row em clientes +
//  envia WhatsApp de boas-vindas via template "boas_vindas".
// ============================================================

const soDigitos = (s) => (s || "").replace(/\D/g, "");

// gera senha alfanumérica de 8 chars
function senhaAleatoria() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => chars[b % chars.length])
    .join("");
}

async function criarUsuarioSupabase(email, senha, env) {
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: senha, email_confirm: true }),
  });
  const data = await r.json();
  return { user: data, error: data.msg || data.message || null };
}

async function inserirCliente({ id, nome, email, telefone, plano }, env) {
  const tel = telefone || null; // nullable após ALTER TABLE
  await fetch(`${env.SUPABASE_URL}/rest/v1/clientes`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ id, nome, email, telefone: tel, tipo: "empreendedor", plano, status: "ativo" }),
  });
}

async function atualizarStatus(email, status, plano, env) {
  const body = plano ? { status, plano } : { status };
  await fetch(`${env.SUPABASE_URL}/rest/v1/clientes?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

async function buscarClientePorEmail(email, env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/clientes?email=eq.${encodeURIComponent(email)}&select=id`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  return rows?.[0] || null;
}

// Gera um link de recuperação/definição de senha do Supabase para o cliente
async function gerarLinkAcesso(email, env) {
  const redirect = `${env.PAINEL_URL || "https://organize-c-finance.pages.dev"}/reset`;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "recovery", email, options: { redirect_to: redirect } }),
  });
  const j = await r.json();
  return j.action_link || j.properties?.action_link || redirect;
}

// Template "bem_vindo": {{1}} nome, {{2}} link para definir senha
async function enviarBoasVindas(to, nome, link, env) {
  if (!to) return; // telefone opcional
  const r = await fetch(`https://graph.facebook.com/${env.GRAPH_VERSION || "v21.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name: "bem_vindo", language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [
          { type: "text", text: nome },
          { type: "text", text: link },
        ]}],
      },
    }),
  });
  console.log("boas-vindas ->", to, r.status, await r.text());
}

// ── Provisionamento compartilhado ──────────────────────────────
async function provisionar({ email, nome, telefone, plano }, env) {
  const existente = await buscarClientePorEmail(email, env);
  if (existente) {
    // renovação: só reativa
    await atualizarStatus(email, "ativo", plano, env);
    return;
  }

  // cria usuário com senha aleatória (o cliente define a dele pelo link)
  const senha = senhaAleatoria();
  const { user, error } = await criarUsuarioSupabase(email, senha, env);
  if (error) { console.error("createUser:", error); return; }

  await inserirCliente({ id: user.id, nome, email, telefone, plano }, env);

  const link = await gerarLinkAcesso(email, env);
  await enviarBoasVindas(telefone, nome.split(" ")[0], link, env);
}

// ── Handler Guru ───────────────────────────────────────────────
async function handleGuru(body, env) {
  console.log("GURU webhook:", JSON.stringify(body).slice(0, 3000));

  // valida o token (Guru envia em body.api_token); aceita match exato ou prefixo (uuid)
  const recebido = body.api_token || "";
  const esperado = env.GURU_TOKEN || "";
  const tokenOk = recebido === esperado || (recebido && esperado.startsWith(recebido)) || (recebido && recebido.startsWith(esperado.split("|")[0]));
  if (!tokenOk) {
    console.log("GURU token não confere. recebido(prefixo):", recebido.slice(0, 8), "| esperado(prefixo):", esperado.slice(0, 8));
    return;
  }
  // O Guru manda 2 formatos: "transaction" (venda avulsa) e "subscription" (assinatura).
  // Dados do cliente: contact (transação) ou subscriber (assinatura).
  const cli = body.contact || body.subscriber || body.last_transaction?.contact || {};
  const email = cli.email;
  const nome  = cli.name || "Cliente";
  // phone_local_code já é o DDI ("55"); phone_number já traz o DDD. Não prefixar outro 55.
  const telefone = cli.phone_number
    ? soDigitos((cli.phone_local_code || "55") + cli.phone_number)
    : null;

  // Status: transação usa body.status; assinatura usa last_status + current_invoice.status
  const statusTx  = (body.status || "").toLowerCase();
  const statusSub = (body.last_status || "").toLowerCase();
  const invoiceOk = (body.current_invoice?.status || "").toLowerCase() === "paid";
  console.log("GURU status tx:", statusTx, "| sub:", statusSub, "| invoicePaid:", invoiceOk, "| email:", email);

  const CANCELADOS = ["refunded", "chargeback", "canceled", "cancelled", "expired", "past_due", "unpaid"];
  const APROVADOS  = ["approved", "active", "paid", "trialing"];

  if (CANCELADOS.includes(statusTx) || CANCELADOS.includes(statusSub)) {
    if (email) await atualizarStatus(email, "cancelado", null, env);
    return;
  }

  const aprovado = APROVADOS.includes(statusTx) || APROVADOS.includes(statusSub) || invoiceOk;
  if (!aprovado || !email) { console.log("GURU: não aprovado ou sem email, ignorando."); return; }

  // plano pelo ciclo de cobrança (>= 300 dias = anual)
  const dias  = body.charged_every_days || body.subscription?.charged_every_days || 0;
  const plano = dias >= 300 ? "anual" : dias > 0 ? "mensal" : "anual";

  await provisionar({ email, nome, telefone, plano }, env);
}

// ── Handler Asaas ──────────────────────────────────────────────
async function handleAsaas(body, env) {
  // Asaas envia header asaas-access-token para validação
  // Aqui usamos o mesmo GURU_TOKEN como segredo de rota
  const evento = body.event;
  const payment = body.payment || {};

  const email    = payment.customer?.email || body.customer?.email;
  const nome     = payment.customer?.name  || body.customer?.name  || "Cliente";
  const telefone = payment.customer?.mobilePhone
    ? soDigitos(payment.customer.mobilePhone)
    : null;

  if (!email) return;

  // cancelamento / inadimplência
  if (["PAYMENT_DELETED", "PAYMENT_OVERDUE", "SUBSCRIPTION_DELETED"].includes(evento)) {
    await atualizarStatus(email, "cancelado", null, env);
    return;
  }

  // reativação por boleto/pix confirmado
  if (evento === "PAYMENT_RECEIVED" || evento === "PAYMENT_CONFIRMED") {
    const existente = await buscarClientePorEmail(email, env);
    if (existente) {
      await atualizarStatus(email, "ativo", null, env);
      return;
    }
    // novo cliente vindo direto do Asaas (sem Guru)
    await provisionar({ email, nome, telefone, plano: "mensal" }, env);
  }
}

// ── Export Worker ──────────────────────────────────────────────
// verifica se o token (JWT do usuário logado) é de um ADMIN. Retorna o email ou null.
async function ehAdminToken(token, env) {
  if (!token) return null;
  const ur = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!ur.ok) return null;
  const u = await ur.json();
  const email = u?.email; if (!email) return null;
  const ar = await fetch(`${env.SUPABASE_URL}/rest/v1/admins?email=eq.${encodeURIComponent(email)}&select=email`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
  const rows = await ar.json();
  return rows?.[0] ? email : null;
}

// cria um usuário manualmente (licença bônus). dias>0 => acesso_ate = hoje + dias; dias<=0 => ilimitado.
async function criarUsuarioAdmin({ email, nome, telefone, dias }, env) {
  const existente = await buscarClientePorEmail(email, env);
  if (existente) return { error: "Já existe um cliente com esse e-mail." };
  const senha = senhaAleatoria();
  const { user, error } = await criarUsuarioSupabase(email, senha, env);
  if (error || !user?.id) return { error: error || "Falha ao criar usuário." };
  const acessoAte = Number(dias) > 0 ? new Date(Date.now() + Number(dias) * 86400000).toISOString() : null;
  await fetch(`${env.SUPABASE_URL}/rest/v1/clientes`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ id: user.id, nome, email, telefone: telefone || null, tipo: "empreendedor", plano: "bonus", status: "ativo", acesso_ate: acessoAte }),
  });
  const link = await gerarLinkAcesso(email, env);
  return { link, acessoAte };
}

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" };

export default {
  async fetch(request, env) {
    const url0 = new URL(request.url);
    // ── endpoint admin: criar usuário bônus (chamado pelo painel, com JWT do admin) ──
    if (url0.pathname === "/admin/criar") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      const token = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
      const adminEmail = await ehAdminToken(token, env);
      if (!adminEmail) return new Response(JSON.stringify({ error: "não autorizado" }), { status: 403, headers: { ...CORS, "Content-Type": "application/json" } });
      const b = await request.json().catch(() => null);
      if (!b?.email || !b?.nome) return new Response(JSON.stringify({ error: "e-mail e nome são obrigatórios" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });
      const res = await criarUsuarioAdmin({ email: b.email.trim().toLowerCase(), nome: b.nome.trim(), telefone: (b.telefone || "").replace(/\D/g, "") || null, dias: b.dias }, env);
      const status = res.error ? 400 : 200;
      return new Response(JSON.stringify(res), { status, headers: { ...CORS, "Content-Type": "application/json" } });
    }

    if (request.method !== "POST") {
      return new Response("Organize-C Finance — provisionamento online", { status: 200 });
    }

    const url  = new URL(request.url);
    const body = await request.json().catch(() => null);
    if (!body) return new Response("Bad Request", { status: 400 });

    // DEBUG: grava todo webhook recebido no Supabase (independe do tail)
    try {
      await fetch(`${env.SUPABASE_URL}/rest/v1/webhook_debug`, {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({ path: url.pathname, corpo: body }),
      });
    } catch (_) {}

    // Roteamento por path explícito OU por formato do payload (robusto a qualquer URL)
    const ehGuru  = url.pathname.includes("guru")  || body.webhook_type !== undefined || body.api_token !== undefined;
    const ehAsaas = url.pathname.includes("asaas") || (body.event !== undefined && body.payment !== undefined);

    if (ehAsaas && !body.webhook_type) {
      await handleAsaas(body, env);
      return new Response("OK", { status: 200 });
    }
    if (ehGuru) {
      await handleGuru(body, env);
      return new Response("OK", { status: 200 });
    }

    console.log("Webhook não reconhecido:", url.pathname, JSON.stringify(body).slice(0, 200));
    return new Response("OK", { status: 200 });
  },
};
