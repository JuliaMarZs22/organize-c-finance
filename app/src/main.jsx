import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { ENV_OK } from "./supabase.js";
const C = { bg:"#070b14", gold:"#e9cd88", muted:"#9aa3bb", text:"#eef1f6", panel:"#0e1525", border:"#1c2438", coral:"#e0857a" };
function EnvError() {
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui",color:C.text,padding:24}}>
      <div style={{maxWidth:480,background:C.panel,border:`1px solid ${C.border}`,borderRadius:20,padding:32,textAlign:"center"}}>
        <div style={{fontSize:28,color:C.gold,marginBottom:8}}>organize-c finance</div>
        <div style={{width:40,height:3,background:C.coral,borderRadius:99,margin:"0 auto 20px"}}/>
        <div style={{fontSize:16,fontWeight:600,color:C.coral,marginBottom:12}}>Variáveis de ambiente não configuradas</div>
        <p style={{fontSize:13.5,color:C.muted,lineHeight:1.6,marginBottom:20}}>
          Configure no painel do <strong style={{color:C.text}}>Cloudflare Pages</strong>:<br/>
          <em>Settings → Variables and Secrets</em>
        </p>
        <div style={{background:"#0b1120",border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 16px",fontFamily:"monospace",fontSize:12.5,textAlign:"left",color:"#a8d8b0",lineHeight:2}}>
          VITE_SUPABASE_URL<br/>VITE_SUPABASE_ANON_KEY<br/>VITE_GOOGLE_CLIENT_ID<br/>VITE_BACKEND_URL
        </div>
        <p style={{fontSize:12,color:C.muted,marginTop:16}}>Após configurar, faça um novo deploy.</p>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(ENV_OK ? <App /> : <EnvError />);
