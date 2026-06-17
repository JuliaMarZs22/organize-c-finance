// ============================================================
//  webhook-whatsapp.js — fluxo do WhatsApp pela API OFICIAL da Meta
//  (WhatsApp Cloud API). O número é um endpoint de API, não um
//  app de conversa: as mensagens vão direto pro servidor, são
//  interpretadas pelo GPT e descartadas — ninguém abre um WhatsApp
//  pra ler as conversas.
//
//  Fluxo: recebe a mensagem -> se for áudio, transcreve (Groq) ->
//  GPT interpreta -> confirma no zap -> ao confirmar, grava no
//  Supabase e espelha na planilha do Drive do cliente.
//
//  Variáveis de ambiente:
//    WHATSAPP_TOKEN            (token permanente do System User na Meta)
//    WHATSAPP_PHONE_NUMBER_ID  (ID do número no WhatsApp Cloud API)
//    WHATSAPP_VERIFY_TOKEN     (você inventa; usado no handshake do webhook)
//    GRAPH_VERSION             (opcional, padrão v21.0)
//    GROQ_API_KEY              (transcrição)
//    OPENAI_API_KEY            (usado pelo cerebro-ia)
//    SUPABASE_URL, SUPABASE_SERVICE_KEY
//
//  Salve o telefone do cliente só com dígitos e DDI (ex.: 5571998123344).
// ============================================================

const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { interpretar, montarLancamentos, textoConfirmacao } = require("./cerebro-ia");
const { sincronizar } = require("./sheets-sync");

const {
  WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN,
  GRAPH_VERSION = "v21.0", GROQ_API_KEY,
  SUPABASE_URL, SUPABASE_SERVICE_KEY, PORT = 3000,
} = process.env;

const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const app = express();
app.use(express.json());

const pendentes = new Map();
const soDigitos = (s) => (s || "").replace(/\D/g, "");
const ehConfirmar = (t) => /\b(sim|confirma|confirmar|isso|pode|ok|1)\b/i.test(t) || /👍/.test(t);
const ehCancelar = (t) => /\b(n[ãa]o|cancela|errado|descarta|2)\b/i.test(t);

// --- enviar texto (resposta livre, válida na janela de 24h do cliente) ---
async function enviar(to, texto) {
  await fetch(`${GRAPH}/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: texto } }),
  });
}

// --- baixar o áudio (a Meta dá um media_id; pega a URL e o binário) ---
async function baixarAudio(mediaId) {
  const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
  const { url } = await meta.json();
  const bin = await fetch(url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } });
  return Buffer.from(await bin.arrayBuffer());
}

// --- transcrever (Groq Whisper) ---
async function transcrever(buf) {
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "audio/ogg" }), "audio.ogg");
  form.append("model", "whisper-large-v3");
  form.append("language", "pt");
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, body: form,
  });
  const j = await r.json();
  return (j.text || "").trim();
}

async function buscarCliente(telefone) {
  const { data } = await supabase.from("clientes").select("id, telefone").eq("telefone", telefone).maybeSingle();
  return data;
}

// ====== verificação do webhook (handshake exigido pela Meta) ======
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

// ====== recebimento das mensagens ======
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // a Meta exige 200 rápido
  try {
    const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return; // status de entrega/leitura etc.

    const telefone = soDigitos(msg.from);
    const cliente = await buscarCliente(telefone);
    if (!cliente) {
      await enviar(telefone, "Esse número ainda não está cadastrado no Organize-C Finance. Assine em organize-c.finance pra começar 💛");
      return;
    }

    // extrai o texto (de texto ou de áudio transcrito)
    let texto = "";
    if (msg.type === "text") texto = msg.text.body;
    else if (msg.type === "audio") texto = await transcrever(await baixarAudio(msg.audio.id));
    if (!texto) { await enviar(telefone, "Me manda um áudio ou um texto dizendo o que entrou ou saiu 🙂"); return; }

    // fluxo de confirmação
    if (pendentes.has(telefone)) {
      const p = pendentes.get(telefone);
      if (ehConfirmar(texto)) {
        const linhas = montarLancamentos(p, cliente.id);
        const { error } = await supabase.from("lancamentos").insert(linhas);
        if (!error) await sincronizar(supabase, cliente.id, linhas); // espelha na planilha do Drive
        pendentes.delete(telefone);
        await enviar(telefone, error ? "Ops, não consegui salvar agora. Tenta de novo?" : "Salvo! ✅ Já atualizei seu painel.");
        return;
      }
      if (ehCancelar(texto)) { pendentes.delete(telefone); await enviar(telefone, "Beleza, descartei esse. 👍"); return; }
      // se não foi confirmar nem cancelar, trata como novo lançamento
    }

    const p = await interpretar(texto);
    if (!p.valid) { await enviar(telefone, "Não peguei o valor. Tenta tipo: \"gastei 30 reais com almoço\" 😉"); return; }
    pendentes.set(telefone, p);
    await enviar(telefone, textoConfirmacao(p));
  } catch (e) {
    console.error("erro no webhook:", e);
  }
});

app.get("/", (_q, r) => r.send("Organize-C Finance — webhook (Meta Cloud API) online"));
app.listen(PORT, () => console.log(`webhook ouvindo na porta ${PORT}`));
