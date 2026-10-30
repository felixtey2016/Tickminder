import {env} from 'cloudflare:workers';
import {authenticateDiagnosticsToken,readDiagnosticFeed} from '@/lib/diagnostics-store';
import {DiagnosticError} from '@/lib/diagnostics-contract';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Authorization'}});
export async function GET(request:Request){
 try{
  if(!env.DIAGNOSTICS)throw new DiagnosticError('Diagnostics unavailable',503);
  const principal=await authenticateDiagnosticsToken(env.DIAGNOSTICS,request.headers.get('authorization'));if(!principal)return json({error:'Diagnostic read authorization required'},401);
  const url=new URL(request.url),result=await readDiagnosticFeed(env.DIAGNOSTICS,principal,{groupId:url.searchParams.get('groupId'),limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):30,cursor:url.searchParams.get('cursor')});
  return json(result);
 }catch(error){return json({error:error instanceof DiagnosticError?error.message:'Diagnostics unavailable'},error instanceof DiagnosticError?error.status:503);}
}
