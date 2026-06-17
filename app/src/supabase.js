import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/* ---------- AUTENTICAÇÃO ---------- */
export async function entrar(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  return { user: data?.user || null, error };
}
export async function sair() { await supabase.auth.signOut(); }
export async function usuarioAtual() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}
export async function ehAdmin(email) {
  const { data } = await supabase.from("admins").select("email").eq("email", email).maybeSingle();
  return !!data;
}

/* ---------- DADOS DO CLIENTE (RLS já limita ao próprio) ---------- */
export async function meuPerfil() {
  const { data } = await supabase.from("clientes").select("*").maybeSingle();
  return data;
}
export async function carregarLancamentos() {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, tipo, valor, categoria, descricao, data, fixa, parcela_atual, parcela_total")
    .order("data", { ascending: false });
  const txs = (data || []).map((r) => ({
    id: r.id, type: r.tipo, amount: Number(r.valor), category: r.categoria,
    desc: r.descricao, date: r.data, fixa: r.fixa,
    parcela: r.parcela_total ? `${r.parcela_atual}/${r.parcela_total}` : undefined,
  }));
  return { txs, error };
}
export async function inserirLancamentos(linhas, clienteId) {
  const comDono = linhas.map((l) => ({ ...l, cliente_id: clienteId, origem: "manual" }));
  const { error } = await supabase.from("lancamentos").insert(comDono);
  return { error };
}
export async function salvarPlanilhaUrl(url, clienteId) {
  await supabase.from("clientes").update({ planilha_url: url }).eq("id", clienteId);
}

/* ---------- ADMIN (requer a policy de admin no banco) ---------- */
export async function carregarClientes() {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, nome, telefone, email, plano, status, criado_em")
    .order("criado_em", { ascending: false });
  return { clientes: data || [], error };
}
