import { currentBusinessAccount } from '@/lib/auth';
import { BillingError } from '@/lib/billing';
import { invoiceLogoResponse, uploadInvoiceLogo, InvoiceSettingsError } from '@/lib/invoice-settings';
import { INVOICE_LOGO_MAX_BYTES } from '@/lib/invoice-logo';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
function failure(error:unknown){return error instanceof InvoiceSettingsError||error instanceof BillingError?json({error:error.message},error.status):json({error:'Logo 暂时无法处理，请稍后重试'},503);}
export async function GET(request:Request){const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);try{return await invoiceLogoResponse(actor,new URL(request.url).searchParams.get('id')||'');}catch(error){return failure(error);}}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'没有权限执行此操作'},403);
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{
  // Bound the multipart body before parsing it; a missing Content-Length must not bypass the file limit.
  if(Number(request.headers.get('content-length')||0)>INVOICE_LOGO_MAX_BYTES+16384)throw new InvoiceSettingsError('Logo 文件过大',413);
  const stream=request.body?.getReader();if(!stream)throw new InvoiceSettingsError('请选择 Logo 文件');
  const parts:Uint8Array[]=[];let length=0;while(true){const part=await stream.read();if(part.done)break;length+=part.value.length;if(length>INVOICE_LOGO_MAX_BYTES+16384){await stream.cancel();throw new InvoiceSettingsError('Logo 文件过大',413);}parts.push(part.value);}
  const buffer=new Uint8Array(length);let offset=0;for(const p of parts){buffer.set(p,offset);offset+=p.length;}
  let form:FormData;try{form=await new Response(buffer,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();}catch{throw new InvoiceSettingsError('上传格式无效');}
  const file=form.get('file'),value=form.get('revision');if(!(file instanceof File)||typeof value!=='string'||!/^\d{1,10}$/.test(value))throw new InvoiceSettingsError('请选择 Logo 文件，并刷新设置后重试');
  return json(await uploadInvoiceLogo(actor,file,Number(value)));
 }catch(error){return failure(error);}
}
