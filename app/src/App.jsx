import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  Wallet, TrendingUp, ArrowUpRight, ArrowDownRight, ShieldCheck,
  LayoutGrid, Plus, Briefcase, ListOrdered, Lock, Mail, LogOut, Users,
  Search, DollarSign, UserPlus, TrendingDown, Banknote, PiggyBank, Target,
  Loader2, Trash2, Settings, AlertCircle, CheckCircle2, MessageCircle,
} from "lucide-react";
import {
  supabase, entrar, sair, definirSenha, usuarioAtual, ehAdmin, meuPerfil,
  carregarLancamentos, inserirLancamentos, carregarClientes,
  carregarDespesasFixas, inserirDespesaFixa, excluirDespesaFixa, editarDespesaFixa, pagarDespesaFixa, renomearNegocioFixa,
  atualizarSaldoInicial, atualizarCliente, editarLancamento, renomearPessoa, ajustarPendentePessoa, criarUsuarioBonus,
  carregarMeta, salvarMeta, salvarPlanejamento, carregarCores, salvarCor, registrarOptin,
} from "./supabase";

// texto exato do consentimento — guardado junto com o aceite como prova (política Meta)
const OPTIN_TEXTO = "Autorizo o Organize-C Finance a me enviar mensagens no WhatsApp (registros, resumos e lembretes que eu solicitar). Sei que posso cancelar quando quiser respondendo \"parar\".";
import { sincronizarManual } from "./drive";

/* ─── PALETA ─────────────────────────────────────────────────────── */
const C = {
  bg:"#070b14",bg2:"#0b1120",panel:"#0e1525",panel2:"#121a2e",
  border:"#1c2438",border2:"#27314c",
  gold:"#1fdd8e",goldDeep:"#16a86a",        // "primário" agora é o verde da marca
  emer:"#1fdd8e",emerDeep:"#16a86a",coral:"#e0857a",
  text:"#eef1f6",muted:"#9aa3bb",faint:"#7e87a0",
};
const serif = "'DM Sans', system-ui, -apple-system, sans-serif"; // tipografia bold do site (sem serifada)
const sans  = "'DM Sans', system-ui, sans-serif";

/* ─── HELPERS ─────────────────────────────────────────────────────── */
const today    = () => new Date();
const brl      = (n) => { if(n==null||isNaN(n))return"R$ 0,00"; return(n<0?"-":"")+`R$ `+Math.abs(n).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); };
const brl0     = (n) => { if(n==null||isNaN(n))return"R$ 0"; return(n<0?"-":"")+`R$ `+Math.abs(Math.round(n)).toLocaleString("pt-BR"); };
const mk       = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
const addMonths= (d,n) => new Date(d.getFullYear(),d.getMonth()+n,d.getDate());
const monthLabel=(key)=>{ const[y,m]=key.split("-").map(Number); return new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"short"}).replace(".",""); };
const CATC = { Alimentação:"#e9cd88",Moradia:"#c0a366",Transporte:"#caa86a",Assinaturas:"#a9824c",Lazer:"#d8b56a",Saúde:"#7ea8d8","Pró-labore":"#2ed6a0",Investimento:"#1d8a6f",Vendas:"#54e8b8",Outros:"#6b7693" };
const colorFor = (c) => CATC[c]||"#6b7693";
// paleta distinta para itens variados (cores que combinam com o tema escuro)
const PALETA = ["#1fdd8e","#2dd4bf","#e9cd88","#e0857a","#6ba8e0","#a98bdc","#e08bbf","#a9d86a","#e0a55a","#5ad8d8","#d86a9a","#8ad86a","#dcc06a","#6a9ad8"];
const corItem = (nome,i,cores) => (cores&&cores[nome]) || CATC[nome] || PALETA[i % PALETA.length];
const parseBRL = (s) => { if(!s)return NaN; const str=String(s).trim(); if(/^\d{1,3}(\.\d{3})*,\d{0,2}$/.test(str))return parseFloat(str.replace(/\./g,"").replace(",",".")); return parseFloat(str.replace(",",".")); };

/* ─── COMPONENTES BASE ────────────────────────────────────────────── */
const Panel  = ({children,style}) => <div className="rounded-2xl p-4" style={{background:C.panel,border:`1px solid ${C.border}`,...style}}>{children}</div>;
const Badge  = ({children,color}) => <span className="px-2 py-0.5 rounded-md" style={{fontSize:11,fontWeight:600,color,background:color+"1f",border:`1px solid ${color}55`}}>{children}</span>;
const Centro = ({children}) => <div className="flex items-center justify-center" style={{minHeight:"100vh"}}>{children}</div>;

function Toast({msg,type="success",onClose}) {
  useEffect(()=>{ const t=setTimeout(onClose,3500); return()=>clearTimeout(t); },[onClose]);
  const bg=type==="success"?C.emer:C.coral;
  const Icon=type==="success"?CheckCircle2:AlertCircle;
  return <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,background:C.panel2,border:`1px solid ${bg}55`,borderRadius:12,padding:"12px 16px",display:"flex",alignItems:"center",gap:10,boxShadow:`0 4px 24px ${bg}22`,maxWidth:340}}><Icon size={17} color={bg}/><span style={{fontSize:13,color:C.text}}>{msg}</span></div>;
}
function useToast() {
  const[toast,setToast]=useState(null);
  const show=useCallback((msg,type="success")=>setToast({msg,type,key:Date.now()}),[]);
  const node=toast?<Toast key={toast.key} msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>:null;
  return[show,node];
}
function Stat({icon:Icon,label,value,sub,accent}) {
  return <Panel><div className="flex items-center gap-2 mb-2" style={{color:C.faint,fontSize:12}}><Icon size={14} color={accent}/> {label}</div><div style={{fontFamily:sans,fontSize:27,fontWeight:700,letterSpacing:"-0.02em",color:accent||C.text,lineHeight:1}}>{value}</div>{sub&&<div className="mt-2" style={{fontSize:11.5,color:C.faint}}>{sub}</div>}</Panel>;
}
const Brand=({size=17})=><div className="flex items-center gap-2.5">
  <img src="/logo.png" alt="" style={{width:size*1.55,height:size*1.55,borderRadius:size*0.4,flexShrink:0}}/>
  <div className="flex items-baseline gap-1.5">
    <span style={{fontSize:size*0.92,fontWeight:500,color:"#c2c9da"}}>organize-c</span>
    <span style={{fontSize:size*0.92,fontWeight:700,color:C.emer,letterSpacing:"-0.01em"}}>finance</span>
  </div>
</div>;

/* ─── APP ROOT ────────────────────────────────────────────────────── */
// Modal de consentimento (opt-in) para mensagens no WhatsApp — aparece no 1º acesso
function OptinModal({onDone,showToast}) {
  const[hidden,setHidden]=useState(false);const[load,setLoad]=useState(false);
  if(hidden)return null;
  const autorizar=async()=>{setLoad(true);const{error}=await registrarOptin(OPTIN_TEXTO);setLoad(false);if(error)return showToast("Não consegui salvar, tenta de novo.","error");showToast("Autorização registrada! ✅");onDone&&onDone();};
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:C.panel,border:`1px solid ${C.border2}`,borderRadius:16,maxWidth:440,width:"100%",padding:24}}>
      <div style={{fontSize:26,marginBottom:8}}>💬</div>
      <div style={{fontSize:17,fontWeight:600,color:C.text,marginBottom:8}}>Ative o assistente no WhatsApp</div>
      <div style={{fontSize:13.5,color:C.muted,lineHeight:1.55,marginBottom:14}}>{OPTIN_TEXTO}</div>
      <button onClick={autorizar} disabled={load} style={{width:"100%",background:C.emer,color:"#04120a",border:"none",borderRadius:10,padding:"12px",fontSize:14,fontWeight:600,cursor:"pointer",opacity:load?.6:1}}>{load?"Salvando...":"Autorizar e ativar 💛"}</button>
      <button onClick={()=>setHidden(true)} style={{width:"100%",background:"transparent",color:C.faint,border:"none",padding:"10px",fontSize:12.5,cursor:"pointer",marginTop:4}}>Agora não</button>
    </div>
  </div>;
}

// Tela de acesso expirado/cancelado
function Bloqueado({logout}) {
  return <Centro><div style={{maxWidth:400,textAlign:"center",padding:24}}>
    <div style={{fontSize:38,marginBottom:12}}>🔒</div>
    <div style={{fontFamily:serif,fontSize:24,fontWeight:600,color:C.text,marginBottom:10}}>Seu acesso expirou</div>
    <p style={{fontSize:14,color:C.muted,lineHeight:1.6,marginBottom:20}}>Seu período de acesso ao Organize-C Finance terminou. Seus dados estão guardados e seguros. Pra continuar usando, renove seu plano.</p>
    <a href="https://organize-c.com/finance" target="_blank" rel="noopener" style={{display:"inline-block",background:C.emer,color:"#04120a",textDecoration:"none",borderRadius:10,padding:"11px 22px",fontSize:14,fontWeight:600}}>Renovar acesso 💛</a>
    <div><button onClick={logout} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:12.5,marginTop:16}}>Sair</button></div>
  </div></Centro>;
}

export default function App() {
  const[screen,setScreen]=useState("loading");
  const[user,setUser]=useState(null);
  useEffect(()=>{
    // detecta link de recuperação de senha (vem com type=recovery no hash)
    const hash=window.location.hash||"";
    const ehRecovery=hash.includes("type=recovery");
    const{data:sub}=supabase.auth.onAuthStateChange((evento)=>{ if(evento==="PASSWORD_RECOVERY")setScreen("recovery"); });
    (async()=>{
      if(ehRecovery){ setScreen("recovery"); return; }
      try{ const u=await usuarioAtual(); if(!u)return setScreen("login"); setUser(u); setScreen(await telaDe(u)); }catch{ setScreen("login"); }
    })();
    return ()=>sub?.subscription?.unsubscribe?.();
  },[]);
  // decide a tela: admin, cliente ativo, ou bloqueado (acesso vencido/cancelado)
  // bloqueia SÓ quem tem prazo definido e vencido (licenças novas/bônus).
  // Cliente antigo tem acesso_ate NULL => nunca é bloqueado.
  const telaDe=async(u)=>{ try{ if(await ehAdmin(u.email))return "admin"; const p=await meuPerfil(); if(p?.acesso_ate&&new Date(p.acesso_ate)<new Date())return "bloqueado"; }catch(e){console.error(e);} return "client"; };
  const aposLogin=async(u)=>{ setUser(u); try{ setScreen(await telaDe(u)); }catch{ setScreen("client"); } };
  const logout=async()=>{ await sair(); setUser(null); setScreen("login"); };
  const aposNovaSenha=async()=>{ try{ const u=await usuarioAtual(); setUser(u); setScreen(await telaDe(u)); }catch{ setScreen("login"); } };
  return <div style={{background:C.bg,color:C.text,minHeight:"100vh",fontFamily:sans}}>
    {screen==="loading"&&<Centro><Loader2 size={26} color={C.gold} className="animate-spin"/></Centro>}
    {screen==="login"&&<Login onLogin={aposLogin}/>}
    {screen==="recovery"&&<NovaSenha onDone={aposNovaSenha}/>}
    {screen==="client"&&<Client user={user} logout={logout}/>}
    {screen==="bloqueado"&&<Bloqueado logout={logout}/>}
    {screen==="admin"&&<Admin logout={logout}/>}
    {screen!=="loading"&&<SuporteFab/>}
  </div>;
}

/* ─── BOTÃO FLUTUANTE DE SUPORTE ──────────────────────────────────── */
function SuporteFab() {
  const link="https://wa.me/5515981732365?text=Ol%C3%A1!%20Preciso%20de%20suporte%20no%20organize-c%20Finance";
  return <a href={link} target="_blank" rel="noopener noreferrer" title="Falar com o suporte"
    style={{position:"fixed",right:20,bottom:20,zIndex:90,display:"flex",alignItems:"center",gap:10,
      background:"#25d366",color:"#053d1c",fontWeight:600,fontSize:13.5,padding:"13px 18px",borderRadius:40,
      textDecoration:"none",boxShadow:"0 16px 36px -12px rgba(0,0,0,.7)"}}>
    <svg width="19" height="19" viewBox="0 0 24 24" fill="#053d1c"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.01c-.24.68-1.42 1.31-1.96 1.36-.5.05-1.14.07-1.84-.12-.42-.13-.97-.31-1.66-.61-2.92-1.26-4.83-4.2-4.98-4.4-.15-.2-1.18-1.57-1.18-2.99s.75-2.12 1.01-2.41c.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.41-.07.65.5.24.57.81 1.97.88 2.11.07.14.12.31.02.5-.1.2-.15.31-.29.48-.15.17-.31.39-.44.52-.15.15-.3.3-.13.59.17.29.76 1.25 1.63 2.03 1.12 1 2.07 1.31 2.36 1.46.29.15.46.12.63-.07.17-.2.73-.85.93-1.14.19-.29.39-.24.65-.15.27.1 1.71.81 2 .96.29.15.49.22.56.34.07.12.07.7-.17 1.38z"/></svg>
    Dúvidas? Chama no suporte
  </a>;
}

