// ============================================================
//  Cloudflare Worker — webhook WhatsApp (Meta Cloud API)
//  Fluxo: recebe msg → transcreve áudio (Groq ou OpenAI) →
//  GPT interpreta → confirma no WPP → grava no Supabase
// ============================================================

const soDigitos = (s) => (s || "").replace(/\D/g, "");
const ehConfirmar = (t) => /\b(sim|confirma|confirmar|isso|pode|ok|1)\b/i.test(t) || /👍/.test(t);
const ehCancelar  = (t) => /\b(n[ãa]o|cancela|errado|descarta|2)\b/i.test(t);

// Estado de confirmação persistido no KV (Workers são stateless).
// Cada lançamento pendente expira em 1h.
const pendKey = (tel) => `pend:${tel}`;
async function pendGet(env, tel) {
  const v = await env.PENDENTES.get(pendKey(tel));
  return v ? JSON.parse(v) : null;
}
async function pendSet(env, tel, p) {
  await env.PENDENTES.put(pendKey(tel), JSON.stringify(p), { expirationTtl: 3600 });
}
async function pendDel(env, tel) {
  await env.PENDENTES.delete(pendKey(tel));
}

async function enviarPara(to, texto, env) {
  const r = await fetch(`https://graph.facebook.com/${env.GRAPH_VERSION || "v21.0"}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }),
  });
  const j = await r.text();
  console.log("ENVIAR ->", to, "status", r.status, "resp:", j);
  return { ok: r.ok, body: j };
}

// Tenta enviar; se o número não estiver na lista permitida (modo teste) ou
// formato BR divergir, tenta as variações com/sem o 9º dígito.
async function enviar(to, texto, env) {
  for (const v of variacoesTelefone(soDigitos(to))) {
    const { ok, body } = await enviarPara(v, texto, env);
    if (ok) return true;
    // só vale tentar outra variação se o erro foi "número não permitido"
    if (!body.includes("131030") && !body.includes("not in allowed")) return false;
  }
  return false;
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
  const hojeISO = new Date().toISOString().slice(0, 10);
  const SYSTEM = `Você é o cérebro de um assistente financeiro brasileiro para empreendedores e autônomos.
HOJE é ${hojeISO}. Use isso para resolver datas relativas.
Primeiro identifique a INTENÇÃO da mensagem e responda APENAS com JSON, sem markdown.

Formato: {"intencao":"registrar"|"quitar"|"consulta"|"cancelar"|"editar"|"lembrete"|"cancelar_lembrete"|"emprestimo","type":"entrada"|"saida","total":number,"installments":number,"category":string,"subcategoria":string,"negocio":string,"desc":string,"pessoa":string,"pendente":number,"data":string,"edit":object,"lembrete":object,"lembrete_busca":string,"emprestimo":object}.

INTENÇÃO:
- "registrar": a pessoa está lançando uma entrada ou saída (ex.: "recebi 300 da Grasiele", "investi 200 em tráfego", "paguei 500 pro influencer", "recebi meu salário de 3000").
- "quitar": a pessoa diz que alguém QUITOU/PAGOU o que devia, sem dar valor (ex.: "a Grasiele quitou", "o João me pagou tudo"). Preencha "pessoa", total 0.
- "cancelar": a pessoa diz que uma venda/compra foi CANCELADA, ESTORNADA ou que houve PEDIDO DE DINHEIRO DE VOLTA/REEMBOLSO. Preencha "type" (entrada=venda cancelada, saida=compra cancelada), "pessoa" se houver, "total" o valor se mencionado.
- "editar": a pessoa quer CORRIGIR/ALTERAR o ÚLTIMO lançamento (ex.: "não, era 500 não 50", "corrige pra gasolina", "muda a categoria pra saúde", "na verdade foi ontem", "o nome era Ana"). Preencha o objeto "edit" só com os campos a mudar: {"valor":number, "category":string, "subcategoria":string, "desc":string, "pessoa":string, "data":"YYYY-MM-DD", "type":"entrada"|"saida"}. Inclua APENAS os campos que a pessoa pediu para mudar; omita o resto.
- "consulta": a pessoa está PERGUNTANDO/PEDINDO algo sobre as finanças dela (ex.: "quanto vendi essa semana?", "meu resumo da semana", "qual produto vendeu mais?", "quanto investi em tráfego?", "qual meu lucro?", "como tá meu caixa?", "quem tá me devendo?", "minhas cobranças", "como estou?"). Nesse caso só "intencao":"consulta" importa.
- "lembrete": a pessoa quer ser LEMBRADA de algo (remédio, tarefa, compromisso, ligar pra alguém, etc.). Ex.: "me lembra de tomar o remédio todo dia às 8h", "me lembra de ligar pro fornecedor amanhã 14h", "todo dia 8h e 20h tomar remédio", "me avisa segunda 9h da reunião". Preencha o objeto "lembrete": {"texto":"o que lembrar (curto)","horario":"HH:MM 24h","recorrencia":"once"|"diario"|"semanal"|"mensal","data":"YYYY-MM-DD se for once/data específica, senão null","dia_semana":0a6 (0=domingo) se semanal senão null,"dia_mes":1a31 se mensal senão null}. Se a pessoa der vários horários, crie um por horário (mas aqui retorne o primeiro; o sistema repete). Se não disser horário, use "09:00".
- "cancelar_lembrete": a pessoa quer PARAR um lembrete (ex.: "para de me lembrar do remédio", "cancela o lembrete da academia"). Preencha "lembrete_busca" com palavras-chave do lembrete.
- "emprestimo": a pessoa pegou um EMPRÉSTIMO/FINANCIAMENTO ou parcelou para ter dinheiro (ex.: "peguei 4647 emprestado no cartão e vou pagar 5x de 1000", "fiz um empréstimo de 10 mil, 10 parcelas de 1200", "antecipei recebíveis"). Preencha "emprestimo": {"recebido":number (quanto ENTROU no caixa agora),"parcelas":number,"valorParcela":number (valor de CADA parcela a pagar),"desc":"origem (ex: Cartão de crédito, Banco X)"}. Se a pessoa der o total a pagar em vez do valor da parcela, calcule valorParcela = total/parcelas.

Campos para registrar/quitar:
- "category": bucket amplo. Para VENDAS de serviço/produto use "Vendas". Para SALÁRIO/emprego fixo/renda fixa (quando a pessoa fala "salário", "meu salário", "recebi do trabalho") use "Salário". Para gastos com anúncios/influencer/divulgação use "Marketing". Outras: Alimentação, Moradia, Transporte, Saúde, Assinaturas, Lazer, Pró-labore, Investimento, Equipe, Insumos, Impostos, Outros.
- "subcategoria": SEMPRE preencha com o item EXATO que a pessoa falou, do jeito dela (ex.: "Gasolina", "Remédio dipirona", "Uber", "Mercado", "Harmonização facial", "Tráfego pago", "Influencer"). NÃO generalize: "gasolina" é "Gasolina" (não "Transporte"); "remédio X" é "Remédio X" (não "Saúde"). A categoria é só o balde amplo; a subcategoria é o que importa pro cliente. Só deixe "" se realmente não der pra identificar o item.
- "negocio": o NEGÓCIO/empresa a que esse lançamento pertence, se a pessoa mencionar (ex.: "vendi 500 na clínica" => "Clínica"; "gastei 200 na loja" => "Loja"; "tráfego do organize-c" => "Organize-C"). Empreendedores têm vários negócios. Se não mencionar nenhum negócio, "".
- "desc": descrição curta e fiel do que foi.
- "pessoa": nome de quem pagou/recebeu, se houver. Senão "".
- "pendente": valor que ainda falta receber/pagar dessa transação, se mencionado. Senão 0.
- "total": valor movimentado agora. Se for consulta ou não houver valor, 0.
- "data": data do lançamento no formato YYYY-MM-DD. Resolva relativo a HOJE (${hojeISO}): "ontem", "anteontem", "dia 5", "5 de junho", "semana passada", "10/07", "dia 10 do mês que vem", etc. Funciona para datas PASSADAS e FUTURAS. Se a pessoa não disser data, use ${hojeISO}.
- "lembrar_dias_antes": se a pessoa pedir um lembrete com antecedência específica (ex.: "me lembra 3 dias antes", "me avisa com 2 dias de antecedência"), coloque esse número (3, 2...). Senão 0.`;

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
  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(j.data || "") ? j.data : hojeISO;
  return { intencao: j.intencao || "registrar", valid: total > 0, type: j.type === "entrada" ? "entrada" : "saida", total, installments, valorParcela: total / installments, category: j.category || "Outros", subcategoria: (j.subcategoria || "").trim() || null, negocio: (j.negocio || "").trim() || null, desc: j.desc || frase.trim(), pessoa: (j.pessoa || "").trim() || null, pendente: Number(j.pendente) > 0 ? Number(j.pendente) : null, data: dataOk, lembrarDiasAntes: Number(j.lembrar_dias_antes) > 0 ? Math.min(30, Number(j.lembrar_dias_antes)) : null, edit: j.edit || null, lembrete: j.lembrete || null, lembreteBusca: (j.lembrete_busca || "").trim() || null, emprestimo: j.emprestimo || null };
}

// ─── Q&A: responde perguntas financeiras consultando os dados do cliente ───
async function responderConsulta(pergunta, clienteId, env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/lancamentos?cliente_id=eq.${clienteId}&cancelado=eq.false&select=tipo,valor,categoria,subcategoria,negocio,descricao,pessoa,valor_pendente,data&order=data.desc&limit=400`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) return "Ainda não tenho lançamentos seus para analisar. Comece registrando suas entradas e saídas que eu te ajudo a entender o negócio. 💛";

  // dados do cliente (saldo inicial) + custo fixo, para calcular caixa
  let saldoInicial = 0, custoFixo = 0;
  try {
    const cr = await fetch(`${env.SUPABASE_URL}/rest/v1/clientes?id=eq.${clienteId}&select=saldo_inicial,imposto_pct,prolabore_alvo`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
    const cli0 = (await cr.json())?.[0] || {}; saldoInicial = Number(cli0.saldo_inicial || 0); var impostoPct = Number(cli0.imposto_pct || 0), prolaboreAlvo = Number(cli0.prolabore_alvo || 0);
    const dr = await fetch(`${env.SUPABASE_URL}/rest/v1/despesas_fixas?cliente_id=eq.${clienteId}&ativa=eq.true&select=valor`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
    custoFixo = (await dr.json() || []).reduce((s, d) => s + Number(d.valor), 0);
  } catch (_) {}
  let metaFat = 0, metaLuc = 0;
  try {
    const mesAtual0 = new Date().toISOString().slice(0, 7);
    const mr = await fetch(`${env.SUPABASE_URL}/rest/v1/metas?cliente_id=eq.${clienteId}&mes=eq.${mesAtual0}&select=meta_faturamento,meta_lucro`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
    const mm = (await mr.json())?.[0]; metaFat = Number(mm?.meta_faturamento || 0); metaLuc = Number(mm?.meta_lucro || 0);
  } catch (_) {}

  const hoje = new Date(); const hojeI = hoje.toISOString().slice(0, 10); const mesAtual = hojeI.slice(0, 7);
  const seteDias = new Date(hoje.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const resumo = { hoje: hojeI, mesAtual, custoFixo, totalEntradas: 0, totalSaidas: 0, entradasMes: 0, saidasMes: 0, entradasSemana: 0, saidasSemana: 0, caixaAtual: saldoInicial, porSubcategoria: {}, porCategoria: {}, porNegocio: {}, pendentes: [] };
  for (const t of rows) {
    const v = Number(t.valor); const noMes = (t.data || "").slice(0, 7) === mesAtual; const naSemana = (t.data || "") >= seteDias && (t.data || "") <= hojeI; const realizado = (t.data || "") <= hojeI;
    if (t.tipo === "entrada") { resumo.totalEntradas += v; if (noMes) resumo.entradasMes += v; if (naSemana) resumo.entradasSemana += v; if (realizado) resumo.caixaAtual += v; }
    else { resumo.totalSaidas += v; if (noMes) resumo.saidasMes += v; if (naSemana) resumo.saidasSemana += v; if (realizado) resumo.caixaAtual -= v; }
    const sk = `${t.tipo}:${t.subcategoria || t.categoria || "Outros"}`;
    resumo.porSubcategoria[sk] = (resumo.porSubcategoria[sk] || 0) + v;
    const ck = `${t.tipo}:${t.categoria || "Outros"}`;
    resumo.porCategoria[ck] = (resumo.porCategoria[ck] || 0) + v;
    if (t.negocio) { const nk = `${t.tipo}:${t.negocio}`; resumo.porNegocio[nk] = (resumo.porNegocio[nk] || 0) + v; }
    if (Number(t.valor_pendente) > 0) resumo.pendentes.push({ pessoa: t.pessoa, desc: t.descricao, pendente: Number(t.valor_pendente) });
  }
  resumo.lucroTotal = resumo.totalEntradas - resumo.totalSaidas;
  resumo.lucroMes = resumo.entradasMes - resumo.saidasMes;
  resumo.lucroSemana = resumo.entradasSemana - resumo.saidasSemana;
  resumo.totalAReceber = resumo.pendentes.reduce((s, p) => s + p.pendente, 0);
  resumo.metaFaturamento = metaFat; resumo.metaLucro = metaLuc;
  try { resumo.impostoPct = impostoPct; resumo.reservaImpostoSugerida = resumo.entradasMes * impostoPct / 100; resumo.prolaboreAlvo = prolaboreAlvo; } catch (_) {}

  const ANALISTA = `Você é um assistente financeiro pessoal e consultor de negócios, falando por WhatsApp com um empreendedor brasileiro. Seja DIRETO, caloroso, máx ~7 linhas. Use os DADOS REAIS (R$) para responder.
Os dados trazem: caixaAtual, custoFixo (mensal), entradas/saídas/lucro do mês (Mes) e da última semana (Semana), totais gerais, pendentes (contas a receber) e totalAReceber, e quebra por produto/serviço (porSubcategoria) e categoria.
- Se perguntarem do "caixa": informe caixaAtual e, se houver custoFixo, diga por quantos meses/dias o caixa cobre o custo fixo.
- Se perguntarem da "semana": use entradasSemana/saidasSemana/lucroSemana.
- Se perguntarem "quem me deve / cobranças": liste os pendentes (pessoa + valor) e o totalAReceber.
- Se perguntarem o que mais vendeu: use porSubcategoria (entrada).
- Se a pessoa tiver vários negócios e perguntar por um ("quanto vendi na clínica?", "lucro da loja"): use porNegocio (formato "tipo:Negocio").
- Se houver metaFaturamento/metaLucro > 0 e perguntarem da "meta": compare com entradasMes/lucroMes, diga o % atingido e quanto falta.
- Se houver impostoPct > 0 e perguntarem de imposto/reserva: diga para reservar reservaImpostoSugerida (impostoPct% do que entrou no mês). Se prolaboreAlvo > 0 e perguntarem de pró-labore/retirada: informe o alvo e quanto já foi retirado.
Sempre que fizer sentido, dê 1 conselho prático (capacidade de investir, onde cortar, cobrar quem deve). Formate como R$ 1.234,56. Não invente números. Use *negrito* do WhatsApp.`;
  const rr = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0.4,
      messages: [
        { role: "system", content: ANALISTA },
        { role: "user", content: `DADOS (JSON):\n${JSON.stringify(resumo)}\n\nPERGUNTA: ${pergunta}` },
      ],
    }),
  });
  const data = await rr.json();
  return (data.choices?.[0]?.message?.content || "Não consegui analisar agora, tenta de novo? 🙂").trim();
}

