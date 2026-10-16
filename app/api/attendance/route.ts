import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {classSessionState} from '@/lib/class-sessions';
import {requireCorePermissions} from '@/lib/admin-core-permissions';
import {adminPermissionFailure} from '@/lib/admin-permission-access';
export async function GET(request:Request){const actor=await currentBusinessAccount();if(!actor)return NextResponse.json({error:'Sign in required'},{status:401});if(!['admin','teacher'].includes(actor.role))return NextResponse.json({error:'没有考勤操作权限'},{status:403});try{await requireCorePermissions(actor,['attendance.view']);const id=new URL(request.url).searchParams.get('sessionId'),state=await classSessionState(actor),session=state.allSessions.find(s=>s.id===id);if(!session)return NextResponse.json({error:'课次不存在或无权访问'},{status:404});return NextResponse.json({session},{headers:{'Cache-Control':'no-store'}});}catch(error){const permission=adminPermissionFailure(error);return NextResponse.json({error:permission?.error||'考勤暂时无法载入，请重试'},{status:permission?.status||503});}}
