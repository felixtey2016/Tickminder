import {env} from 'cloudflare:workers';
import {currentBusinessAccount} from '@/lib/auth';
import {accountSessionPredicate} from '@/lib/account-session';
import {learningDb} from '@/lib/learning-server';
import {DiagnosticError,diagnosticExpectedStatus,sanitizeDiagnosticInput} from '@/lib/diagnostics-contract';
import {writeDiagnosticEvent} from '@/lib/diagnostics-store';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'请求来源无效'},403);
 try{
  const actor=await currentBusinessAccount();if(!actor)throw new DiagnosticError('请先登录',401);if(!actor.groupId||!['admin','teacher','student','parent'].includes(actor.role))throw new DiagnosticError('请先完成账号设置',403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||Number(request.headers.get('content-length')||0)>8192)throw new DiagnosticError('诊断内容格式无效');
  const text=await request.text();if(new TextEncoder().encode(text).length>8192)throw new DiagnosticError('诊断内容过大',413);
  let body:unknown;try{body=JSON.parse(text);}catch{throw new DiagnosticError('诊断内容格式无效');}
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>key!=='events'))throw new DiagnosticError('诊断内容格式无效');
  const values=(body as {events?:unknown}).events;if(!Array.isArray(values)||values.length<1||values.length>10)throw new DiagnosticError('每次最多提交 10 条诊断');
  const events=values.map(value=>sanitizeDiagnosticInput(value,true));if(events.some(value=>!value||!['browser','api'].includes(value.source)))throw new DiagnosticError('诊断内容格式无效');
  const session=accountSessionPredicate(actor),allowed=await learningDb().prepare(`SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? AND g.active=1 JOIN local_credentials c ON c.account_id=a.id AND c.must_change_password=0 WHERE a.id=? AND a.disabled_at IS NULL AND a.role=? AND (a.group_id=g.id OR (a.role='admin' AND lower(trim(a.email))='felixtey2016@gmail.com' AND substr(a.id,1,6)<>'local:')) AND (${session.sql})`).bind(actor.groupId,actor.id,actor.role,...session.args).first();
  if(!allowed)throw new DiagnosticError('账号状态已改变，请刷新后重试',403);
  const accepted=events.filter(value=>value&&!diagnosticExpectedStatus(value.status));
  const results=await Promise.all(accepted.map(value=>writeDiagnosticEvent(env.DIAGNOSTICS,value!,{groupId:actor.groupId,untrusted:true})));
  return json({ok:true,accepted:accepted.length,stored:results.filter(result=>result.stored).length},202);
 }catch(error){return json({error:error instanceof DiagnosticError?error.message:'诊断暂时无法保存'},error instanceof DiagnosticError?error.status:503);}
}
