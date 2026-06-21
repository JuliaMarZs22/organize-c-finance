// ============================================================
//  Cloudflare Worker AGENDADO — assistente financeiro proativo
//  Crons (UTC): segunda 12h (9h BRT) = resumo semanal + cobrança + alerta
//               dia 1 12h = resumo mensal
//  Envia via templates aprovados na Meta (mensagem iniciada pela empresa).
// ============================================================

const fmt = (n) => "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function variacoesTelefone(tel) {
  const set = new Set([tel]);
  const m = /^55(\d{2})(\d{8,9})$/.exec(tel);
  if (m) { const ddd = m[1], r = m[2];
    if (r.length === 8) set.add(`55${ddd}9${r}`);
    if (r.length === 9 && r[0] === "9") set.add(`55${ddd}${r.slice(1)}`); }
  return [...set];
}

// trava anti-duplicado: garante 1 envio por cliente/rotina/dia mesmo se o cron disparar 2x
async function jaEnviadoHoje(env, rotina, clienteId) {
  if (!env.ENVIADOS) return false;
  const key = `${rotina}:${clienteId}:${hojeISO()}`;
  if (await env.ENVIADOS.get(key)) return true;
  await env.ENVIADOS.put(key, "1", { expirationTtl: 129600 }); // 36h
  return false;
}

