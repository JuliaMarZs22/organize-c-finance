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
  supabase, entrar, sair, usuarioAtual, ehAdmin, meuPerfil,
  carregarLancamentos, inserirLancamentos, carregarClientes,
  carregarDespesasFixas, inserirDespesaFixa, excluirDespesaFixa,
} from "./supabase";
import { sincronizarManual } from "./drive";

/* ─── PALETA ─────────────────────────────────────────────────────── */
const C = {
  bg:"#070b14",bg2:"#0b1120",panel:"#0e1525",panel2:"#121a2e",
  border:"#1c2438",border2:"#27314c",gold:"#e9cd88",goldDeep:"#c0a366",
  emer:"#2ed6a0",emerDeep:"#1d8a6f",coral:"#e0857a",
  text:"#eef1f6",muted:"#9aa3bb",faint:"#7e87a0",
};
const serif = "'Cormorant Garamond', Georgia, serif";
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
  return <Panel><div className="flex items-center gap-2 mb-2" style={{color:C.faint,fontSize:12}}><Icon size={14} color={accent}/> {label}</div><div style={{fontFamily:serif,fontSize:26,fontWeight:600,color:accent||C.text,lineHeight:1}}>{value}</div>{sub&&<div className="mt-2" style={{fontSize:11.5,color:C.faint}}>{sub}</div>}</Panel>;
}
const Brand=({size=17})=><div className="flex items-baseline gap-2"><span style={{fontSize:size*.82,fontWeight:500,color:"#c2c9da"}}>organize-c</span><span style={{fontFamily:serif,fontSize:size*1.25,color:C.gold,lineHeight:1}}>finance</span></div>;

/* ─── APP ROOT ────────────────────────────────────────────────────── */
export default function App() {
  const[screen,setScreen]=useState("loading");
  const[user,setUser]=useState(null);
  useEffect(()=>{(async()=>{ try{ const u=await usuarioAtual(); if(!u)return setScreen("login"); setUser(u); setScreen((await ehAdmin(u.email))?"admin":"client"); }catch{ setScreen("login"); } })();},[]);
  const aposLogin=async(u)=>{ setUser(u); try{ setScreen((await ehAdmin(u.email))?"admin":"client"); }catch{ setScreen("client"); } };
  const logout=async()=>{ await sair(); setUser(null); setScreen("login"); };
  return <div style={{background:C.bg,color:C.text,minHeight:"100vh",fontFamily:sans}}>
    {screen==="loading"&&<Centro><Loader2 size={26} color={C.gold} className="animate-spin"/></Centro>}
    {screen==="login"&&<Login onLogin={aposLogin}/>}
    {screen==="client"&&<Client user={user} logout={logout}/>}
    {screen==="admin"&&<Admin logout={logout}/>}
  </div>;
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
        <h1 style={{fontFamily:serif,fontSize:27,fontWeight:600,textAlign:"center",marginBottom:6}}>Bem-vindo de volta</h1>
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
        </div>
        <p style={{fontSize:11.5,color:C.faint,textAlign:"center",marginTop:20,lineHeight:1.6}}>
          Acesso exclusivo para assinantes.<br/>
          <span style={{color:C.muted}}>Adquira seu acesso em <b style={{color:C.gold}}>organize-c.finance</b></span>
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
      <div style={{fontSize:16,fontWeight:700,color:C.gold,letterSpacing:1}}>+55 (XX) XXXX-XXXX</div>
      <div style={{fontSize:11,color:C.faint,marginTop:2}}>Configure no backend</div>
    </div>
  </Panel>;
}

