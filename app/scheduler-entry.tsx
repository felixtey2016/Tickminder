"use client";

import dynamic from "next/dynamic";
import {useCallback,useEffect,useRef,useState} from "react";
import {reportClientException} from "@/lib/diagnostics-client";
import {BRAND_NAME} from "@/lib/brand";
import {setLanguage,t,type Language} from "@/lib/i18n";
import {readBrowserLanguagePreference,rememberLanguagePreference} from "@/lib/language-preference";
import {groupFetch,setClientGroup} from "@/lib/group-client";
import {alertActionFailure,readApiJson,showActionToast} from "@/lib/action-feedback";
import {LoginForm,AuthLanguageSwitcher} from "./login-form";
import type {SchedulerAuth} from "./scheduler";
import {readClientAuth,acceptClientAuth} from '@/lib/client-auth-read';
import {installPrivateReadEvents,getPrivateReadSnapshot} from '@/lib/private-read-lifecycle';
import {PrivateReadInvalidatedError} from '@/lib/private-read-flight';

// Authentication is deliberately outside the management bundle. An anonymous
// visitor only downloads the login/recovery UI; the workspace starts after auth.
const Workspace = dynamic(() => import("./scheduler").then(module => module.Scheduler), {
  ssr: false,
  loading: ({error}) => <WorkspaceStartup error={error}/>,
});
function WorkspaceStartup({error}:{error?:Error|null}){
  useEffect(()=>{if(error)reportClientException(error,"render_failure");},[error]);
  return <main className="workspace-startup" aria-busy={!error}>
    <img src="/tickminder-logo-192.png" alt="" width={56} height={56}/>
    <h1>{BRAND_NAME}</h1>
    {error ? <><p role="alert">页面暂时无法加载 / Unable to load the page</p><button type="button" onClick={() => window.location.reload()}>重新加载 / Reload</button></> : <p role="status">正在加载… / Loading…</p>}
  </main>;
}
type GoogleWindow = Window & {google?:{accounts:{id:{
  initialize:(options:{client_id:string;callback:(value:{credential:string})=>void})=>void;
  renderButton:(element:HTMLElement,options:Record<string,unknown>)=>void;
}}}};
async function authRequest(body?:Record<string,unknown>,signal?:AbortSignal):Promise<SchedulerAuth>{
  if(!body)return readClientAuth(signal);
  const response=await groupFetch("/api/auth",{cache:"no-store",signal,...(body?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{})});
  const responseEpoch=getPrivateReadSnapshot().authEpoch;
  const value=await readApiJson<SchedulerAuth & {error?:string}>(response);
  if(!response.ok)throw new Error(t(value?.error||"请求失败"));
  if(!value||typeof value!=="object"||!("account" in value)||!("clientId" in value))throw new Error(t("服务器未返回有效响应，请稍后重试"));
  if(!acceptClientAuth(value,responseEpoch))return readClientAuth(signal);
  return value;
}
export function SchedulerEntry({initialQuizId}:{initialQuizId?:string}={}){
  const [auth,setAuth]=useState<SchedulerAuth|null>(null);
  const [language,setLanguageState]=useState<Language>("zh"),[ready,setReady]=useState(false);
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const [invitedGroup,setInvitedGroup]=useState("");
  const googleButton=useRef<HTMLDivElement>(null),inFlight=useRef(false),alive=useRef(true);
  const acceptAuth=useCallback((next:SchedulerAuth)=>{
    if(!next.account){setClientGroup(null);const preference=readBrowserLanguagePreference();setLanguage(preference);setLanguageState(preference);}
    setAuth(next);
  },[]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(installPrivateReadEvents,[]);
  const authRef=useRef(auth);authRef.current=auth;
  useEffect(()=>{const refresh=()=>{if(authRef.current?.account)return;void readClientAuth().then(next=>{if(alive.current)acceptAuth(next);}).catch(error=>{if(alive.current&&!(error instanceof PrivateReadInvalidatedError))setMessage(alertActionFailure(error));});};window.addEventListener('timelyo:auth-refresh',refresh);return()=>window.removeEventListener('timelyo:auth-refresh',refresh);},[acceptAuth]);
  useEffect(()=>{const next=readBrowserLanguagePreference();setLanguage(next);setLanguageState(next);setReady(true);},[]);
  useEffect(()=>{
    const controller=new AbortController();setMessage("");
    void authRequest(undefined,controller.signal).then(next=>{if(!controller.signal.aborted)acceptAuth(next);}).catch(error=>{if(!controller.signal.aborted&&!(error instanceof PrivateReadInvalidatedError))setMessage(alertActionFailure(error));});
    return()=>controller.abort();
  },[retry,acceptAuth]);
  useEffect(()=>{
    if(!auth||auth.account)return;
    const code=new URLSearchParams(location.search).get("group");if(!code)return;
    const controller=new AbortController();
    void groupFetch(`/api/groups?code=${encodeURIComponent(code)}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      const result=await readApiJson<{group?:{name:string};error?:string}>(response);
      if(!response.ok)throw new Error(result.error||t("请求失败"));
      if(!controller.signal.aborted)setInvitedGroup(result.group?.name||"");
    }).catch(error=>{if(!controller.signal.aborted)setMessage(alertActionFailure(error));});
    return()=>controller.abort();
  },[auth?.account,auth?.clientId]);
  const signIn=useCallback(async(body:Record<string,unknown>)=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setMessage("");
    try{const result=await authRequest(body),next=result.account?result:await authRequest();if(alive.current){acceptAuth(next);showActionToast("success","登录成功");}}
    catch(error){if(alive.current&&!(error instanceof PrivateReadInvalidatedError))setMessage(alertActionFailure(error));}
    finally{inFlight.current=false;if(alive.current)setBusy(false);}
  },[acceptAuth]);
  useEffect(()=>{
    if(!ready||!auth||auth.account||!auth.clientId||!googleButton.current)return;
    let active=true;
    const setup=()=>{
      const google=(window as GoogleWindow).google;if(!active||!google||!googleButton.current)return;
      google.accounts.id.initialize({client_id:auth.clientId!,callback:value=>{if(active)void signIn({...value,groupCode:new URLSearchParams(location.search).get("group")||undefined});}});
      googleButton.current.innerHTML="";
      google.accounts.id.renderButton(googleButton.current,{theme:"outline",size:"large",width:Math.max(200,Math.min(300,googleButton.current.clientWidth)),text:"signin_with",locale:language==="zh"?"zh_CN":"en"});
    };
    if((window as GoogleWindow).google){setup();return()=>{active=false;};}
    let script=document.querySelector<HTMLScriptElement>("#timelyo-google-script");
    if(!script){script=document.createElement("script");script.id="timelyo-google-script";script.src="https://accounts.google.com/gsi/client";script.async=true;script.defer=true;document.head.appendChild(script);}
    script.addEventListener("load",setup);return()=>{active=false;script?.removeEventListener("load",setup);};
  },[ready,auth?.account,auth?.clientId,language,signIn]);
  function changeLanguage(next:Language){setLanguage(next);setLanguageState(next);rememberLanguagePreference(next);}
  if(!ready||!auth){
    if(!message)return <WorkspaceStartup/>;
    return <main className="auth-loading"><AuthLanguageSwitcher language={language} change={changeLanguage}/><p role="alert">{message}</p><button type="button" onClick={()=>setRetry(value=>value+1)}>{t("重试")}</button></main>;
  }
  if(!auth.account)return <LoginForm googleButton={googleButton} clientId={auth.clientId} login={(username,password)=>signIn({username,password})} busy={busy} message={message} language={language} changeLanguage={changeLanguage} invitedGroup={invitedGroup}/>;
  return <Workspace initialQuizId={initialQuizId} initialAuth={auth} onAuthChange={acceptAuth}/>;
}
