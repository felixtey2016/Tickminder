import { isLegacyBusinessRole } from '@/lib/legacy-business-access';
import {groupStatement,requireGroup} from "@/lib/group-data";
import { currentBusinessAccount } from "@/lib/auth";
import { learningDb } from "@/lib/learning-server";
import { NotificationError, notificationState, saveSubscription, removeSubscription, sendTest,pushConfigured,requireParentPushAuthority } from "@/lib/notifications-server";
import {quizAssignmentNoticeAccess} from "@/lib/quiz-assignment-notices";
import {env} from 'cloudflare:workers';
import {ParentsError} from '@/lib/parents';
import {parentNotificationState,parentNotificationCount,generateParentNotifications,markParentNotificationRead} from '@/lib/parent-notifications';
const headers={"Cache-Control":"private, no-store","Vary":"Cookie, x-tickminder-group","X-Content-Type-Options":"nosniff"};
export async function GET(request?:Request) {
  const account=await currentBusinessAccount();
  if(!account) return Response.json({error:"登录已过期，请重新登录"},{status:401,headers});
  const params=request?new URL(request.url).searchParams:new URLSearchParams(),summary=params.get('view')==='summary';
  if(account.role==='parent'){
    try{
      const health=await learningDb().prepare('SELECT last_dispatch_at AS lastDispatchAt FROM parent_notification_runtime WHERE id=1').first<{lastDispatchAt:string|null}>();
      if(summary&&(!health?.lastDispatchAt||Date.now()-Date.parse(health.lastDispatchAt)>=90_000))await generateParentNotifications(Date.now(),account.id);
      const state=summary?{...await parentNotificationCount(account),items:[],summary:true}:await parentNotificationState(account,params);
      await requireParentPushAuthority(account);return Response.json({...state,accountId:account.id,groupId:account.groupId,unreadQuizCount:0,configured:pushConfigured(),publicKey:pushConfigured()?env.VAPID_PUBLIC_KEY:null,schedulerReady:Boolean(health?.lastDispatchAt&&Date.now()-Date.parse(health.lastDispatchAt)<5*60000),lastDispatchAt:health?.lastDispatchAt||null},{headers});
    }
    catch(error){return Response.json({error:error instanceof ParentsError||error instanceof NotificationError?error.message:'家长通知暂时无法载入，请重试'},{status:error instanceof ParentsError||error instanceof NotificationError?error.status:503,headers});}
  }
  if(!isLegacyBusinessRole(account.role)) return Response.json({error:"没有权限执行此操作"},{status:403,headers});
  try {return Response.json(await notificationState(account,summary),{headers});}
  catch {return Response.json({error:"通知中心暂时无法载入，请稍后重试"},{status:503,headers});}
}
export async function POST(request:Request) {
  const account=await currentBusinessAccount();
  if(!account) return Response.json({error:"登录已过期，请重新登录"},{status:401,headers});
  if(!isLegacyBusinessRole(account.role)&&account.role!=='parent') return Response.json({error:"没有权限执行此操作"},{status:403,headers});
  if(request.headers.get("origin")!==new URL(request.url).origin) return Response.json({error:"没有权限执行此操作"},{status:403,headers});
  try {
    const bodyText=await request.text();if(bodyText.length>6000) throw new NotificationError("请求内容过大",413);
    const body=JSON.parse(bodyText); const db=learningDb(); const groupId=requireGroup(account.groupId);
    if(account.role==='parent'){
      await requireParentPushAuthority(account);
      if(body?.action==='subscribe')return Response.json({ok:true,...await saveSubscription(account,body.subscription,body.language)},{headers});
      if(body?.action==='unsubscribe'&&typeof body.id==='string'){await removeSubscription(body.id,account.id);return Response.json({ok:true},{headers});}
      if(body?.action==='test'&&typeof body.id==='string'){await sendTest(account,body.id);return Response.json({ok:true},{headers});}
      if(body?.action==='readAll')return Response.json(await markParentNotificationRead(account,'all'),{headers});
      if(body?.action==='read'&&typeof body.id==='string')return Response.json(await markParentNotificationRead(account,body.id),{headers});
      throw new NotificationError('请求格式无效');
    }
    if(body.action==="subscribe") return Response.json({ok:true,...await saveSubscription(account,body.subscription,body.language)},{headers});
    if(body.action==="unsubscribe" && typeof body.id==="string") {await removeSubscription(body.id,account.id);return Response.json({ok:true},{headers});}
    if(body.action==="read" && typeof body.id==="string") {
      if(body.id.startsWith("quiz:")) {
        await db.prepare(`UPDATE quiz_assignment_notifications AS n SET read_at=coalesce(read_at,?) WHERE n.id=? AND n.account_id=? AND n.group_id=? AND EXISTS(SELECT 1 FROM accounts a JOIN quiz_practice_assignments qa ON qa.id=n.assignment_id WHERE a.id=n.account_id AND ${quizAssignmentNoticeAccess})`).bind(new Date().toISOString(),body.id.slice(5),account.id,groupId).run();
        return Response.json({ok:true},{headers});
      }
      const change=body.id.startsWith("change:"),learning=body.id.startsWith("learning:"),table=learning?"learning_notifications":change?"site_notifications":"notification_items";
      await groupStatement(groupId,`UPDATE ${table} SET read_at=coalesce(read_at,?) WHERE (id=? AND account_id=?) AND group_id = ?`).bind(new Date().toISOString(),learning?body.id.slice(9):change?body.id.slice(7):body.id,account.id,groupId).run();
      return Response.json({ok:true},{headers});
    }
    if(body.action==="readAll") {const now=new Date().toISOString();await db.batch([groupStatement(groupId,"UPDATE notification_items SET read_at=? WHERE (account_id=? AND read_at IS NULL) AND group_id = ?").bind(now,account.id,groupId),groupStatement(groupId,"UPDATE site_notifications SET read_at=? WHERE (account_id=? AND read_at IS NULL) AND group_id = ?").bind(now,account.id,groupId),groupStatement(groupId,"UPDATE learning_notifications SET read_at=? WHERE (account_id=? AND read_at IS NULL) AND group_id=?").bind(now,account.id,groupId),db.prepare(`UPDATE quiz_assignment_notifications AS n SET read_at=? WHERE n.account_id=? AND n.group_id=? AND n.read_at IS NULL AND EXISTS(SELECT 1 FROM accounts a JOIN quiz_practice_assignments qa ON qa.id=n.assignment_id WHERE a.id=n.account_id AND ${quizAssignmentNoticeAccess})`).bind(now,account.id,groupId)]);return Response.json({ok:true},{headers});}
    if(body.action==="test" && typeof body.id==="string") {await sendTest(account,body.id);return Response.json({ok:true},{headers});}
    throw new NotificationError("请求格式无效");
  } catch(error) {
    return Response.json({error:error instanceof NotificationError||error instanceof ParentsError?error.message:"操作失败，请稍后重试；如仍失败请联系管理员"},{status:error instanceof NotificationError||error instanceof ParentsError?error.status:503,headers});
  }
}