/* ─── CLIENT ──────────────────────────────────────────────────────── */
function Client({user,logout}) {
  const[tab,setTab]=useState("visao");
  const[txs,setTxs]=useState([]);
  const[perfil,setPerfil]=useState(null);
  const[despesas,setDespesas]=useState([]);
  const[load,setLoad]=useState(true);
  const[showToast,toastNode]=useToast();

  const recarregar=useCallback(async()=>{
    try{
      const[{txs:t},p,{despesas:d}]=await Promise.all([carregarLancamentos(),meuPerfil(),carregarDespesasFixas()]);
      setTxs(t);setPerfil(p);setDespesas(d);
    }catch(e){console.error(e);}
    finally{setLoad(false);}
  },[]);

  useEffect(()=>{recarregar();},[recarregar]);

  const calc=useMemo(()=>{
    const NOW=today();const cur=mk(NOW);const realized=(d)=>new Date(d+"T12:00:00")<=NOW;
    let entradasMes=0,saidasMes=0,proLabore=0,investido=0;const catMap={};
    txs.forEach((t)=>{
      if(mk(new Date(t.date+"T12:00:00"))===cur){
        if(t.type==="entrada")entradasMes+=t.amount;
        else{saidasMes+=t.amount;if(t.category==="Pró-labore")proLabore+=t.amount;else if(t.category==="Investimento")investido+=t.amount;catMap[t.category]=(catMap[t.category]||0)+t.amount;}
      }
    });
    const rE=txs.filter((t)=>t.type==="entrada"&&realized(t.date)).reduce((s,t)=>s+t.amount,0);
    const rS=txs.filter((t)=>t.type==="saida"&&realized(t.date)).reduce((s,t)=>s+t.amount,0);
    const caixa=Number(perfil?.saldo_inicial||0)+rE-rS;
    const totalFixo=despesas.reduce((s,d)=>s+Number(d.valor),0);
    const mesesReserva=Number(perfil?.reserva_meses||1);const reserva=totalFixo*mesesReserva;
    const proj=[];let run=caixa;
    for(let i=1;i<=5;i++){const key=mk(addMonths(NOW,i));const ent=txs.filter((t)=>t.type==="entrada"&&mk(new Date(t.date+"T12:00:00"))===key).reduce((s,t)=>s+t.amount,0);run=run+ent-totalFixo;proj.push({key,label:monthLabel(key),entrada:ent,fixa:totalFixo,caixaFim:Math.round(run)});}
    const prox=proj[0]||{entrada:0,key:mk(addMonths(NOW,1))};
    const podeGastar=caixa+prox.entrada-totalFixo-reserva;
    const coberto=caixa+prox.entrada>=totalFixo+reserva;
    const lucro=entradasMes-(saidasMes-proLabore-investido);
    const cats=Object.entries(catMap).map(([name,value])=>({name,value})).sort((a,b)=>b.value-a.value);
    return{caixa,entradasMes,saidasMes,fixa:totalFixo,reserva,mesesReserva,proj,prox,podeGastar,coberto,proLabore,investido,lucro,cats};
  },[txs,perfil,despesas]);

  if(load)return<Centro><Loader2 size={26} color={C.gold} className="animate-spin"/></Centro>;

  const TABS=[["visao","Visão geral",LayoutGrid],["lancar","Lançar",Plus],["negocio","Negócio",Briefcase],["lancamentos","Lançamentos",ListOrdered],["fixas","Despesas fixas",Settings]];

  return <div className="mx-auto px-4 py-5" style={{maxWidth:1060}}>
    {toastNode}
    <TopBar logout={logout} label="Cliente" nomeUsuario={perfil?.nome}/>
    <div className="flex gap-1.5 mb-5 flex-wrap">
      {TABS.map(([k,l,I])=><button key={k} onClick={()=>setTab(k)} className="flex items-center gap-2 px-3.5 py-2 rounded-lg" style={{fontSize:13,fontWeight:500,cursor:"pointer",background:tab===k?C.panel2:"transparent",color:tab===k?C.text:C.muted,border:`1px solid ${tab===k?C.border2:"transparent"}`}}><I size={15}/> {l}</button>)}
    </div>
    {tab==="visao"&&<Visao calc={calc} perfil={perfil} despesas={despesas} showToast={showToast}/>}
    {tab==="lancar"&&<Lancar user={user} onAdd={recarregar} showToast={showToast}/>}
    {tab==="negocio"&&<Negocio calc={calc}/>}
    {tab==="lancamentos"&&<Lista txs={txs} onDelete={recarregar} showToast={showToast}/>}
    {tab==="fixas"&&<DespesasFixas despesas={despesas} onUpdate={recarregar} showToast={showToast}/>}
  </div>;
}

