import { currentBusinessAccount } from '@/lib/auth';
import { BillingError } from '@/lib/billing';
import { invoiceSettings, saveInvoiceSettings, InvoiceSettingsError } from '@/lib/invoice-settings';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
function failure(error:unknown){return error instanceof InvoiceSettingsError||error instanceof BillingError?json({error:error.message},error.status):json({error:'账单设置暂时无法处理，请稍后重试'},503);}
export async function GET(){const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);try{return json(await invoiceSettings(actor));}catch(error){return failure(error);}}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'没有权限执行此操作'},403);
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{
  if(Number(request.headers.get('content-length')||0)>16384)throw new InvoiceSettingsError('设置内容过大',413);
  const body=await request.text();if(body.length>16384)throw new InvoiceSettingsError('设置内容过大',413);
  let data:unknown;try{data=JSON.parse(body);}catch{throw new InvoiceSettingsError('设置格式无效');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new InvoiceSettingsError('设置格式无效');
  return json(await saveInvoiceSettings(actor,data as Record<string,unknown>));
 }catch(error){return failure(error);}
}
