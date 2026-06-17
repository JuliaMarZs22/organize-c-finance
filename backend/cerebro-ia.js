// ============================================================
//  cerebro-ia.js — o "cérebro" do Organize-C Finance
//  Recebe a frase do cliente (texto, ou áudio já transcrito) e
//  devolve o lançamento estruturado, pronto pra gravar no banco.
//  Roda com GPT (gpt-4o-mini — barato e ótimo em português).
//  Funciona em Node, em função do n8n, ou em qualquer backend.
//  Variável de ambiente necessária: OPENAI_API_KEY
// ============================================================

const OPENAI_KEY = process.env.OPENAI_API_KEY;

const SYSTEM = `Você é um parser financeiro de um app brasileiro de gestão financeira.
Extraia a transação da frase do usuário e responda APENAS com um objeto JSON, sem markdown.
Formato exato: {"type":"entrada"|"saida","total":number,"installments":number,"category":string,"desc":string}.

Regras:
- "total" é o valor cheio da operação em reais. Ex.: "10 mil" = 10000; "30 reais" = 30; "1.200" = 1200.
- "installments" = número de parcelas (1 se for à vista). Para vendas parceladas no boleto/cartão, use o nº de parcelas.
- "category" curta em português. Use: Alimentação, Moradia, Transporte, Assinaturas, Lazer, Saúde, Pró-labore, Investimento, Vendas, Outros.
- Retirada de salário / "me paguei" / pró-labore => type "saida", category "Pró-labore".
- Investir / aplicar / reinvestir / reserva => type "saida", category "Investimento".
- Vender / receber / faturar / entrou => type "entrada".
- "desc" é uma descrição curta da operação.
- Se não houver valor claro, responda total = 0.`;

// 1) Interpreta a frase via GPT.
//    categoriasDoCliente: lista opcional das categorias que o cliente já criou,
//    pra IA reaproveitar (ex.: "Comida de Rua").
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

// 2) Transforma o resultado em linhas prontas pro banco.
//    "10 mil em 5x" vira 5 linhas de 2 mil, uma por mês.
//    Os nomes dos campos batem com a tabela "lancamentos" do schema SQL.
function montarLancamentos(p, clienteId, hoje = new Date()) {
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
      parcela_atual: p.installments > 1 ? i + 1 : null,
      parcela_total: p.installments > 1 ? p.installments : null,
      origem: "whatsapp",
    });
  }
  return linhas;
}

// 3) Texto que o bot devolve pra confirmar ANTES de salvar.
//    (a confirmação é o que mantém a base limpa quando o áudio erra)
function textoConfirmacao(p) {
  const fmt = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (p.installments > 1) {
    return `Anotei: *${p.installments} entradas de ${fmt(p.valorParcela)}*, uma por mês, em ${p.category}. Confirma? 👍`;
  }
  const tipo = p.type === "entrada" ? "Entrada" : "Saída";
  return `Registrei: *${tipo} de ${fmt(p.total)}* em ${p.category}. Confirma? 👍`;
}

module.exports = { interpretar, montarLancamentos, textoConfirmacao };

/* ---------------- exemplo de uso ----------------
(async () => {
  const p = await interpretar("vendi 10 mil parcelado em 5x no boleto");
  console.log(textoConfirmacao(p));
  // -> "Anotei: 5 entradas de R$ 2.000,00, uma por mês, em Vendas. Confirma? 👍"
  console.log(montarLancamentos(p, "uuid-do-cliente"));
})();
-------------------------------------------------- */
