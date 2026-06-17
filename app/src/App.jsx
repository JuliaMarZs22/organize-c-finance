import React, { useState, useEffect, useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import {
  Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, ShieldCheck, Sparkles,
  LayoutGrid, Plus, Briefcase, ListOrdered, Lock, Mail, LogOut, Users,
  Search, DollarSign, UserPlus, TrendingDown, Banknote, PiggyBank, Target,
  FileSpreadsheet, Loader2,
} from "lucide-react";
import {
  supabase, entrar, sair, usuarioAtual, ehAdmin, meuPerfil, carregarLancamentos,
  inserirLancamentos, carregarClientes,
} from "./supabase";
import { conectarDrive } from "./drive";

/* ---------- paleta ---------- */
const C = {
  bg: "#070b14", bg2: "#0b1120", panel: "#0e1525", panel2: "#121a2e",
  border: "#1c2438", border2: "#27314c", gold: "#e9cd88", gold2: "#e6c984",
  goldDeep: "#c0a366", emer: "#2ed6a0", emerDeep: "#1d8a6f", coral: "#e0857a",
  text: "#eef1f6", muted: "#9aa3bb", faint: "#7e87a0",
};
const serif = "'Cormorant Garamond', Georgia, serif";
const sans = "'DM Sans', system-ui, sans-serif";

/* ---------- helpers ---------- */
const TODAY = new Date();
const brl = (n) => (n < 0 ? "-" : "") + "R$ " + Math.abs(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = (n) => "R$ " + Math.round(n).toLocaleString("pt-BR");
const mk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""); };
const CATC = { Alimentação: "#e9cd88", Moradia: "#c0a366", Transporte: "#caa86a", Assinaturas: "#a9824c", Lazer: "#d8b56a", "Pró-labore": "#2ed6a0", Investimento: "#1d8a6f", Vendas: "#2ed6a0", Outros: "#6b7693" };
const colorFor = (c) => CATC[c] || "#6b7693";

/* ---------- componentes base ---------- */
const Panel = ({ children, style }) => <div className="rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}`, ...style }}>{children}</div>;
const Badge = ({ children, color }) => <span className="px-2 py-0.5 rounded-md" style={{ fontSize: 11, fontWeight: 600, color, background: color + "1f", border: `1px solid ${color}55` }}>{children}</span>;
function Stat({ icon: Icon, label, value, sub, accent }) {
  return (
    <Panel>
      <div className="flex items-center gap-2 mb-2" style={{ color: C.faint, fontSize: 12 }}><Icon size={14} color={accent} /> {label}</div>
      <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 600, color: accent || C.text, lineHeight: 1 }}>{value}</div>
      {sub && <div className="mt-2" style={{ fontSize: 11.5, color: C.faint }}>{sub}</div>}
    </Panel>
  );
}
const Brand = ({ size = 17 }) => (
  <div className="flex items-baseline gap-2">
    <span style={{ fontSize: size * 0.82, fontWeight: 500, color: "#c2c9da" }}>organize-c</span>
    <span style={{ fontFamily: serif, fontSize: size * 1.25, color: C.gold, lineHeight: 1 }}>finance</span>
  </div>
);

/* ============================== APP ============================== */
export default function App() {
  const [screen, setScreen] = useState("loading");
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      const u = await usuarioAtual();
      if (!u) return setScreen("login");
      setUser(u);
      setScreen((await ehAdmin(u.email)) ? "admin" : "client");
    })();
  }, []);

  const aposLogin = async (u) => {
    setUser(u);
    setScreen((await ehAdmin(u.email)) ? "admin" : "client");
  };
  const logout = async () => { await sair(); setUser(null); setScreen("login"); };

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: sans }}>
      {screen === "loading" && <Centro><Loader2 size={26} color={C.gold} className="animate-spin" /></Centro>}
      {screen === "login" && <Login onLogin={aposLogin} />}
      {screen === "client" && <Client user={user} logout={logout} />}
      {screen === "admin" && <Admin logout={logout} />}
    </div>
  );
}
const Centro = ({ children }) => <div className="flex items-center justify-center" style={{ minHeight: "100vh" }}>{children}</div>;