/* ─── DEFINIR NOVA SENHA (link de recuperação) ────────────────────── */
function NovaSenha({onDone}) {
  const[pw,setPw]=useState("");const[pw2,setPw2]=useState("");const[erro,setErro]=useState("");const[load,setLoad]=useState(false);
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:14,borderRadius:12,padding:"13px 13px 13px 42px",width:"100%",outline:"none"};
  const salvar=async()=>{
    if(pw.length<6)return setErro("A senha precisa ter ao menos 6 caracteres.");
    if(pw!==pw2)return setErro("As senhas não conferem.");
    setErro("");setLoad(true);
    const{error}=await definirSenha(pw);
    setLoad(false);
    if(error)return setErro("Não foi possível salvar. Tente o link novamente.");
    onDone();
  };
  return <div className="flex items-center justify-center px-4" style={{minHeight:"100vh",background:`radial-gradient(680px 460px at 50% -5%, rgba(46,214,160,.10), transparent 60%), ${C.bg}`}}>
    <div className="w-full" style={{maxWidth:380}}>
      <div className="flex justify-center mb-7"><Brand size={26}/></div>
      <div className="rounded-3xl p-7" style={{background:C.panel,border:`1px solid ${C.border2}`}}>
        <div style={{height:3,background:C.gold,borderRadius:99,width:46,margin:"0 auto 22px"}}/>
        <h1 style={{fontFamily:sans,fontSize:28,fontWeight:700,letterSpacing:"-0.02em",textAlign:"center",marginBottom:6}}>Defina sua senha</h1>
        <p style={{fontSize:13.5,color:C.muted,textAlign:"center",marginBottom:24}}>Crie a senha de acesso ao seu painel</p>
        <div className="flex flex-col gap-3">
          <div style={{position:"relative"}}>
            <Lock size={17} color={C.faint} style={{position:"absolute",left:14,top:14}}/>
            <input value={pw} onChange={(e)=>setPw(e.target.value)} type="password" placeholder="Nova senha" autoFocus style={field}/>
          </div>
          <div style={{position:"relative"}}>
            <Lock size={17} color={C.faint} style={{position:"absolute",left:14,top:14}}/>
            <input value={pw2} onChange={(e)=>setPw2(e.target.value)} type="password" placeholder="Repita a senha" onKeyDown={(e)=>e.key==="Enter"&&salvar()} style={field}/>
          </div>
          {erro&&<div className="flex items-center gap-2" style={{fontSize:12.5,color:C.coral}}><AlertCircle size={13}/> {erro}</div>}
          <button onClick={salvar} disabled={load} className="rounded-xl py-3 mt-1 flex items-center justify-center gap-2" style={{background:load?C.goldDeep:C.gold,color:"#16213a",fontSize:14.5,fontWeight:600,cursor:load?"not-allowed":"pointer"}}>
            {load?<><Loader2 size={17} className="animate-spin"/> Salvando…</>:"Salvar e entrar"}
          </button>
        </div>
      </div>
    </div>
  </div>;
}

/* ─── RECUPERAR SENHA ─────────────────────────────────────────────── */
function RecuperarSenha({email}) {
  const[enviado,setEnviado]=useState(false);const[load,setLoad]=useState(false);
  const enviar=async()=>{
    const e=(email||"").trim();
    if(!e)return alert("Digite seu e-mail acima primeiro.");
    setLoad(true);
    await supabase.auth.resetPasswordForEmail(e,{redirectTo:`${window.location.origin}/reset`});
    setLoad(false);setEnviado(true);
  };
  if(enviado)return<div style={{fontSize:12,color:C.emer,textAlign:"center",marginTop:12}}>✅ Link enviado para {email}. Verifique seu e-mail.</div>;
  return<button onClick={enviar} disabled={load} style={{background:"none",border:"none",color:C.faint,fontSize:12,cursor:"pointer",marginTop:10,width:"100%",textDecoration:"underline"}}>
    {load?"Enviando…":"Esqueci minha senha"}
  </button>;
}

/* ─── LOGIN — apenas email + senha, sem "criar conta" ────────────── */
function Login({onLogin}) {
  const[email,setEmail]=useState("");
  const[pw,setPw]=useState("");
  const[erro,setErro]=useState("");
  const[load,setLoad]=useState(false);
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:14,borderRadius:12,padding:"13px 13px 13px 42px",width:"100%",outline:"none"};
  const submit=async()=>{
    if(!email.trim())return setErro("Digite seu e-mail.");
    if(!pw)return setErro("Digite sua senha.");
    setErro("");setLoad(true);
    const{user,error}=await entrar(email.trim(),pw);
    setLoad(false);
    if(error||!user){ return setErro("E-mail ou senha inválidos."); }
    onLogin(user);
  };
  return <div className="flex items-center justify-center px-4" style={{minHeight:"100vh",background:`radial-gradient(680px 460px at 50% -5%, rgba(46,214,160,.10), transparent 60%), ${C.bg}`}}>
    <div className="w-full" style={{maxWidth:380}}>
      <div className="flex justify-center mb-7"><Brand size={26}/></div>
      <div className="rounded-3xl p-7" style={{background:C.panel,border:`1px solid ${C.border2}`}}>
        <div style={{height:3,background:C.gold,borderRadius:99,width:46,margin:"0 auto 22px"}}/>
        <h1 style={{fontFamily:sans,fontSize:28,fontWeight:700,letterSpacing:"-0.02em",textAlign:"center",marginBottom:6}}>Bem-vindo de volta</h1>
        <p style={{fontSize:13.5,color:C.muted,textAlign:"center",marginBottom:24}}>Acesse seu painel financeiro</p>
        <div className="flex flex-col gap-3">
          <div style={{position:"relative"}}>
            <Mail size={17} color={C.faint} style={{position:"absolute",left:14,top:14}}/>
            <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="seu@email.com" type="email" autoComplete="email" style={field}/>
          </div>
          <div style={{position:"relative"}}>
            <Lock size={17} color={C.faint} style={{position:"absolute",left:14,top:14}}/>
            <input value={pw} onChange={(e)=>setPw(e.target.value)} type="password" placeholder="Senha" autoComplete="current-password" onKeyDown={(e)=>e.key==="Enter"&&submit()} style={field}/>
          </div>
          {erro&&<div className="flex items-center gap-2" style={{fontSize:12.5,color:C.coral}}><AlertCircle size={13}/> {erro}</div>}
          <button onClick={submit} disabled={load} className="rounded-xl py-3 mt-1 flex items-center justify-center gap-2" style={{background:load?C.goldDeep:C.gold,color:"#16213a",fontSize:14.5,fontWeight:600,cursor:load?"not-allowed":"pointer"}}>
            {load?<><Loader2 size={17} className="animate-spin"/> Entrando…</>:"Entrar"}
          </button>
          <RecuperarSenha email={email}/>
        </div>
        <p style={{fontSize:11.5,color:C.faint,textAlign:"center",marginTop:20,lineHeight:1.6}}>
          Acesso exclusivo para assinantes.<br/>
          <span style={{color:C.muted}}>Adquira seu acesso em <b style={{color:C.gold}}>organize-c.com/finance</b></span>
        </p>
      </div>
    </div>
  </div>;
}

/* ─── TOPBAR ──────────────────────────────────────────────────────── */
const TopBar=({logout,label,nomeUsuario})=><div className="flex items-center justify-between flex-wrap gap-3 mb-5"><div className="flex items-center gap-3"><Brand size={17}/><span style={{fontSize:11,color:C.faint,border:`1px solid ${C.border}`,borderRadius:20,padding:"3px 10px"}}>{label}</span></div><div className="flex items-center gap-3">{nomeUsuario&&<span style={{fontSize:12.5,color:C.muted}}>{nomeUsuario}</span>}<button onClick={logout} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{background:C.panel,border:`1px solid ${C.border}`,color:C.muted,fontSize:12.5,cursor:"pointer"}}><LogOut size={14}/> Sair</button></div></div>;

