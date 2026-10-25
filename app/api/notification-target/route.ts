import {currentBusinessAccount} from '@/lib/auth';
import {courseLessonTarget,CourseQueryError} from '@/lib/course-query';
import {notificationLearningTarget,NotificationTargetError} from '@/lib/notification-target';
import {adminPermissionFailure} from '@/lib/admin-permission-access';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group','X-Content-Type-Options':'nosniff'}});
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);
 const params=new URL(request.url).searchParams,kind=params.get('kind'),id=params.get('id')||'';
 if(!id||id.length>200||/[\u0000-\u001f]/.test(id)||!['lesson','homework','material'].includes(kind||''))return json({error:'请选择有效的通知内容'},400);
 try{return json(kind==='lesson'?{kind,...await courseLessonTarget(actor,id)}:await notificationLearningTarget(actor,kind as 'homework'|'material',id));}
 catch(error){const permission=adminPermissionFailure(error);return json({error:permission?.error||(error instanceof CourseQueryError||error instanceof NotificationTargetError?error.message:'通知内容暂时无法载入，请重试')},permission?.status||(error instanceof CourseQueryError||error instanceof NotificationTargetError?error.status:503));}
}