// busca pendências em aberto de uma pessoa (valor_pendente > 0)
async function buscarPendencias(pessoa, clienteId, env) {
  const q = encodeURIComponent(`*${pessoa}*`);
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/lancamentos?cliente_id=eq.${clienteId}&pessoa=ilike.${q}&cancelado=eq.false&valor_pendente=gt.0&select=id,tipo,descricao,categoria,valor_pendente,pessoa`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

// ─── LEMBRETES ───
async function criarLembrete(l, clienteId, env) {
  const row = {
    cliente_id: clienteId, texto: l.texto || "lembrete",
    horario: /^\d{2}:\d{2}$/.test(l.horario || "") ? l.horario : "09:00",
    recorrencia: ["once", "diario", "semanal", "mensal"].includes(l.recorrencia) ? l.recorrencia : "diario",
    data: /^\d{4}-\d{2}-\d{2}$/.test(l.data || "") ? l.data : null,
    dia_semana: Number.isInteger(l.dia_semana) ? l.dia_semana : null,
    dia_mes: Number.isInteger(l.dia_mes) ? l.dia_mes : null,
  };
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/lembretes`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
  return { ok: r.ok, row };
}
async function listarLembretes(clienteId, env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/lembretes?cliente_id=eq.${clienteId}&ativo=eq.true&select=id,texto,horario,recorrencia,data,dia_semana,dia_mes&order=horario`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}
async function cancelarLembretes(busca, clienteId, env) {
  const lista = await listarLembretes(clienteId, env);
  const alvos = lista.filter((l) => (l.texto || "").toLowerCase().includes((busca || "").toLowerCase()));
  if (!alvos.length) return 0;
  await fetch(`${env.SUPABASE_URL}/rest/v1/lembretes?id=in.(${alvos.map((a) => a.id).join(",")})`, {
    method: "PATCH",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ ativo: false }),
  });
  return alvos.length;
}
function descreverRecorrencia(l) {
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  if (l.recorrencia === "diario") return `todo dia às ${l.horario}`;
  if (l.recorrencia === "semanal") return `toda ${dias[l.dia_semana] || "semana"} às ${l.horario}`;
  if (l.recorrencia === "mensal") return `todo dia ${l.dia_mes} às ${l.horario}`;
  return `${(l.data || "").split("-").reverse().join("/")} às ${l.horario}`;
}

// busca o último lançamento registrado do cliente (para editar)
async function ultimoLancamento(clienteId, env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/lancamentos?cliente_id=eq.${clienteId}&select=id,tipo,valor,categoria,subcategoria,descricao,pessoa,data&order=criado_em.desc&limit=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

// aplica edição a um lançamento
async function aplicarEdicao(id, campos, env) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/lancamentos?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(campos),
  });
}

// busca lançamentos ativos (não cancelados) para cancelar — por pessoa e/ou valor e tipo
async function buscarParaCancelar({ pessoa, total, type }, clienteId, env) {
  let url = `${env.SUPABASE_URL}/rest/v1/lancamentos?cliente_id=eq.${clienteId}&cancelado=eq.false&select=id,descricao,categoria,subcategoria,valor,pessoa,tipo&order=data.desc&limit=10`;
  if (type) url += `&tipo=eq.${type}`;
  if (pessoa) url += `&pessoa=ilike.${encodeURIComponent(`*${pessoa}*`)}`;
  if (total) url += `&valor=eq.${Number(total).toFixed(2)}`;
  const r = await fetch(url, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } });
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

// marca lançamentos como cancelados (mantém o registro, tira do somatório)
async function marcarCancelado(ids, env) {
  await fetch(`${env.SUPABASE_URL}/rest/v1/lancamentos?id=in.(${ids.join(",")})`, {
    method: "PATCH",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ cancelado: true }),
  });
}

// zera o valor_pendente dos lançamentos quitados
async function zerarPendencias(ids, env) {
  const inList = ids.join(",");
  await fetch(`${env.SUPABASE_URL}/rest/v1/lancamentos?id=in.(${inList})`, {
    method: "PATCH",
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ valor_pendente: 0 }),
  });
}

function montarLancamentos(p, clienteId) {
  const base = p.data ? new Date(p.data + "T12:00:00") : new Date();
  const grupoParcela = p.installments > 1 ? crypto.randomUUID() : null;
  const linhas = [];
  for (let i = 0; i < p.installments; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, Math.min(base.getDate(), 28));
    linhas.push({
      cliente_id: clienteId, tipo: p.type,
      valor: Number(p.valorParcela.toFixed(2)),
      categoria: p.category,
      subcategoria: p.subcategoria || null,
      negocio: p.negocio || null,
      descricao: p.installments > 1 ? `${p.desc} — parcela ${i + 1}/${p.installments}` : p.desc,
      data: d.toISOString().slice(0, 10), fixa: false,
      grupo_parcela: grupoParcela,
      parcela_atual: p.installments > 1 ? i + 1 : null,
      parcela_total: p.installments > 1 ? p.installments : null,
      pessoa: p.pessoa || null,
      valor_pendente: i === 0 ? (p.pendente || null) : null,
      lembrar_dias_antes: p.lembrarDiasAntes || null,
      origem: "whatsapp",
    });
  }
  return linhas;
}

function textoConfirmacao(p) {
  const fmt = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const cat = p.subcategoria ? `${p.subcategoria}` : p.category;
  const hojeISO = new Date().toISOString().slice(0, 10);
  const dataTxt = p.data && p.data !== hojeISO ? ` em ${p.data.split("-").reverse().join("/")}` : "";
  const negTxt = p.negocio ? ` · ${p.negocio}` : "";
  const extra = `${p.pessoa ? ` (${p.pessoa})` : ""}${negTxt}${p.pendente ? ` — falta ${p.type === "saida" ? "pagar" : "receber"} ${fmt(p.pendente)}` : ""}`;
  if (p.installments > 1) return `Anotei: *${p.installments} entradas de ${fmt(p.valorParcela)}*, uma por mês, em ${cat}${extra}. Confirma? 👍`;
  return `Registrei: *${p.type === "entrada" ? "Entrada" : "Saída"} de ${fmt(p.total)}*${dataTxt} em ${cat}${extra}. Confirma? 👍`;
}

// Gera variações do número BR: com e sem o 9º dígito do celular.
// Ex.: 557192868026 (wa_id) <-> 5571992868026 (formato cheio)
function variacoesTelefone(tel) {
  const set = new Set([tel]);
  const m = /^55(\d{2})(\d{8,9})$/.exec(tel);
  if (m) {
    const ddd = m[1], resto = m[2];
    if (resto.length === 8) set.add(`55${ddd}9${resto}`);       // adiciona o 9
    if (resto.length === 9 && resto[0] === "9") set.add(`55${ddd}${resto.slice(1)}`); // remove o 9
  }
  return [...set];
}

async function buscarCliente(telefone, env) {
  const vars = variacoesTelefone(telefone);
  const inList = vars.map((v) => `"${v}"`).join(",");
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/clientes?telefone=in.(${inList})&select=id,telefone`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });
  const rows = await r.json();
  return Array.isArray(rows) ? (rows[0] || null) : null;
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
  if (!r.ok) console.log("GRAVAR falhou:", r.status, (await r.text()).slice(0, 300));
  return r.ok;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ── GET /template-status — status do template bem_vindo (sem expor token) ──
    if (request.method === "GET" && url.pathname === "/template-status") {
      const waba = "874813105673936";
      const r = await fetch(`https://graph.facebook.com/v21.0/${waba}/message_templates?fields=name,status&limit=50`, {
        headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
      });
      const j = await r.json();
      const out = {};
      for (const x of (j.data || [])) out[x.name] = x.status;
      return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
    }

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
      ctx.waitUntil(processarMensagem(body, env));

      return new Response("OK", { status: 200 });
    }

    return new Response("Organize-C Finance — WhatsApp Worker online", { status: 200 });
  },
};

