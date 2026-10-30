"use client";

import {diagnosticsRoute,sanitizeDiagnosticInput} from "./diagnostics-contract";
export type DiagnosticCode="runtime_exception"|"unhandled_rejection"|"api_5xx"|"network_failure"|"invalid_response"|"render_failure";
export type DiagnosticFrame={asset:string;line?:number;column?:number};
export type BrowserDiagnostic={source:"browser";code:DiagnosticCode;route?:string;method?:"GET"|"POST"|"PUT"|"PATCH"|"DELETE"|"HEAD"|"OPTIONS";status?:number;requestId?:string;rayId?:string;buildId?:string;frame?:DiagnosticFrame};
const nativeFetch=typeof fetch==="function"?fetch.bind(globalThis):null;
const methods=new Set(["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"]);
const codes=new Set(["runtime_exception","unhandled_rejection","api_5xx","network_failure","invalid_response","render_failure"]);
const queue:BrowserDiagnostic[]=[],seen=new Map<string,number>(),responseContexts=new WeakMap<Response,{route:string;method:BrowserDiagnostic["method"]}>();
let timer:ReturnType<typeof setTimeout>|undefined,inFlight=false,retries=0,backoffUntil=0,windowAt=0,windowCount=0,lifetimeCount=0;
const isBrowser=()=>typeof window!=="undefined"&&typeof location!=="undefined";
const online=()=>typeof navigator==="undefined"||navigator.onLine!==false;
const boundedPosition=(value:unknown)=>typeof value==="number"&&Number.isInteger(value)&&value>0&&value<=10000000?value:undefined;
function localUrl(input:unknown){
 try{if(!isBrowser())return null;const raw=typeof input==="string"?input:input instanceof URL?input.href:typeof Request!=="undefined"&&input instanceof Request?input.url:null;if(!raw)return null;const url=new URL(raw,location.origin);return url.origin===location.origin&&!url.username&&!url.password?url:null;}catch{return null;}
}
/** Only fixed routes leave the browser. IDs, query strings and unknown names do not. */
export function clientDiagnosticRoute(input:unknown):string|undefined{
 const url=localUrl(input);if(!url)return undefined;const route=diagnosticsRoute(url.pathname);return route==="/diagnostics"?undefined:route;
}
function safeAsset(input:unknown):string|undefined{
 if(typeof input!=="string")return undefined;
 if(/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,139}\.m?js$/.test(input)&&!input.includes(".."))return input;
 const url=localUrl(input);if(!url||!/^\/(?:_next\/|assets\/)/.test(url.pathname))return undefined;
 const asset=url.pathname.split("/").pop()||"";return /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,139}\.m?js$/.test(asset)&&!asset.includes("..")?asset:undefined;
}
export function clientDiagnosticFrame(input:unknown,line?:unknown,column?:unknown):DiagnosticFrame|undefined{
 const asset=safeAsset(input);if(!asset)return undefined;const l=boundedPosition(line),c=boundedPosition(column);return{asset,...(l?{line:l}:{}),...(c?{column:c}:{})};
}
function errorFrame(error:unknown):DiagnosticFrame|undefined{
 try{if(!(error instanceof Error)||typeof error.stack!=="string")return undefined;for(const line of error.stack.split("\n").slice(1,12)){const found=line.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);if(found){const frame=clientDiagnosticFrame(found[1],Number(found[2]),Number(found[3]));if(frame)return frame;}}}catch{}return undefined;
}
function clientBuild(){try{if(!isBrowser())return undefined;for(const script of Array.from(document.scripts)){const asset=safeAsset(script.src);if(asset){let hash=2166136261;for(let i=0;i<asset.length;i++)hash=Math.imul(hash^asset.charCodeAt(i),16777619);return(hash>>>0).toString(16).padStart(8,"0");}}}catch{}return undefined;}
/** Whitelist reconstruction prevents accidental raw message/stack/body fields. */
export function sanitizeBrowserDiagnostic(value:BrowserDiagnostic):BrowserDiagnostic|null{
 try{if(!codes.has(value.code))return null;const route=clientDiagnosticRoute(value.route||location.pathname);if(!route)return null;const method=value.method&&methods.has(value.method)?value.method:undefined,frame=value.frame&&clientDiagnosticFrame(value.frame.asset,value.frame.line,value.frame.column),status=typeof value.status==="number"&&Number.isInteger(value.status)&&value.status>=500&&value.status<=599?value.status:undefined;
  const payload={source:"browser" as const,code:value.code,route,...(method?{method}:{}),...(status?{status}:{}),...(typeof value.requestId==="string"&&/^[A-Za-z0-9_-]{8,100}$/.test(value.requestId)?{requestId:value.requestId}:{}),...(typeof value.rayId==="string"&&/^[a-f0-9]{16,32}(?:-[A-Z]{3})?$/i.test(value.rayId)?{rayId:value.rayId}:{}),...(typeof value.buildId==="string"&&/^[a-f0-9-]{7,64}$/i.test(value.buildId)?{buildId:value.buildId}:{}),...(frame?{frame}:{})};return sanitizeDiagnosticInput(payload,true) as BrowserDiagnostic|null;
 }catch{return null;}
}
function schedule(delay=2500){if(timer!==undefined||!queue.length)return;timer=setTimeout(()=>{timer=undefined;void flushClientDiagnostics();},Math.max(delay,backoffUntil-Date.now()));}
export function reportClientDiagnostic(value:BrowserDiagnostic){
 try{if(!isBrowser()||!online()||lifetimeCount>=50)return;const clean=sanitizeBrowserDiagnostic(value);if(!clean)return;const now=Date.now();if(now-windowAt>=60000){windowAt=now;windowCount=0;}if(windowCount>=10)return;
  const fingerprint=JSON.stringify([clean.code,clean.route,clean.method,clean.status,clean.frame]);if(now-(seen.get(fingerprint)||0)<300000)return;seen.set(fingerprint,now);if(seen.size>100)seen.delete(seen.keys().next().value!);if(queue.length>=10)return;queue.push(clean);windowCount++;lifetimeCount++;schedule();
 }catch{/* Diagnostics never block the user's action. */}
}
export async function flushClientDiagnostics(){
 if(!isBrowser()||!nativeFetch||inFlight||!queue.length)return;if(!online()){queue.length=0;return;}if(Date.now()<backoffUntil){schedule(backoffUntil-Date.now());return;}
 if(timer!==undefined){clearTimeout(timer);timer=undefined;}const batch=queue.splice(0,10);while(batch.length&&new TextEncoder().encode(JSON.stringify({events:batch})).length>8000)batch.pop();if(!batch.length)return;inFlight=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);
 try{const response=await nativeFetch("/api/diagnostics/ingest",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({events:batch}),keepalive:true,signal:controller.signal});
  if(!response.ok){backoffUntil=Date.now()+(response.status===429?900000:60000*Math.min(16,2**retries));if(response.status>=500&&retries<2){retries++;queue.unshift(...batch.slice(0,10-queue.length));}else retries=0;}else{retries=0;backoffUntil=0;}
 }catch{backoffUntil=Date.now()+60000*Math.min(16,2**retries);if(retries<2){retries++;queue.unshift(...batch.slice(0,10-queue.length));}else retries=0;}
 finally{clearTimeout(timeout);inFlight=false;if(queue.length)schedule();}
}
function apiContext(input:unknown,method?:string){const url=localUrl(input),route=url&&clientDiagnosticRoute(url);if(!route?.startsWith("/api/"))return null;const m=(method||((typeof Request!=="undefined"&&input instanceof Request)?input.method:"GET")).toUpperCase();return{route,method:(methods.has(m)?m:"GET") as BrowserDiagnostic["method"]};}
export function observeApiResponse(input:unknown,response:Response,method?:string){try{const context=apiContext(input,method);if(!context)return;responseContexts.set(response,context);if(response.status<500)return;reportClientDiagnostic({source:"browser",code:"api_5xx",...context,status:response.status,requestId:response.headers.get("x-tickminder-error-id")||undefined,rayId:response.headers.get("cf-ray")||undefined,buildId:clientBuild()});}catch{}}
export function observeApiFailure(input:unknown,error:unknown,method?:string){try{if(!online()||(error as{name?:string})?.name==="AbortError")return;const context=apiContext(input,method);if(context)reportClientDiagnostic({source:"browser",code:"network_failure",...context,buildId:clientBuild()});}catch{}}
export function observeInvalidApiResponse(response:Response,error?:unknown){try{if(!response.ok||(error as{name?:string})?.name==="AbortError")return;const context=responseContexts.get(response)||apiContext(response.url);if(context)reportClientDiagnostic({source:"browser",code:"invalid_response",...context,buildId:clientBuild()});}catch{}}
export function reportClientException(error:unknown,code:DiagnosticCode="runtime_exception",frame?:DiagnosticFrame){
 try{if((error as{name?:string})?.name==="AbortError")return;const status=(error as{status?:number})?.status;if(status&&status>=400&&status<500)return;reportClientDiagnostic({source:"browser",code,route:location.pathname,frame:frame||errorFrame(error),buildId:clientBuild()});}catch{}
}
export function installClientDiagnostics(){
 if(!isBrowser())return()=>{};
 const crashed=(event:ErrorEvent)=>{const frame=clientDiagnosticFrame(event.filename,event.lineno,event.colno);if(event.filename&&!localUrl(event.filename))return;reportClientException(event.error,"runtime_exception",frame);};
 const rejected=(event:PromiseRejectionEvent)=>reportClientException(event.reason,"unhandled_rejection");
 const hidden=()=>{if(document.visibilityState==="hidden")void flushClientDiagnostics();};
 const exiting=()=>{void flushClientDiagnostics();};
 window.addEventListener("error",crashed);window.addEventListener("unhandledrejection",rejected);window.addEventListener("pagehide",exiting);document.addEventListener("visibilitychange",hidden);
 return()=>{window.removeEventListener("error",crashed);window.removeEventListener("unhandledrejection",rejected);window.removeEventListener("pagehide",exiting);document.removeEventListener("visibilitychange",hidden);};
}