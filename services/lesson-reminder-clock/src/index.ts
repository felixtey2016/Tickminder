import {authenticateDiagnosticsToken,readDiagnosticFeed,writeDiagnosticEvent} from '../../../lib/diagnostics-store';
import type {DiagnosticInput} from '../../../lib/diagnostics-contract';

interface Env { TICKMINDER_ORIGIN:string; NOTIFICATIONS_CRON_TOKEN:string; DIAGNOSTICS?:R2Bucket; CF_VERSION_METADATA?:{id:string}; }
const DISPATCH_PATH='/api/notifications/dispatch',FEED_PATH='/diagnostics/feed';
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
function clockOrigin(value:string){
  let origin:URL;try{origin=new URL(value);}catch{throw new Error('Invalid scheduler configuration');}
  if(origin.origin!=='https://www.tickminder.com'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw new Error('Invalid scheduler configuration');
  return origin;
}
function rayId(response:Response){const value=response.headers.get('cf-ray')||'';return /^[a-f0-9]{16,32}(?:-[a-z]{3})?$/i.test(value)?value:undefined;}
async function report(env:Env,input:DiagnosticInput){
  // The independent clock never reads business D1 or copies a response body,
  // request headers, reminder credentials or student information into reports.
  let stored=false;
  try{stored=(await writeDiagnosticEvent(env.DIAGNOSTICS,input,{groupId:null,buildId:env.CF_VERSION_METADATA?.id})).stored;}catch{/* Diagnostic failure cannot replace the original failure. */}
  // False also covers deduplication/rate limits. Never declare the collector
  // healthy on that basis; Workers Logs remains a separate best-effort channel.
  console.error({event:'tickminder_clock_failure',source:input.source,code:input.code,route:input.route,status:input.status,rayId:input.rayId,stored});
}
async function resourceLimit(response:Response){
  if(!response.body)return false;
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
  try{
    while(bytes<4096){const next=await reader.read();if(next.done)break;const chunk=next.value.subarray(0,4096-bytes);chunks.push(chunk);bytes+=chunk.byteLength;}
    const sample=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){sample.set(chunk,offset);offset+=chunk.byteLength;}
    return /\bError\s*1102\b|Worker exceeded resource limits/i.test(new TextDecoder().decode(sample));
  }catch{return false;}finally{void reader.cancel().catch(()=>{});}
}
async function discard(response:Response){try{await response.body?.cancel();}catch{/* No response content is retained. */}}
async function dispatch(env:Env,origin:URL){
  if(typeof env.NOTIFICATIONS_CRON_TOKEN!=='string'||env.NOTIFICATIONS_CRON_TOKEN.length<32){await report(env,{source:'cron',code:'cron_failure',route:DISPATCH_PATH,method:'POST'});throw new Error('Invalid scheduler configuration');}
  let response:Response;
  try{
    // Preserve the original authenticated minute dispatch and its 45s timeout.
    response=await fetch(new URL(DISPATCH_PATH,origin),{method:'POST',headers:{Authorization:`Bearer ${env.NOTIFICATIONS_CRON_TOKEN}`},redirect:'manual',signal:AbortSignal.timeout(45_000)});
  }catch{await report(env,{source:'cron',code:'network_failure',route:DISPATCH_PATH,method:'POST'});throw new Error('Tickminder reminder dispatch failed');}
  if(!response.ok){
    const limited=await resourceLimit(response);
    await report(env,{source:'cron',code:limited?'resource_limit':response.status>=500?'api_5xx':'cron_failure',route:DISPATCH_PATH,method:'POST',status:response.status,rayId:rayId(response)});
    throw new Error(`Tickminder reminder dispatch failed (${response.status})`);
  }
  await discard(response);
}
async function health(env:Env,origin:URL){
  let response:Response;
  try{response=await fetch(new URL('/',origin),{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(8_000)});}
  catch{await report(env,{source:'cron',code:'network_failure',route:'/',method:'GET'});throw new Error('Tickminder health probe failed');}
  if(!response.ok){
    const limited=await resourceLimit(response);
    await report(env,{source:'cron',code:limited?'resource_limit':response.status>=500?'api_5xx':'cron_failure',route:'/',method:'GET',status:response.status,rayId:rayId(response)});
    throw new Error(`Tickminder health probe failed (${response.status})`);
  }
  await discard(response);
}
function json(value:unknown,status=200){return Response.json(value,{status,headers:privateHeaders});}
export default {
  async scheduled(_event:ScheduledController,env:Env,ctx:ExecutionContext) {
    ctx.waitUntil((async()=>{
      let origin:URL;
      try{origin=clockOrigin(env.TICKMINDER_ORIGIN);}catch{await report(env,{source:'cron',code:'cron_failure',route:DISPATCH_PATH,method:'POST'});throw new Error('Invalid scheduler configuration');}
      // Both run once per invocation; an app/D1 failure cannot stop the other
      // probe or force diagnostic persistence through the broken application.
      const results=await Promise.allSettled([dispatch(env,origin),health(env,origin)]);
      for(const result of results)if(result.status==='rejected')throw result.reason;
    })());
  },
  async fetch(request:Request,env:Env){
    const url=new URL(request.url);
    if(url.pathname!==FEED_PATH)return new Response(null,{status:404});
    if(request.method!=='GET')return new Response(null,{status:405,headers:{...privateHeaders,Allow:'GET'}});
    if(!env.DIAGNOSTICS)return json({error:'Diagnostics unavailable'},503);
    try{
      const principal=await authenticateDiagnosticsToken(env.DIAGNOSTICS,request.headers.get('Authorization'));
      if(!principal)return json({error:'Unauthorized'},401);
      if([...url.searchParams.keys()].some(key=>!['groupId','limit','cursor'].includes(key)))return json({error:'Invalid diagnostic query'},400);
      const limit=url.searchParams.has('limit')?Number(url.searchParams.get('limit')):undefined;
      if(limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>30))return json({error:'Invalid diagnostic query'},400);
      const feed=await readDiagnosticFeed(env.DIAGNOSTICS,principal,{groupId:url.searchParams.get('groupId'),limit,cursor:url.searchParams.get('cursor')});
      return json({...feed,coverage:{...feed.coverage,independentFeedConfigured:true}});
    }catch(error){
      const status=typeof error==='object'&&error!==null&&'status'in error?Number(error.status):503;
      return json({error:status===400?'Invalid diagnostic query':status===403?'Forbidden':'Diagnostics unavailable'},[400,403].includes(status)?status:503);
    }
  },
};
