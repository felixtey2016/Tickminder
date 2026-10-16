import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentBusinessAccount, currentIdentity } from "@/lib/auth";
import { getDb } from "@/db";
import { tuitionGroups } from "@/db/schema";
import { isOwnerAccount, OWNER_EMAIL } from "@/lib/owner";
import { GROUP_COOKIE, registrationGroup, selectedGroup } from "@/lib/groups-server";
import { learningDb } from "@/lib/learning-server";
import { authorityGuard, ownerAuthorityGuard, isAdminAuthorityFailure } from "@/lib/admin-authority";

const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request:Request) {
  const code=new URL(request.url).searchParams.get("code");
  if(code!==null) {
    const group=await registrationGroup(code);
    return group?json({group:{id:group.id,name:group.name}}):json({error:"集团邀请链接无效或已停用"},404);
  }
  const identity=await currentIdentity();
  if(!identity) return json({error:"请先登录"},401);
  if(!isOwnerAccount(identity.account)) {
    const group=await selectedGroup(identity.account);
    return group?json({groups:[{id:group.id,name:group.name,joinCode:group.joinCode,active:group.active}],isOwner:false}):json({error:"补习集团已停用，请联系管理员"},403);
  }
  const account=await currentBusinessAccount();
  if(!account) return json({error:"请先完成账号设置"},403);
  const result=await learningDb().prepare(`SELECT g.id,g.name,g.join_code AS joinCode,g.active,g.chief_admin_id AS chiefAdminId,
    (SELECT count(*) FROM accounts a WHERE a.group_id=g.id AND a.role='admin' AND a.disabled_at IS NULL) AS admins,
    (SELECT count(*) FROM teachers t WHERE t.group_id=g.id AND t.active=1) AS teachers,
    (SELECT count(*) FROM students s WHERE s.group_id=g.id AND s.active=1) AS students,
    (SELECT count(*) FROM classrooms c WHERE c.group_id=g.id AND c.archived=0) AS classrooms
    FROM tuition_groups g ORDER BY g.created_at,g.id`).all();
  const administrators=await learningDb().prepare("SELECT a.id,a.name,a.group_id AS groupId,coalesce(c.must_change_password,0) AS mustChangePassword FROM accounts a LEFT JOIN local_credentials c ON c.account_id=a.id WHERE a.role='admin' AND a.disabled_at IS NULL AND a.group_id IS NOT NULL AND NOT(lower(trim(a.email))=? AND substr(a.id,1,6)<>'local:') ORDER BY a.name,a.id").bind(OWNER_EMAIL).all<{id:string;name:string;groupId:string;mustChangePassword:number}>();
  return json({groups:result.results.map(group=>({...group,adminOptions:administrators.results.filter(a=>a.groupId===group.id).map(({id,name,mustChangePassword})=>({id,name,mustChangePassword:Boolean(mustChangePassword)}))})),isOwner:true,currentGroupId:account.groupId});
}
export async function POST(request:Request) {
  if(request.headers.get("origin")!==new URL(request.url).origin) return json({error:"没有权限执行此操作"},403);
  const account=await currentBusinessAccount();
  if(!account||!isOwnerAccount(account))return json({error:"只有平台最高管理员可以管理补习集团"},403);
  try {
    const data=await request.json() as Record<string,unknown>;
    const db=getDb(),now=new Date().toISOString();
    if(data.action==='setChief'){
      const validId=(value:unknown)=>typeof value==='string'&&value.length>0&&value.length<=128;
      if(!validId(data.id)||!(data.chiefAdminId===null||validId(data.chiefAdminId))||!Object.hasOwn(data,'expectedChiefAdminId')||!(data.expectedChiefAdminId===null||validId(data.expectedChiefAdminId)))return json({error:'admin.invalidFields'},400);
      const raw=learningDb(),group=await raw.prepare('SELECT id,chief_admin_id FROM tuition_groups WHERE id=?').bind(data.id).first<{id:string;chief_admin_id:string|null}>();
      if(!group)return json({error:'admin.groupNotFound'},404);
      if(group.chief_admin_id!==data.expectedChiefAdminId)return json({error:'admin.chiefChanged'},409);
      if(group.chief_admin_id&&data.chiefAdminId===null)return json({error:'admin.chiefRequired'},400);
      if(data.chiefAdminId!==null&&!await raw.prepare("SELECT 1 FROM accounts WHERE id=? AND group_id=? AND role='admin' AND disabled_at IS NULL AND NOT(lower(trim(email))=? AND substr(id,1,6)<>'local:')").bind(data.chiefAdminId,group.id,OWNER_EMAIL).first())return json({error:'admin.chiefInvalid'},409);
      const guards=[
        ownerAuthorityGuard(account,group.id),
        authorityGuard({sql:'EXISTS(SELECT 1 FROM tuition_groups WHERE id=? AND chief_admin_id IS ?)',args:[group.id,data.expectedChiefAdminId]},'admin_chief_changed'),
        ...(data.chiefAdminId===null?[]:[authorityGuard({sql:"EXISTS(SELECT 1 FROM accounts WHERE id=? AND group_id=? AND role='admin' AND disabled_at IS NULL AND NOT(lower(trim(email))=? AND substr(id,1,6)<>'local:'))",args:[data.chiefAdminId,group.id,OWNER_EMAIL]})]),
      ];
      if(group.chief_admin_id===data.chiefAdminId){await raw.batch(guards);return json({ok:true});}
      await raw.batch([
        ...guards,
        raw.prepare("UPDATE tuition_groups SET chief_admin_id=?,updated_at=? WHERE id=? AND chief_admin_id IS ?").bind(data.chiefAdminId,now,group.id,data.expectedChiefAdminId),
        raw.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,'group.setChief',?,?,?)").bind(group.id,crypto.randomUUID(),'group:'+group.id,account.id,JSON.stringify({chiefAdminId:group.chief_admin_id}),JSON.stringify({chiefAdminId:data.chiefAdminId}),now),
        ...(group.chief_admin_id?[raw.prepare("DELETE FROM sessions WHERE account_id=?").bind(group.chief_admin_id)]:[]),
      ]);
      return json({ok:true});
    }
    if(data.action==="switch") {
      const group=typeof data.id==="string"?await db.select().from(tuitionGroups).where(eq(tuitionGroups.id,data.id)).get():null;
      if(!group)return json({error:"补习集团不存在"},404);
      const response=json({ok:true,group:{id:group.id,name:group.name}});
      response.cookies.set(GROUP_COOKIE,group.id,{httpOnly:true,secure:true,sameSite:"lax",path:"/",maxAge:30*86400});
      return response;
    }
    if(!["create","update"].includes(String(data.action)))return json({error:"请求格式无效"},400);
    const name=typeof data.name==="string"?data.name.trim().replace(/\s+/g," "):"";
    if(!name||name.length>120||/[\p{Cc}\p{Cf}]/u.test(name))return json({error:"请输入不超过 120 字的集团名称"},400);
    const id=data.action==="create"?crypto.randomUUID():String(data.id||"");
    const group=data.action==="update"?await db.select().from(tuitionGroups).where(eq(tuitionGroups.id,id)).get():null;
    if(data.action==="update"&&!group)return json({error:"补习集团不存在"},404);
    const duplicate=await learningDb().prepare("SELECT id FROM tuition_groups WHERE lower(name)=lower(?) AND id<>?").bind(name,id).first();
    if(duplicate)return json({error:"集团名称已存在"},409);
    const raw=learningDb(),update=data.action==='create'
      ?raw.prepare("INSERT INTO tuition_groups(id,name,join_code,active,created_at,updated_at) VALUES(?,?,?,1,?,?)").bind(id,name,crypto.randomUUID(),now,now)
      :raw.prepare("UPDATE tuition_groups SET name=?,active=?,updated_at=? WHERE id=?").bind(name,data.active!==false?1:0,now,id);
    await raw.batch([ownerAuthorityGuard(account,account.groupId!),update,raw.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) VALUES(?,?,?,?,?,?,?)").bind(id,crypto.randomUUID(),`group:${id}`,account.id,data.action==='create'?'createGroup':'updateGroup',JSON.stringify({name,active:data.action==='create'||data.active!==false}),now)]);
    return json({ok:true,id});
  } catch(error) {if(isAdminAuthorityFailure(error))return json({error:/admin_chief_changed/.test(String(error))?'admin.chiefChanged':'admin.authorityChanged'},409);return json({error:"集团设置未能确认，请刷新列表检查后再试"},503);}
}
