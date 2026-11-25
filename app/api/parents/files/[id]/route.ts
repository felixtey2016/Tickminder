import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {ParentsError} from '@/lib/parents';
import {parentFile} from '@/lib/parents-server';
import {parentHomeworkReviewFile} from '@/lib/parent-learning';
import {pdfBucket} from '@/lib/pdf-storage';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const actor=await currentBusinessAccount(),headers={'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'};
 if(!actor)return NextResponse.json({error:'请先登录'},{status:401,headers});
 try{const {id}=await context.params,url=new URL(request.url),access=await parentFile(actor,url.searchParams.get('studentId')||'',id).catch(error=>{if(error instanceof ParentsError&&error.status===404)return parentHomeworkReviewFile(actor,url.searchParams.get('studentId')||'',id);throw error;}),object=await pdfBucket().get(access.file.objectKey);
  if(!object)throw new ParentsError('PDF 文件暂时不可用',503);
  // R2 may take time. Recheck the child grant and the document's current audience
  // after the object is fetched, before any private bytes leave the Worker.
  await access.recheck();
  return new Response(object.body,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename="document.pdf"`,'Content-Length':String(access.file.bytes),'X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox','Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer'}});
 }catch(error){return NextResponse.json({error:error instanceof ParentsError?error.message:'PDF 暂时不可用'},{status:error instanceof ParentsError?error.status:503,headers});}
}
