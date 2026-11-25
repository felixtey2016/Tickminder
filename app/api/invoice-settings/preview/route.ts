import { currentBusinessAccount } from '@/lib/auth';
import { BillingError } from '@/lib/billing';
import { invoiceSettingsSnapshot, parseInvoiceSettings, invoiceLogoDataUrl, InvoiceSettingsError } from '@/lib/invoice-settings';
import { renderInvoiceHtml, sampleInvoiceDocument } from '@/lib/invoice-render';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'没有权限执行此操作'},403);
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{
  await invoiceSettingsSnapshot(actor);
  if(Number(request.headers.get('content-length')||0)>16384)throw new InvoiceSettingsError('设置内容过大',413);
  const body=await request.text();if(body.length>16384)throw new InvoiceSettingsError('设置内容过大',413);
  let value:unknown;try{value=JSON.parse(body);}catch{throw new InvoiceSettingsError('预览格式无效');}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new InvoiceSettingsError('预览格式无效');
  const data=value as Record<string,unknown>,settings=parseInvoiceSettings(data.settings),logoDataUrl=await invoiceLogoDataUrl(actor,settings.logoAssetId);
  return new Response(renderInvoiceHtml(sampleInvoiceDocument(settings),{lang:data.lang==='zh'?'zh':'en',lessons:data.lessons===true,preview:true,logoDataUrl,layout:data.layout==='compact'?'compact':data.layout==='original'?'original':undefined}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"}});
 }catch(error){return error instanceof InvoiceSettingsError||error instanceof BillingError?json({error:error.message},error.status):json({error:'账单预览暂时无法生成，请稍后重试'},503);}
}
