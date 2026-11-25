import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {readAuditHistory} from '@/lib/audit-history-server';
import {AuditHistoryError} from '@/lib/audit-history';
import {adminPermissionFailure} from '@/lib/admin-permission-access';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return NextResponse.json({error:'请先登录'}, {status:401,headers});
 try{return NextResponse.json(await readAuditHistory(actor,new URL(request.url).searchParams),{headers});}
 catch(error){const permission=adminPermissionFailure(error);return NextResponse.json({error:permission?.error||(error instanceof AuditHistoryError?error.message:'操作日志暂时无法加载')},{status:permission?.status||(error instanceof AuditHistoryError?error.status:503),headers});}
}