/* ============================== LOGIN ============================== */
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [erro, setErro] = useState("");
  const [load, setLoad] = useState(false);
  const field = { background: C.panel2, border: `1px solid ${C.border}`, color: C.text, fontSize: 14, borderRadius: 12, padding: "13px 13px 13px 42px", width: "100%", outline: "none" };

  const submit = async () => {
    setErro(""); setLoad(true);
    const { user, error } = await entrar(email, pw);
    setLoad(false);
    if (error || !user) return setErro("E-mail ou senha inválidos.");
    onLogin(user);
  };

  return (
    <div className="flex items-center justify-center px-4" style={{ minHeight: "100vh", background: `radial-gradient(680px 460px at 50% -5%, rgba(46,214,160,.10), transparent 60%), ${C.bg}` }}>
      <div className="w-full" style={{ maxWidth: 380 }}>
        <div className="flex justify-center mb-7"><Brand size={26} /></div>
        <div className="rounded-3xl p-7" style={{ background: C.panel, border: `1px solid ${C.border2}` }}>
          <div style={{ height: 3, background: C.gold, borderRadius: 99, width: 46, margin: "0 auto 22px" }} />
          <h1 style={{ fontFamily: serif, fontSize: 27, fontWeight: 600, textAlign: "center", marginBottom: 6 }}>Bem-vindo de volta</h1>
          <p style={{ fontSize: 13.5, color: C.muted, textAlign: "center", marginBottom: 24 }}>Acesse seu painel financeiro</p>
          <div className="flex flex-col gap-3">
            <div style={{ position: "relative" }}><Mail size={17} color={C.faint} style={{ position: "absolute", left: 14, top: 14 }} /><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" style={field} /></div>
            <div style={{ position: "relative" }}><Lock size={17} color={C.faint} style={{ position: "absolute", left: 14, top: 14 }} /><input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="Senha" onKeyDown={(e) => e.key === "Enter" && submit()} style={field} /></div>
            {erro && <div style={{ fontSize: 12.5, color: C.coral }}>{erro}</div>}
            <button onClick={submit} disabled={load} className="rounded-xl py-3 mt-1 flex items-center justify-center gap-2" style={{ background: C.gold, color: "#16213a", fontSize: 14.5, fontWeight: 600 }}>{load ? <Loader2 size={17} className="animate-spin" /> : "Entrar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================== TOPBAR ============================== */
const TopBar = ({ logout, label }) => (
  <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
    <div className="flex items-center gap-3"><Brand size={17} /><span style={{ fontSize: 11, color: C.faint, border: `1px solid ${C.border}`, borderRadius: 20, padding: "3px 10px" }}>{label}</span></div>
    <button onClick={logout} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.muted, fontSize: 12.5 }}><LogOut size={14} /> Sair</button>
  </div>
);