async function enviarTemplate(to, templateName, params, env) {
  const body = {
    messaging_product: "whatsapp", to, type: "template",
    template: { name: templateName, language: { code: "pt_BR" },
      components: params.length ? [{ type: "body", parameters: params.map((t) => ({ type: "text", text: String(t) })) }] : [] },
  };
  for (const v of variacoesTelefone((to || "").replace(/\D/g, ""))) {
    const r = await fetch(`https://graph.facebook.com/${env.GRAPH_VERSION || "v21.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST", headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, to: v }),
    });
    const txt = await r.text();
    if (r.ok) return true;
    if (!txt.includes("131030") && !txt.includes("not in allowed")) { console.log("template falhou:", v, txt.slice(0, 200)); return false; }
  }
  return false;
}

async function clientesAtivos(env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/clientes?status=eq.ativo&telefone=not.is.null&select=id,nome,telefone,saldo_inicial,reserva_meses`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

async function lancamentosCliente(clienteId, env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/lancamentos?cliente_id=eq.${clienteId}&cancelado=eq.false&select=tipo,valor,categoria,subcategoria,descricao,pessoa,valor_pendente,data,fixa,lembrar_dias_antes&limit=600`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

async function despesasFixas(clienteId, env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/despesas_fixas?cliente_id=eq.${clienteId}&ativa=eq.true&select=valor`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  return (Array.isArray(rows) ? rows : []).reduce((s, d) => s + Number(d.valor), 0);
}

// resumo de um intervalo [de, ate] (datas ISO)
function resumir(lancs, de, ate) {
  let ent = 0, sai = 0; const itens = {};
  for (const t of lancs) {
    if (t.data < de || t.data > ate) continue;
    const v = Number(t.valor);
    if (t.tipo === "entrada") { ent += v; const k = t.subcategoria || t.categoria || "Outros"; itens[k] = (itens[k] || 0) + v; }
    else sai += v;
  }
  const top = Object.entries(itens).sort((a, b) => b[1] - a[1])[0];
  return { ent, sai, lucro: ent - sai, topNome: top ? top[0] : null, topValor: top ? top[1] : 0 };
}

const isoAdd = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const hojeISO = () => new Date().toISOString().slice(0, 10);
const PAINEL = (env) => env.PAINEL_URL || "https://organize-c-finance.pages.dev";

// ── Resumo semanal + cobrança + alerta ──
async function rotinaSemanal(env) {
  const clientes = await clientesAtivos(env);
  const de = isoAdd(-7), ate = hojeISO();
  for (const c of clientes) {
    if (await jaEnviadoHoje(env, "semanal", c.id)) continue;
    const nome = (c.nome || "").split(" ")[0] || "tudo bem";
    const lancs = await lancamentosCliente(c.id, env);

    // 1) resumo da semana (só manda se houve movimento)
    const r = resumir(lancs, de, ate);
    if (r.ent > 0 || r.sai > 0) {
      const destaque = r.topNome ? `${r.topNome} (${fmt(r.topValor)})` : "—";
      await enviarTemplate(c.telefone, "resumo_semanal", [nome, fmt(r.ent), fmt(r.sai), fmt(r.lucro), destaque, PAINEL(env)], env);
    }

    // 2) cobrança: pendências paradas há +7 dias
    const pend = lancs.filter((t) => Number(t.valor_pendente) > 0 && t.pessoa && t.data <= isoAdd(-7));
    if (pend.length) {
      const maior = pend.sort((a, b) => Number(b.valor_pendente) - Number(a.valor_pendente))[0];
      await enviarTemplate(c.telefone, "lembrete_cobranca", [nome, maior.pessoa, fmt(maior.valor_pendente)], env);
    }

    // 3) alerta de caixa descoberto
    const realizado = (arr, tipo) => arr.filter((t) => t.tipo === tipo && t.data <= hojeISO()).reduce((s, t) => s + Number(t.valor), 0);
    const caixa = Number(c.saldo_inicial || 0) + realizado(lancs, "entrada") - realizado(lancs, "saida");
    const fixo = await despesasFixas(c.id, env);
    if (fixo > 0 && caixa < fixo) {
      const msg = `Seu caixa atual (${fmt(caixa)}) está abaixo do seu custo fixo mensal (${fmt(fixo)}). Vale revisar gastos ou acelerar recebimentos.`;
      await enviarTemplate(c.telefone, "alerta_caixa", [nome, msg, PAINEL(env)], env);
    }
  }
}

// ── Resumo mensal (mês anterior) ──
async function rotinaMensal(env) {
  const clientes = await clientesAtivos(env);
  const hoje = new Date();
  const primeiroDesteMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const ini = new Date(primeiroDesteMes); ini.setMonth(ini.getMonth() - 1);
  const de = ini.toISOString().slice(0, 10);
  const ate = new Date(primeiroDesteMes.getTime() - 86400000).toISOString().slice(0, 10);
  for (const c of clientes) {
    if (await jaEnviadoHoje(env, "mensal", c.id)) continue;
    const nome = (c.nome || "").split(" ")[0] || "tudo bem";
    const lancs = await lancamentosCliente(c.id, env);
    const r = resumir(lancs, de, ate);
    if (r.ent > 0 || r.sai > 0) {
      const destaque = r.topNome ? `${r.topNome} (${fmt(r.topValor)})` : "—";
      await enviarTemplate(c.telefone, "resumo_mensal", [nome, fmt(r.ent), fmt(r.sai), fmt(r.lucro), destaque, PAINEL(env)], env);
    }
  }
}

// ── Alerta de vencimentos (diário) — contas a pagar e a receber a vencer ──
async function rotinaVencimentos(env) {
  const clientes = await clientesAtivos(env);
  const hoje = hojeISO();
  for (const c of clientes) {
    if (await jaEnviadoHoje(env, "vencimentos", c.id)) continue;
    const nome = (c.nome || "").split(" ")[0] || "tudo bem";
    const lancs = await lancamentosCliente(c.id, env);
    // itens FUTUROS (data > hoje), não cancelados; antecedência padrão 1 dia (ou lembrar_dias_antes)
    const avisos = [];
    for (const t of lancs) {
      if (!t.data || t.data <= hoje) continue;
      const dias = Math.round((new Date(t.data + "T12:00:00") - new Date(hoje + "T12:00:00")) / 86400000);
      const antec = Number(t.lembrar_dias_antes) > 0 ? Number(t.lembrar_dias_antes) : 1;
      if (dias !== antec) continue;
      const quando = dias === 1 ? "amanhã" : `em ${dias} dias`;
      const oque = t.subcategoria || t.descricao || t.categoria;
      if (t.tipo === "saida") avisos.push(`${oque} ${fmt(t.valor)} (vence ${quando})`);
      else avisos.push(`receber ${fmt(t.valor)}${t.pessoa ? " de " + t.pessoa : ""} (${quando})`);
    }
    // despesas fixas com dia de vencimento (avisa na véspera)
    const amanha = new Date(new Date(hoje + "T12:00:00").getTime() + 86400000);
    const diaAmanha = amanha.getDate();
    const dfr = await fetch(`${env.SUPABASE_URL}/rest/v1/despesas_fixas?cliente_id=eq.${c.id}&ativa=eq.true&dia_vencimento=not.is.null&select=nome,valor,dia_vencimento`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });
    for (const df of (await dfr.json() || [])) {
      if (Number(df.dia_vencimento) === diaAmanha) avisos.push(`${df.nome} ${fmt(df.valor)} (vence amanhã)`);
    }

    if (avisos.length) {
      const msg = `Vencimentos próximos: ${avisos.join("; ")}.`;
      await enviarTemplate(c.telefone, "alerta_caixa", [nome, msg, PAINEL(env)], env);
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "0 12 1 * *") ctx.waitUntil(rotinaMensal(env));
    else if (event.cron === "0 11 * * *") ctx.waitUntil(rotinaVencimentos(env));
    else ctx.waitUntil(rotinaSemanal(env));
  },
  // endpoint manual para testar (?rotina=semanal|mensal)
  async fetch(request, env) {
    const url = new URL(request.url);
    const rot = url.searchParams.get("rotina");
    if (rot === "semanal") { await rotinaSemanal(env); return new Response("rotina semanal executada"); }
    if (rot === "mensal") { await rotinaMensal(env); return new Response("rotina mensal executada"); }
    if (rot === "vencimentos") { await rotinaVencimentos(env); return new Response("rotina vencimentos executada"); }
    return new Response("Organize-C Finance — worker proativo online");
  },
};
