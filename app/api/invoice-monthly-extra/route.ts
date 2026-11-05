import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {InvoiceFinanceError} from '@/lib/invoice-finance';
import {BillingError} from '@/lib/billing';
import {reportUnexpectedError} from '@/lib/diagnostics-server';
import {invoiceMonthlyExtras,confirmInvoiceMonthlyExtra} from '@/lib/invoice-monthly-extra-server';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
function failure(error:unknown){if(error instanceof InvoiceFinanceError||error instanceof BillingError)return json({error:error.message},error.status);reportUnexpectedError(error,{operation:'invoice-monthly-extra'});return json({error:'月费额外课次暂时无法处理，请稍后重试'},503);}
export async function GET(request:Request){const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);try{const p=new URL(request.url).searchParams;if(p.getAll('invoiceId').length!==1)throw new InvoiceFinanceError('请选择有效账单');return json(await invoiceMonthlyExtras(actor,p.get('invoiceId')!));}catch(error){return failure(error);}}
export async function POST(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'没有权限执行此操作'},403);const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);try{if(Number(request.headers.get('content-length')||0)>16384)throw new InvoiceFinanceError('请求内容过大',413);const text=await request.text();if(text.length>16384)throw new InvoiceFinanceError('请求内容过大',413);let data:unknown;try{data=JSON.parse(text);}catch{throw new InvoiceFinanceError('请求格式无效');}if(!data||typeof data!=='object'||Array.isArray(data))throw new InvoiceFinanceError('请求格式无效');return json(await confirmInvoiceMonthlyExtra(actor,data as Record<string,unknown>));}catch(error){return failure(error);}}