/* ============================== CLIENT ============================== */
function Client({ user, logout }) {
  const [tab, setTab] = useState("visao");
  const [txs, setTxs] = useState([]);
  const [perfil, setPerfil] = useState(null);
  const [load, setLoad] = useState(true);

  const recarregar = async () => {
    const [{ txs }, p] = await Promise.all([carregarLancamentos(), meuPerfil()]);
    setTxs(txs); setPerfil(p); setLoad(false);
  };
  useEffect(() => { recarregar(); }, []);

  const calc = useMemo(() => {
    const cur = mk(TODAY);
    const realized = (d) => new Date(d + "T12:00:00") <= TODAY;
    let entradasMes = 0, saidasMes = 0, proLabore = 0, investido = 0; const catMap = {};
    txs.forEach((t) => {
      if (mk(new Date(t.date + "T12:00:00")) === cur) {
        if (t.type === "entrada") entradasMes += t.amount;
        else {
          saidasMes += t.amount;
          if (t.category === "Pró-labore") proLabore += t.amount;
          else if (t.category === "Investimento") investido += t.amount;
          catMap[t.category] = (catMap[t.category] || 0) + t.amount;
        }
      }
    });
    const rE = txs.filter((t) => t.type === "entrada" && realized(t.date)).reduce((s, t) => s + t.amount, 0);
    const rS = txs.filter((t) => t.type === "saida" && realized(t.date)).reduce((s, t) => s + t.amount, 0);
    const caixa = Number(perfil?.saldo_inicial || 0) + rE - rS;
    const fixa = txs.filter((t) => t.type === "saida" && t.fixa && mk(new Date(t.date + "T12:00:00")) === cur).reduce((s, t) => s + t.amount, 0);
    const reserva = fixa;
    const proj = []; let run = caixa;
    for (let i = 1; i <= 5; i++) {
      const key = mk(addMonths(TODAY, i));
      const ent = txs.filter((t) => t.type === "entrada" && mk(new Date(t.date + "T12:00:00")) === key).reduce((s, t) => s + t.amount, 0);
      run = run + ent - fixa;
      proj.push({ key, label: monthLabel(key), entrada: ent, fixa, caixaFim: Math.round(run) });
    }
    const prox = proj[0] || { entrada: 0, key: mk(addMonths(TODAY, 1)) };
    const podeGastar = caixa + prox.entrada - fixa - reserva;
    const coberto = caixa + prox.entrada >= fixa + reserva;
    const lucro = entradasMes - (saidasMes - proLabore - investido);
    const cats = Object.entries(catMap).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    return { caixa, entradasMes, saidasMes, fixa, reserva, proj, prox, podeGastar, coberto, proLabore, investido, lucro, cats };
  }, [txs, perfil]);

  if (load) return <Centro><Loader2 size={26} color={C.gold} className="animate-spin" /></Centro>;

  return (
    <div className="mx-auto px-4 py-5" style={{ maxWidth: 1060 }}>
      <TopBar logout={logout} label="Cliente" />
      <div className="flex gap-1.5 mb-5 flex-wrap">
        {[["visao", "Visão geral", LayoutGrid], ["lancar", "Lançar", Plus], ["negocio", "Negócio", Briefcase], ["lancamentos", "Lançamentos", ListOrdered]].map(([k, l, I]) => (
          <button key={k} onClick={() => setTab(k)} className="flex items-center gap-2 px-3.5 py-2 rounded-lg" style={{ fontSize: 13, fontWeight: 500, background: tab === k ? C.panel2 : "transparent", color: tab === k ? C.text : C.muted, border: `1px solid ${tab === k ? C.border2 : "transparent"}` }}><I size={15} /> {l}</button>
        ))}
      </div>
      {tab === "visao" && <Visao calc={calc} perfil={perfil} user={user} onPlanilha={recarregar} txs={txs} />}
      {tab === "lancar" && <Lancar user={user} onAdd={recarregar} />}
      {tab === "negocio" && <Negocio calc={calc} />}
      {tab === "lancamentos" && <Lista txs={txs} />}
    </div>
  );
}

function DriveCard({ perfil, user, txs, onPlanilha }) {
  const [load, setLoad] = useState(false);
  const conectar = async () => {
    setLoad(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await conectarDrive(session.access_token);
      await onPlanilha();
    } catch (e) { alert(e.message); }
    setLoad(false);
  };
  return (
    <Panel style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: C.emer + "1c", flexShrink: 0 }}><FileSpreadsheet size={20} color={C.emer} /></div>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Sua planilha no Google Drive</div>
        <div style={{ fontSize: 12.5, color: C.muted }}>{perfil?.planilha_url ? "Conectada — sua cópia viva, no seu Drive." : "Conecte o Google e a planilha nasce no seu próprio Drive."}</div>
      </div>
      {perfil?.planilha_url
        ? <a href={perfil.planilha_url} target="_blank" rel="noopener" className="rounded-lg px-4 py-2" style={{ background: C.panel2, border: `1px solid ${C.border2}`, color: C.text, fontSize: 13 }}>Abrir planilha</a>
        : <button onClick={conectar} disabled={load} className="rounded-lg px-4 py-2 flex items-center gap-2" style={{ background: C.gold, color: "#16213a", fontSize: 13, fontWeight: 600 }}>{load ? <Loader2 size={15} className="animate-spin" /> : "Conectar Google Drive"}</button>}
    </Panel>
  );
}

