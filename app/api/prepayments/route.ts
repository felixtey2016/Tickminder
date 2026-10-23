import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {PrepaymentError} from '@/lib/prepayments';
import {prepaymentStudents,prepaymentRequests,prepaymentLedger,prepaymentOverview,prepaymentRequestDetail,prepaymentReceiptDetail,prepaymentAllocationPreview,prepaymentPayments,prepaymentAllocations,prepaymentPreview,savePrepayment} from '@/lib/prepayments-server';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
function failure(error:unknown){if(error instanceof PrepaymentError)return json({error:error.message},error.status);return json({error:'预收资料暂时无法处理，请刷新重试'},503);}
export async function GET(request:Request){const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);try{const p=new URL(request.url).searchParams,view=p.get('view')||'students',sid=p.get('studentId')||'',month=p.get('month')||'',page=Number(p.get('page')||1);switch(view){
 case 'students':return json(await prepaymentStudents(actor,p.get('q')||'',page));
 case 'requests':return json(await prepaymentRequests(actor,month,p.get('q')||'',page,sid));
 case 'ledger':return json(await prepaymentLedger(actor,sid,month,page));
 case 'overview':return json(await prepaymentOverview(actor,sid));
 case 'request':return json(await prepaymentRequestDetail(actor,p.get('requestId')||''));
 case 'receipt':return json(await prepaymentReceiptDetail(actor,p.get('receiptId')||''));
 case 'allocation':return json(await prepaymentAllocationPreview(actor,p.get('invoiceId')||''));
 case 'payments':return json(await prepaymentPayments(actor,sid,page,'prepayments.view',p.get('availableOnly')==='true'));
 case 'allocations':return json(await prepaymentAllocations(actor,sid,page,p.get('invoiceId')||''));
 case 'preview':return json(await prepaymentPreview(actor,sid,month,p.get('subjectKey')||'',p.get('monthlyReviewed')==='true'));
 default:throw new PrepaymentError('未知预收视图');
 }}catch(error){return failure(error);}}
export async function POST(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'没有权限执行此操作'},403);const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);try{if(Number(request.headers.get('content-length')||0)>16384)throw new PrepaymentError('请求内容过大',413);const source=await request.text();if(source.length>16384)throw new PrepaymentError('请求内容过大',413);let data:unknown;try{data=JSON.parse(source);}catch{throw new PrepaymentError('预收请求格式无效');}if(!data||typeof data!=='object'||Array.isArray(data))throw new PrepaymentError('预收请求格式无效');return json(await savePrepayment(actor,data as Record<string,unknown>));}catch(error){return failure(error);}}