/* ─── VISÃO GERAL ─────────────────────────────────────────────────── */
function Visao({calc,perfil,despesas}) {
  return <div className="flex flex-col gap-4">
    <div className="grid gap-4" style={{gridTemplateColumns:"repeat(auto-fit, minmax(205px, 1fr))"}}>
      <Stat icon={Wallet} label="Caixa atual" value={brl(calc.caixa)} accent={C.gold} sub="Saldo disponível hoje"/>
      <Stat icon={ArrowUpRight} label="Entradas do mês" value={brl(calc.entradasMes)} accent={C.emer}/>
      <Stat icon={ArrowDownRight} label="Saídas do mês" value={brl(calc.saidasMes)} accent={C.coral}/>
      <Stat icon={TrendingUp} label="Pode gastar mês que vem" value={brl(calc.podeGastar)} accent={C.gold} sub={`Com ${calc.mesesReserva} ${calc.mesesReserva===1?"mês":"meses"} de reserva`}/>
    </div>
    <WhatsAppBanner/>
    <Panel>
      <div className="flex items-center justify-between mb-3"><div style={{fontSize:14,fontWeight:500}}>Gastos por categoria</div><div style={{fontSize:12,color:C.faint}}>{brl(calc.saidasMes)}</div></div>
      {calc.cats.length===0
        ?<div style={{fontSize:13,color:C.faint,padding:16}}>Ainda sem lançamentos neste mês. Mande um áudio no WhatsApp ou lance manualmente.</div>
        :<div className="flex items-center gap-4 flex-wrap">
          <div style={{width:150,height:150,flexShrink:0}}>
            <ResponsiveContainer><PieChart><Pie data={calc.cats} dataKey="value" nameKey="name" innerRadius={45} outerRadius={72} paddingAngle={2} stroke="none">{calc.cats.map((c)=><Cell key={c.name} fill={colorFor(c.name)}/>)}</Pie><Tooltip formatter={(v)=>[brl(v),""]} contentStyle={{background:C.panel2,border:`1px solid ${C.border2}`,borderRadius:10,color:C.text,fontSize:12}}/></PieChart></ResponsiveContainer>
          </div>
          <div className="flex-1 flex flex-col gap-1.5" style={{minWidth:170}}>
            {calc.cats.map((c)=><div key={c.name} className="flex items-center justify-between" style={{fontSize:13}}><div className="flex items-center gap-2"><span style={{width:9,height:9,borderRadius:3,background:colorFor(c.name),display:"inline-block"}}/>{c.name}</div><div style={{color:C.muted}}>{brl(c.value)}</div></div>)}
          </div>
        </div>
      }
    </Panel>
    {despesas.length>0&&<Panel>
      <div style={{fontSize:14,fontWeight:500,marginBottom:10}}>Despesas fixas mensais</div>
      {despesas.map((d,i)=><div key={d.id} className="flex items-center justify-between py-1.5" style={{fontSize:13,borderTop:i?`1px solid ${C.border}`:"none"}}><span style={{color:C.muted}}>{d.nome}</span><span style={{color:C.coral}}>{brl(d.valor)}</span></div>)}
      <div className="flex items-center justify-between pt-2 mt-1" style={{fontSize:13,fontWeight:600,borderTop:`1px solid ${C.border2}`}}><span>Total fixo</span><span style={{color:C.coral}}>{brl(calc.fixa)}</span></div>
    </Panel>}
  </div>;
}

