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

async function enviarBoasVindas(to, nome, login, senha, env) {
  if (!to) return; // telefone opcional
  await fetch(`https://graph.facebook.com/${env.GRAPH_VERSION || "v21.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to, type: "template",
      template: {
        name: "boas_vindas", language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [
          { type: "text", text: nome },
          { type: "text", text: login },
          { type: "text", text: senha },
          { type: "text", text: env.PAINEL_URL || "https://organize-c-finance.pages.dev" },
        ]}],
      },
    }),
  });
}

// ── Provisionamento compartilhado ──────────────────────────────
async function provisionar({ email, nome, telefone, plano }, env) {
  const existente = await buscarClientePorEmail(email, env);
  if (existente) {
    // renovação: só reativa
    await atualizarStatus(email, "ativo", plano, env);
    return;
  }

  const senha = senhaAleatoria();
  const { user, error } = await criarUsuarioSupabase(email, senha, env);
  if (error) { console.error("createUser:", error); return; }

  await inserirCliente({ id: user.id, nome, email, telefone, plano }, env);
  await enviarBoasVindas(telefone, nome.split(" ")[0], email, senha, env);
}

// ── Handler Guru ───────────────────────────────────────────────
async function handleGuru(body, env) {
  if (body.api_token !== env.GURU_TOKEN) return;
  if (body.webhook_type !== "transaction") return;

  const email    = body.contact?.email;
  const nome     = body.contact?.name || "Cliente";
  // DDI 55 + DDD + número
  const telefone = body.contact?.phone_number
    ? soDigitos("55" + (body.contact.phone_local_code || "") + body.contact.phone_number)
    : null;

  if (["refunded", "chargeback", "canceled"].includes(body.status)) {
    if (email) await atualizarStatus(email, "cancelado", null, env);
    return;
  }
  if (body.status !== "approved" || !email) return;

  const dias  = body.subscription?.charged_every_days || 0;
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
export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Organize-C Finance — provisionamento online", { status: 200 });
    }

    const url  = new URL(request.url);
    const body = await request.json().catch(() => null);
    if (!body) return new Response("Bad Request", { status: 400 });

    if (url.pathname === "/webhook/guru") {
      await handleGuru(body, env);
      return new Response("OK", { status: 200 });
    }

    if (url.pathname === "/webhook/asaas") {
      await handleAsaas(body, env);
      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
};
