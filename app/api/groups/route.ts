import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentBusinessAccount, currentIdentity } from "@/lib/auth";
import { getDb } from "@/db";
import { tuitionGroups, audit } from "@/db/schema";
import { isOwnerAccount } from "@/lib/owner";
import { GROUP_COOKIE, registrationGroup, selectedGroup } from "@/lib/groups-server";
import { learningDb } from "@/lib/learning-server";

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
  const administrators=await learningDb().prepare("SELECT id,name,group_id AS groupId FROM accounts WHERE role='admin' AND disabled_at IS NULL AND group_id IS NOT NULL ORDER BY name,id").all<{id:string;name:string;groupId:string}>();
  return json({groups:result.results.map(group=>({...group,adminOptions:administrators.results.filter(a=>a.groupId===group.id).map(({id,name})=>({id,name}))})),isOwner:true,currentGroupId:account.groupId});
}
export async function POST(request:Request) {
  if(request.headers.get("origin")!==new URL(request.url).origin) return json({error:"没有权限执行此操作"},403);
  const account=await currentBusinessAccount();
  if(!account||!isOwnerAccount(account))return json({error:"只有平台最高管理员可以管理补习集团"},403);
  try {
    const data=await request.json() as Record<string,unknown>;
    const db=getDb(),now=new Date().toISOString();
    if(data.action==='setChief'){
      if(typeof data.id!=='string'||data.id.length>128||data.chiefAdminId!==null&&(typeof data.chiefAdminId!=='string'||data.chiefAdminId.length>128))return json({error:'quiz.invalidFields'},400);
      const raw=learningDb(),group=await raw.prepare('SELECT id,chief_admin_id FROM tuition_groups WHERE id=?').bind(data.id).first<{id:string;chief_admin_id:string|null}>();
      if(!group)return json({error:'quiz.notFound'},404);
      if(group.chief_admin_id===data.chiefAdminId)return json({ok:true});
      const result=await raw.batch([
        raw.prepare("UPDATE tuition_groups SET chief_admin_id=?,updated_at=? WHERE id=? AND chief_admin_id IS ? AND (? IS NULL OR EXISTS(SELECT 1 FROM accounts a WHERE a.id=? AND a.group_id=tuition_groups.id AND a.role='admin' AND a.disabled_at IS NULL)) AND EXISTS(SELECT 1 FROM accounts o WHERE o.id=? AND o.role='admin' AND o.disabled_at IS NULL AND lower(trim(o.email))=? AND substr(o.id,1,6)<>'local:')").bind(data.chiefAdminId,now,group.id,group.chief_admin_id,data.chiefAdminId,data.chiefAdminId,account.id,account.email.trim().toLowerCase()),
        raw.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,'group.setChief',?,?,? WHERE changes()=1").bind(group.id,crypto.randomUUID(),'group:'+group.id,account.id,JSON.stringify({chiefAdminId:group.chief_admin_id}),JSON.stringify({chiefAdminId:data.chiefAdminId}),now),
      ]);
      return result[0].meta.changes?json({ok:true}):json({error:'quiz.chiefInvalid'},409);
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
    const update=data.action==="create"
      ? db.insert(tuitionGroups).values({id,name,joinCode:crypto.randomUUID(),active:true,createdAt:now,updatedAt:now})
      : db.update(tuitionGroups).set({name,active:data.active!==false,updatedAt:now}).where(eq(tuitionGroups.id,id));
    await db.batch([update,db.insert(audit).values({groupId:id,id:crypto.randomUUID(),lessonId:`group:${id}`,actorId:account.id,action:data.action==="create"?"createGroup":"updateGroup",after:JSON.stringify({name,active:data.action==="create"||data.active!==false}),at:now})]);
    return json({ok:true,id});
  } catch {return json({error:"集团设置未能确认，请刷新列表检查后再试"},503);}
}
