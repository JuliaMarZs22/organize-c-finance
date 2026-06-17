// ============================================================
//  cerebro-ia.js — interpreta a frase do cliente via GPT.
//  Variável de ambiente: OPENAI_API_KEY
// ============================================================

const OPENAI_KEY = process.env.OPENAI_API_KEY;

const SYSTEM = `Você é um parser financeiro de um app brasileiro de gestão financeira.
Extraia a transação da frase do usuário e responda APENAS com um objeto JSON, sem markdown.
Formato exato: {"type":"entrada"|"saida","total":number,"installments":number,"category":string,"desc":string}.

Regras:
- "total" é o valor cheio da operação em reais. Ex.: "10 mil" = 10000; "30 reais" = 30; "1.200" = 1200.
- "installments" = número de parcelas (1 se for à vista).
- "category" curta em português. Use: Alimentação, Moradia, Transporte, Assinaturas, Lazer, Saúde, Pró-labore, Investimento, Vendas, Outros.
- Retirada de salário / "me paguei" / pró-labore => type "saida", category "Pró-labore".
- Investir / aplicar / reinvestir / reserva => type "saida", category "Investimento".
- Vender / receber / faturar / entrou => type "entrada".
- "desc" é uma descrição curta da operação.
- Se não houver valor claro, responda total = 0.`;

async function interpretar(frase, categoriasDoCliente = []) {
  const hint = categoriasDoCliente.length
    ? ` O cliente já usa estas categorias: ${categoriasDoCliente.join(", ")}. Prefira uma delas quando fizer sentido.`
    : "";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM + hint },
        { role: "user", content: frase },
      ],
    }),
  });

  const data = await res.json();
  const j = JSON.parse(data.choices[0].message.content);
  const total = Number(j.total) || 0;
  const installments = Math.max(1, Number(j.installments) || 1);

  return {
    valid: total > 0,
    type: j.type === "entrada" ? "entrada" : "saida",
    total,
    installments,
    valorParcela: total / installments,
    category: j.category || "Outros",
    desc: j.desc || frase.trim(),
  };
}

function montarLancamentos(p, clienteId, hoje = new Date()) {
  // grupo_parcela: mesmo UUID em todas as parcelas da mesma venda
  const grupoParcela = p.installments > 1
    ? crypto.randomUUID()
    : null;

  const linhas = [];
  for (let i = 0; i < p.installments; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, Math.min(hoje.getDate(), 28));
    linhas.push({
      cliente_id: clienteId,
      tipo: p.type,
      valor: Number(p.valorParcela.toFixed(2)),
      categoria: p.category,
      descricao: p.installments > 1 ? `${p.desc} — parcela ${i + 1}/${p.installments}` : p.desc,
      data: d.toISOString().slice(0, 10),
      fixa: false,
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
  if (p.installments > 1) {
    return `Anotei: *${p.installments} entradas de ${fmt(p.valorParcela)}*, uma por mês, em ${p.category}. Confirma? 👍`;
  }
  const tipo = p.type === "entrada" ? "Entrada" : "Saída";
  return `Registrei: *${tipo} de ${fmt(p.total)}* em ${p.category}. Confirma? 👍`;
}

module.exports = { interpretar, montarLancamentos, textoConfirmacao };
