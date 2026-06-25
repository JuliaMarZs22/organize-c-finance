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
    .select("id, tipo, valor, categoria, subcategoria, negocio, descricao, data, fixa, parcela_atual, parcela_total, pessoa, valor_pendente, cancelado")
    .order("data", { ascending: false });
  const txs = (data || []).map((r) => ({
    id: r.id, type: r.tipo, amount: Number(r.valor),
    category: r.categoria, sub: r.subcategoria || "", negocio: r.negocio || "", desc: r.descricao, date: r.data, fixa: r.fixa,
    pessoa: r.pessoa || "", pendente: r.valor_pendente ? Number(r.valor_pendente) : 0, cancelado: !!r.cancelado,
    parcela: r.parcela_total ? `${r.parcela_atual}/${r.parcela_total}` : undefined,
  }));
  return { txs, error };
}
export async function editarLancamento(id, campos) {
  const { error } = await supabase.from("lancamentos").update(campos).eq("id", id);
  return { error };
}
export async function inserirLancamentos(linhas, clienteId) {
  const comDono = linhas.map((l) => ({ ...l, cliente_id: clienteId, origem: "manual" }));
  const { error } = await supabase.from("lancamentos").insert(comDono);
  return { error };
}
export async function salvarPlanejamento(imposto_pct, prolabore_alvo) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("não autenticado") };
  const { error } = await supabase.from("clientes").update({ imposto_pct, prolabore_alvo }).eq("id", user.id);
  return { error };
}
export async function carregarMeta(mes) {
  const { data } = await supabase.from("metas").select("meta_faturamento, meta_lucro").eq("mes", mes).maybeSingle();
  return data || { meta_faturamento: 0, meta_lucro: 0 };
}
export async function salvarMeta(mes, faturamento, lucro) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("não autenticado") };
  const { error } = await supabase.from("metas").upsert({ cliente_id: user.id, mes, meta_faturamento: faturamento, meta_lucro: lucro });
  return { error };
}
export async function carregarDespesasFixas() {
  const { data, error } = await supabase
    .from("despesas_fixas").select("id, nome, valor, ativa, dia_vencimento, tipo, pago_mes").eq("ativa", true).order("nome");
  return { despesas: data || [], error };
}
export async function editarDespesaFixa(id, campos) {
  const { error } = await supabase.from("despesas_fixas").update(campos).eq("id", id);
  return { error };
}
export async function pagarDespesaFixa(despesa, mes) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("não autenticado") };
  const { error: e1 } = await supabase.from("lancamentos").insert({
    cliente_id: user.id, tipo: "saida", valor: despesa.valor,
    categoria: "Despesa fixa", subcategoria: despesa.nome, descricao: despesa.nome,
    data: new Date().toISOString().slice(0, 10), fixa: true, origem: "manual",
  });
  if (e1) return { error: e1 };
  const { error: e2 } = await supabase.from("despesas_fixas").update({ pago_mes: mes }).eq("id", despesa.id);
  return { error: e2 };
}
export async function inserirDespesaFixa(nome, valor, diaVencimento, tipo) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: new Error("Usuário não autenticado") };
  const { error } = await supabase.from("despesas_fixas").insert({ nome, valor, dia_vencimento: diaVencimento || null, tipo: tipo || "pj", cliente_id: user.id });
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
