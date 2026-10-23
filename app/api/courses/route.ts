import {currentBusinessAccount} from '@/lib/auth';
import {courseList,CourseQueryError} from '@/lib/course-query';
import {adminPermissionFailure} from '@/lib/admin-permission-access';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 try{return json(await courseList(actor,new URL(request.url).searchParams));}catch(error){const permission=adminPermissionFailure(error);return json({error:permission?.error||(error instanceof CourseQueryError?error.message:'课程暂时无法加载，请重试')},permission?.status||(error instanceof CourseQueryError?error.status:503));}
}
