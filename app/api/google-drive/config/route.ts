import {currentBusinessAccount} from '@/lib/auth';
import {googleDriveConfig} from '@/lib/google-drive-config';
import {MaterialImportError} from '@/lib/material-import-access';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group','X-Content-Type-Options':'nosniff'}});
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{return json(await googleDriveConfig(actor,new URL(request.url).searchParams));}
 catch(error){return json({error:error instanceof MaterialImportError?error.message:(error as {status?:number})?.status===400?'请选择有效的班级和文件夹':'Google Drive 暂时无法连接，请稍后重试'},error instanceof MaterialImportError?error.status:(error as {status?:number})?.status===400?400:503);}
}
