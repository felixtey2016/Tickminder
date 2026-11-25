import {currentBusinessAccount} from '@/lib/auth';
import {adminPermissionFailure} from '@/lib/admin-permission-access';
import {adminActorGuard,authorityGuard,isAdminAuthorityFailure} from '@/lib/admin-authority';
import {guardedCoreDb,requireCorePermissions} from '@/lib/admin-core-permissions';
import {AccountProvisioningError,isAccountProvisioningFailure,prepareAccountPerson} from '@/lib/account-provisioning';
import {appendAudit} from '@/lib/audit-log';
import {DEFAULT_GROUP_ID} from '@/lib/group-data';
import {learningDb} from '@/lib/learning-server';
import {quizRequestBytes} from '@/lib/quiz-server';
import {tickLearnSignupReason} from '@/lib/ticklearn-routes';

const reply = (data: Record<string, unknown>, status = 200) =>
  Response.json(data, {status,headers:{'Cache-Control':'private, no-store'}});
const pageSize=25;
const freeAccount = `a.role='learner' AND a.group_id IS NULL AND a.activation_reason=? AND a.disabled_at IS NULL`;

async function administrator() {
  const actor=await currentBusinessAccount();
  return actor?.role==='admin' && actor.groupId===DEFAULT_GROUP_ID ? actor : null;
}

export async function GET(request:Request) {
  const actor=await administrator();
  if(!actor)return reply({error:'没有权限执行此操作'},403);
  try {
    await requireCorePermissions(actor,['accounts.view']);
    const params=new URL(request.url).searchParams;
    const count=Number(params.get('offset')),offset=Number.isSafeInteger(count)?Math.max(0,Math.min(100_000,count)):0;
    const search=(params.get('q')||'').trim().slice(0,100).toLowerCase();
    const db=guardedCoreDb(actor,['accounts.view']);
    const results=await db.batch([
      adminActorGuard(actor),
      db.prepare(`SELECT a.id,a.name,g.email,c.username,a.created_at AS createdAt,a.student_name AS studentName
        FROM accounts a LEFT JOIN local_credentials c ON c.account_id=a.id LEFT JOIN google_identities g ON g.account_id=a.id
        WHERE ((${freeAccount}) OR (a.role='student' AND a.group_id=? AND a.activation_reason=?))
          AND (?='' OR instr(lower(a.name || ' ' || coalesce(g.email,'') || ' ' || coalesce(c.username,'')),?)>0)
        ORDER BY a.created_at DESC,a.id DESC LIMIT ? OFFSET ?`)
        .bind(tickLearnSignupReason,DEFAULT_GROUP_ID,tickLearnSignupReason,search,search,pageSize+1,offset),
    ]);
    const rows=results[1].results;
    return reply({items:rows.slice(0,pageSize), hasMore:rows.length>pageSize});
  } catch(error) {
    if(adminPermissionFailure(error)||isAdminAuthorityFailure(error))return reply({error:'没有权限执行此操作'},403);
    return reply({error:'暂时无法加载账号'},503);
  }
}

export async function POST(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'没有权限执行此操作'},403);
  const actor=await administrator();
  if(!actor)return reply({error:'没有权限执行此操作'},403);
  const permission=['accounts.view','accounts.assign'];
  try {
    await requireCorePermissions(actor,permission);
    const data:Record<string,unknown>=JSON.parse(new TextDecoder().decode(await quizRequestBytes(request,4096)));
    const id=data?.id;
    if(typeof id!=='string'||!id||id.length>255)return reply({error:'请选择用户'},400);
    const raw=learningDb();
    const target=await raw.prepare(`SELECT a.name FROM accounts a WHERE a.id=? AND ${freeAccount}`)
      .bind(id,tickLearnSignupReason).first<{name:string}>();
    if(!target)return reply({error:'此账号已转换或暂时无法使用'},409);
    const now=new Date().toISOString();
    const person=await prepareAccountPerson(actor,data,'student',now,id);
    permission.push(...person.permissions);
    await requireCorePermissions(actor,permission);
    const db=guardedCoreDb(actor,permission);
    await db.batch([
      adminActorGuard(actor),
      authorityGuard({sql:`EXISTS(SELECT 1 FROM accounts a WHERE a.id=? AND ${freeAccount})
        AND EXISTS(SELECT 1 FROM tuition_groups WHERE id=? AND active=1)`,args:[id,tickLearnSignupReason,DEFAULT_GROUP_ID]},'account_provisioning_changed'),
      ...person.statements,
      db.prepare(`UPDATE accounts SET group_id=?,role='student',student_name=?,name=?,name_confirmed_at=?,
        activated_at=?,pending_expires_at=NULL WHERE id=?`)
        .bind(DEFAULT_GROUP_ID,person.studentName,person.studentName,now,now,id),
      appendAudit(db,{groupId:DEFAULT_GROUP_ID,lessonId:'account:'+id,actorId:actor.id,actorName:actor.name,objectName:target.name,
        action:'enrollTickLearnStudent',before:{role:'learner'},after:{role:'student',studentName:person.studentName,identityMode:person.identityMode},at:now}),
    ]);
    return reply({ok:true,studentName:person.studentName});
  } catch(error) {
    if(error instanceof AccountProvisioningError)return reply({error:error.message},error.status);
    if(adminPermissionFailure(error)||isAdminAuthorityFailure(error))return reply({error:'没有权限执行此操作'},403);
    if(isAccountProvisioningFailure(error))return reply({error:'资料已变更，请刷新后重试'},409);
    if(error instanceof SyntaxError)return reply({error:'请求无效'},400);
    return reply({error:'暂时无法转换账号'},503);
  }
}