/* ─── DESPESAS FIXAS ──────────────────────────────────────────────── */
function DespesasFixas({despesas,onUpdate,showToast}) {
  const[nome,setNome]=useState("");const[valor,setValor]=useState("");const[load,setLoad]=useState(false);const[deleting,setDeleting]=useState(null);
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",outline:"none"};
  const adicionar=async()=>{const v=parseBRL(valor);if(!nome.trim())return showToast("Digite o nome.","error");if(isNaN(v)||v<=0)return showToast("Digite um valor válido.","error");setLoad(true);const{error}=await inserirDespesaFixa(nome.trim(),v);setLoad(false);if(error)return showToast("Erro ao adicionar.","error");setNome("");setValor("");showToast("Despesa adicionada!");onUpdate();};
  const excluir=async(id)=>{setDeleting(id);const{error}=await excluirDespesaFixa(id);setDeleting(null);if(error)return showToast("Erro ao remover.","error");showToast("Despesa removida.");onUpdate();};
  const total=despesas.reduce((s,d)=>s+Number(d.valor),0);
  return <div className="grid gap-4" style={{gridTemplateColumns:"minmax(0,520px)",justifyContent:"center"}}>
    <Panel>
      <div className="flex items-center gap-2 mb-1" style={{fontSize:14,fontWeight:600}}><Settings size={16} color={C.gold}/> Despesas fixas</div>
      <p style={{fontSize:12.5,color:C.muted,marginBottom:16}}>Aluguel, internet, assinaturas — tudo que sai todo mês. Alimenta a projeção de caixa e o cálculo de reserva.</p>
      <div className="flex flex-col gap-2 mb-4">
        <input value={nome} onChange={(e)=>setNome(e.target.value)} placeholder="Nome (ex: Aluguel)" onKeyDown={(e)=>e.key==="Enter"&&adicionar()} style={{...field,width:"100%"}}/>
        <div className="flex gap-2">
          <input value={valor} onChange={(e)=>setValor(e.target.value)} placeholder="Valor (R$)" inputMode="decimal" onKeyDown={(e)=>e.key==="Enter"&&adicionar()} style={{...field,flex:1}}/>
          <button onClick={adicionar} disabled={load} className="rounded-lg px-4 flex items-center gap-2" style={{background:C.gold,color:"#16213a",fontSize:13,fontWeight:600,whiteSpace:"nowrap",cursor:load?"not-allowed":"pointer"}}>{load?<Loader2 size={15} className="animate-spin"/>:<><Plus size={15}/> Adicionar</>}</button>
        </div>
      </div>
      {despesas.length===0?<div style={{fontSize:13,color:C.faint,padding:"12px 0"}}>Nenhuma despesa fixa cadastrada.</div>:despesas.map((d,i)=><div key={d.id} className="flex items-center justify-between py-2.5 gap-3" style={{borderTop:i?`1px solid ${C.border}`:"none"}}><span style={{fontSize:13,flex:1}}>{d.nome}</span><span style={{fontSize:13,color:C.coral,fontWeight:600}}>{brl(d.valor)}</span><button onClick={()=>excluir(d.id)} disabled={deleting===d.id} style={{background:"none",border:"none",cursor:"pointer",color:C.faint,padding:4}}>{deleting===d.id?<Loader2 size={14} className="animate-spin"/>:<Trash2 size={15}/>}</button></div>)}
      {despesas.length>0&&<div className="flex justify-between pt-2 mt-1" style={{fontSize:13,fontWeight:600,borderTop:`1px solid ${C.border2}`}}><span>Total mensal</span><span style={{color:C.coral}}>{brl(total)}</span></div>}
    </Panel>
  </div>;
}