function Visao({ calc, perfil, user, onPlanilha, txs }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))" }}>
        <Stat icon={Wallet} label="Caixa atual" value={brl(calc.caixa)} accent={C.gold} sub="Saldo disponível hoje" />
        <Stat icon={ArrowUpRight} label="Entradas do mês" value={brl(calc.entradasMes)} accent={C.emer} />
        <Stat icon={ArrowDownRight} label="Saídas do mês" value={brl(calc.saidasMes)} accent={C.coral} />
        <Stat icon={TrendingUp} label="Pode gastar mês que vem" value={brl(calc.podeGastar)} accent={C.gold} sub="Com 1 mês de reserva" />
      </div>
      <DriveCard perfil={perfil} user={user} txs={txs} onPlanilha={onPlanilha} />
      <Panel>
        <div className="flex items-center justify-between mb-3"><div style={{ fontSize: 14, fontWeight: 500 }}>Gastos por categoria</div><div style={{ fontSize: 12, color: C.faint }}>{brl(calc.saidasMes)}</div></div>
        {calc.cats.length === 0 ? <div style={{ fontSize: 13, color: C.faint, padding: 16 }}>Ainda sem lançamentos neste mês. Mande um áudio no WhatsApp ou lance manualmente.</div> : (
          <div className="flex items-center gap-4 flex-wrap">
            <div style={{ width: 150, height: 150 }}>
              <ResponsiveContainer><PieChart>
                <Pie data={calc.cats} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2} stroke="none">{calc.cats.map((c) => <Cell key={c.name} fill={colorFor(c.name)} />)}</Pie>
                <Tooltip formatter={(v) => brl(v)} contentStyle={{ background: C.panel2, border: `1px solid ${C.border2}`, borderRadius: 10, color: C.text, fontSize: 12 }} />
              </PieChart></ResponsiveContainer>
            </div>
            <div className="flex-1 flex flex-col gap-1.5" style={{ minWidth: 170 }}>
              {calc.cats.map((c) => <div key={c.name} className="flex items-center justify-between" style={{ fontSize: 13 }}><div className="flex items-center gap-2"><span style={{ width: 9, height: 9, borderRadius: 3, background: colorFor(c.name) }} />{c.name}</div><div style={{ color: C.muted }}>{brl(c.value)}</div></div>)}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Lancar({ user, onAdd }) {
  const [type, setType] = useState("saida"); const [amt, setAmt] = useState(""); const [cat, setCat] = useState("Alimentação"); const [desc, setDesc] = useState(""); const [inst, setInst] = useState(1); const [load, setLoad] = useState(false);
  const cats = ["Alimentação", "Moradia", "Transporte", "Assinaturas", "Lazer", "Pró-labore", "Investimento", "Vendas", "Outros"];
  const field = { background: C.panel2, border: `1px solid ${C.border}`, color: C.text, fontSize: 13, borderRadius: 8, padding: "9px 11px", width: "100%", outline: "none" };
  const salvar = async () => {
    const tot = parseFloat(String(amt).replace(".", "").replace(",", ".")); if (!tot) return;
    const n = Number(inst), valor = Number((tot / n).toFixed(2)); const linhas = [];
    for (let i = 0; i < n; i++) {
      const d = addMonths(TODAY, i);
      linhas.push({ tipo: type, valor, categoria: cat, descricao: desc || cat, data: mk(d) + "-" + String(Math.min(TODAY.getDate(), 28)).padStart(2, "0"), fixa: false, parcela_atual: n > 1 ? i + 1 : null, parcela_total: n > 1 ? n : null });
    }
    setLoad(true); await inserirLancamentos(linhas, user.id); setLoad(false);
    setAmt(""); setDesc(""); setInst(1); onAdd();
  };
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0,460px)", justifyContent: "center" }}>
      <Panel>
        <div className="flex items-center gap-2 mb-1" style={{ fontSize: 14, fontWeight: 600 }}><Plus size={16} color={C.gold} /> Lançar manualmente</div>
        <p style={{ fontSize: 12.5, color: C.muted, marginBottom: 14 }}>No dia a dia, é só mandar áudio no WhatsApp. Aqui você lança pela tela quando preferir.</p>
        <div className="flex gap-1.5 mb-3">{[["saida", "Saída", C.coral], ["entrada", "Entrada", C.emer]].map(([k, l, col]) => <button key={k} onClick={() => setType(k)} className="flex-1 rounded-lg py-2" style={{ fontSize: 13, fontWeight: 600, background: type === k ? col + "22" : C.panel2, color: type === k ? col : C.muted, border: `1px solid ${type === k ? col + "66" : C.border}` }}>{l}</button>)}</div>
        <div className="flex flex-col gap-2.5">
          <input value={amt} onChange={(e) => setAmt(e.target.value)} placeholder="Valor (R$)" inputMode="decimal" style={field} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={field}>{cats.map((c) => <option key={c} value={c} style={{ background: C.panel2 }}>{c}</option>)}</select>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descrição (opcional)" style={field} />
          {type === "entrada" && <div className="flex items-center gap-2"><span style={{ fontSize: 12.5, color: C.muted }}>Parcelas:</span><input value={inst} onChange={(e) => setInst(e.target.value)} type="number" min={1} max={36} style={{ ...field, width: 80 }} /></div>}
          <button onClick={salvar} disabled={load} className="rounded-lg py-2.5 mt-1 flex items-center justify-center gap-2" style={{ background: C.gold, color: "#16213a", fontSize: 13.5, fontWeight: 600 }}>{load ? <Loader2 size={16} className="animate-spin" /> : "Adicionar lançamento"}</button>
        </div>
      </Panel>
    </div>
  );
}

