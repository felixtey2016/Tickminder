import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {ParentsError} from '@/lib/parents';
import {parentRecording} from '@/lib/parents-server';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const actor=await currentBusinessAccount(),headers={'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group','Referrer-Policy':'no-referrer'};
 if(!actor)return NextResponse.json({error:'请先登录'},{status:401,headers});
 try{const {id}=await context.params,url=new URL(request.url),target=await parentRecording(actor,url.searchParams.get('studentId')||'',id);return new Response(null,{status:302,headers:{...headers,Location:target}});}
 catch(error){return NextResponse.json({error:error instanceof ParentsError?error.message:'录影暂时不可用'},{status:error instanceof ParentsError?error.status:503,headers});}
}
