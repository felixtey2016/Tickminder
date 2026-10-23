import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {ParentsError} from '@/lib/parents';
import {parentChildren,parentLinks,parentStudentSearch,studentParents,parentChildView,saveParentLink} from '@/lib/parents-server';
import {parentFinancialAccess,saveParentFinancialAccess,parentInvoiceList,parentInvoiceDetail,parentPrepayments} from '@/lib/parent-finance-server';
import {parentLearningView} from '@/lib/parent-learning';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group','X-Content-Type-Options':'nosniff'}});
function failure(error:unknown){return error instanceof ParentsError?json({error:error.message},error.status):json({error:'家长资料暂时无法处理，请刷新后重试'},503);}
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{const params=new URL(request.url).searchParams,view=params.get('view')||'children';
  if(['quizResults','quizResult','homeworkGrades','homeworkGrade','performance'].includes(view))return json(await parentLearningView(actor,params));
  if(view==='financialAccess')return json(await parentFinancialAccess(actor,params));
  if(view==='finance')return json(await parentInvoiceList(actor,params));
  if(view==='invoice')return json(await parentInvoiceDetail(actor,params));
  if(view==='prepayments')return json(await parentPrepayments(actor,params));
  if(view==='children')return json(await parentChildren(actor,params));
  if(view==='links')return json(await parentLinks(actor,params));
  if(view==='students')return json(await parentStudentSearch(actor,params));
  if(view==='studentParents')return json(await studentParents(actor,params));
  if(['child','calendar','lessons','homework','materials','recordings'].includes(view))return json(await parentChildView(actor,params));
  throw new ParentsError('家长页面不存在',404);
 }catch(error){return failure(error);}
}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'没有权限执行此操作'},403);
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{if(Number(request.headers.get('content-length')||0)>8192)throw new ParentsError('请求内容过大',413);const raw=await request.text();if(raw.length>8192)throw new ParentsError('请求内容过大',413);let value:unknown;try{value=JSON.parse(raw);}catch{throw new ParentsError('家长请求格式无效');}if(!value||typeof value!=='object'||Array.isArray(value))throw new ParentsError('家长请求格式无效');const data=value as Record<string,unknown>;return json(await (['financialGrant','financialRevoke'].includes(String(data.action))?saveParentFinancialAccess(actor,data):saveParentLink(actor,data)));}catch(error){return failure(error);}
}