function Negocio({ calc }) {
  return (
    <div className="flex flex-col gap-4">
      <Panel style={{ background: calc.coberto ? `linear-gradient(160deg, #0c241d, ${C.panel})` : `linear-gradient(160deg, #2c1d1a, ${C.panel})`, borderColor: (calc.coberto ? C.emer : C.coral) + "55" }}>
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: (calc.coberto ? C.emer : C.coral) + "22", flexShrink: 0 }}><ShieldCheck size={20} color={calc.coberto ? C.emer : C.coral} /></div>
          <div className="flex-1">
            <div style={{ fontSize: 15, fontWeight: 600, color: calc.coberto ? C.emer : C.coral }}>{calc.coberto ? "Próximo mês está coberto" : "Atenção: próximo mês descoberto"}</div>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginTop: 4 }}>Em {monthLabel(calc.prox.key)} entram <b style={{ color: C.text }}>{brl(calc.prox.entrada)}</b> previstos. Com caixa de <b style={{ color: C.text }}>{brl(calc.caixa)}</b>, você pode gastar até <b style={{ color: C.gold }}>{brl(calc.podeGastar)}</b> mantendo a reserva.</p>
          </div>
        </div>
      </Panel>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))" }}>
        <Stat icon={Banknote} label="Pró-labore do mês" value={brl0(calc.proLabore)} accent={C.gold} sub="Seu salário, separado do caixa" />
        <Stat icon={PiggyBank} label="Investido no mês" value={brl0(calc.investido)} accent={C.emer} />
        <Stat icon={DollarSign} label="Lucro da operação" value={brl0(calc.lucro)} accent={C.gold} sub="Entradas menos custos operacionais" />
        <Stat icon={Target} label="Reserva de segurança" value={brl0(calc.reserva)} accent={C.emer} sub="1 mês de custo fixo" />
      </div>
      <Panel>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Previsibilidade de caixa · próximos 5 meses</div>
        <p style={{ fontSize: 12, color: C.faint, margin: "4px 0 10px" }}>Barras = entradas previstas vs. despesa fixa. Linha = caixa no fim do mês.</p>
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer><ComposedChart data={calc.proj} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke={C.border} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.muted, fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
            <YAxis tick={{ fill: C.faint, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
            <Tooltip formatter={(v, n) => [brl(v), n]} contentStyle={{ background: C.panel2, border: `1px solid ${C.border2}`, borderRadius: 10, color: C.text, fontSize: 12 }} />
            <Bar dataKey="entrada" name="Entrada prevista" fill={C.emer} radius={[4, 4, 0, 0]} barSize={18} />
            <Bar dataKey="fixa" name="Despesa fixa" fill={C.coral} radius={[4, 4, 0, 0]} barSize={18} />
            <Line dataKey="caixaFim" name="Caixa no fim do mês" stroke={C.gold} strokeWidth={2.5} dot={{ r: 3, fill: C.gold }} />
          </ComposedChart></ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}

function Lista({ txs }) {
  const fmt = (d) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  if (txs.length === 0) return <Panel><div style={{ fontSize: 13, color: C.faint, padding: 16 }}>Nenhum lançamento ainda.</div></Panel>;
  return (
    <Panel>
      <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 12 }}>Todos os lançamentos</div>
      <div className="flex flex-col">
        {txs.map((t, i) => {
          const fut = new Date(t.date + "T12:00:00") > TODAY;
          return (
            <div key={t.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: i ? `1px solid ${C.border}` : "none" }}>
              <div className="flex items-center justify-center rounded-lg" style={{ width: 34, height: 34, flexShrink: 0, background: (t.type === "entrada" ? C.emer : C.coral) + "1c" }}>{t.type === "entrada" ? <ArrowUpRight size={17} color={C.emer} /> : <ArrowDownRight size={17} color={C.coral} />}</div>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="flex items-center gap-2" style={{ fontSize: 13.5 }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.desc}</span>{fut && <Badge color={C.faint}>previsto</Badge>}</div>
                <div style={{ fontSize: 11.5, color: C.faint }}>{fmt(t.date)} · {t.category}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.type === "entrada" ? C.emer : C.coral, flexShrink: 0 }}>{t.type === "entrada" ? "+" : "-"}{brl(t.amount)}</div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ============================== ADMIN ============================== */
function Admin({ logout }) {
  const [clientes, setClientes] = useState([]);
  const [q, setQ] = useState(""); const [filtro, setFiltro] = useState("todos"); const [load, setLoad] = useState(true);
  const PRECO = { anual: 497, mensal: 67 };
  useEffect(() => { carregarClientes().then(({ clientes }) => { setClientes(clientes); setLoad(false); }); }, []);

  const ativos = clientes.filter((c) => c.status === "ativo");
  const receita = ativos.reduce((s, c) => s + (PRECO[c.plano] || 0) * (c.plano === "mensal" ? 12 : 1), 0);
  const novosMes = clientes.filter((c) => c.criado_em && mk(new Date(c.criado_em)) === mk(TODAY)).length;
  const cancel = clientes.filter((c) => c.status === "cancelado").length;
  const cor = (s) => s === "ativo" ? C.emer : s === "teste" ? C.gold : C.coral;
  const lbl = (s) => s === "ativo" ? "Ativo" : s === "teste" ? "Em teste" : "Cancelado";
  const list = clientes.filter((c) => (filtro === "todos" || c.status === filtro) && (c.nome || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="mx-auto px-4 py-5" style={{ maxWidth: 1060 }}>
      <TopBar logout={logout} label="Admin" />
      {load ? <Centro><Loader2 size={24} color={C.gold} className="animate-spin" /></Centro> : (
        <>
          <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(195px, 1fr))" }}>
            <Stat icon={Users} label="Assinantes ativos" value={ativos.length} accent={C.emer} />
            <Stat icon={DollarSign} label="Receita anual estimada" value={brl0(receita)} accent={C.gold} />
            <Stat icon={UserPlus} label="Novos este mês" value={novosMes} accent={C.gold} />
            <Stat icon={TrendingDown} label="Cancelamentos" value={cancel} accent={C.coral} />
          </div>
          <Panel>
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div style={{ fontSize: 14, fontWeight: 500 }}>Clientes</div>
              <div className="flex items-center gap-2 flex-wrap">
                {[["todos", "Todos"], ["ativo", "Ativos"], ["teste", "Em teste"], ["cancelado", "Cancelados"]].map(([k, l]) => <button key={k} onClick={() => setFiltro(k)} className="px-3 py-1 rounded-full" style={{ fontSize: 12, background: filtro === k ? C.gold : C.panel2, color: filtro === k ? "#16213a" : C.muted, border: `1px solid ${filtro === k ? C.gold : C.border}`, fontWeight: filtro === k ? 600 : 400 }}>{l}</button>)}
                <div style={{ position: "relative" }}><Search size={15} color={C.faint} style={{ position: "absolute", left: 11, top: 8 }} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" style={{ background: C.panel2, border: `1px solid ${C.border}`, color: C.text, fontSize: 12.5, borderRadius: 8, padding: "7px 11px 7px 32px", width: 150, outline: "none" }} /></div>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ color: C.faint, fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".05em" }}>
                  {["Cliente", "WhatsApp", "Plano", "Status", "Entrou em"].map((h) => <th key={h} style={{ textAlign: "left", padding: "10px 12px", borderBottom: `1px solid ${C.border}` }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #141b2c" }}>
                      <td style={{ padding: 12 }}><div className="flex items-center gap-2.5"><div className="flex items-center justify-center rounded-full" style={{ width: 30, height: 30, background: C.panel2, border: `1px solid ${C.border}`, fontSize: 12, color: C.gold, fontWeight: 600 }}>{(c.nome || "?")[0]}</div><span style={{ fontWeight: 500 }}>{c.nome}</span></div></td>
                      <td style={{ padding: 12, color: C.muted }}>{c.telefone}</td>
                      <td style={{ padding: 12, color: C.muted, textTransform: "capitalize" }}>{c.plano || "—"}</td>
                      <td style={{ padding: 12 }}><Badge color={cor(c.status)}>{lbl(c.status)}</Badge></td>
                      <td style={{ padding: 12, color: C.muted }}>{c.criado_em ? new Date(c.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.length === 0 && <div style={{ textAlign: "center", padding: 28, color: C.faint, fontSize: 13 }}>Nenhum cliente encontrado.</div>}
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
