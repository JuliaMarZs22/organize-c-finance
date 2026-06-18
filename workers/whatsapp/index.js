// ============================================================
//  Cloudflare Worker — webhook WhatsApp (Meta Cloud API)
//  Fluxo: recebe msg → transcreve áudio (Groq ou OpenAI) →
//  GPT interpreta → confirma no WPP → grava no Supabase
// ============================================================

const soDigitos = (s) => (s || "").replace(/\D/g, "");
const ehConfirmar = (t) => /\b(sim|confirma|confirmar|isso|pode|ok|1)\b/i.test(t) || /👍/.test(t);
const ehCancelar  = (t) => /\b(n[ãa]o|cancela|errado|descarta|2)\b/i.test(t);

// pendentes em memória (Workers são stateless — para produção use KV ou D1)
const pendentes = new Map();

async function enviar(to, texto, env) {
  await fetch(`https://graph.facebook.com/${env.GRAPH_VERSION || "v21.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }),
  });
}

async function baixarAudio(mediaId, env) {
  const meta = await fetch(`https://graph.facebook.com/${env.GRAPH_VERSION || "v21.0"}/${mediaId}`, {
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  });
  const { url } = await meta.json();
  const bin = await fetch(url, { headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` } });
  return bin.arrayBuffer();
}

async function transcrever(audioBuf, env) {
  const blob = new Blob([audioBuf], { type: "audio/ogg" });
  const form = new FormData();
  form.append("file", blob, "audio.ogg");
  form.append("language", "pt");

  if (env.GROQ_API_KEY) {
    form.append("model", "whisper-large-v3");
    const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` }, body: form,
    });
    const j = await r.json();
    return (j.text || "").trim();
  }

  form.append("model", "whisper-1");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form,
  });
  const j = await r.json();
  return (j.text || "").trim();
}

async function interpretar(frase, env) {
  const SYSTEM = `Você é um parser financeiro de um app brasileiro de gestão financeira.
Extraia a transação da frase e responda APENAS com JSON, sem markdown.
Formato: {"type":"entrada"|"saida","total":number,"installments":number,"category":string,"desc":string}.
Categorias: Alimentação, Moradia, Transporte, Assinaturas, Lazer, Saúde, Pró-labore, Investimento, Vendas, Outros.
Se não houver valor claro, total = 0.`;

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: frase }],
    }),
  });
  const data = await r.json();
  const j = JSON.parse(data.choices[0].message.content);
  const total = Number(j.total) || 0;
  const installments = Math.max(1, Number(j.installments) || 1);
  return { valid: total > 0, type: j.type === "entrada" ? "entrada" : "saida", total, installments, valorParcela: total / installments, category: j.category || "Outros", desc: j.desc || frase.trim() };
}

function montarLancamentos(p, clienteId) {
  const hoje = new Date();
  const grupoParcela = p.installments > 1 ? crypto.randomUUID() : null;
  const linhas = [];
  for (let i = 0; i < p.installments; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, Math.min(hoje.getDate(), 28));
    linhas.push({
      cliente_id: clienteId, tipo: p.type,
      valor: Number(p.valorParcela.toFixed(2)),
      categoria: p.category,
      descricao: p.installments > 1 ? `${p.desc} — parcela ${i + 1}/${p.installments}` : p.desc,
      data: d.toISOString().slice(0, 10), fixa: false,
      grupo_parcela: grupoParcela,
      parcela_atual: p.installments > 1 ? i + 1 : null,
      parcela_total: p.installments > 1 ? p.installments : null,
      origem: "whatsapp",
    });
  }
  return linhas;
}

function textoConfirmacao(p) {
  const fmt = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (p.installments > 1) return `Anotei: *${p.installments} entradas de ${fmt(p.valorParcela)}*, uma por mês, em ${p.category}. Confirma? 👍`;
  return `Registrei: *${p.type === "entrada" ? "Entrada" : "Saída"} de ${fmt(p.total)}* em ${p.category}. Confirma? 👍`;
}

async function buscarCliente(telefone, env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/clientes?telefone=eq.${telefone}&select=id,telefone`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  return rows?.[0] || null;
}

async function gravarLancamentos(linhas, env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/lancamentos`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json", Prefer: "return=minimal",
    },
    body: JSON.stringify(linhas),
  });
  return r.ok;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── GET /webhook — handshake da Meta ──
    if (request.method === "GET" && url.pathname === "/webhook") {
      const mode      = url.searchParams.get("hub.mode");
      const token     = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === env.WHATSAPP_VERIFY_TOKEN)
        return new Response(challenge, { status: 200 });
      return new Response("Forbidden", { status: 403 });
    }

    // ── POST /webhook — mensagens ──
    if (request.method === "POST" && url.pathname === "/webhook") {
      // responde 200 imediatamente (Meta exige < 5s)
      const body = await request.json().catch(() => null);

      // processa de forma assíncrona via waitUntil
      env.ctx?.waitUntil?.(processarMensagem(body, env));

      return new Response("OK", { status: 200 });
    }

    return new Response("Organize-C Finance — WhatsApp Worker online", { status: 200 });
  },
};

async function processarMensagem(body, env) {
  try {
    const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const telefone = soDigitos(msg.from);
    const cliente  = await buscarCliente(telefone, env);

    if (!cliente) {
      await enviar(telefone, "Esse número não está cadastrado no Organize-C Finance. Assine em organize-c.finance 💛", env);
      return;
    }

    let texto = "";
    if (msg.type === "text") texto = msg.text.body;
    else if (msg.type === "audio") texto = await transcrever(await baixarAudio(msg.audio.id, env), env);
    if (!texto) { await enviar(telefone, "Me manda um áudio ou texto dizendo o que entrou ou saiu 🙂", env); return; }

    // fluxo de confirmação
    if (pendentes.has(telefone)) {
      const p = pendentes.get(telefone);
      if (ehConfirmar(texto)) {
        const linhas = montarLancamentos(p, cliente.id);
        const ok = await gravarLancamentos(linhas, env);
        pendentes.delete(telefone);
        await enviar(telefone, ok ? "Salvo! ✅ Já atualizei seu painel." : "Ops, não consegui salvar. Tenta de novo?", env);
        return;
      }
      if (ehCancelar(texto)) { pendentes.delete(telefone); await enviar(telefone, "Beleza, descartei. 👍", env); return; }
    }

    const p = await interpretar(texto, env);
    if (!p.valid) { await enviar(telefone, "Não peguei o valor. Tenta: \"gastei 30 reais com almoço\" 😉", env); return; }
    pendentes.set(telefone, p);
    await enviar(telefone, textoConfirmacao(p), env);
  } catch (e) {
    console.error("erro no webhook:", e);
  }
}
