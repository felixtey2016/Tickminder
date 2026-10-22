import {currentBusinessAccount} from '@/lib/auth';
import {invoiceAttendanceSources} from '@/lib/invoice-attendance-correction';
import {InvoiceFinanceError} from '@/lib/invoice-finance';
import {InvoiceError} from '@/lib/invoice';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'};
export async function GET(request:Request){try{const actor=await currentBusinessAccount();if(!actor)return Response.json({error:'请先登录'},{status:401,headers});const url=new URL(request.url);return Response.json(await invoiceAttendanceSources(actor,url.searchParams.get('invoiceId')||'',Number(url.searchParams.get('page')||1)),{headers});}catch(error){return Response.json({error:error instanceof InvoiceFinanceError||error instanceof InvoiceError?error.message:'考勤资料暂时无法读取，请重试'},{status:error instanceof InvoiceFinanceError||error instanceof InvoiceError?error.status:503,headers});}}
