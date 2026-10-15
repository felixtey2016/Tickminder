import {groupStatement,requireGroup} from "@/lib/group-data";
import { currentBusinessAccount } from "@/lib/auth";
import { learningDb } from "@/lib/learning-server";
import { NotificationError, notificationState, saveSubscription, removeSubscription, sendTest } from "@/lib/notifications-server";
import {quizAssignmentNoticeAccess} from "@/lib/quiz-assignment-notices";
const headers={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"};
export async function GET() {
  const account=await currentBusinessAccount();
  if(!account) return Response.json({error:"登录已过期，请重新登录"},{status:401,headers});
  try {return Response.json(await notificationState(account),{headers});}
  catch {return Response.json({error:"通知中心暂时无法载入，请稍后重试"},{status:503,headers});}
}
export async function POST(request:Request) {
  const account=await currentBusinessAccount();
  if(!account) return Response.json({error:"登录已过期，请重新登录"},{status:401,headers});
  if(request.headers.get("origin")!==new URL(request.url).origin) return Response.json({error:"没有权限执行此操作"},{status:403,headers});
  try {
    const bodyText=await request.text();if(bodyText.length>6000) throw new NotificationError("请求内容过大",413);
    const body=JSON.parse(bodyText); const db=learningDb(); const groupId=requireGroup(account.groupId);
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
    return Response.json({error:error instanceof NotificationError?error.message:"操作失败，请稍后重试；如仍失败请联系管理员"},{status:error instanceof NotificationError?error.status:503,headers});
  }
}