/* ─── LANÇAR ──────────────────────────────────────────────────────── */
function Lancar({user,onAdd,showToast}) {
  const[type,setType]=useState("saida");const[amt,setAmt]=useState("");const[cat,setCat]=useState("Alimentação");const[desc,setDesc]=useState("");const[inst,setInst]=useState(1);const[load,setLoad]=useState(false);
  const[dataLanc,setDataLanc]=useState(()=>{const n=today();return mk(n)+"-"+String(Math.min(n.getDate(),28)).padStart(2,"0");});
  const CATS_SAIDA=["Alimentação","Moradia","Transporte","Assinaturas","Lazer","Saúde","Pró-labore","Investimento","Outros"];
  const CATS_ENTRADA=["Vendas","Pró-labore","Investimento","Outros"];
  const cats=type==="saida"?CATS_SAIDA:CATS_ENTRADA;
  const handleType=(t)=>{setType(t);setCat(t==="saida"?"Alimentação":"Vendas");};
  const field={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:13,borderRadius:8,padding:"9px 11px",width:"100%",outline:"none"};
  const previewValor=()=>{const v=parseBRL(amt);const n=Math.max(1,Number(inst));if(isNaN(v)||v<=0||n===1)return null;return`${n}x de ${brl(v/n)}`;};
  const salvar=async()=>{
    const tot=parseBRL(amt);if(isNaN(tot)||tot<=0)return showToast("Digite um valor válido.","error");
    const n=Math.max(1,Math.min(36,Number(inst)));const valor=Number((tot/n).toFixed(2));const linhas=[];
    const grupoParcela=n>1?crypto.randomUUID():null;const baseDate=new Date(dataLanc+"T12:00:00");
    for(let i=0;i<n;i++){const d=addMonths(baseDate,i);linhas.push({tipo:type,valor,categoria:cat,descricao:n>1?`${desc||cat} — parcela ${i+1}/${n}`:(desc||cat),data:mk(d)+"-"+String(Math.min(d.getDate(),28)).padStart(2,"0"),fixa:false,grupo_parcela:grupoParcela,parcela_atual:n>1?i+1:null,parcela_total:n>1?n:null});}
    setLoad(true);const{error}=await inserirLancamentos(linhas,user.id);
    if(error){setLoad(false);return showToast("Erro ao salvar.","error");}
    try{const{data:{session}}=await supabase.auth.getSession();if(session?.access_token)await sincronizarManual(session.access_token,linhas.map((l)=>({data:l.data,tipo:l.tipo,categoria:l.categoria,descricao:l.descricao,valor:l.valor})));}catch(_){}
    setLoad(false);setAmt("");setDesc("");setInst(1);showToast(n>1?`${n} parcelas lançadas!`:"Lançamento salvo!");onAdd();
  };
  return <div className="grid gap-4" style={{gridTemplateColumns:"minmax(0,460px)",justifyContent:"center"}}>
    <Panel>
      <div className="flex items-center gap-2 mb-1" style={{fontSize:14,fontWeight:600}}><Plus size={16} color={C.gold}/> Lançar manualmente</div>
      <p style={{fontSize:12.5,color:C.muted,marginBottom:14}}>No dia a dia, é só mandar áudio no WhatsApp. Aqui você lança pela tela quando preferir.</p>
      <div className="flex gap-1.5 mb-3">{[["saida","Saída",C.coral],["entrada","Entrada",C.emer]].map(([k,l,col])=><button key={k} onClick={()=>handleType(k)} className="flex-1 rounded-lg py-2" style={{fontSize:13,fontWeight:600,cursor:"pointer",background:type===k?col+"22":C.panel2,color:type===k?col:C.muted,border:`1px solid ${type===k?col+"66":C.border}`}}>{l}</button>)}</div>
      <div className="flex flex-col gap-2.5">
        <div><input value={amt} onChange={(e)=>setAmt(e.target.value)} placeholder="Valor (R$)" inputMode="decimal" style={field}/>{previewValor()&&<div style={{fontSize:11.5,color:C.gold,marginTop:4}}>{previewValor()}</div>}</div>
        <select value={cat} onChange={(e)=>setCat(e.target.value)} style={{...field,appearance:"none"}}>{cats.map((c)=><option key={c} value={c} style={{background:C.panel2}}>{c}</option>)}</select>
        <input value={desc} onChange={(e)=>setDesc(e.target.value)} placeholder="Descrição (opcional)" style={field}/>
        <div><div style={{fontSize:11.5,color:C.faint,marginBottom:4}}>Data</div><input type="date" value={dataLanc} onChange={(e)=>setDataLanc(e.target.value)} style={{...field,colorScheme:"dark"}}/></div>
        <div className="flex items-center gap-2"><span style={{fontSize:12.5,color:C.muted,whiteSpace:"nowrap"}}>{type==="saida"?"Parcelas:":"Recebimentos futuros:"}</span><input value={inst} onChange={(e)=>setInst(Math.max(1,Math.min(36,Number(e.target.value))))} type="number" min={1} max={36} style={{...field,width:70}}/></div>
        <button onClick={salvar} disabled={load} className="rounded-lg py-2.5 mt-1 flex items-center justify-center gap-2" style={{background:load?C.goldDeep:C.gold,color:"#16213a",fontSize:13.5,fontWeight:600,cursor:load?"not-allowed":"pointer"}}>{load?<><Loader2 size={16} className="animate-spin"/> Salvando…</>:"Adicionar lançamento"}</button>
      </div>
    </Panel>
  </div>;
}

