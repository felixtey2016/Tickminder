import {currentBusinessAccount} from '@/lib/auth';
import {InvoiceError} from '@/lib/invoice';
import {BillingError} from '@/lib/billing';
import {InvoiceFinanceError} from '@/lib/invoice-finance';
import {receiptDetail,requireFinancePermission} from '@/lib/invoice-finance-server';
import {invoiceLogoDataUrl,InvoiceSettingsError} from '@/lib/invoice-settings';
import {renderReceiptHtml} from '@/lib/receipt-render';

const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{
  const {id}=await context.params,{receipt,reversedAt}=await receiptDetail(actor,id),url=new URL(request.url),nonce=crypto.randomUUID().replaceAll('-','');
  const logoDataUrl=await invoiceLogoDataUrl(actor,receipt.institution.logoAssetId);
  // Recheck the live payment grant after storage access, immediately before returning the document.
  await requireFinancePermission(actor,'payments.view');
  return new Response(renderReceiptHtml(receipt,{lang:url.searchParams.get('lang')==='zh'?'zh':'en',nonce,logoDataUrl,reversedAt}),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':`default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`}});
 }catch(error){return error instanceof InvoiceFinanceError||error instanceof InvoiceError||error instanceof InvoiceSettingsError||error instanceof BillingError?json({error:error.message},error.status):json({error:'收据暂时无法打印，请稍后重试'},503);}
}