/* ─── BANNER WHATSAPP ─────────────────────────────────────────────── */
function WhatsAppBanner() {
  return <Panel style={{background:`linear-gradient(135deg, #0d2318, ${C.panel})`,borderColor:C.emer+"44",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
    <div style={{width:44,height:44,borderRadius:12,background:C.emer+"22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
      <MessageCircle size={22} color={C.emer}/>
    </div>
    <div style={{flex:1,minWidth:200}}>
      <div style={{fontSize:14,fontWeight:600,color:C.emer,marginBottom:2}}>Registre gastos pelo WhatsApp</div>
      <div style={{fontSize:12.5,color:C.muted,lineHeight:1.5}}>Mande um áudio ou texto para o número abaixo. Ex: <em style={{color:C.text}}>"gastei 50 reais no mercado"</em> — o assistente interpreta e registra automaticamente.</div>
    </div>
    <div style={{textAlign:"center",flexShrink:0}}>
      <div style={{fontSize:11,color:C.faint,marginBottom:4}}>Seu número assistente</div>
      <div style={{fontSize:16,fontWeight:700,color:C.gold,letterSpacing:1}}>+55 11 97271-8110</div>
      <div style={{fontSize:11,color:C.faint,marginTop:2}}>Organize-c Finance</div>
    </div>
  </Panel>;
}

/* ─── CLIENT ──────────────────────────────────────────────────────── */
function Client({user,logout}) {
  const[tab,setTab]=useState("visao");
  const[txs,setTxs]=useState([]);
  const[perfil,setPerfil]=useState(null);
  const[despesas,setDespesas]=useState([]);
  const[meta,setMeta]=useState({meta_faturamento:0,meta_lucro:0});
  const[cores,setCores]=useState({});
  const[load,setLoad]=useState(true);
  const[showToast,toastNode]=useToast();
  const mesAtual=mk(today());

  const recarregar=useCallback(async()=>{
    try{
      const[{txs:t},p,{despesas:d},m,cr]=await Promise.all([carregarLancamentos(),meuPerfil(),carregarDespesasFixas(),carregarMeta(mk(today())),carregarCores()]);
      setTxs(t);setPerfil(p);setDespesas(d);setMeta(m);setCores(cr);
    }catch(e){console.error(e);}
    finally{setLoad(false);}
  },[]);
  const definirCor=useCallback(async(nome,cor)=>{setCores((prev)=>({...prev,[nome]:cor}));await salvarCor(nome,cor);},[]);

  useEffect(()=>{recarregar();},[recarregar]);

  const calc=useMemo(()=>{
    const NOW=today();const cur=mk(NOW);
    // compara SÓ por data (YYYY-MM-DD), sem hora — senão lançamentos de hoje somem de manhã
    const hojeStr=`${NOW.getFullYear()}-${String(NOW.getMonth()+1).padStart(2,"0")}-${String(NOW.getDate()).padStart(2,"0")}`;
    const realized=(d)=>(d||"")<=hojeStr;
    const ativos=txs.filter((t)=>!t.cancelado); // cancelados não entram no somatório
    let entradasMes=0,saidasMes=0,proLabore=0,investido=0,emprestEntMes=0,emprestSaiMes=0,aporteEntMes=0;const catMap={};
    const vendaSubMap={},investSubMap={};const negMap={};
    const ehEmprest=(t)=>t.category==="Empréstimo";
    // classifica cada saída em Negócio (operação) x Pessoal (custo de vida) x Outros
    const CAT_NEGOCIO=new Set(["Marketing","Equipe","Insumos","Impostos","Investimento"]);
    const CAT_PESSOAL=new Set(["Alimentação","Moradia","Transporte","Saúde","Assinaturas","Lazer","Pró-labore"]);
    // despesa fixa carrega tipo pj (negócio) / pf (pessoal) — usa pra jogar no balde certo
    const fixaTipo={};despesas.forEach((d)=>{fixaTipo[d.nome]=d.tipo||"pj";});
    const baldeSaida=(t)=>{if(t.category==="Empréstimo")return"outros";if(t.category==="Despesa fixa"){const tp=fixaTipo[t.sub];return tp==="pf"?"pessoal":tp==="pj"?"negocio":"outros";}if(CAT_NEGOCIO.has(t.category)||t.negocio)return"negocio";if(CAT_PESSOAL.has(t.category))return"pessoal";return"outros";};
    let pessoalMes=0,negocioMes=0,outrosMes=0;
    ativos.forEach((t)=>{
      // "do mês" conta só o que JÁ aconteceu (data <= hoje); parcelas/compromissos futuros
      // não são deduzidos como saída — eles aparecem na projeção e no painel de Dívidas.
      if(mk(new Date(t.date+"T12:00:00"))===cur && realized(t.date)){
        if(t.negocio){if(!negMap[t.negocio])negMap[t.negocio]={entrada:0,saida:0};negMap[t.negocio][t.type]+=t.amount;}
        if(t.type==="entrada"){entradasMes+=t.amount;if(ehEmprest(t))emprestEntMes+=t.amount;if(t.category==="Investimento"){aporteEntMes+=t.amount;/* aporte de capital não é venda/faturamento */}else{const k=t.sub||t.category;vendaSubMap[k]=(vendaSubMap[k]||0)+t.amount;}}
        else{saidasMes+=t.amount;if(ehEmprest(t))emprestSaiMes+=t.amount;if(t.category==="Pró-labore")proLabore+=t.amount;else if(t.category==="Investimento")investido+=t.amount;const gk=t.sub||t.category;catMap[gk]=(catMap[gk]||0)+t.amount;if(t.category==="Marketing"||t.category==="Investimento"){const k=t.sub||t.category;investSubMap[k]=(investSubMap[k]||0)+t.amount;}const b=baldeSaida(t);if(b==="negocio")negocioMes+=t.amount;else if(b==="pessoal")pessoalMes+=t.amount;else outrosMes+=t.amount;}
      }
    });
    const vendaSub=Object.entries(vendaSubMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
    const investSub=Object.entries(investSubMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
    const negocios=Object.entries(negMap).map(([name,v])=>({name,entrada:v.entrada,saida:v.saida,lucro:v.entrada-v.saida})).sort((a,b)=>b.entrada-a.entrada);
    const rE=ativos.filter((t)=>t.type==="entrada"&&realized(t.date)).reduce((s,t)=>s+t.amount,0);
    const rS=ativos.filter((t)=>t.type==="saida"&&realized(t.date)).reduce((s,t)=>s+t.amount,0);
    const caixa=Number(perfil?.saldo_inicial||0)+rE-rS;
    const totalFixo=despesas.reduce((s,d)=>s+Number(d.valor),0);
    const mesesReserva=Number(perfil?.reserva_meses||1);const reserva=totalFixo*mesesReserva;
    const proj=[];let run=caixa;
    for(let i=1;i<=5;i++){const key=mk(addMonths(NOW,i));const noMes=(t)=>mk(new Date(t.date+"T12:00:00"))===key;const ent=ativos.filter((t)=>t.type==="entrada"&&noMes(t)).reduce((s,t)=>s+t.amount,0);const saiFut=ativos.filter((t)=>t.type==="saida"&&noMes(t)).reduce((s,t)=>s+t.amount,0);run=run+ent-totalFixo-saiFut;proj.push({key,label:monthLabel(key),entrada:ent,fixa:totalFixo+saiFut,caixaFim:Math.round(run)});}
    const prox=proj[0]||{entrada:0,key:mk(addMonths(NOW,1))};
    const podeGastar=caixa+prox.entrada-totalFixo-reserva;
    const coberto=caixa+prox.entrada>=totalFixo+reserva;
    // lucro NÃO conta empréstimo (entrada de dívida) nem APORTE de capital (não é venda) nem investimento (não é custo operacional)
    const lucro=(entradasMes-emprestEntMes-aporteEntMes)-((saidasMes-emprestSaiMes)-proLabore-investido);
    const cats=Object.entries(catMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
    // DÍVIDAS: parcelas de empréstimo ainda não pagas (futuras)
    const parcDiv=ativos.filter((t)=>t.type==="saida"&&t.category==="Empréstimo"&&new Date(t.date+"T12:00:00")>NOW);
    const dividaTotal=parcDiv.reduce((s,t)=>s+t.amount,0);
    const totalEmprest=ativos.filter((t)=>t.type==="entrada"&&t.category==="Empréstimo").reduce((s,t)=>s+t.amount,0);
    const totalParcelas=ativos.filter((t)=>t.type==="saida"&&t.category==="Empréstimo").reduce((s,t)=>s+t.amount,0);
    const dividas={aPagar:dividaTotal,parcelasRestantes:parcDiv.length,totalEmprestado:totalEmprest,custo:Math.max(0,totalParcelas-totalEmprest)};
    return{caixa,entradasMes,saidasMes,fixa:totalFixo,reserva,mesesReserva,proj,prox,podeGastar,coberto,proLabore,investido,lucro,cats,vendaSub,investSub,negocios,dividas,pessoalMes,negocioMes,outrosMes};
  },[txs,perfil,despesas]);

  if(load)return<Centro><Loader2 size={26} color={C.gold} className="animate-spin"/></Centro>;

  const TABS=[["visao","Visão geral",LayoutGrid],["lancar","Lançar",Plus],["negocio","Negócio",Briefcase],["clientes","Clientes",Users],["lancamentos","Lançamentos",ListOrdered],["relatorio","Relatório",DollarSign],["fixas","Despesas fixas",Settings]];

  return <div className="mx-auto px-4 py-5" style={{maxWidth:1060}}>
    {toastNode}
    {perfil&&perfil.whatsapp_optin===false&&<OptinModal onDone={recarregar} showToast={showToast}/>}
    <TopBar logout={logout} label="Cliente" nomeUsuario={perfil?.nome}/>
    <div className="tabs-scroll flex gap-1.5 mb-5" style={{flexWrap:"nowrap",paddingBottom:4}}>
      {TABS.map(([k,l,I])=><button key={k} onClick={()=>setTab(k)} className="flex items-center gap-2 px-3.5 py-2 rounded-lg" style={{fontSize:13,fontWeight:500,cursor:"pointer",whiteSpace:"nowrap",flexShrink:0,background:tab===k?C.panel2:"transparent",color:tab===k?C.text:C.muted,border:`1px solid ${tab===k?C.border2:"transparent"}`}}><I size={15}/> {l}</button>)}
    </div>
    {tab==="visao"&&<Visao calc={calc} perfil={perfil} despesas={despesas} showToast={showToast} onUpdate={recarregar} cores={cores} definirCor={definirCor}/>}
    {tab==="lancar"&&<Lancar user={user} onAdd={recarregar} showToast={showToast}/>}
    {tab==="negocio"&&<Negocio calc={calc} meta={meta} mes={mesAtual} onMeta={recarregar} showToast={showToast} perfil={perfil}/>}
    {tab==="clientes"&&<Clientes txs={txs} onUpdate={recarregar} showToast={showToast}/>}
    {tab==="relatorio"&&<Relatorio txs={txs} perfil={perfil} showToast={showToast}/>}
    {tab==="lancamentos"&&<Lista txs={txs} onDelete={recarregar} showToast={showToast} cores={cores}/>}
    {tab==="fixas"&&<DespesasFixas despesas={despesas} onUpdate={recarregar} showToast={showToast}/>}
  </div>;
}

/* ─── VISÃO GERAL ─────────────────────────────────────────────────── */
function Visao({calc,perfil,despesas,onUpdate,showToast,cores,definirCor}) {
  const[editSaldo,setEditSaldo]=useState(false);const[saldoVal,setSaldoVal]=useState("");const[savingS,setSavingS]=useState(false);
  const salvarSaldo=async()=>{const v=parseBRL(saldoVal);if(isNaN(v))return showToast("Valor inválido","error");setSavingS(true);const{error}=await atualizarSaldoInicial(v);setSavingS(false);if(error)return showToast("Erro ao salvar","error");setEditSaldo(false);showToast("Saldo inicial atualizado!");onUpdate();};
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"7px 10px",outline:"none"};
  return <div className="flex flex-col gap-4">
    <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fit, minmax(205px, 1fr))"}}>
      <div onClick={()=>{if(!editSaldo){setSaldoVal(String(perfil?.saldo_inicial||0));setEditSaldo(true);}}} style={{cursor:"pointer"}}>
        <Stat icon={Wallet} label="Caixa atual" value={brl(calc.caixa)} accent={C.gold} sub={editSaldo?<span onClick={(e)=>e.stopPropagation()} className="flex gap-1 items-center mt-1"><input autoFocus value={saldoVal} onChange={(e)=>setSaldoVal(e.target.value)} style={{...field,width:110}} placeholder="Saldo inicial"/><button onClick={salvarSaldo} disabled={savingS} style={{background:C.gold,color:"#16213a",border:"none",borderRadius:6,padding:"4px 8px",fontSize:12,cursor:"pointer"}}>{savingS?"…":"OK"}</button><button onClick={()=>setEditSaldo(false)} style={{background:"none",border:"none",color:C.faint,fontSize:12,cursor:"pointer"}}>✕</button></span>:"Clique para definir saldo inicial"}/>
      </div>
      <Stat icon={ArrowUpRight} label="Entradas do mês" value={brl(calc.entradasMes)} accent={C.emer}/>
      <Stat icon={ArrowDownRight} label="Saídas do mês" value={brl(calc.saidasMes)} accent={C.coral}/>
      <Stat icon={TrendingUp} label="Pode gastar mês que vem" value={brl(calc.podeGastar)} accent={C.gold} sub={`Com ${calc.mesesReserva} ${calc.mesesReserva===1?"mês":"meses"} de reserva`}/>
    </div>

    <WhatsAppBanner/>
    <Panel>
      <div className="flex items-center justify-between mb-3"><div style={{fontSize:14,fontWeight:500}}>Gastos por item</div><div style={{fontSize:12,color:C.faint}}>{brl(calc.saidasMes)}</div></div>
      {calc.cats.length===0
        ?<div style={{fontSize:13,color:C.faint,padding:16}}>Ainda sem lançamentos neste mês. Mande um áudio no WhatsApp ou lance manualmente.</div>
        :<div className="flex items-center gap-4 flex-wrap">
          <div style={{width:150,height:150,flexShrink:0}}>
            <ResponsiveContainer><PieChart><Pie data={calc.cats} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2} stroke="none">{calc.cats.map((c,i)=><Cell key={c.name} fill={corItem(c.name,i,cores)}/>)}</Pie><Tooltip formatter={(v)=>[brl(v),""]} contentStyle={{background:C.panel2,border:`1px solid ${C.border2}`,borderRadius:10,color:C.text,fontSize:12}}/></PieChart></ResponsiveContainer>
          </div>
          <div className="flex-1 flex flex-col" style={{minWidth:170}}>
            {calc.cats.map((c,i)=><div key={c.name} className="flex items-center" style={{fontSize:13,padding:"5px 0",borderTop:i?`1px solid ${C.border}`:"none"}}><div className="flex items-center gap-2" style={{flexShrink:0}}><label style={{cursor:"pointer",display:"inline-flex",position:"relative"}} title="Clique para mudar a cor"><span style={{width:11,height:11,borderRadius:3,background:corItem(c.name,i,cores),display:"inline-block",border:`1px solid ${C.border2}`}}/><input type="color" value={corItem(c.name,i,cores)} onChange={(e)=>definirCor(c.name,e.target.value)} style={{position:"absolute",opacity:0,width:11,height:11,cursor:"pointer"}}/></label>{c.name}</div><div style={{flex:1,margin:"0 8px",borderBottom:`1px dotted ${C.border2}`,transform:"translateY(2px)",minWidth:14}}/><div style={{color:C.muted,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{brl(c.value)}</div></div>)}
          </div>
        </div>
      }
    </Panel>
    {(calc.pessoalMes+calc.negocioMes+calc.outrosMes)>0&&(()=>{
      const tot=calc.pessoalMes+calc.negocioMes+calc.outrosMes;const pct=(v)=>tot?Math.round(v/tot*100):0;
      const itens=[{nome:"Negócio (operação)",val:calc.negocioMes,cor:C.emer},{nome:"Pessoal (custo de vida)",val:calc.pessoalMes,cor:C.coral},{nome:"Outros",val:calc.outrosMes,cor:C.faint}].filter((x)=>x.val>0);
      const insight=calc.pessoalMes>calc.negocioMes
        ?`Seu custo de vida pessoal é ${pct(calc.pessoalMes)}% das saídas do mês — é o que mais pesa.`
        :`Suas saídas são puxadas pela operação do negócio (${pct(calc.negocioMes)}%).`;
      return <Panel>
        <div className="flex items-center justify-between mb-3"><div style={{fontSize:14,fontWeight:500}}>Pessoal × Negócio</div><div style={{fontSize:12,color:C.faint}}>saídas do mês</div></div>
        <div className="flex w-full" style={{height:14,borderRadius:7,overflow:"hidden",background:C.panel2}}>
          {itens.map((x)=><div key={x.nome} title={`${x.nome}: ${brl(x.val)}`} style={{width:`${pct(x.val)}%`,background:x.cor}}/>)}
        </div>
        <div className="flex flex-col mt-3">
          {itens.map((x,i)=><div key={x.nome} className="flex items-center" style={{fontSize:13,padding:"5px 0",borderTop:i?`1px solid ${C.border}`:"none"}}>
            <span style={{width:11,height:11,borderRadius:3,background:x.cor,display:"inline-block",flexShrink:0,marginRight:8}}/>
            <span style={{flexShrink:0}}>{x.nome}</span>
            <div style={{flex:1,margin:"0 8px",borderBottom:`1px dotted ${C.border2}`,transform:"translateY(2px)",minWidth:14}}/>
            <span style={{color:C.muted,flexShrink:0,fontVariantNumeric:"tabular-nums"}}>{brl(x.val)} · {pct(x.val)}%</span>
          </div>)}
        </div>
        <div style={{fontSize:12.5,color:C.muted,lineHeight:1.5,marginTop:10,paddingTop:10,borderTop:`1px solid ${C.border2}`}}>{insight}</div>
      </Panel>;
    })()}
    {despesas.length>0&&<Panel>
      <div style={{fontSize:14,fontWeight:500,marginBottom:10}}>Despesas fixas mensais</div>
      {despesas.map((d,i)=><div key={d.id} className="flex items-center justify-between py-1.5" style={{fontSize:13,borderTop:i?`1px solid ${C.border}`:"none"}}><span style={{color:C.muted}}>{d.nome}</span><span style={{color:C.coral}}>{brl(d.valor)}</span></div>)}
      <div className="flex items-center justify-between pt-2 mt-1" style={{fontSize:13,fontWeight:600,borderTop:`1px solid ${C.border2}`}}><span>Total fixo</span><span style={{color:C.coral}}>{brl(calc.fixa)}</span></div>
    </Panel>}
  </div>;
}

/* ─── DESPESAS FIXAS ──────────────────────────────────────────────── */
function DespesasFixas({despesas,onUpdate,showToast}) {
  const[nome,setNome]=useState("");const[valor,setValor]=useState("");const[dia,setDia]=useState("");const[tipo,setTipo]=useState("pj");const[neg,setNeg]=useState("");const[load,setLoad]=useState(false);const[deleting,setDeleting]=useState(null);
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",outline:"none"};
  const sugestoesNeg=[...new Set(despesas.map((d)=>(d.negocio||"").trim()).filter(Boolean))];
  const adicionar=async()=>{const v=parseBRL(valor);if(!nome.trim())return showToast("Digite o nome.","error");if(isNaN(v)||v<=0)return showToast("Digite um valor válido.","error");const dv=dia?Math.max(1,Math.min(31,Number(dia))):null;setLoad(true);const{error}=await inserirDespesaFixa(nome.trim(),v,dv,tipo,tipo==="pj"?neg.trim():"");setLoad(false);if(error)return showToast("Erro ao adicionar.","error");setNome("");setValor("");setDia("");setNeg("");showToast("Despesa adicionada!");onUpdate();};
  const excluir=async(id)=>{setDeleting(id);const{error}=await excluirDespesaFixa(id);setDeleting(null);if(error)return showToast("Erro ao remover.","error");showToast("Despesa removida.");onUpdate();};
  const[editId,setEditId]=useState(null);const[eVal,setEVal]=useState("");const[eDia,setEDia]=useState("");const[eTipo,setETipo]=useState("pj");const[eNeg,setENeg]=useState("");const[paying,setPaying]=useState(null);
  const[renNeg,setRenNeg]=useState(null);const[renVal,setRenVal]=useState("");const[renLoad,setRenLoad]=useState(false);
  const salvarRename=async(neg,itens)=>{setRenLoad(true);const{error}=await renomearNegocioFixa(itens.map((d)=>d.id),renVal);setRenLoad(false);if(error)return showToast("Erro ao renomear","error");setRenNeg(null);showToast("Negócio atualizado!");onUpdate();};
  const mesAtual=mk(today());
  const abrirEdit=(d)=>{setEditId(d.id);setEVal(String(d.valor).replace(".",","));setEDia(d.dia_vencimento?String(d.dia_vencimento):"");setETipo(d.tipo||"pj");setENeg(d.negocio||"");};
  const salvarEdit=async(d)=>{const v=parseBRL(eVal);if(isNaN(v)||v<=0)return showToast("Valor inválido","error");const dv=eDia?Math.max(1,Math.min(31,Number(eDia))):null;const{error}=await editarDespesaFixa(d.id,{valor:v,dia_vencimento:dv,tipo:eTipo,negocio:eTipo==="pj"?(eNeg.trim()||null):null});if(error)return showToast("Erro ao salvar","error");setEditId(null);showToast("Despesa atualizada!");onUpdate();};
  const pagar=async(d)=>{setPaying(d.id);const{error}=await pagarDespesaFixa(d,mesAtual);setPaying(null);if(error)return showToast("Erro ao registrar pagamento","error");showToast("Pago! ✅ Saída registrada no caixa.");onUpdate();};
  const pj=despesas.filter((d)=>(d.tipo||"pj")==="pj");const pf=despesas.filter((d)=>(d.tipo||"pj")==="pf");
  const totPf=pf.reduce((s,d)=>s+Number(d.valor),0);
  // agrupa despesas PJ por negócio (empreendedor com vários negócios)
  const gruposNeg=[...new Set(pj.map((d)=>(d.negocio||"").trim()))].sort((a,b)=>(a===""?1:b===""?-1:a.localeCompare(b)));
  const fieldSm={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:12.5,borderRadius:8,padding:"6px 9px",outline:"none"};
  const Linha=(d,i)=>{const pago=d.pago_mes===mesAtual;
    if(editId===d.id)return<div key={d.id} className="py-2.5" style={{borderTop:i?`1px solid ${C.border}`:"none"}}>
      <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>{d.nome}</div>
      <div className="flex gap-1.5 mb-2">{[["pj","Empresa"],["pf","Pessoal"]].map(([k,l])=><button key={k} onClick={()=>setETipo(k)} className="flex-1 rounded-lg py-1.5" style={{fontSize:12,cursor:"pointer",background:eTipo===k?C.emer+"22":C.panel2,color:eTipo===k?C.emer:C.muted,border:`1px solid ${eTipo===k?C.emer+"66":C.border}`}}>{l}</button>)}</div>
      {eTipo==="pj"&&<input value={eNeg} onChange={(e)=>setENeg(e.target.value)} list="negocios-fixas" placeholder="Negócio (ex: Loja, Clínica)" style={{...fieldSm,width:"100%",marginBottom:8}}/>}
      <div className="flex gap-2 items-center">
        <input value={eVal} onChange={(e)=>setEVal(e.target.value)} placeholder="Valor" inputMode="decimal" style={{...fieldSm,flex:1}}/>
        <input value={eDia} onChange={(e)=>setEDia(e.target.value)} placeholder="Dia" type="number" min={1} max={31} style={{...fieldSm,width:64}}/>
        <button onClick={()=>salvarEdit(d)} style={{background:C.gold,color:"#16213a",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>Salvar</button>
        <button onClick={()=>setEditId(null)} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:12.5}}>✕</button>
      </div>
    </div>;
    return<div key={d.id} className="flex items-center justify-between py-2.5 gap-2" style={{borderTop:i?`1px solid ${C.border}`:"none"}}>
      <div style={{flex:1,minWidth:0}}><span style={{fontSize:13}}>{d.nome}</span>{d.dia_vencimento&&<span style={{fontSize:11,color:C.faint,marginLeft:8}}>vence dia {d.dia_vencimento}</span>}{pago&&<span style={{fontSize:11,color:C.emer,marginLeft:8,fontWeight:600}}>✓ paga</span>}</div>
      <span style={{fontSize:13,color:pago?C.faint:C.coral,fontWeight:600}}>{brl(d.valor)}</span>
      {!pago&&<button onClick={()=>pagar(d)} disabled={paying===d.id} style={{background:C.emer+"22",color:C.emer,border:`1px solid ${C.emer}55`,borderRadius:8,padding:"4px 10px",fontSize:11.5,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>{paying===d.id?"...":"Pagar"}</button>}
      <button onClick={()=>abrirEdit(d)} style={{background:"none",border:"none",cursor:"pointer",color:C.faint,padding:3}} title="Editar"><Settings size={14}/></button>
      <button onClick={()=>excluir(d.id)} disabled={deleting===d.id} style={{background:"none",border:"none",cursor:"pointer",color:C.faint,padding:3}}>{deleting===d.id?<Loader2 size={13} className="animate-spin"/>:<Trash2 size={14}/>}</button>
    </div>;};
  const Grupo=({titulo,itens,total,neg})=>itens.length?<Panel>
    {renNeg===neg&&neg!==undefined
      ?<div className="flex items-center gap-2 mb-1">
        <input value={renVal} onChange={(e)=>setRenVal(e.target.value)} list="negocios-fixas" placeholder="Nome do negócio" autoFocus onKeyDown={(e)=>e.key==="Enter"&&salvarRename(neg,itens)} style={{...fieldSm,flex:1}}/>
        <button onClick={()=>salvarRename(neg,itens)} disabled={renLoad} style={{background:C.gold,color:"#16213a",border:"none",borderRadius:8,padding:"6px 12px",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>{renLoad?"...":"Salvar"}</button>
        <button onClick={()=>setRenNeg(null)} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:12.5}}>✕</button>
      </div>
      :<div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5" style={{fontSize:13,fontWeight:600}}>{titulo}{neg!==undefined&&<button onClick={()=>{setRenNeg(neg);setRenVal(neg||"");}} title="Nomear/renomear negócio" style={{background:"none",border:"none",cursor:"pointer",color:C.gold,padding:2,display:"inline-flex"}}><Settings size={12}/></button>}</div>
        <div style={{fontSize:13,fontWeight:600,color:C.coral}}>{brl(total)}</div>
      </div>}
    {itens.map(Linha)}</Panel>:null;
  return <div className="grid gap-4" style={{gridTemplateColumns:"minmax(0,520px)",justifyContent:"center"}}>
    <Panel>
      <div className="flex items-center gap-2 mb-1" style={{fontSize:14,fontWeight:600}}><Settings size={16} color={C.gold}/> Despesas fixas</div>
      <p style={{fontSize:12.5,color:C.muted,marginBottom:16}}>Separe o que é da <b style={{color:C.text}}>empresa (PJ)</b> e o que é <b style={{color:C.text}}>pessoal (PF)</b>. Tem vários negócios? Marque o <b style={{color:C.text}}>negócio</b> de cada custo fixo e veja o total de cada um.</p>
      <datalist id="negocios-fixas">{sugestoesNeg.map((n)=><option key={n} value={n}/>)}</datalist>
      <div className="flex flex-col gap-2 mb-4">
        <div className="flex gap-1.5">{[["pj","🏢 Empresa (PJ)"],["pf","👤 Pessoal (PF)"]].map(([k,l])=><button key={k} onClick={()=>setTipo(k)} className="flex-1 rounded-lg py-2" style={{fontSize:12.5,fontWeight:600,cursor:"pointer",background:tipo===k?C.emer+"22":C.panel2,color:tipo===k?C.emer:C.muted,border:`1px solid ${tipo===k?C.emer+"66":C.border}`}}>{l}</button>)}</div>
        <input value={nome} onChange={(e)=>setNome(e.target.value)} placeholder="Nome (ex: Aluguel)" onKeyDown={(e)=>e.key==="Enter"&&adicionar()} style={{...field,width:"100%"}}/>
        {tipo==="pj"&&<input value={neg} onChange={(e)=>setNeg(e.target.value)} list="negocios-fixas" placeholder="Negócio (ex: Loja, Clínica) — opcional" onKeyDown={(e)=>e.key==="Enter"&&adicionar()} style={{...field,width:"100%"}}/>}
        <div className="flex gap-2">
          <input value={valor} onChange={(e)=>setValor(e.target.value)} placeholder="Valor (R$)" inputMode="decimal" onKeyDown={(e)=>e.key==="Enter"&&adicionar()} style={{...field,flex:1}}/>
          <input value={dia} onChange={(e)=>setDia(e.target.value)} placeholder="Dia venc." inputMode="numeric" type="number" min={1} max={31} onKeyDown={(e)=>e.key==="Enter"&&adicionar()} style={{...field,width:90}} title="Dia do mês em que vence (opcional)"/>
          <button onClick={adicionar} disabled={load} className="rounded-lg px-4 flex items-center gap-2" style={{background:C.gold,color:"#16213a",fontSize:13,fontWeight:600,whiteSpace:"nowrap",cursor:load?"not-allowed":"pointer"}}>{load?<Loader2 size={15} className="animate-spin"/>:<><Plus size={15}/> Adicionar</>}</button>
        </div>
        <p style={{fontSize:11,color:C.faint}}>Dia de vencimento é opcional — preenche pra receber lembrete na véspera. 🔔</p>
      </div>
      {despesas.length===0&&<div style={{fontSize:13,color:C.faint,padding:"12px 0"}}>Nenhuma despesa fixa cadastrada.</div>}
    </Panel>
    {gruposNeg.map((ng)=>{const itens=pj.filter((d)=>(d.negocio||"").trim()===ng);const tot=itens.reduce((s,d)=>s+Number(d.valor),0);return <Grupo key={ng||"_semneg"} titulo={ng?`🏢 ${ng}`:"🏢 Empresa — sem negócio definido"} itens={itens} total={tot} neg={ng}/>;})}
    <Grupo titulo="👤 Custo fixo pessoal (PF)" itens={pf} total={totPf}/>
  </div>;
}

/* ─── LANÇAR ──────────────────────────────────────────────────────── */
function Lancar({user,onAdd,showToast}) {
  const[type,setType]=useState("saida");const[amt,setAmt]=useState("");const[cat,setCat]=useState("Alimentação");const[sub,setSub]=useState("");const[negocio,setNegocio]=useState("");const[desc,setDesc]=useState("");const[inst,setInst]=useState(1);const[load,setLoad]=useState(false);
  const[dataLanc,setDataLanc]=useState(()=>{const n=today();return mk(n)+"-"+String(Math.min(n.getDate(),28)).padStart(2,"0");});
  const CATS_SAIDA=["Alimentação","Moradia","Transporte","Assinaturas","Lazer","Saúde","Marketing","Equipe","Insumos","Impostos","Pró-labore","Investimento","Empréstimo","Outros"];
  const CATS_ENTRADA=["Vendas","Salário","Empréstimo","Pró-labore","Investimento","Empréstimo","Outros"];
  const cats=type==="saida"?CATS_SAIDA:CATS_ENTRADA;
  const handleType=(t)=>{setType(t);setCat(t==="saida"?"Alimentação":"Vendas");};
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",width:"100%",outline:"none"};
  const previewValor=()=>{const v=parseBRL(amt);const n=Math.max(1,Number(inst));if(isNaN(v)||v<=0||n===1)return null;return`${n}x de ${brl(v/n)}`;};
  const salvar=async()=>{
    const tot=parseBRL(amt);if(isNaN(tot)||tot<=0)return showToast("Digite um valor válido.","error");
    const n=Math.max(1,Math.min(36,Number(inst)));const valor=Number((tot/n).toFixed(2));const linhas=[];
    const grupoParcela=n>1?crypto.randomUUID():null;const baseDate=new Date(dataLanc+"T12:00:00");
    for(let i=0;i<n;i++){const d=addMonths(baseDate,i);linhas.push({tipo:type,valor,categoria:cat,subcategoria:sub.trim()||null,negocio:negocio.trim()||null,descricao:n>1?`${desc||sub||cat} — parcela ${i+1}/${n}`:(desc||sub||cat),data:mk(d)+"-"+String(Math.min(d.getDate(),28)).padStart(2,"0"),fixa:false,grupo_parcela:grupoParcela,parcela_atual:n>1?i+1:null,parcela_total:n>1?n:null});}
    setLoad(true);const{error}=await inserirLancamentos(linhas,user.id);
    if(error){setLoad(false);return showToast("Erro ao salvar.","error");}
    try{const{data:{session}}=await supabase.auth.getSession();if(session?.access_token)await sincronizarManual(session.access_token,linhas.map((l)=>({data:l.data,tipo:l.tipo,categoria:l.categoria,descricao:l.descricao,valor:l.valor})));}catch(_){}
    setLoad(false);setAmt("");setSub("");setNegocio("");setDesc("");setInst(1);showToast(n>1?`${n} parcelas lançadas!`:"Lançamento salvo!");onAdd();
  };
  return <div className="grid gap-4" style={{gridTemplateColumns:"minmax(0,460px)",justifyContent:"center"}}>
    <Panel>
      <div className="flex items-center gap-2 mb-1" style={{fontSize:14,fontWeight:600}}><Plus size={16} color={C.gold}/> Lançar manualmente</div>
      <p style={{fontSize:12.5,color:C.muted,marginBottom:14}}>No dia a dia, é só mandar áudio no WhatsApp. Aqui você lança pela tela quando preferir.</p>
      <div className="flex gap-1.5 mb-3">{[["saida","Saída",C.coral],["entrada","Entrada",C.emer]].map(([k,l,col])=><button key={k} onClick={()=>handleType(k)} className="flex-1 rounded-lg py-2" style={{fontSize:13,fontWeight:600,cursor:"pointer",background:type===k?col+"22":C.panel2,color:type===k?col:C.muted,border:`1px solid ${type===k?col+"66":C.border}`}}>{l}</button>)}</div>
      <div className="flex flex-col gap-2.5">
        <div><input value={amt} onChange={(e)=>setAmt(e.target.value)} placeholder="Valor (R$)" inputMode="decimal" style={field}/>{previewValor()&&<div style={{fontSize:11.5,color:C.gold,marginTop:4}}>{previewValor()}</div>}</div>
        <select value={cat} onChange={(e)=>setCat(e.target.value)} style={{...field,appearance:"none"}}>{cats.map((c)=><option key={c} value={c} style={{background:C.panel2}}>{c}</option>)}</select>
        <input value={sub} onChange={(e)=>setSub(e.target.value)} placeholder={type==="entrada"?"Produto/Serviço (ex: Harmonização facial)":"Detalhe (ex: Tráfego pago, Influencer)"} style={field}/>
        <input value={negocio} onChange={(e)=>setNegocio(e.target.value)} placeholder="Negócio (ex: Clínica, Loja) — opcional" style={field}/>
        <input value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="Descrição (opcional)" style={field}/>
        <div><div style={{fontSize:11.5,color:C.faint,marginBottom:4}}>Data</div><input type="date" value={dataLanc} onChange={(e)=>setDataLanc(e.target.value)} style={{...field,colorScheme:"dark"}}/></div>
        <div className="flex items-center gap-2"><span style={{fontSize:12.5,color:C.muted,whiteSpace:"nowrap"}}>{type==="saida"?"Parcelas:":"Recebimentos futuros:"}</span><input value={inst} onChange={(e)=>setInst(Math.max(1,Math.min(36,Number(e.target.value))))} type="number" min={1} max={36} style={{...field,width:70}}/></div>
        <button onClick={salvar} disabled={load} className="rounded-lg py-2.5 mt-1 flex items-center justify-center gap-2" style={{background:load?C.goldDeep:C.gold,color:"#16213a",fontSize:13.5,fontWeight:600,cursor:load?"not-allowed":"pointer"}}>{load?<><Loader2 size={16} className="animate-spin"/> Salvando…</>:"Adicionar lançamento"}</button>
      </div>
    </Panel>
  </div>;
}

/* ─── RELATÓRIO MENSAL (imagem compartilhável) ────────────────────── */
function Relatorio({txs,perfil,showToast}) {
  const ref=React.useRef(null);const[baixando,setBaixando]=useState(false);
  const meses=useMemo(()=>{const s=new Set(txs.filter((t)=>!t.cancelado).map((t)=>t.date.slice(0,7)));s.add(mk(today()));return[...s].sort().reverse();},[txs]);
  const[mes,setMes]=useState(mk(today()));
  const d=useMemo(()=>{
    // só conta o que JÁ aconteceu (data <= hoje); parcelas/compromissos futuros não entram
    const N=today();const hojeStr=`${N.getFullYear()}-${String(N.getMonth()+1).padStart(2,"0")}-${String(N.getDate()).padStart(2,"0")}`;
    const lin=txs.filter((t)=>!t.cancelado&&t.date.slice(0,7)===mes&&(t.date||"")<=hojeStr);
    let ent=0,sai=0;const vend={},gasto={};
    lin.forEach((t)=>{if(t.type==="entrada"){ent+=t.amount;const k=t.sub||t.category;vend[k]=(vend[k]||0)+t.amount;}else{sai+=t.amount;const k=t.sub||t.category;gasto[k]=(gasto[k]||0)+t.amount;}});
    const top=(o)=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0];
    const[y,m]=mes.split("-");const nomeMes=new Date(y,m-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
    return{ent,sai,lucro:ent-sai,topVenda:top(vend),topGasto:top(gasto),nomeMes,n:lin.length};
  },[txs,mes]);
  const baixar=async()=>{
    setBaixando(true);
    try{
      const html2canvas=(await import("html2canvas")).default;
      const canvas=await html2canvas(ref.current,{scale:3,backgroundColor:null,useCORS:true});
      const a=document.createElement("a");a.href=canvas.toDataURL("image/png");a.download=`organize-c_relatorio_${mes}.png`;a.click();
      showToast("Imagem baixada! 📸");
    }catch(e){console.error(e);showToast("Erro ao gerar imagem","error");}
    setBaixando(false);
  };
  const cap=(s)=>s.charAt(0).toUpperCase()+s.slice(1);
  return <div className="flex flex-col items-center gap-4">
    <div className="flex items-center gap-2 self-stretch justify-between flex-wrap">
      <select value={mes} onChange={(e)=>setMes(e.target.value)} style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"8px 12px",outline:"none"}}>{meses.map((m)=>{const[y,mm]=m.split("-");return<option key={m} value={m}>{cap(new Date(y,mm-1,1).toLocaleDateString("pt-BR",{month:"long",year:"numeric"}))}</option>;})}</select>
      <button onClick={baixar} disabled={baixando} className="flex items-center gap-2" style={{background:C.emer,color:"#06231a",border:"none",borderRadius:10,padding:"10px 18px",fontSize:14,fontWeight:600,cursor:"pointer"}}>{baixando?<Loader2 size={16} className="animate-spin"/>:<DollarSign size={16}/>} Baixar imagem</button>
    </div>
    {/* CARD que vira imagem */}
    <div ref={ref} style={{width:380,background:`linear-gradient(160deg, #0c1322, ${C.bg})`,border:`1px solid ${C.border2}`,borderRadius:24,padding:"32px 28px",fontFamily:sans}}>
      <div className="flex items-center gap-2 mb-1" style={{justifyContent:"center"}}><img src="/logo.png" alt="" style={{width:30,height:30,borderRadius:8}}/><span style={{fontSize:15,fontWeight:500,color:"#c2c9da"}}>organize-c</span><span style={{fontFamily:serif,fontSize:21,color:C.emer}}>finance</span></div>
      <div style={{textAlign:"center",fontSize:12,letterSpacing:".18em",textTransform:"uppercase",color:C.gold,marginBottom:24,marginTop:8}}>{cap(d.nomeMes)}</div>
      <div style={{textAlign:"center",marginBottom:6}}><div style={{fontSize:12,color:C.muted}}>Lucro do mês</div><div style={{fontFamily:serif,fontSize:46,fontWeight:600,color:d.lucro>=0?C.emer:C.coral,lineHeight:1.1}}>{brl(d.lucro)}</div></div>
      <div className="grid" style={{gridTemplateColumns:"1fr 1fr",gap:12,margin:"22px 0"}}>
        <div style={{background:C.panel2,borderRadius:14,padding:"14px"}}><div style={{fontSize:11.5,color:C.faint}}>Entrou</div><div style={{fontFamily:serif,fontSize:22,fontWeight:600,color:C.emer}}>{brl0(d.ent)}</div></div>
        <div style={{background:C.panel2,borderRadius:14,padding:"14px"}}><div style={{fontSize:11.5,color:C.faint}}>Saiu</div><div style={{fontFamily:serif,fontSize:22,fontWeight:600,color:C.coral}}>{brl0(d.sai)}</div></div>
      </div>
      {d.topVenda&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0",borderTop:`1px solid ${C.border}`}}><span style={{color:C.muted}}>🏆 Mais vendeu</span><span style={{fontWeight:600}}>{d.topVenda[0]}</span></div>}
      {d.topGasto&&<div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0",borderTop:`1px solid ${C.border}`}}><span style={{color:C.muted}}>💸 Maior gasto</span><span style={{fontWeight:600}}>{d.topGasto[0]}</span></div>}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"8px 0",borderTop:`1px solid ${C.border}`}}><span style={{color:C.muted}}>📌 Lançamentos</span><span style={{fontWeight:600}}>{d.n}</span></div>
      <div style={{textAlign:"center",fontSize:11,color:C.faint,marginTop:18}}>Organize suas finanças pelo WhatsApp 💛<br/>organize-c.com/finance</div>
    </div>
    <p style={{fontSize:12.5,color:C.faint,textAlign:"center",maxWidth:380}}>Baixe e compartilhe seu fechamento do mês. 📲 Escolha o mês acima.</p>
  </div>;
}

/* ─── CLIENTES (mini-CRM) ─────────────────────────────────────────── */
function Clientes({txs,onUpdate,showToast}) {
  const[busca,setBusca]=useState("");const[ordem,setOrdem]=useState("gerado");const[editNome,setEditNome]=useState(null);const[novo,setNovo]=useState("");const[nRec,setNRec]=useState("");const[nPag,setNPag]=useState("");const[savingN,setSavingN]=useState(false);
  const abrirEdit=(c)=>{setEditNome(c.nome);setNovo(c.nome);setNRec(c.aReceber?String(c.aReceber).replace(".",","):"");setNPag(c.aPagar?String(c.aPagar).replace(".",","):"");};
  const salvar=async(c)=>{const n=novo.trim();if(!n)return showToast("Digite o nome","error");setSavingN(true);
    try{
      if(n!==c.nome)await renomearPessoa(c.nome,n);
      const rec=parseBRL(nRec)||0;if(rec!==c.aReceber)await ajustarPendentePessoa(n,"entrada",rec);
      const pag=parseBRL(nPag)||0;if(pag!==c.aPagar)await ajustarPendentePessoa(n,"saida",pag);
    }catch(e){setSavingN(false);return showToast("Erro ao salvar","error");}
    setSavingN(false);setEditNome(null);showToast("Atualizado!");onUpdate&&onUpdate();};
  const fmtD=(d)=>new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"2-digit"});
  const mapa=useMemo(()=>{
    const m={};
    txs.filter((t)=>t.pessoa&&!t.cancelado).forEach((t)=>{
      const k=t.pessoa.trim();if(!m[k])m[k]={nome:k,gerado:0,gasto:0,aReceber:0,aPagar:0,n:0,ult:t.date};
      if(t.type==="entrada"){m[k].gerado+=t.amount;m[k].aReceber+=(t.pendente||0);}
      else{m[k].gasto+=t.amount;m[k].aPagar+=(t.pendente||0);}
      m[k].n++;if(t.date>m[k].ult)m[k].ult=t.date;
    });
    return Object.values(m);
  },[txs]);
  const totalReceber=mapa.reduce((s,c)=>s+c.aReceber,0);
  const totalPagar=mapa.reduce((s,c)=>s+c.aPagar,0);
  const lista=mapa.filter((c)=>c.nome.toLowerCase().includes(busca.toLowerCase()))
    .sort((a,b)=>ordem==="pendente"?(b.aReceber+b.aPagar)-(a.aReceber+a.aPagar):ordem==="recente"?(a.ult<b.ult?1:-1):b.gerado-a.gerado);
  const receber=mapa.filter((c)=>c.aReceber>0).sort((a,b)=>b.aReceber-a.aReceber);
  const pagar=mapa.filter((c)=>c.aPagar>0).sort((a,b)=>b.aPagar-a.aPagar);
  const fieldSm={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:12.5,borderRadius:8,padding:"6px 10px",outline:"none"};
  if(mapa.length===0)return<Panel><div style={{fontSize:13,color:C.faint,padding:16}}>Quando você registrar com o nome da pessoa (ex: "recebi 300 da Ana"), seus clientes aparecem aqui com quanto cada um gerou e quem te deve.</div></Panel>;
  return <div className="flex flex-col gap-4">
    <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))"}}>
      {receber.length>0&&<Panel style={{borderColor:C.emer+"44"}}>
        <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2" style={{fontSize:14,fontWeight:500}}><ArrowUpRight size={15} color={C.emer}/> A receber</div><div style={{fontSize:13,color:C.emer,fontWeight:600}}>{brl(totalReceber)}</div></div>
        {receber.slice(0,6).map((c,i)=><div key={c.nome} className="flex items-center justify-between py-1.5" style={{fontSize:13,borderTop:i?`1px solid ${C.border}`:"none"}}><span>{c.nome}</span><span style={{color:C.emer,fontWeight:600}}>{brl(c.aReceber)}</span></div>)}
      </Panel>}
      {pagar.length>0&&<Panel style={{borderColor:C.coral+"44"}}>
        <div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2" style={{fontSize:14,fontWeight:500}}><ArrowDownRight size={15} color={C.coral}/> A pagar</div><div style={{fontSize:13,color:C.coral,fontWeight:600}}>{brl(totalPagar)}</div></div>
        {pagar.slice(0,6).map((c,i)=><div key={c.nome} className="flex items-center justify-between py-1.5" style={{fontSize:13,borderTop:i?`1px solid ${C.border}`:"none"}}><span>{c.nome}</span><span style={{color:C.coral,fontWeight:600}}>{brl(c.aPagar)}</span></div>)}
      </Panel>}
    </div>
    <Panel>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2" style={{fontSize:14,fontWeight:500}}><Users size={16} color={C.gold}/> Seus clientes <span style={{fontSize:12,color:C.faint}}>({mapa.length})</span></div>
        <div className="flex gap-2">
          <div style={{position:"relative"}}><Search size={13} color={C.faint} style={{position:"absolute",left:9,top:8}}/><input value={busca} onChange={(e)=>setBusca(e.target.value)} placeholder="Buscar cliente..." style={{...fieldSm,paddingLeft:28,width:160}}/></div>
          <select value={ordem} onChange={(e)=>setOrdem(e.target.value)} style={fieldSm}><option value="gerado">Mais gerou</option><option value="pendente">Maior dívida</option><option value="recente">Mais recente</option></select>
        </div>
      </div>
      {lista.map((c,i)=><div key={c.nome} className="flex items-center gap-3 py-2.5" style={{borderTop:i?`1px solid ${C.border}`:"none"}}>
        <div style={{width:34,height:34,borderRadius:"50%",background:C.panel2,border:`1px solid ${C.border}`,fontSize:13,color:C.gold,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{c.nome[0].toUpperCase()}</div>
        {editNome===c.nome
          ?<div className="flex-1 flex flex-col gap-2">
            <input autoFocus value={novo} onChange={(e)=>setNovo(e.target.value)} placeholder="Nome" style={{...fieldSm,width:"100%"}}/>
            <div className="flex gap-2 items-center flex-wrap">
              <span style={{fontSize:11.5,color:C.faint}}>A receber</span><input value={nRec} onChange={(e)=>setNRec(e.target.value)} placeholder="0" inputMode="decimal" style={{...fieldSm,width:90}}/>
              <span style={{fontSize:11.5,color:C.faint}}>A pagar</span><input value={nPag} onChange={(e)=>setNPag(e.target.value)} placeholder="0" inputMode="decimal" style={{...fieldSm,width:90}}/>
              <button onClick={()=>salvar(c)} disabled={savingN} style={{background:C.gold,color:"#16213a",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>{savingN?"…":"Salvar"}</button>
              <button onClick={()=>setEditNome(null)} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:13}}>✕</button>
            </div>
          </div>
          :<><div className="flex-1" style={{minWidth:0}}><div style={{fontSize:14,fontWeight:500}}>{c.nome}</div><div style={{fontSize:11.5,color:C.faint}}>{c.n} {c.n===1?"lançamento":"lançamentos"} · última {fmtD(c.ult)}</div></div>
        <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:14,fontWeight:600,color:C.emer}}>{brl(c.gerado)}</div>{c.aReceber>0&&<div style={{fontSize:11.5,color:C.emer}}>a receber {brl(c.aReceber)}</div>}{c.aPagar>0&&<div style={{fontSize:11.5,color:C.coral}}>a pagar {brl(c.aPagar)}</div>}</div>
        <button onClick={()=>abrirEdit(c)} style={{background:"none",border:"none",cursor:"pointer",color:C.faint,padding:3,flexShrink:0}} title="Editar"><Settings size={14}/></button></>}
      </div>)}
      {lista.length===0&&<div style={{textAlign:"center",padding:20,color:C.faint,fontSize:13}}>Nenhum cliente com esse nome.</div>}
    </Panel>
  </div>;
}

/* ─── LISTA ───────────────────────────────────────────────────────── */
function Lista({txs,onDelete,showToast,cores}) {
  const NOW=today();const[busca,setBusca]=useState("");const[filtroTipo,setFiltroTipo]=useState("todos");const[filtroCat,setFiltroCat]=useState("todas");const[deleting,setDeleting]=useState(null);
  const[dataDe,setDataDe]=useState("");const[dataAte,setDataAte]=useState("");const[editTx,setEditTx]=useState(null);
  const fmt=(d)=>new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});
  const cats=[...new Set(txs.map((t)=>t.category))].sort();
  const lista=txs.filter((t)=>{
    if(filtroTipo!=="todos"&&t.type!==filtroTipo)return false;
    if(filtroCat!=="todas"&&t.category!==filtroCat)return false;
    if(dataDe&&t.date<dataDe)return false;
    if(dataAte&&t.date>dataAte)return false;
    if(busca&&!t.desc?.toLowerCase().includes(busca.toLowerCase())&&!t.category?.toLowerCase().includes(busca.toLowerCase()))return false;
    return true;
  });
  // atalhos de período
  const setMes=(offset)=>{const d=addMonths(NOW,offset);const y=d.getFullYear(),m=d.getMonth();const ini=`${y}-${String(m+1).padStart(2,"0")}-01`;const fim=new Date(y,m+1,0);const fimS=`${y}-${String(m+1).padStart(2,"0")}-${String(fim.getDate()).padStart(2,"0")}`;setDataDe(ini);setDataAte(fimS);};
  const limparPeriodo=()=>{setDataDe("");setDataAte("");};
  // resumo por categoria (sempre somado) sobre a lista filtrada
  const resumo=useMemo(()=>{
    const m={};let totEnt=0,totSai=0;
    lista.filter((t)=>!t.cancelado).forEach((t)=>{const k=t.category||"Outros";if(!m[k])m[k]={entrada:0,saida:0};m[k][t.type]=(m[k][t.type]||0)+t.amount;if(t.type==="entrada")totEnt+=t.amount;else totSai+=t.amount;});
    const cats=Object.entries(m).map(([nome,v])=>({nome,...v,total:(v.saida||0)+(v.entrada||0)})).sort((a,b)=>(b.saida+b.entrada)-(a.saida+a.entrada));
    return{cats,totEnt,totSai,saldo:totEnt-totSai};
  },[lista]);
  // baixar planilha (CSV — abre no Excel/Google Sheets)
  const baixarPlanilha=()=>{
    const n=(v)=>Number(v).toFixed(2).replace(".",",");
    const esc=(s)=>`"${String(s??"").replace(/"/g,'""')}"`;
    const linhas=[["Data","Tipo","Categoria","Produto/Serviço","Negócio","Descrição","Pessoa","Status","Valor (R$)","Falta receber/pagar (R$)"]];
    lista.slice().sort((a,b)=>a.date<b.date?-1:1).forEach((t)=>linhas.push([t.date,t.type==="entrada"?"Entrada":"Saída",t.category,t.sub||"",t.negocio||"",t.desc,t.pessoa||"",t.cancelado?"CANCELADA":"OK",n(t.amount),t.pendente?n(t.pendente):""]));
    const totPend=lista.filter((t)=>!t.cancelado).reduce((s,t)=>s+(t.pendente||0),0);
    linhas.push([]);linhas.push(["RESUMO POR CATEGORIA"]);linhas.push(["Categoria","Entradas","Saídas"]);
    resumo.cats.forEach((c)=>linhas.push([c.nome,n(c.entrada||0),n(c.saida||0)]));
    linhas.push([]);linhas.push(["TOTAIS"]);
    linhas.push(["Total entradas",n(resumo.totEnt)]);linhas.push(["Total saídas",n(resumo.totSai)]);linhas.push(["Saldo",n(resumo.saldo)]);
    if(totPend>0)linhas.push(["Total a receber/pagar (pendente)",n(totPend)]);
    const csv="﻿"+linhas.map((l)=>l.map(esc).join(";")).join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    const periodo=dataDe||dataAte?`${dataDe||"inicio"}_a_${dataAte||"hoje"}`:"completo";
    a.href=url;a.download=`organize-c-financas_${periodo}.csv`;a.click();URL.revokeObjectURL(url);
    showToast("Planilha baixada! 📊");
  };
  const excluirLanc=async(id)=>{if(!window.confirm("Remover este lançamento?"))return;setDeleting(id);const{error}=await supabase.from("lancamentos").delete().eq("id",id);setDeleting(null);if(error)return showToast("Erro ao remover.","error");showToast("Lançamento removido.");onDelete();};
  const fieldSm={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:12.5,borderRadius:8,padding:"6px 10px",outline:"none"};
  const chip=(ativo)=>({fontSize:11.5,cursor:"pointer",background:ativo?C.gold:C.panel2,color:ativo?"#16213a":C.muted,border:`1px solid ${ativo?C.gold:C.border}`,borderRadius:20,padding:"5px 11px",fontWeight:ativo?600:400});
  if(txs.length===0)return<Panel><div style={{fontSize:13,color:C.faint,padding:16}}>Nenhum lançamento ainda. Use o WhatsApp ou a aba "Lançar" para começar.</div></Panel>;
  const temPeriodo=dataDe||dataAte;
  return <div className="flex flex-col gap-4">
  <Panel>
    <div className="flex items-center justify-between mb-3 flex-wrap gap-2"><div style={{fontSize:14,fontWeight:500}}>Todos os lançamentos</div><div style={{fontSize:12,color:C.faint}}>{lista.length} de {txs.length}</div></div>
    {/* período */}
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <span style={{fontSize:11.5,color:C.faint}}>Período:</span>
      <button onClick={()=>setMes(0)} style={chip(false)}>Este mês</button>
      <button onClick={()=>setMes(-1)} style={chip(false)}>Mês passado</button>
      <input type="date" value={dataDe} onChange={(e)=>setDataDe(e.target.value)} style={{...fieldSm,colorScheme:"dark"}}/>
      <span style={{fontSize:12,color:C.faint}}>até</span>
      <input type="date" value={dataAte} onChange={(e)=>setDataAte(e.target.value)} style={{...fieldSm,colorScheme:"dark"}}/>
      {temPeriodo&&<button onClick={limparPeriodo} style={{...chip(false),border:"none",background:"none",color:C.faint,textDecoration:"underline"}}>limpar</button>}
      <button onClick={baixarPlanilha} className="flex items-center gap-1.5" style={{marginLeft:"auto",background:C.emer,color:"#06231a",border:"none",borderRadius:8,padding:"7px 13px",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>
        <DollarSign size={14}/> Baixar planilha
      </button>
    </div>
    <div className="flex gap-2 mb-4 flex-wrap">
      <div style={{position:"relative"}}><Search size={13} color={C.faint} style={{position:"absolute",left:9,top:8}}/><input value={busca} onChange={(e)=>setBusca(e.target.value)} placeholder="Buscar..." style={{...fieldSm,paddingLeft:28,width:160}}/></div>
      <select value={filtroTipo} onChange={(e)=>setFiltroTipo(e.target.value)} style={fieldSm}><option value="todos">Todos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select>
      <select value={filtroCat} onChange={(e)=>setFiltroCat(e.target.value)} style={fieldSm}><option value="todas">Todas as categorias</option>{cats.map((c)=><option key={c} value={c}>{c}</option>)}</select>
    </div>
    <div className="flex flex-col">
      {lista.map((t,i)=>{const fut=new Date(t.date+"T12:00:00")>NOW;const canc=t.cancelado;return<div key={t.id} className="flex items-center gap-3 py-2.5" style={{borderTop:i?`1px solid ${C.border}`:"none",opacity:canc?0.55:1}}>
        <div className="flex items-center justify-center rounded-lg" style={{width:34,height:34,flexShrink:0,background:(canc?C.faint:(t.type==="entrada"?C.emer:C.coral))+"1c"}}>{t.type==="entrada"?<ArrowUpRight size={17} color={canc?C.faint:C.emer}/>:<ArrowDownRight size={17} color={canc?C.faint:C.coral}/>}</div>
        <div className="flex-1" style={{minWidth:0}}><div className="flex items-center gap-2 flex-wrap" style={{fontSize:13.5}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textDecoration:canc?"line-through":"none"}}>{t.desc}</span>{canc&&<Badge color={C.coral}>cancelada</Badge>}{t.pessoa&&<Badge color={C.muted}>{t.pessoa}</Badge>}{fut&&!canc&&<Badge color={C.faint}>previsto</Badge>}{t.parcela&&<Badge color={C.gold}>{t.parcela}</Badge>}{t.pendente>0&&!canc&&<Badge color={C.coral}>falta {brl(t.pendente)}</Badge>}</div><div style={{fontSize:11.5,color:C.faint}}>{fmt(t.date)} · {t.sub?`${t.category} · ${t.sub}`:t.category}{t.negocio?` · ${t.negocio}`:""}</div></div>
        <div style={{fontSize:14,fontWeight:600,color:canc?C.faint:(t.type==="entrada"?C.emer:C.coral),flexShrink:0,textDecoration:canc?"line-through":"none"}}>{t.type==="entrada"?"+":"-"}{brl(t.amount)}</div>
        <button onClick={()=>setEditTx(t)} style={{background:"none",border:"none",cursor:"pointer",color:C.faint,padding:4,flexShrink:0}} title="Editar"><Settings size={13}/></button>
        <button onClick={()=>excluirLanc(t.id)} disabled={deleting===t.id} style={{background:"none",border:"none",cursor:"pointer",color:C.faint,padding:4,flexShrink:0}} title="Remover">{deleting===t.id?<Loader2 size={13} className="animate-spin"/>:<Trash2 size={13}/>}</button>
      </div>;})}
    </div>
    {lista.length===0&&<div style={{textAlign:"center",padding:24,color:C.faint,fontSize:13}}>Nenhum resultado com esses filtros.</div>}
  </Panel>
  {editTx&&<EditarLancamento tx={editTx} onClose={()=>setEditTx(null)} onSaved={()=>{setEditTx(null);onDelete();}} showToast={showToast}/>}
  {/* RESUMO POR CATEGORIA (sempre somado) */}
  {resumo.cats.length>0&&<Panel>
    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
      <div style={{fontSize:14,fontWeight:500}}>Resumo por categoria {temPeriodo?"(período)":"(tudo)"}</div>
      <div className="flex gap-3" style={{fontSize:12}}><span style={{color:C.emer}}>↑ {brl(resumo.totEnt)}</span><span style={{color:C.coral}}>↓ {brl(resumo.totSai)}</span><span style={{color:resumo.saldo>=0?C.gold:C.coral,fontWeight:600}}>= {brl(resumo.saldo)}</span></div>
    </div>
    {resumo.cats.map((c,i)=><div key={c.nome} className="flex items-center justify-between py-2" style={{fontSize:13,borderTop:i?`1px solid ${C.border}`:"none"}}>
      <div className="flex items-center gap-2"><span style={{width:9,height:9,borderRadius:3,background:corItem(c.nome,i,cores),display:"inline-block"}}/>{c.nome}</div>
      <div className="flex gap-4">{c.entrada>0&&<span style={{color:C.emer}}>+{brl(c.entrada)}</span>}{c.saida>0&&<span style={{color:C.coral}}>-{brl(c.saida)}</span>}</div>
    </div>)}
  </Panel>}
  </div>;
}

/* ─── EDITAR LANÇAMENTO (modal) ───────────────────────────────────── */
function EditarLancamento({tx,onClose,onSaved,showToast}) {
  const[type,setType]=useState(tx.type);const[amt,setAmt]=useState(String(tx.amount).replace(".",","));
  const[cat,setCat]=useState(tx.category);const[sub,setSub]=useState(tx.sub||"");const[negocio,setNegocio]=useState(tx.negocio||"");const[desc,setDesc]=useState(tx.desc||"");
  const[pessoa,setPessoa]=useState(tx.pessoa||"");const[data,setData]=useState(tx.date);const[load,setLoad]=useState(false);
  const CATS_SAIDA=["Alimentação","Moradia","Transporte","Saúde","Assinaturas","Lazer","Marketing","Equipe","Insumos","Impostos","Pró-labore","Investimento","Empréstimo","Outros"];
  const CATS_ENTRADA=["Vendas","Salário","Empréstimo","Pró-labore","Investimento","Empréstimo","Outros"];
  const cats=type==="saida"?CATS_SAIDA:CATS_ENTRADA;
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",width:"100%",outline:"none"};
  const salvar=async()=>{
    const v=parseBRL(amt);if(isNaN(v)||v<=0)return showToast("Valor inválido","error");
    setLoad(true);
    const{error}=await editarLancamento(tx.id,{tipo:type,valor:v,categoria:cat,subcategoria:sub.trim()||null,negocio:negocio.trim()||null,descricao:desc.trim()||sub.trim()||cat,pessoa:pessoa.trim()||null,data});
    setLoad(false);
    if(error)return showToast("Erro ao salvar","error");
    showToast("Lançamento atualizado!");onSaved();
  };
  return <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div onClick={(e)=>e.stopPropagation()} className="rounded-2xl p-5" style={{background:C.panel,border:`1px solid ${C.border2}`,width:"100%",maxWidth:420}}>
      <div className="flex items-center justify-between mb-4"><div style={{fontSize:15,fontWeight:600}}>Editar lançamento</div><button onClick={onClose} style={{background:"none",border:"none",color:C.faint,cursor:"pointer",fontSize:18}}>✕</button></div>
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-1.5">{[["saida","Saída",C.coral],["entrada","Entrada",C.emer]].map(([k,l,col])=><button key={k} onClick={()=>{setType(k);setCat(k==="saida"?"Alimentação":"Vendas");}} className="flex-1 rounded-lg py-2" style={{fontSize:13,fontWeight:600,cursor:"pointer",background:type===k?col+"22":C.panel2,color:type===k?col:C.muted,border:`1px solid ${type===k?col+"66":C.border}`}}>{l}</button>)}</div>
        <input value={amt} onChange={(e)=>setAmt(e.target.value)} placeholder="Valor (R$)" inputMode="decimal" style={field}/>
        <select value={cat} onChange={(e)=>setCat(e.target.value)} style={{...field,appearance:"none"}}>{cats.map((c)=><option key={c} value={c} style={{background:C.panel2}}>{c}</option>)}</select>
        <input value={sub} onChange={(e)=>setSub(e.target.value)} placeholder="Produto/Item (ex: Gasolina, Harmonização)" style={field}/>
        <input value={negocio} onChange={(e)=>setNegocio(e.target.value)} placeholder="Negócio (ex: Clínica) — opcional" style={field}/>
        <input value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="Descrição" style={field}/>
        <input value={pessoa} onChange={(e)=>setPessoa(e.target.value)} placeholder="Pessoa (opcional)" style={field}/>
        <div><div style={{fontSize:11.5,color:C.faint,marginBottom:4}}>Data</div><input type="date" value={data} onChange={(e)=>setData(e.target.value)} style={{...field,colorScheme:"dark"}}/></div>
        <button onClick={salvar} disabled={load} className="rounded-lg py-2.5 mt-1 flex items-center justify-center gap-2" style={{background:load?C.goldDeep:C.gold,color:"#16213a",fontSize:13.5,fontWeight:600,cursor:load?"not-allowed":"pointer"}}>{load?<><Loader2 size={16} className="animate-spin"/> Salvando…</>:"Salvar alterações"}</button>
      </div>
    </div>
  </div>;
}

/* ─── METAS ───────────────────────────────────────────────────────── */
function Metas({calc,meta,mes,onMeta,showToast}) {
  const[edit,setEdit]=useState(false);const[fat,setFat]=useState("");const[luc,setLuc]=useState("");const[load,setLoad]=useState(false);
  const metaFat=Number(meta?.meta_faturamento||0);const metaLuc=Number(meta?.meta_lucro||0);
  const temMeta=metaFat>0||metaLuc>0;
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",width:"100%",outline:"none"};
  const abrir=()=>{setFat(metaFat?String(metaFat).replace(".",","):"");setLuc(metaLuc?String(metaLuc).replace(".",","):"");setEdit(true);};
  const salvar=async()=>{const f=parseBRL(fat)||0;const l=parseBRL(luc)||0;setLoad(true);const{error}=await salvarMeta(mes,f,l);setLoad(false);if(error)return showToast("Erro ao salvar meta","error");setEdit(false);showToast("Meta salva! 🎯");onMeta();};
  const Barra=({label,atual,meta,cor})=>{const pct=meta>0?Math.min(100,atual/meta*100):0;const falta=Math.max(0,meta-atual);const bateu=atual>=meta&&meta>0;return<div className="mb-3">
    <div className="flex items-center justify-between mb-1.5" style={{fontSize:13}}><span style={{color:C.muted}}>{label}</span><span style={{fontWeight:600,color:cor}}>{brl(atual)} <span style={{color:C.faint,fontWeight:400}}>/ {brl(meta)}</span></span></div>
    <div style={{height:9,background:C.panel2,borderRadius:99,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",background:cor,borderRadius:99,transition:"width .4s"}}/></div>
    <div style={{fontSize:11.5,color:bateu?C.emer:C.faint,marginTop:4}}>{bateu?`🎉 Meta batida! +${brl(atual-meta)} acima`:`${pct.toFixed(0)}% — faltam ${brl(falta)}`}</div>
  </div>;};
  return <Panel>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2" style={{fontSize:14,fontWeight:500}}><Target size={16} color={C.gold}/> Metas de {monthLabel(mes)}</div>
      <button onClick={abrir} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"5px 11px",fontSize:12,cursor:"pointer"}}>{temMeta?"Editar metas":"Definir metas"}</button>
    </div>
    {edit?<div className="flex flex-col gap-2">
      <div><div style={{fontSize:11.5,color:C.faint,marginBottom:4}}>Meta de faturamento (entradas)</div><input value={fat} onChange={(e)=>setFat(e.target.value)} placeholder="Ex: 20000" inputMode="decimal" style={field}/></div>
      <div><div style={{fontSize:11.5,color:C.faint,marginBottom:4}}>Meta de lucro</div><input value={luc} onChange={(e)=>setLuc(e.target.value)} placeholder="Ex: 12000" inputMode="decimal" style={field}/></div>
      <div className="flex gap-2 mt-1"><button onClick={salvar} disabled={load} style={{flex:1,background:C.gold,color:"#16213a",border:"none",borderRadius:8,padding:"9px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{load?"Salvando…":"Salvar metas"}</button><button onClick={()=>setEdit(false)} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"9px 14px",fontSize:13,cursor:"pointer"}}>Cancelar</button></div>
    </div>:temMeta?<>
      {metaFat>0&&<Barra label="Faturamento" atual={calc.entradasMes} meta={metaFat} cor={C.emer}/>}
      {metaLuc>0&&<Barra label="Lucro" atual={calc.lucro} meta={metaLuc} cor={C.gold}/>}
    </>:<p style={{fontSize:13,color:C.faint}}>Defina sua meta de faturamento e lucro do mês para acompanhar seu progresso. 🎯</p>}
  </Panel>;
}

/* ─── PLANEJAMENTO DO DONO (imposto + pró-labore) ─────────────────── */
function Planejamento({calc,perfil,onUpdate,showToast}) {
  const[edit,setEdit]=useState(false);const[imp,setImp]=useState("");const[pro,setPro]=useState("");const[load,setLoad]=useState(false);
  const impPct=Number(perfil?.imposto_pct||0);const proAlvo=Number(perfil?.prolabore_alvo||0);
  const config=impPct>0||proAlvo>0;
  const reservaImposto=calc.entradasMes*impPct/100;
  const proRetirado=calc.proLabore;const faltaPro=Math.max(0,proAlvo-proRetirado);
  const sobra=calc.entradasMes-calc.saidasMes-reservaImposto; // disponível depois de custos e reserva de imposto
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",width:"100%",outline:"none"};
  const abrir=()=>{setImp(impPct?String(impPct).replace(".",","):"");setPro(proAlvo?String(proAlvo).replace(".",","):"");setEdit(true);};
  const salvar=async()=>{const i=parseBRL(imp)||0;const p=parseBRL(pro)||0;setLoad(true);const{error}=await salvarPlanejamento(i,p);setLoad(false);if(error)return showToast("Erro ao salvar","error");setEdit(false);showToast("Planejamento salvo! 🏷️");onUpdate();};
  return <Panel>
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2" style={{fontSize:14,fontWeight:500}}><PiggyBank size={16} color={C.emer}/> Planejamento do dono</div>
      <button onClick={abrir} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"5px 11px",fontSize:12,cursor:"pointer"}}>{config?"Editar":"Configurar"}</button>
    </div>
    {edit?<div className="flex flex-col gap-2">
      <div><div style={{fontSize:11.5,color:C.faint,marginBottom:4}}>% para reservar de imposto (ex: 6 para Simples Nacional)</div><input value={imp} onChange={(e)=>setImp(e.target.value)} placeholder="Ex: 6" inputMode="decimal" style={field}/></div>
      <div><div style={{fontSize:11.5,color:C.faint,marginBottom:4}}>Pró-labore alvo do mês (sua retirada fixa)</div><input value={pro} onChange={(e)=>setPro(e.target.value)} placeholder="Ex: 5000" inputMode="decimal" style={field}/></div>
      <div className="flex gap-2 mt-1"><button onClick={salvar} disabled={load} style={{flex:1,background:C.gold,color:"#16213a",border:"none",borderRadius:8,padding:"9px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{load?"Salvando…":"Salvar"}</button><button onClick={()=>setEdit(false)} style={{background:"none",border:`1px solid ${C.border}`,color:C.muted,borderRadius:8,padding:"9px 14px",fontSize:13,cursor:"pointer"}}>Cancelar</button></div>
    </div>:config?<div className="flex flex-col gap-3">
      {impPct>0&&<div className="flex items-start gap-3 p-3 rounded-xl" style={{background:C.panel2}}>
        <div style={{width:34,height:34,borderRadius:10,background:C.gold+"22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Banknote size={17} color={C.gold}/></div>
        <div className="flex-1"><div style={{fontSize:13,fontWeight:600}}>Reserve {brl(reservaImposto)} para imposto</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{impPct}% do que entrou este mês ({brl(calc.entradasMes)}). Separe agora e não tome susto depois. 💡</div></div>
      </div>}
      {proAlvo>0&&<div className="flex items-start gap-3 p-3 rounded-xl" style={{background:C.panel2}}>
        <div style={{width:34,height:34,borderRadius:10,background:C.emer+"22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Banknote size={17} color={C.emer}/></div>
        <div className="flex-1"><div style={{fontSize:13,fontWeight:600}}>Pró-labore: {brl(proRetirado)} de {brl(proAlvo)}</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>{faltaPro>0?`Você ainda pode retirar ${brl(faltaPro)} este mês.`:`Você já retirou sua meta de pró-labore. 👏`}</div></div>
      </div>}
      <div style={{fontSize:12.5,color:C.faint,borderTop:`1px solid ${C.border}`,paddingTop:10}}>Sobra para o negócio (depois de custos e reserva de imposto): <b style={{color:sobra>=0?C.emer:C.coral}}>{brl(sobra)}</b></div>
    </div>:<p style={{fontSize:13,color:C.faint}}>Configure quanto separar de imposto (%) e seu pró-labore alvo. O assistente calcula automaticamente quanto reservar a cada mês. 🏷️</p>}
  </Panel>;
}

/* ─── NEGÓCIO ─────────────────────────────────────────────────────── */
function Negocio({calc,meta,mes,onMeta,showToast,perfil}) {
  return <div className="flex flex-col gap-4">
    <Metas calc={calc} meta={meta} mes={mes} onMeta={onMeta} showToast={showToast}/>
    <Planejamento calc={calc} perfil={perfil} onUpdate={onMeta} showToast={showToast}/>
    <Panel style={{background:calc.coberto?`linear-gradient(160deg,#0c241d,${C.panel})`:`linear-gradient(160deg,#2c1d1a,${C.panel})`,borderColor:(calc.coberto?C.emer:C.coral)+"55"}}>
      <div className="flex items-start gap-3">
        <div style={{width:40,height:40,borderRadius:12,background:(calc.coberto?C.emer:C.coral)+"22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><ShieldCheck size={20} color={calc.coberto?C.emer:C.coral}/></div>
        <div className="flex-1">
          <div style={{fontSize:15,fontWeight:600,color:calc.coberto?C.emer:C.coral}}>{calc.coberto?"Próximo mês está coberto":"Atenção: próximo mês descoberto"}</div>
          <p style={{fontSize:13,color:C.muted,lineHeight:1.5,marginTop:4}}>Em {monthLabel(calc.prox.key)} entram <b style={{color:C.text}}>{brl(calc.prox.entrada)}</b> previstos. Com caixa de <b style={{color:C.text}}>{brl(calc.caixa)}</b>, você pode gastar até <b style={{color:C.gold}}>{brl(Math.max(0,calc.podeGastar))}</b> mantendo a reserva.</p>
        </div>
      </div>
    </Panel>
    <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fit, minmax(195px, 1fr))"}}>
      <Stat icon={Banknote} label="Pró-labore do mês" value={brl0(calc.proLabore)} accent={C.gold} sub="Seu salário, separado do caixa"/>
      <Stat icon={PiggyBank} label="Investido no mês" value={brl0(calc.investido)} accent={C.emer}/>
      <Stat icon={DollarSign} label="Lucro da operação" value={brl0(calc.lucro)} accent={calc.lucro>=0?C.gold:C.coral} sub="Receita menos custos operacionais"/>
      <Stat icon={Target} label="Reserva de segurança" value={brl0(calc.reserva)} accent={C.emer} sub={`${calc.mesesReserva} ${calc.mesesReserva===1?"mês":"meses"} de custo fixo`}/>
    </div>
    <Panel>
      <div style={{fontSize:14,fontWeight:500}}>Previsibilidade de caixa · próximos 5 meses</div>
      <p style={{fontSize:12,color:C.faint,margin:"4px 0 10px"}}>Barras = entradas previstas vs. despesa fixa. Linha = caixa no fim do mês.</p>
      {calc.proj.every((p)=>p.entrada===0&&p.fixa===0)
        ?<div style={{fontSize:13,color:C.faint,padding:16}}>Lance entradas futuras para ver a projeção.</div>
        :<div style={{width:"100%",height:240}}><ResponsiveContainer><ComposedChart data={calc.proj} margin={{top:10,right:8,left:-8,bottom:0}}><CartesianGrid stroke={C.border} vertical={false}/><XAxis dataKey="label" tick={{fill:C.muted,fontSize:12}} axisLine={{stroke:C.border}} tickLine={false}/><YAxis tick={{fill:C.faint,fontSize:11}} axisLine={false} tickLine={false} tickFormatter={(v)=>`${(v/1000).toFixed(0)}k`}/><Tooltip formatter={(v,n)=>[brl(v),n]} contentStyle={{background:C.panel2,border:`1px solid ${C.border2}`,borderRadius:10,color:C.text,fontSize:12}}/><Legend wrapperStyle={{fontSize:12,color:C.muted}}/><Bar dataKey="entrada" name="Entrada prevista" fill={C.emer} radius={[4,4,0,0]} barSize={18}/><Bar dataKey="fixa" name="Despesa fixa" fill={C.coral} radius={[4,4,0,0]} barSize={18}/><Line dataKey="caixaFim" name="Caixa no fim do mês" stroke={C.gold} strokeWidth={2.5} dot={{r:3,fill:C.gold}}/></ComposedChart></ResponsiveContainer></div>
      }
    </Panel>
    {/* DÍVIDAS / EMPRÉSTIMOS (só aparece se houver dívida em aberto) */}
    {calc.dividas.aPagar>0&&<Panel style={{borderColor:C.coral+"44"}}>
      <div className="flex items-center gap-2 mb-1" style={{fontSize:14,fontWeight:500}}><AlertCircle size={15} color={C.coral}/> Dívidas e financiamentos</div>
      <p style={{fontSize:11.5,color:C.faint,marginBottom:12}}>Empréstimos não contam como lucro — é dinheiro que você devolve.</p>
      <div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))"}}>
        <div style={{background:C.panel2,borderRadius:12,padding:"12px"}}><div style={{fontSize:11.5,color:C.faint}}>Falta pagar</div><div style={{fontFamily:sans,fontSize:22,fontWeight:700,color:C.coral}}>{brl0(calc.dividas.aPagar)}</div></div>
        <div style={{background:C.panel2,borderRadius:12,padding:"12px"}}><div style={{fontSize:11.5,color:C.faint}}>Parcelas restantes</div><div style={{fontFamily:sans,fontSize:22,fontWeight:700}}>{calc.dividas.parcelasRestantes}</div></div>
        <div style={{background:C.panel2,borderRadius:12,padding:"12px"}}><div style={{fontSize:11.5,color:C.faint}}>Custo (juros)</div><div style={{fontFamily:sans,fontSize:22,fontWeight:700,color:C.gold}}>{brl0(calc.dividas.custo)}</div></div>
      </div>
    </Panel>}
    {/* POR NEGÓCIO (só aparece se houver lançamentos com negócio) */}
    {calc.negocios.length>0&&<Panel>
      <div className="flex items-center gap-2 mb-1" style={{fontSize:14,fontWeight:500}}><Briefcase size={15} color={C.emer}/> Por negócio <span style={{fontSize:11,color:C.faint}}>· este mês</span></div>
      <p style={{fontSize:11.5,color:C.faint,marginBottom:12}}>Faturamento, custo e lucro de cada negócio seu.</p>
      <div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))"}}>
        {calc.negocios.map((n)=><div key={n.name} className="p-3 rounded-xl" style={{background:C.panel2,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:13.5,fontWeight:600,marginBottom:8}}>{n.name}</div>
          <div className="flex justify-between" style={{fontSize:12,marginBottom:3}}><span style={{color:C.faint}}>Entrou</span><span style={{color:C.emer}}>{brl(n.entrada)}</span></div>
          <div className="flex justify-between" style={{fontSize:12,marginBottom:3}}><span style={{color:C.faint}}>Saiu</span><span style={{color:C.coral}}>{brl(n.saida)}</span></div>
          <div className="flex justify-between pt-2 mt-1" style={{fontSize:13,fontWeight:600,borderTop:`1px solid ${C.border}`}}><span>Lucro</span><span style={{color:n.lucro>=0?C.gold:C.coral}}>{brl(n.lucro)}</span></div>
        </div>)}
      </div>
    </Panel>}
    {/* RANKINGS por produto/serviço e canal de investimento (mês atual) */}
    <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fit, minmax(280px, 1fr))"}}>
      <Panel>
        <div className="flex items-center gap-2 mb-1" style={{fontSize:14,fontWeight:500}}><TrendingUp size={15} color={C.emer}/> O que mais vendeu <span style={{fontSize:11,color:C.faint}}>· este mês</span></div>
        <p style={{fontSize:11.5,color:C.faint,marginBottom:10}}>Ranking de produtos e serviços por receita.</p>
        {calc.vendaSub.length===0?<div style={{fontSize:13,color:C.faint,padding:"10px 0"}}>Sem vendas neste mês ainda.</div>
          :calc.vendaSub.map((s,i)=>{const max=calc.vendaSub[0].value||1;return<div key={s.name} className="mb-2.5">
            <div className="flex items-center justify-between" style={{fontSize:13,marginBottom:4}}><span><b style={{color:C.faint,marginRight:6}}>{i+1}.</b>{s.name}</span><span style={{color:C.emer,fontWeight:600}}>{brl(s.value)}</span></div>
            <div style={{height:6,background:C.panel2,borderRadius:99,overflow:"hidden"}}><div style={{width:`${Math.max(8,s.value/max*100)}%`,height:"100%",background:C.emer,borderRadius:99}}/></div>
          </div>;})}
      </Panel>
      <Panel>
        <div className="flex items-center gap-2 mb-1" style={{fontSize:14,fontWeight:500}}><TrendingDown size={15} color={C.gold}/> Onde investiu <span style={{fontSize:11,color:C.faint}}>· este mês</span></div>
        <p style={{fontSize:11.5,color:C.faint,marginBottom:10}}>Marketing e investimentos por canal.</p>
        {calc.investSub.length===0?<div style={{fontSize:13,color:C.faint,padding:"10px 0"}}>Nenhum investimento registrado este mês.</div>
          :calc.investSub.map((s,i)=>{const max=calc.investSub[0].value||1;return<div key={s.name} className="mb-2.5">
            <div className="flex items-center justify-between" style={{fontSize:13,marginBottom:4}}><span><b style={{color:C.faint,marginRight:6}}>{i+1}.</b>{s.name}</span><span style={{color:C.gold,fontWeight:600}}>{brl(s.value)}</span></div>
            <div style={{height:6,background:C.panel2,borderRadius:99,overflow:"hidden"}}><div style={{width:`${Math.max(8,s.value/max*100)}%`,height:"100%",background:C.gold,borderRadius:99}}/></div>
          </div>;})}
      </Panel>
    </div>
  </div>;
}

/* ─── ADMIN ───────────────────────────────────────────────────────── */
function Admin({logout}) {
  const[clientes,setClientes]=useState([]);const[q,setQ]=useState("");const[filtro,setFiltro]=useState("todos");const[load,setLoad]=useState(true);
  const[editando,setEditando]=useState(null); // {id, campo, valor}
  const[showToast,toastNode]=useToast();
  const recarregarAdmin=()=>carregarClientes().then(({clientes:c})=>setClientes(c||[]));
  const salvarEdicao=async()=>{if(!editando)return;const{error}=await atualizarCliente(editando.id,{[editando.campo]:editando.valor});if(error)return showToast("Erro ao salvar","error");showToast("Atualizado!");setEditando(null);recarregarAdmin();};
  // cadastro de usuário bônus
  const DURACOES=[["7","7 dias"],["30","1 mês"],["90","3 meses"],["180","6 meses"],["365","1 ano"],["0","Ilimitado"]];
  const[novo,setNovo]=useState({email:"",nome:"",telefone:"",dias:"30"});const[criando,setCriando]=useState(false);const[linkGerado,setLinkGerado]=useState("");
  const criarBonus=async()=>{if(!novo.email.trim()||!novo.nome.trim())return showToast("Preencha e-mail e nome.","error");setCriando(true);setLinkGerado("");const{link,error}=await criarUsuarioBonus({email:novo.email,nome:novo.nome,telefone:novo.telefone,dias:Number(novo.dias)});setCriando(false);if(error)return showToast(error.message||"Erro ao criar","error");setLinkGerado(link||"");setNovo({email:"",nome:"",telefone:"",dias:"30"});showToast("Usuário criado! 🎁");recarregarAdmin();};
  // dar/estender acesso de um cliente existente (+dias a partir de hoje ou da data atual futura)
  const darBonus=async(c,dias)=>{const base=(c.acesso_ate&&new Date(c.acesso_ate)>NOW)?new Date(c.acesso_ate):NOW;const nova=Number(dias)>0?new Date(base.getTime()+Number(dias)*86400000).toISOString():null;const{error}=await atualizarCliente(c.id,{acesso_ate:nova});if(error)return showToast("Erro","error");showToast(Number(dias)>0?`+${dias} dias de acesso ✅`:"Acesso ilimitado ✅");recarregarAdmin();};
  const PRECO={anual:497,mensal:67};
  useEffect(()=>{carregarClientes().then(({clientes:c})=>setClientes(c||[])).finally(()=>setLoad(false));},[]);
  const NOW=today();
  const ativos=clientes.filter((c)=>c.status==="ativo");
  const receita=ativos.reduce((s,c)=>s+(PRECO[c.plano]||0)*(c.plano==="mensal"?12:1),0);
  const novosMes=clientes.filter((c)=>c.criado_em&&mk(new Date(c.criado_em))===mk(NOW)).length;
  const cancel=clientes.filter((c)=>c.status==="cancelado").length;
  const churnRate=clientes.length>0?((cancel/clientes.length)*100).toFixed(1):"0";
  const cor=(s)=>s==="ativo"?C.emer:s==="teste"?C.gold:C.coral;
  const lbl=(s)=>s==="ativo"?"Ativo":s==="teste"?"Em teste":"Cancelado";
  const list=clientes.filter((c)=>(filtro==="todos"||c.status===filtro)&&((c.nome||"")+(c.email||"")+(c.telefone||"")).toLowerCase().includes(q.toLowerCase()));
  return <div className="mx-auto px-4 py-5" style={{maxWidth:1060}}>
    {toastNode}
    <TopBar logout={logout} label="Admin"/>
    {load?<Centro><Loader2 size={24} color={C.gold} className="animate-spin"/></Centro>:<>
      <div className="grid gap-4 mb-5" style={{gridTemplateColumns:"repeat(auto-fit, minmax(195px, 1fr))"}}>
        <Stat icon={Users} label="Assinantes ativos" value={ativos.length} accent={C.emer}/>
        <Stat icon={DollarSign} label="Receita anual estimada" value={brl0(receita)} accent={C.gold}/>
        <Stat icon={UserPlus} label="Novos este mês" value={novosMes} accent={C.gold}/>
        <Stat icon={TrendingDown} label="Churn rate" value={`${churnRate}%`} accent={C.coral} sub={`${cancel} cancelamento${cancel!==1?"s":""}`}/>
      </div>
      <Panel>
        <div className="flex items-center gap-2 mb-1" style={{fontSize:14,fontWeight:600}}><UserPlus size={16} color={C.gold}/> Cadastrar usuário (licença bônus)</div>
        <p style={{fontSize:12,color:C.muted,marginBottom:12}}>Cria uma conta com prazo de acesso. Ao vencer, o login e o bot bloqueiam automaticamente.</p>
        <div className="grid gap-2 mb-2" style={{gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))"}}>
          <input value={novo.nome} onChange={(e)=>setNovo({...novo,nome:e.target.value})} placeholder="Nome" style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",outline:"none"}}/>
          <input value={novo.email} onChange={(e)=>setNovo({...novo,email:e.target.value})} placeholder="E-mail" type="email" style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",outline:"none"}}/>
          <input value={novo.telefone} onChange={(e)=>setNovo({...novo,telefone:e.target.value})} placeholder="WhatsApp (com DDD)" style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",outline:"none"}}/>
          <select value={novo.dias} onChange={(e)=>setNovo({...novo,dias:e.target.value})} style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",outline:"none"}}>{DURACOES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select>
        </div>
        <button onClick={criarBonus} disabled={criando} className="rounded-lg px-4 py-2 flex items-center gap-2" style={{background:C.emer,color:"#04120a",fontSize:13,fontWeight:600,cursor:criando?"not-allowed":"pointer",border:"none"}}>{criando?<><Loader2 size={15} className="animate-spin"/> Criando…</>:<><UserPlus size={15}/> Criar usuário</>}</button>
        {linkGerado&&<div style={{marginTop:12,padding:12,background:C.panel2,borderRadius:8,border:`1px solid ${C.border2}`}}>
          <div style={{fontSize:12,color:C.emer,fontWeight:600,marginBottom:4}}>✅ Conta criada! Envie este link pra pessoa definir a senha:</div>
          <div style={{fontSize:11.5,color:C.muted,wordBreak:"break-all",marginBottom:6}}>{linkGerado}</div>
          <button onClick={()=>{navigator.clipboard.writeText(linkGerado);showToast("Link copiado!");}} style={{background:C.gold,color:"#16213a",border:"none",borderRadius:6,padding:"4px 10px",fontSize:11.5,fontWeight:600,cursor:"pointer"}}>Copiar link</button>
        </div>}
      </Panel>
      <Panel>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div style={{fontSize:14,fontWeight:500}}>Clientes <span style={{fontSize:12,color:C.faint,marginLeft:6}}>({list.length})</span></div>
          <div className="flex items-center gap-2 flex-wrap">
            {[["todos","Todos"],["ativo","Ativos"],["teste","Em teste"],["cancelado","Cancelados"]].map(([k,l])=><button key={k} onClick={()=>setFiltro(k)} className="px-3 py-1 rounded-full" style={{fontSize:12,cursor:"pointer",background:filtro===k?C.gold:C.panel2,color:filtro===k?"#16213a":C.muted,border:`1px solid ${filtro===k?C.gold:C.border}`,fontWeight:filtro===k?600:400}}>{l}</button>)}
            <div style={{position:"relative"}}><Search size={15} color={C.faint} style={{position:"absolute",left:11,top:8}}/><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Nome, e-mail ou fone…" style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:12.5,borderRadius:8,padding:"7px 11px 7px 32px",width:190,outline:"none"}}/></div>
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{color:C.faint,fontSize:11.5,textTransform:"uppercase",letterSpacing:".05em"}}>{["Cliente","WhatsApp","Plano","Status","Acesso até","Ações"].map((h)=><th key={h} style={{textAlign:"left",padding:"10px 12px",borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
            <tbody>{list.map((c)=><tr key={c.id} style={{borderBottom:`1px solid ${C.border}`}}>
              <td style={{padding:12}}><div className="flex items-center gap-2.5"><div style={{width:30,height:30,borderRadius:"50%",background:C.panel2,border:`1px solid ${C.border}`,fontSize:12,color:C.gold,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{(c.nome||"?")[0].toUpperCase()}</div><div><div style={{fontWeight:500}}>{c.nome||"—"}</div>{c.email&&<div style={{fontSize:11,color:C.faint}}>{c.email}</div>}</div></div></td>
              <td style={{padding:12,color:C.muted}}>{c.telefone||"—"}</td>
              <td style={{padding:12}}>
                {editando?.id===c.id&&editando.campo==="plano"
                  ?<span className="flex gap-1"><select value={editando.valor} onChange={(e)=>setEditando({...editando,valor:e.target.value})} style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:12,borderRadius:6,padding:"3px 6px"}}><option value="mensal">mensal</option><option value="anual">anual</option></select><button onClick={salvarEdicao} style={{background:C.gold,color:"#16213a",border:"none",borderRadius:5,padding:"2px 7px",fontSize:11,cursor:"pointer"}}>OK</button></span>
                  :<span style={{color:C.muted,textTransform:"capitalize",cursor:"pointer",textDecoration:"underline dotted"}} onClick={()=>setEditando({id:c.id,campo:"plano",valor:c.plano||"mensal"})}>{c.plano||"—"}</span>}
              </td>
              <td style={{padding:12}}>
                {editando?.id===c.id&&editando.campo==="status"
                  ?<span className="flex gap-1"><select value={editando.valor} onChange={(e)=>setEditando({...editando,valor:e.target.value})} style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:12,borderRadius:6,padding:"3px 6px"}}><option value="ativo">ativo</option><option value="teste">teste</option><option value="cancelado">cancelado</option></select><button onClick={salvarEdicao} style={{background:C.gold,color:"#16213a",border:"none",borderRadius:5,padding:"2px 7px",fontSize:11,cursor:"pointer"}}>OK</button></span>
                  :<span onClick={()=>setEditando({id:c.id,campo:"status",valor:c.status||"ativo"})} style={{cursor:"pointer"}}><Badge color={cor(c.status)}>{lbl(c.status)}</Badge></span>}
              </td>
              <td style={{padding:12}}>{(()=>{const venc=c.acesso_ate&&new Date(c.acesso_ate)<NOW;const txt=c.acesso_ate?new Date(c.acesso_ate).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}):"Ilimitado";return <div className="flex items-center gap-2"><span style={{color:venc?C.coral:c.acesso_ate?C.muted:C.emer,fontSize:12.5,whiteSpace:"nowrap"}}>{venc?`${txt} · vencido`:txt}</span><select value="" onChange={(e)=>{if(e.target.value!=="")darBonus(c,e.target.value);}} title="Dar bônus / renovar" style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.muted,fontSize:11,borderRadius:5,padding:"2px 4px",cursor:"pointer"}}><option value="">+ bônus</option>{DURACOES.map(([v,l])=><option key={v} value={v}>{Number(v)>0?`+${l}`:"Ilimitado"}</option>)}</select></div>;})()}</td>
              <td style={{padding:12}}><button onClick={()=>setEditando({id:c.id,campo:"status",valor:c.status==="cancelado"?"ativo":"cancelado"})} style={{background:"none",border:`1px solid ${c.status==="cancelado"?C.emer:C.coral}`,color:c.status==="cancelado"?C.emer:C.coral,borderRadius:6,padding:"3px 9px",fontSize:11.5,cursor:"pointer"}} title={c.status==="cancelado"?"Reativar":"Cancelar"}>{c.status==="cancelado"?"Reativar":"Cancelar"}</button></td>
            </tr>)}</tbody>
          </table>
          {list.length===0&&<div style={{textAlign:"center",padding:28,color:C.faint,fontSize:13}}>Nenhum cliente encontrado.</div>}
        </div>
      </Panel>
    </>}
  </div>;
}
