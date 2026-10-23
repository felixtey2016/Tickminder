import {currentBusinessAccount} from '@/lib/auth';
import {ParentsError} from '@/lib/parents';
import {parentFinancialPrint} from '@/lib/parent-finance-server';
export async function GET(request:Request,context:{params:Promise<{kind:string;id:string}>}){
 const headers={'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'},actor=await currentBusinessAccount();if(!actor)return Response.json({error:'请先登录'},{status:401,headers});
 try{const {kind,id}=await context.params,url=new URL(request.url);return await parentFinancialPrint(actor,url.searchParams.get('studentId')||'',kind,id,url.searchParams.get('lang')||'en');}catch(error){return Response.json({error:error instanceof ParentsError?error.message:'单据暂时无法读取，请稍后重试'},{status:error instanceof ParentsError?error.status:503,headers});}
}
