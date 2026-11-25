import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {requireCorePermissions} from '@/lib/admin-core-permissions';
import {adminPermissionFailure} from '@/lib/admin-permission-access';
import {StudentOffboardingError,offboardingItems,markStudentDeparture,previewStudentCleanup,cleanStudentDeparture} from '@/lib/student-offboarding';

const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});
function failure(error:unknown){const permission=adminPermissionFailure(error);if(permission)return json({error:permission.error},permission.status);if(error instanceof StudentOffboardingError)return json({error:error.message},error.status);if(/student_offboarding_changed|UNIQUE constraint/.test(String(error)))return json({error:'记录已更新，请刷新后重试'},409);return json({error:'暂时无法处理，请刷新后重试'},503);}
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'登录已过期，请重新登录'},401);if(actor.role!=='admin'||!actor.groupId)return json({error:'没有权限执行此操作'},403);
 try{await requireCorePermissions(actor,['students.view']);const name=new URL(request.url).searchParams.get('studentName')||'';return json({items:await offboardingItems(actor.groupId,name)});}catch(error){return failure(error);}
}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'没有权限执行此操作'},403);
 const actor=await currentBusinessAccount();if(!actor)return json({error:'登录已过期，请重新登录'},401);if(actor.role!=='admin'||!actor.groupId)return json({error:'没有权限执行此操作'},403);
 try{
  const data=await request.json() as Record<string,unknown>;if(!data||typeof data!=='object'||Array.isArray(data))return json({error:'请求格式无效'},400);
  if(data.action==='mark'||data.action==='cancel')return json(await markStudentDeparture(actor,data));
  if(typeof data.studentName!=='string'||!data.studentName.trim()||data.studentName.length>80||!Number.isSafeInteger(data.revision))return json({error:'请求格式无效'},400);
  if(data.action==='preview')return json(await previewStudentCleanup(actor,data.studentName.trim(),Number(data.revision)));
  if(data.action==='cleanup')return json(await cleanStudentDeparture(actor,data));
  return json({error:'请求格式无效'},400);
 }catch(error){return failure(error);}
}
