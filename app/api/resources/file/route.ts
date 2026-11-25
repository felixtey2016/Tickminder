import {currentBusinessAccount} from '@/lib/auth';
import {learningDb} from '@/lib/learning-server';
import {pdfBucket} from '@/lib/pdf-storage';
import {readResourceFile} from '@/lib/resource-catalog-server';
import {translate} from '@/lib/i18n';

export async function GET(request:Request){
  const url=new URL(request.url),language=url.searchParams.get('lang')==='en'?'en':'zh';
  const failure=(message:string,status:number)=>Response.json({error:translate(message,language)},{status,headers:{'cache-control':'private, no-store'}});
  const actor=await currentBusinessAccount();
  if(!actor)return failure('请先登录',401);
  try{
    const source=await readResourceFile(actor,url.searchParams.get('resourceId')||'',url.searchParams.get('assignmentId')||undefined);
    const read=()=>learningDb().prepare(`SELECT object_key AS objectKey,bytes FROM pdf_files WHERE id=? AND group_id=? AND status='attached' AND (${source.scope.sql})`)
      .bind(source.fileId,actor.groupId,...source.scope.args).first<{objectKey:string;bytes:number}>();
    const file=await read();if(!file)return failure('文件不存在或无权访问',404);
    const object=await pdfBucket().get(file.objectKey);if(!object)return failure('PDF 文件暂时不可用',503);
    if(!await read())return failure('文件不存在或无权访问',404);
    return new Response(object.body,{headers:{
      'Content-Type':'application/pdf','Content-Length':String(file.bytes),
      'Content-Disposition':`${url.searchParams.get('download')==='1'?'attachment':'inline'}; filename="document.pdf"`,
      'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':'sandbox',
      'Cross-Origin-Resource-Policy':'same-origin','Referrer-Policy':'no-referrer',
    }});
  }catch(error){
    const status=typeof error==='object'&&error!==null&&'status' in error?Number(error.status):503;
    return failure(status===503?'PDF 暂时不可用':'文件不存在或无权访问',[400,401,403,404].includes(status)?status:503);
  }
}
