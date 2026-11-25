import {NextResponse} from 'next/server';
import {currentIdentity,type Account} from '@/lib/auth';
import {learningDb} from '@/lib/learning-server';
import {accountSessionPredicate} from '@/lib/account-session';
import {authorityGuard} from '@/lib/admin-authority';
import {parseStudentContactInput,StudentContactError} from '@/lib/student-contact';

type Stored={name:string;studentName:string;contactPhone:string|null;contactPhoneKind:'student'|'parent'|null;contactPhoneUpdatedAt:string|null};
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group'}});
function scope(account:Account){
 const session=accountSessionPredicate(account);
 return{sql:`EXISTS(SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=a.group_id AND g.active=1
 JOIN students s ON s.group_id=a.group_id AND s.name=a.student_name AND s.active=1
 JOIN local_credentials c ON c.account_id=a.id AND c.must_change_password=0
 WHERE a.id=? AND a.group_id=? AND a.role='student' AND a.student_name=? AND a.disabled_at IS NULL AND a.name_confirmed_at IS NOT NULL AND (${session.sql}))`,args:[account.id,account.groupId,account.studentName,...session.args]};
}
async function actor(){
 const identity=await currentIdentity();if(!identity)throw new StudentContactError('登录已过期，请重新登录',401);
 if(!identity.local||identity.local.mustChangePassword||!identity.account.nameConfirmedAt)throw new StudentContactError('请先完成登录账号设置',403);
 const account=identity.account;if(account.role!=='student'||!account.groupId||!account.studentName)throw new StudentContactError('只有当前学生可以修改自己的联系电话',403);
 return account;
}
async function stored(account:Account){const permission=scope(account),row=await learningDb().prepare(`SELECT name,student_name AS studentName,contact_phone AS contactPhone,contact_phone_kind AS contactPhoneKind,contact_phone_updated_at AS contactPhoneUpdatedAt FROM accounts WHERE id=? AND group_id=? AND ${permission.sql}`).bind(account.id,account.groupId,...permission.args).first<Stored>();if(!row)throw new StudentContactError('学生账号或联系电话已改变，请刷新后重试',409);return row;}
function failure(error:unknown){if(error instanceof StudentContactError)return json({error:error.message},error.status);if(/student_contact_changed/.test(String(error)))return json({error:'学生账号或联系电话已改变，请刷新后重试'},409);return json({error:'联系电话暂时无法保存，请稍后重试'},503);}
export async function GET(){try{return json(await stored(await actor()));}catch(error){return failure(error);}}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'请求来源无效'},403);
 try{
  const account=await actor();if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||Number(request.headers.get('content-length')||0)>2048)throw new StudentContactError('联系电话资料格式无效');
  const raw=await request.text();if(raw.length>2048)throw new StudentContactError('联系电话资料格式无效');let body:unknown;try{body=JSON.parse(raw);}catch{throw new StudentContactError('联系电话资料格式无效');}
  const input=parseStudentContactInput(body),before=await stored(account),permission=scope(account),now=new Date().toISOString(),db=learningDb();
  const guard={sql:permission.sql+' AND EXISTS(SELECT 1 FROM accounts current_contact WHERE current_contact.id=? AND current_contact.contact_phone IS ? AND current_contact.contact_phone_kind IS ? AND current_contact.contact_phone_updated_at IS ?)',args:[...permission.args,account.id,before.contactPhone,before.contactPhoneKind,before.contactPhoneUpdatedAt]};
  await db.batch([
   authorityGuard(guard,'student_contact_changed'),
   db.prepare('UPDATE accounts SET contact_phone=?,contact_phone_kind=?,contact_phone_updated_at=? WHERE id=? AND group_id=?').bind(input.phone,input.kind,now,account.id,account.groupId),
   db.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,'studentContact.update',?,?,?)").bind(account.groupId,crypto.randomUUID(),'account:'+account.id,account.id,JSON.stringify({hasContactPhone:Boolean(before.contactPhone),kind:before.contactPhoneKind}),JSON.stringify({hasContactPhone:true,kind:input.kind}),now),
  ]);
  return json({ok:true,contactPhone:input.phone,contactPhoneKind:input.kind,contactPhoneUpdatedAt:now});
 }catch(error){return failure(error);}
}