/* ─── LISTA ───────────────────────────────────────────────────────── */
function Lista({txs,onDelete,showToast}) {
  const NOW=today();const[busca,setBusca]=useState("");const[filtroTipo,setFiltroTipo]=useState("todos");const[filtroCat,setFiltroCat]=useState("todas");const[deleting,setDeleting]=useState(null);
  const fmt=(d)=>new Date(d+"T12:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"});
  const cats=[...new Set(txs.map((t)=>t.category))].sort();
  const lista=txs.filter((t)=>{if(filtroTipo!=="todos"&&t.type!==filtroTipo)return false;if(filtroCat!=="todas"&&t.category!==filtroCat)return false;if(busca&&!t.desc?.toLowerCase().includes(busca.toLowerCase())&&!t.category?.toLowerCase().includes(busca.toLowerCase()))return false;return true;});
  const excluirLanc=async(id)=>{if(!window.confirm("Remover este lançamento?"))return;setDeleting(id);const{error}=await supabase.from("lancamentos").delete().eq("id",id);setDeleting(null);if(error)return showToast("Erro ao remover.","error");showToast("Lançamento removido.");onDelete();};
  const fieldSm={background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:12.5,borderRadius:8,padding:"6px 10px",outline:"none"};
  if(txs.length===0)return<Panel><div style={{fontSize:13,color:C.faint,padding:16}}>Nenhum lançamento ainda. Use o WhatsApp ou a aba "Lançar" para começar.</div></Panel>;
  return <Panel>
    <div className="flex items-center justify-between mb-3 flex-wrap gap-2"><div style={{fontSize:14,fontWeight:500}}>Todos os lançamentos</div><div style={{fontSize:12,color:C.faint}}>{lista.length} de {txs.length}</div></div>
    <div className="flex gap-2 mb-4 flex-wrap">
      <div style={{position:"relative"}}><Search size={13} color={C.faint} style={{position:"absolute",left:9,top:8}}/><input value={busca} onChange={(e)=>setBusca(e.target.value)} placeholder="Buscar..." style={{...fieldSm,paddingLeft:28,width:160}}/></div>
      <select value={filtroTipo} onChange={(e)=>setFiltroTipo(e.target.value)} style={fieldSm}><option value="todos">Todos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select>
      <select value={filtroCat} onChange={(e)=>setFiltroCat(e.target.value)} style={fieldSm}><option value="todas">Todas as categorias</option>{cats.map((c)=><option key={c} value={c}>{c}</option>)}</select>
    </div>
    <div className="flex flex-col">
      {lista.map((t,i)=>{const fut=new Date(t.date+"T12:00:00")>NOW;return<div key={t.id} className="flex items-center gap-3 py-2.5" style={{borderTop:i?`1px solid ${C.border}`:"none"}}>
        <div className="flex items-center justify-center rounded-lg" style={{width:34,height:34,flexShrink:0,background:(t.type==="entrada"?C.emer:C.coral)+"1c"}}>{t.type==="entrada"?<ArrowUpRight size={17} color={C.emer}/>:<ArrowDownRight size={17} color={C.coral}/>}</div>
        <div className="flex-1" style={{minWidth:0}}><div className="flex items-center gap-2 flex-wrap" style={{fontSize:13.5}}><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.desc}</span>{fut&&<Badge color={C.faint}>previsto</Badge>}{t.parcela&&<Badge color={C.gold}>{t.parcela}</Badge>}</div><div style={{fontSize:11.5,color:C.faint}}>{fmt(t.date)} · {t.category}</div></div>
        <div style={{fontSize:14,fontWeight:600,color:t.type==="entrada"?C.emer:C.coral,flexShrink:0}}>{t.type==="entrada"?"+":"-"}{brl(t.amount)}</div>
        <button onClick={()=>excluirLanc(t.id)} disabled={deleting===t.id} style={{background:"none",border:"none",cursor:"pointer",color:C.faint,padding:4,flexShrink:0}} title="Remover">{deleting===t.id?<Loader2 size={13} className="animate-spin"/>:<Trash2 size={13}/>}</button>
      </div>;})}
    </div>
    {lista.length===0&&<div style={{textAlign:"center",padding:24,color:C.faint,fontSize:13}}>Nenhum resultado com esses filtros.</div>}
  </Panel>;
}

