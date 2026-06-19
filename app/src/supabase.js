import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(
  SUPABASE_URL      || "https://placeholder.supabase.co",
  SUPABASE_ANON_KEY || "placeholder-key"
);
export const ENV_OK = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
export async function entrar(email, senha) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  return { user: data?.user || null, error };
}
export async function sair() { await supabase.auth.signOut(); }
export async function definirSenha(novaSenha) {
  const { error } = await supabase.auth.updateUser({ password: novaSenha });
  return { error };
}
export async function usuarioAtual() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}
export async function ehAdmin(email) {
  const { data } = await supabase.from("admins").select("email").eq("email", email).maybeSingle();
  return !!data;
}
export async function meuPerfil() {
  const { data } = await supabase.from("clientes").select("*").maybeSingle();
  return data;
}
export async function carregarLancamentos() {
  const { data, error } = await supabase
    .from("lancamentos")
    .select("id, tipo, valor, categoria, descricao, data, fixa, parcela_atual, parcela_total, pessoa, valor_pendente")
    .order("data", { ascending: false });
  const txs = (data || []).map((r) => ({
    id: r.id, type: r.tipo, amount: Number(r.valor),
    category: r.categoria, desc: r.descricao, date: r.data, fixa: r.fixa,
    pessoa: r.pessoa || "", pendente: r.valor_pendente ? Number(r.valor_pendente) : 0,
    parcela: r.parcela_total ? `${r.parcela_atual}/${r.parcela_total}` : undefined,
  }));
  return { txs, error };
}
export async function inserirLancamentos(linhas, clienteId) {
  const comDono = linhas.map((l) => ({ ...l, cliente_id: clienteId, origem: "manual" }));
  const { error } = await supabase.from("lancamentos").insert(comDono);
  return { error };
}
export async function carregarDespesasFixas() {
  const { data, error } = await supabase
    .from("despesas_fixas").select("id, nome, valor, ativa").eq("ativa", true).order("nome");
  return { despesas: data || [], error };
}
export async function inserirDespesaFixa(nome, valor) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Usuário não autenticado") };
  const { error } = await supabase.from("despesas_fixas").insert({ nome, valor, cliente_id: user.id });
  return { error };
}
export async function excluirDespesaFixa(id) {
  const { error } = await supabase.from("despesas_fixas").update({ ativa: false }).eq("id", id);
  return { error };
}
export async function salvarPlanilhaUrl(url, clienteId) {
  await supabase.from("clientes").update({ planilha_url: url }).eq("id", clienteId);
}
export async function atualizarSaldoInicial(valor) {
  const { error } = await supabase.from("clientes").update({ saldo_inicial: valor });
  return { error };
}
export async function carregarClientes() {
  const { data, error } = await supabase
    .from("clientes").select("id, nome, telefone, email, plano, status, criado_em")
    .order("criado_em", { ascending: false });
  return { clientes: data || [], error };
}
export async function atualizarCliente(id, campos) {
  const { error } = await supabase.from("clientes").update(campos).eq("id", id);
  return { error };
}
