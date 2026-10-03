import { currentBusinessAccount } from "@/lib/auth";
import { learningDb } from "@/lib/learning-server";
import { NotificationError, notificationState, saveSubscription, removeSubscription, sendTest } from "@/lib/notifications-server";
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
    const body=JSON.parse(bodyText); const db=learningDb();
    if(body.action==="subscribe") return Response.json({ok:true,...await saveSubscription(account,body.subscription,body.language)},{headers});
    if(body.action==="unsubscribe" && typeof body.id==="string") {await removeSubscription(body.id,account.id);return Response.json({ok:true},{headers});}
    if(body.action==="read" && typeof body.id==="string") {
      await db.prepare("UPDATE notification_items SET read_at=coalesce(read_at,?) WHERE id=? AND account_id=?").bind(new Date().toISOString(),body.id,account.id).run();
      return Response.json({ok:true},{headers});
    }
    if(body.action==="readAll") {await db.prepare("UPDATE notification_items SET read_at=? WHERE account_id=? AND read_at IS NULL").bind(new Date().toISOString(),account.id).run();return Response.json({ok:true},{headers});}
    if(body.action==="test" && typeof body.id==="string") {await sendTest(account,body.id);return Response.json({ok:true},{headers});}
    throw new NotificationError("请求格式无效");
  } catch(error) {
    return Response.json({error:error instanceof NotificationError?error.message:"操作失败，请稍后重试；如仍失败请联系管理员"},{status:error instanceof NotificationError?error.status:503,headers});
  }
}