/* ─── NEGÓCIO ─────────────────────────────────────────────────────── */
function Negocio({calc}) {
  return <div className="flex flex-col gap-4">
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
  </div>;
}

/* ─── ADMIN ───────────────────────────────────────────────────────── */
function Admin({logout}) {
  const[clientes,setClientes]=useState([]);const[q,setQ]=useState("");const[filtro,setFiltro]=useState("todos");const[load,setLoad]=useState(true);
  const[showToast,toastNode]=useToast();
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
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div style={{fontSize:14,fontWeight:500}}>Clientes <span style={{fontSize:12,color:C.faint,marginLeft:6}}>({list.length})</span></div>
          <div className="flex items-center gap-2 flex-wrap">
            {[["todos","Todos"],["ativo","Ativos"],["teste","Em teste"],["cancelado","Cancelados"]].map(([k,l])=><button key={k} onClick={()=>setFiltro(k)} className="px-3 py-1 rounded-full" style={{fontSize:12,cursor:"pointer",background:filtro===k?C.gold:C.panel2,color:filtro===k?"#16213a":C.muted,border:`1px solid ${filtro===k?C.gold:C.border}`,fontWeight:filtro===k?600:400}}>{l}</button>)}
            <div style={{position:"relative"}}><Search size={15} color={C.faint} style={{position:"absolute",left:11,top:8}}/><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Nome, e-mail ou fone…" style={{background:C.panel2,border:`1px solid ${C.border}`,color:C.text,fontSize:12.5,borderRadius:8,padding:"7px 11px 7px 32px",width:190,outline:"none"}}/></div>
          </div>
        </div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr style={{color:C.faint,fontSize:11.5,textTransform:"uppercase",letterSpacing:".05em"}}>{["Cliente","WhatsApp","Plano","Status","Entrou em"].map((h)=><th key={h} style={{textAlign:"left",padding:"10px 12px",borderBottom:`1px solid ${C.border}`}}>{h}</th>)}</tr></thead>
            <tbody>{list.map((c)=><tr key={c.id} style={{borderBottom:`1px solid ${C.border}`}}>
              <td style={{padding:12}}><div className="flex items-center gap-2.5"><div style={{width:30,height:30,borderRadius:"50%",background:C.panel2,border:`1px solid ${C.border}`,fontSize:12,color:C.gold,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{(c.nome||"?")[0].toUpperCase()}</div><div><div style={{fontWeight:500}}>{c.nome||"—"}</div>{c.email&&<div style={{fontSize:11,color:C.faint}}>{c.email}</div>}</div></div></td>
              <td style={{padding:12,color:C.muted}}>{c.telefone||"—"}</td>
              <td style={{padding:12,color:C.muted,textTransform:"capitalize"}}>{c.plano||"—"}</td>
              <td style={{padding:12}}><Badge color={cor(c.status)}>{lbl(c.status)}</Badge></td>
              <td style={{padding:12,color:C.muted}}>{c.criado_em?new Date(c.criado_em).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"}):"—"}</td>
            </tr>)}</tbody>
          </table>
          {list.length===0&&<div style={{textAlign:"center",padding:28,color:C.faint,fontSize:13}}>Nenhum cliente encontrado.</div>}
        </div>
      </Panel>
    </>}
  </div>;
}
