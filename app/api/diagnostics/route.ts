import {env} from 'cloudflare:workers';
import {currentBusinessAccount,type Account} from '@/lib/auth';
import {isOwnerAccount} from '@/lib/owner';
import {ownerAuthorityGuard} from '@/lib/admin-authority';
import {learningDb} from '@/lib/learning-server';
import {createDiagnosticKey,listDiagnosticKeys,readDiagnosticFeed,revokeDiagnosticKey} from '@/lib/diagnostics-store';
import {DiagnosticError,diagnosticCoverage,diagnosticGroup} from '@/lib/diagnostics-contract';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
function configuration(){const raw=(env as unknown as {DIAGNOSTICS_FEED_URL?:string}).DIAGNOSTICS_FEED_URL;let feedUrl:string|null=null;try{if(raw){const url=new URL(raw);if(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/diagnostics/feed')feedUrl=url.href;}}catch{}return{feedUrl,coverage:diagnosticCoverage(Boolean(env.DIAGNOSTICS),Boolean(feedUrl))};}
async function owner():Promise<Account>{const actor=await currentBusinessAccount();if(!actor)throw new DiagnosticError('请先登录',401);if(!isOwnerAccount(actor)||!actor.groupId)throw new DiagnosticError('只有平台最高管理员可以读取诊断',403);await learningDb().batch([ownerAuthorityGuard(actor,actor.groupId)]);return actor;}
const failure=(error:unknown)=>json({error:error instanceof DiagnosticError?error.message:'诊断暂时无法读取，请稍后重试'},error instanceof DiagnosticError?error.status:503);
export async function GET(request:Request){
 try{
  await owner();const url=new URL(request.url),view=url.searchParams.get('view')||'events';
  if(view==='keys'){const keys=await listDiagnosticKeys(env.DIAGNOSTICS);await owner();return json({keys,...configuration()});}
  if(view!=='events')throw new DiagnosticError('诊断视图无效');
  const feed=await readDiagnosticFeed(env.DIAGNOSTICS,{scope:'all',groupId:null},{groupId:url.searchParams.get('groupId'),limit:url.searchParams.has('limit')?Number(url.searchParams.get('limit')):30,cursor:url.searchParams.get('cursor')});
  await owner();return json({...feed,...configuration()});
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'请求来源无效'},403);
 let createdId:string|undefined;
 try{
  const actor=await owner(),text=await request.text();if(text.length>4096)throw new DiagnosticError('诊断授权内容过大');let data:Record<string,unknown>;
  try{data=JSON.parse(text);}catch{throw new DiagnosticError('诊断授权格式无效');}if(!data||typeof data!=='object'||Array.isArray(data))throw new DiagnosticError('诊断授权格式无效');
  if(data.action==='createKey'){
   if(Object.keys(data).some(key=>!['action','label','scope','groupId','expiresDays'].includes(key)))throw new DiagnosticError('诊断授权格式无效');
   if(data.scope==='group'&&(!diagnosticGroup(data.groupId)||!await learningDb().prepare('SELECT 1 FROM tuition_groups WHERE id=?').bind(data.groupId).first()))throw new DiagnosticError('补习集团不存在',404);
   const result=await createDiagnosticKey(env.DIAGNOSTICS,{label:data.label,scope:data.scope,groupId:data.groupId,expiresDays:data.expiresDays});createdId=result.key.id;
   await learningDb().batch([ownerAuthorityGuard(actor,actor.groupId!)]);await owner();createdId=undefined;return json({ok:true,...result,...configuration()});
  }
  if(data.action==='revokeKey'){
   if(Object.keys(data).some(key=>!['action','id'].includes(key)))throw new DiagnosticError('诊断授权格式无效');
   await revokeDiagnosticKey(env.DIAGNOSTICS,data.id);await owner();return json({ok:true});
  }
  throw new DiagnosticError('诊断授权操作无效');
 }catch(error){if(createdId)try{await revokeDiagnosticKey(env.DIAGNOSTICS,createdId);}catch{/* A failed owner operation never returns a token. */}return failure(error);}
}
