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
  const result=await learningDb().prepare(`SELECT g.id,g.name,g.join_code AS joinCode,g.active,
    (SELECT count(*) FROM accounts a WHERE a.group_id=g.id AND a.role='admin' AND a.disabled_at IS NULL) AS admins,
    (SELECT count(*) FROM teachers t WHERE t.group_id=g.id AND t.active=1) AS teachers,
    (SELECT count(*) FROM students s WHERE s.group_id=g.id AND s.active=1) AS students,
    (SELECT count(*) FROM classrooms c WHERE c.group_id=g.id AND c.archived=0) AS classrooms
    FROM tuition_groups g ORDER BY g.created_at,g.id`).all();
  return json({groups:result.results,isOwner:true,currentGroupId:account.groupId});
}
export async function POST(request:Request) {
  if(request.headers.get("origin")!==new URL(request.url).origin) return json({error:"没有权限执行此操作"},403);
  const account=await currentBusinessAccount();
  if(!account||!isOwnerAccount(account))return json({error:"只有平台最高管理员可以管理补习集团"},403);
  try {
    const data=await request.json() as Record<string,unknown>;
    const db=getDb(),now=new Date().toISOString();
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
