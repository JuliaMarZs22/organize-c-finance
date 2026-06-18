// drive.js — apenas sincronização silenciosa (Google Drive desativado temporariamente)

export async function sincronizarManual(accessTokenSupabase, linhas) {
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (!backendUrl || backendUrl.includes("placeholder")) return;
  try {
    await fetch(`${backendUrl}/drive/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessTokenSupabase}` },
      body: JSON.stringify({ linhas }),
    });
  } catch (e) {
    console.warn("Drive sync skipped:", e.message);
  }
}