async function processarMensagem(body, env) {
  try {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    console.log("WEBHOOK value:", JSON.stringify(value));
    const msg = value?.messages?.[0];
    if (!msg) { console.log("Sem messages no payload (provavelmente status). Ignorando."); return; }

    const telefone = soDigitos(msg.from);
    console.log("Mensagem de:", telefone, "tipo:", msg.type);
    const cliente  = await buscarCliente(telefone, env);
    console.log("Cliente encontrado:", cliente ? cliente.id : "NENHUM");

    if (!cliente) {
      await enviar(telefone, "Esse número não está cadastrado no Organize-C Finance. Assine em organize-c.com/finance 💛", env);
      return;
    }

    let texto = "";
    if (msg.type === "text") texto = msg.text.body;
    else if (msg.type === "audio") texto = await transcrever(await baixarAudio(msg.audio.id, env), env);
    if (!texto) { await enviar(telefone, "Me manda um áudio ou texto dizendo o que entrou ou saiu 🙂", env); return; }

    const fmtBRL = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    // fluxo de confirmação (estado no KV)
    const pendente = await pendGet(env, telefone);
    if (pendente) {
      if (ehConfirmar(texto)) {
        if (pendente.tipo === "liquidacao") {
          // direção: se a pendência era saída (você devia), a quitação é SAÍDA; se entrada, ENTRADA
          const dir = pendente.dirSaida ? "saida" : "entrada";
          const linha = [{ cliente_id: cliente.id, tipo: dir, valor: Number(pendente.total.toFixed(2)), categoria: pendente.category || (dir === "saida" ? "Outros" : "Vendas"), descricao: `${dir === "saida" ? "Pagamento" : "Quitação"} — ${pendente.pessoa}`, data: new Date().toISOString().slice(0, 10), fixa: false, pessoa: pendente.pessoa, origem: "whatsapp" }];
          const ok = await gravarLancamentos(linha, env);
          if (ok) await zerarPendencias(pendente.ids, env);
          await pendDel(env, telefone);
          const verbo = dir === "saida" ? `Pagamento registrado! ✅ Saída de ${fmtBRL(pendente.total)} pra ${pendente.pessoa}` : `Quitação registrada! ✅ Entrada de ${fmtBRL(pendente.total)} de ${pendente.pessoa}`;
          await enviar(telefone, ok ? `${verbo}. Conta zerada.` : "Ops, não consegui salvar. Tenta de novo?", env);
          return;
        }
        if (pendente.tipo === "cancelamento") {
          await marcarCancelado(pendente.ids, env);
          await pendDel(env, telefone);
          await enviar(telefone, `Feito! ✅ ${pendente.label} marcada como *cancelada*. Tirei ${fmtBRL(pendente.total)} do somatório, mas o registro fica no histórico.`, env);
          return;
        }
        const linhas = montarLancamentos(pendente, cliente.id);
        const ok = await gravarLancamentos(linhas, env);
        await pendDel(env, telefone);
        await enviar(telefone, ok ? "Salvo! ✅ Já atualizei seu painel." : "Ops, não consegui salvar. Tenta de novo?", env);
        return;
      }
      if (ehCancelar(texto)) { await pendDel(env, telefone); await enviar(telefone, "Beleza, descartei. 👍", env); return; }
      // se não foi sim/não, cai abaixo e trata como novo lançamento
    }

    // menu de ajuda (oi, menu, ajuda) — descoberta das funções, sem custo de IA
    if (/^\s*(oi+|ol[áa]|menu|ajuda|help|come[çc]ar|in[íi]cio|comandos|o que (voc[êe]|tu) faz|como funciona)\s*[!?.]*\s*$/i.test(texto)) {
      await enviar(telefone, `Oi! 👋 Sou seu assistente do *Organize-C Finance*. Comigo você pode, por áudio ou texto:\n\n📥 *Registrar* — "recebi 300 da Ana pela harmonização" / "gastei 50 de gasolina" / "investi 200 em tráfego"\n📅 *Datas* — "ontem", "dia 5/06", "10/07 vou receber 1000"\n✅ *Quitação* — "a Ana quitou"\n❌ *Cancelar* — "a cliente cancelou e quer o dinheiro de volta"\n✏️ *Corrigir* — "era 500, não 50"\n\nE me *perguntar* quando quiser:\n📊 "meu resumo da semana"\n💰 "como tá meu caixa?"\n🔔 "quem tá me devendo?"\n🏆 "qual produto vendeu mais?"\n📈 "qual meu lucro esse mês?"\n\n🔔 E posso te *lembrar* de coisas:\n"me lembra de tomar o remédio todo dia às 8h"\n"me lembra de ligar pro fornecedor amanhã 14h"\n("meus lembretes" pra ver / "cancela o lembrete X")\n\nÉ só mandar! 💛`, env);
      return;
    }

    console.log("Texto interpretado:", texto);
    const p = await interpretar(texto, env);
    console.log("Resultado IA:", JSON.stringify(p));

    // ─── empréstimo/financiamento: entra no caixa + parcelas a pagar ───
    if (p.intencao === "emprestimo" && p.emprestimo) {
      const e = p.emprestimo;
      const recebido = Number(e.recebido) || 0;
      const parcelas = Math.max(1, Math.min(60, Number(e.parcelas) || 1));
      const vParc = Number(e.valorParcela) || 0;
      if (recebido <= 0 || vParc <= 0) { await enviar(telefone, "Me diz quanto entrou e o valor das parcelas. Ex: \"peguei 4647 emprestado, 5x de 1000\".", env); return; }
      const desc = (e.desc || "Empréstimo").trim();
      const hoje = new Date();
      const grupo = crypto.randomUUID();
      const linhas = [{ cliente_id: cliente.id, tipo: "entrada", valor: Number(recebido.toFixed(2)), categoria: "Empréstimo", subcategoria: desc, descricao: `Empréstimo — ${desc}`, data: hoje.toISOString().slice(0, 10), fixa: false, grupo_parcela: grupo, parcela_atual: null, parcela_total: null, origem: "whatsapp" }];
      for (let i = 0; i < parcelas; i++) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() + i + 1, Math.min(hoje.getDate(), 28));
        linhas.push({ cliente_id: cliente.id, tipo: "saida", valor: Number(vParc.toFixed(2)), categoria: "Empréstimo", subcategoria: desc, descricao: `Parcela ${i + 1}/${parcelas} — ${desc}`, data: d.toISOString().slice(0, 10), fixa: false, grupo_parcela: grupo, parcela_atual: i + 1, parcela_total: parcelas, origem: "whatsapp" });
      }
      const ok = await gravarLancamentos(linhas, env);
      const totalPagar = vParc * parcelas; const custo = totalPagar - recebido;
      await enviar(telefone, ok ? `Empréstimo anotado! 💵 Entrou *${fmtBRL(recebido)}* no caixa. Você vai pagar *${parcelas}x de ${fmtBRL(vParc)}* (total ${fmtBRL(totalPagar)}${custo > 0 ? `, custo de ${fmtBRL(custo)} em juros` : ""}). Não conto isso como lucro — é dívida. 👍` : "Ops, não consegui salvar. Tenta de novo?", env);
      return;
    }

    // ─── criar lembrete: "me lembra de tomar remédio todo dia às 8h" ───
    if (p.intencao === "lembrete" && p.lembrete) {
      const { ok, row } = await criarLembrete(p.lembrete, cliente.id, env);
      await enviar(telefone, ok ? `Pronto! 🔔 Vou te lembrar de *${row.texto}* ${descreverRecorrencia(row)}.` : "Ops, não consegui criar o lembrete. Tenta de novo?", env);
      return;
    }

    // ─── cancelar lembrete ───
    if (p.intencao === "cancelar_lembrete") {
      const n = await cancelarLembretes(p.lembreteBusca || "", cliente.id, env);
      await enviar(telefone, n > 0 ? `Ok, parei de te lembrar disso (${n} lembrete${n > 1 ? "s" : ""} cancelado${n > 1 ? "s" : ""}). 👍` : "Não achei um lembrete com esse nome. Manda \"meus lembretes\" pra ver os ativos.", env);
      return;
    }

    // ─── listar lembretes ───
    if (/^\s*(meus lembretes|quais.*lembrete|lembretes ativos|ver lembretes)\s*[?!.]*\s*$/i.test(texto)) {
      const ls = await listarLembretes(cliente.id, env);
      if (!ls.length) { await enviar(telefone, "Você não tem lembretes ativos. É só me pedir, ex.: \"me lembra de tomar remédio todo dia às 8h\". 🔔", env); return; }
      const lista = ls.map((l) => `🔔 ${l.texto} — ${descreverRecorrencia(l)}`).join("\n");
      await enviar(telefone, `Seus lembretes ativos:\n${lista}`, env);
      return;
    }

    // ─── consulta/pergunta: "quanto vendi esse mês?" ───
    if (p.intencao === "consulta") {
      const resposta = await responderConsulta(texto, cliente.id, env);
      await enviar(telefone, resposta, env);
      return;
    }

    // ─── editar/corrigir o último lançamento ───
    if (p.intencao === "editar") {
      const ult = await ultimoLancamento(cliente.id, env);
      if (!ult) { await enviar(telefone, "Não achei um lançamento recente para corrigir. Me manda de novo? 🙂", env); return; }
      const e = p.edit || {};
      const campos = {};
      if (Number(e.valor) > 0) campos.valor = Number(e.valor);
      if (e.category) campos.categoria = e.category;
      if (typeof e.subcategoria === "string") campos.subcategoria = e.subcategoria.trim() || null;
      if (e.desc) campos.descricao = e.desc;
      if (typeof e.pessoa === "string") campos.pessoa = e.pessoa.trim() || null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(e.data || "")) campos.data = e.data;
      if (e.type === "entrada" || e.type === "saida") campos.tipo = e.type;
      if (!Object.keys(campos).length) { await enviar(telefone, "Não entendi o que mudar. Ex.: \"era 500, não 50\" ou \"corrige pra gasolina\".", env); return; }
      await aplicarEdicao(ult.id, campos, env);
      const fmt2 = (n) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const resumoEd = Object.entries(campos).map(([k, v]) => `${k === "valor" ? "valor→" + fmt2(v) : k === "categoria" ? "categoria→" + v : k === "subcategoria" ? "item→" + (v || "—") : k === "descricao" ? "descrição→" + v : k === "pessoa" ? "pessoa→" + (v || "—") : k === "data" ? "data→" + v.split("-").reverse().join("/") : k === "tipo" ? "tipo→" + v : k}`).join(", ");
      await enviar(telefone, `Corrigido! ✅ Último lançamento atualizado (${resumoEd}).`, env);
      return;
    }

    // ─── cancelamento/estorno: "a Ana cancelou e quer o dinheiro de volta" ───
    if (p.intencao === "cancelar") {
      const achados = await buscarParaCancelar({ pessoa: p.pessoa, total: p.total, type: p.type }, cliente.id, env);
      if (!achados.length) { await enviar(telefone, `Não achei ${p.type === "saida" ? "uma compra" : "uma venda"} ativa${p.pessoa ? ` de *${p.pessoa}*` : ""}${p.total ? ` de ${fmtBRL(p.total)}` : ""} para cancelar. Pode me dar mais detalhes?`, env); return; }
      const alvo = achados[0]; // mais recente que casa
      const valor = Number(alvo.valor);
      const label = `${alvo.tipo === "entrada" ? "venda" : "compra"} de ${alvo.subcategoria || alvo.descricao || alvo.categoria}${alvo.pessoa ? ` (${alvo.pessoa})` : ""}`;
      await pendSet(env, telefone, { tipo: "cancelamento", ids: [alvo.id], total: valor, label });
      await enviar(telefone, `Quer cancelar a *${label}* de ${fmtBRL(valor)}? Vou tirar do somatório, mas manter o registro como cancelada. Confirma? 👍`, env);
      return;
    }

    // ─── quitação de pendência: "a Grasiele quitou" ───
    if (p.intencao === "quitar" && p.pessoa) {
      const pend = await buscarPendencias(p.pessoa, cliente.id, env);
      if (!pend.length) { await enviar(telefone, `Não achei nenhuma pendência em aberto de *${p.pessoa}*. Se quiser, me diga o valor que entrou.`, env); return; }
      const total = pend.reduce((s, r) => s + Number(r.valor_pendente), 0);
      const ids = pend.map((r) => r.id);
      const dirSaida = pend[0].tipo === "saida"; // pendência de saída = você devia
      await pendSet(env, telefone, { tipo: "liquidacao", pessoa: p.pessoa, total, ids, category: pend[0].categoria || (dirSaida ? "Outros" : "Vendas"), dirSaida });
      const txt = dirSaida ? `Você tinha ${fmtBRL(total)} a pagar pra *${p.pessoa}*. Registrar o pagamento (saída) agora e zerar? 👍` : `*${p.pessoa}* tinha ${fmtBRL(total)} a receber. Registrar a entrada agora e zerar a conta? 👍`;
      await enviar(telefone, txt, env);
      return;
    }

    if (!p.valid) { await enviar(telefone, "Não peguei o valor. Tenta: \"gastei 30 reais com almoço\" 😉", env); return; }
    await pendSet(env, telefone, { ...p, tipo: "lancamento" });
    await enviar(telefone, textoConfirmacao(p), env);
  } catch (e) {
    console.error("erro no webhook:", e && e.stack ? e.stack : String(e));
  }
}
