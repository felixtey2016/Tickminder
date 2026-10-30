import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {BillingError} from '@/lib/billing';
import {InvoiceFinanceError} from '@/lib/invoice-finance';
import {PrepaymentError} from '@/lib/prepayments';
import {studentStatementPage} from '@/lib/student-statements-server';
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{return json(await studentStatementPage(actor,new URL(request.url).searchParams));}
 catch(error){if(error instanceof BillingError||error instanceof InvoiceFinanceError||error instanceof PrepaymentError)return json({error:error.message},error.status);return json({error:'学生月结暂时无法计算，请刷新重试'},503);}
}
