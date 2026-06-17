// ============================================================
//  drive.js (front) — conecta o Google Drive do cliente.
//  Usa o fluxo de "code" (não o token curto), para que o backend
//  consiga um refresh token e mantenha a planilha sincronizada
//  mesmo com o cliente offline. O front nunca vê o refresh token.
//
//  Variáveis: VITE_GOOGLE_CLIENT_ID, VITE_BACKEND_URL
// ============================================================

const SCOPE = "https://www.googleapis.com/auth/drive.file";

function pedirCode() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2)
      return reject(new Error("Google ainda carregando, tente de novo."));
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: SCOPE,
      ux_mode: "popup",
      callback: (resp) => (resp.code ? resolve(resp.code) : reject(new Error("Permissão negada."))),
    });
    client.requestCode();
  });
}

// conecta: pega o code e manda pro backend
export async function conectarDrive(accessTokenSupabase) {
  const code = await pedirCode();
  const r = await fetch(`${import.meta.env.VITE_BACKEND_URL}/drive/conectar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessTokenSupabase}` },
    body: JSON.stringify({ code }),
  });
  const j = await r.json();
  if (j.erro) throw new Error(j.erro);
  return j.planilha_url;
}

// sincroniza lançamentos manuais feitos na tela
export async function sincronizarManual(accessTokenSupabase, linhas) {
  try {
    await fetch(`${import.meta.env.VITE_BACKEND_URL}/drive/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessTokenSupabase}` },
      body: JSON.stringify({ linhas }),
    });
  } catch (e) {
    // silencioso: se o Drive não estiver conectado, não quebra o fluxo
    console.warn("Drive sync skipped:", e.message);
  }
}
