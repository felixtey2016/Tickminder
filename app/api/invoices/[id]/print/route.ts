import { currentBusinessAccount } from '@/lib/auth';
import { InvoiceError } from '@/lib/invoice';
import { BillingError } from '@/lib/billing';
import { invoiceDetail, requireInvoicePermission } from '@/lib/invoice-server';
import { invoiceLogoDataUrl, InvoiceSettingsError } from '@/lib/invoice-settings';
import { renderInvoiceHtml } from '@/lib/invoice-render';
import { invoiceFinanceSummary } from '@/lib/invoice-finance-server';
import { InvoiceFinanceError } from '@/lib/invoice-finance';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{
  const {id}=await context.params,{invoice}=await invoiceDetail(actor,id),url=new URL(request.url),nonce=crypto.randomUUID().replaceAll('-','');
  // Issued documents use their saved institution snapshot and immutable logo asset, never today's settings.
  const logoDataUrl=await invoiceLogoDataUrl(actor,invoice.institution.logoAssetId),finance=invoice.status==='issued'?(await invoiceFinanceSummary(actor,[id]))[id]:undefined;await requireInvoicePermission(actor);
  return new Response(renderInvoiceHtml(invoice,{lang:url.searchParams.get('lang')==='zh'?'zh':'en',lessons:url.searchParams.get('lessons')==='1',nonce,logoDataUrl,finance,layout:url.searchParams.get('layout')==='compact'?'compact':url.searchParams.get('layout')==='original'?'original':undefined}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch(error){return error instanceof InvoiceError||error instanceof InvoiceSettingsError||error instanceof BillingError||error instanceof InvoiceFinanceError?json({error:error.message},error.status):json({error:'账单暂时无法打印，请稍后重试'},503);}
}
