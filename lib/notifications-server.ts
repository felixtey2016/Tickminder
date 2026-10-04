import { env } from "cloudflare:workers";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { learningDb, rows, first } from "@/lib/learning-server";
import type { Account } from "@/lib/auth";

export const REMINDER_OFFSETS = [30, 5, 0] as const;
const GRACE_MS = 120_000;
// This same predicate controls generation, reading and delivery. No client ID or
// public endpoint can widen the signed-in user's course access.
export const participantSql = `a.disabled_at IS NULL AND (
 (a.role = 'teacher' AND a.teacher_name = l.teacher_name) OR
 (a.role = 'student' AND a.student_name = l.student)) AND EXISTS (
 SELECT 1 FROM plans p JOIN students s ON s.name=p.student AND s.active=1
 JOIN teachers t ON t.name=p.teacher_name AND t.active=1
 WHERE p.student=l.student AND p.subject=l.subject AND p.teacher_name=l.teacher_name AND p.active=1)`;

export function pushConfigured() { return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT); }
export class NotificationError extends Error { constructor(message:string, public status=400) { super(message); } }
function decode(value: unknown, bytes: number) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new NotificationError("通知设备资料无效，请重新开启通知");
  const buffer = Uint8Array.from(atob(value.replace(/-/g,"+").replace(/_/g,"/")), c=>c.charCodeAt(0));
  if (buffer.length !== bytes) throw new NotificationError("通知设备资料无效，请重新开启通知");
  return buffer;
}
export function allowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const u=new URL(value), h=u.hostname;
    return u.protocol==="https:" && !u.username && !u.password && !u.hash && (!u.port || u.port==="443") &&
      (h==="fcm.googleapis.com" || h.endsWith(".push.services.mozilla.com") || h.endsWith(".push.apple.com") || h.endsWith(".notify.windows.com"));
  } catch { return false; }
}
export async function validateSubscription(value: unknown) {
  const s=value as {endpoint?:unknown;keys?:{p256dh?:unknown;auth?:unknown}};
  if (!s || !allowedPushEndpoint(s.endpoint)) throw new NotificationError("此浏览器的通知服务暂不支持，请使用 Chrome、Safari、Edge 或 Firefox");
  const key=decode(s.keys?.p256dh,65); decode(s.keys?.auth,16);
  try { await crypto.subtle.importKey("raw", key, {name:"ECDH",namedCurve:"P-256"},false,[]); }
  catch { throw new NotificationError("通知设备资料无效，请重新开启通知"); }
  return {endpoint:s.endpoint,p256dh:s.keys!.p256dh as string,auth:s.keys!.auth as string};
}
type Subscription = {id:string;account_id:string;endpoint:string;p256dh:string;auth:string;language:string};
export async function removeSubscription(id:string, accountId:string) {
  const db=learningDb();
  await db.batch([
    db.prepare("DELETE FROM notification_deliveries WHERE subscription_id IN (SELECT id FROM push_subscriptions WHERE id=? AND account_id=?)").bind(id,accountId),
    db.prepare("DELETE FROM push_subscriptions WHERE id=? AND account_id=?").bind(id,accountId),
  ]);
}
export async function saveSubscription(account:Account, value:unknown, language:unknown) {
  if (!pushConfigured()) throw new NotificationError("通知服务尚未配置，请稍后重试",503);
  const s=await validateSubscription(value), db=learningDb(), now=new Date().toISOString();
  // A foreign endpoint is never reassigned by a request. The browser must first
  // unsubscribe and create fresh keys after an account switch.
  const old=await first<Subscription>("SELECT * FROM push_subscriptions WHERE endpoint=?",s.endpoint);
  if (old && old.account_id!==account.id) throw new NotificationError("此设备仍连接其他账号，请退出登录后重新开启通知",409);
  const id=old?.id || crypto.randomUUID();
  await db.prepare(`INSERT INTO push_subscriptions (id,account_id,endpoint,p256dh,auth,language,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,language=excluded.language,updated_at=excluded.updated_at
    WHERE push_subscriptions.account_id=excluded.account_id`).bind(id,account.id,s.endpoint,s.p256dh,s.auth,language==="en"?"en":"zh",now,now).run();
  const saved=await first<Subscription>("SELECT * FROM push_subscriptions WHERE endpoint=? AND account_id=?",s.endpoint,account.id);
  if (!saved) throw new NotificationError("此设备仍连接其他账号，请退出登录后重新开启通知",409);
  return {id:saved.id};
}

export async function generateReminders(nowMs=Date.now(), onlyAccount?:string) {
  const db=learningDb(), now=new Date(nowMs).toISOString();
  const courses=await rows<{id:string;account_id:string;planned_start:string}>(`SELECT l.id,l.planned_start,a.id AS account_id
    FROM lessons l JOIN accounts a ON ${participantSql}
    WHERE l.status='scheduled' AND l.planned_start>=? AND l.planned_start<=? ${onlyAccount?"AND a.id=?":""}`,
    new Date(nowMs-GRACE_MS).toISOString(),new Date(nowMs+30*60_000).toISOString(),...(onlyAccount?[onlyAccount]:[]));
  const statements=[];
  for (const lesson of courses) for (const minutes of REMINDER_OFFSETS) {
    const dueMs=Date.parse(lesson.planned_start)-minutes*60_000;
    if (dueMs>nowMs || nowMs-dueMs>GRACE_MS) continue;
    const id=crypto.randomUUID();
    statements.push(db.prepare(`INSERT OR IGNORE INTO notification_items (id,account_id,lesson_id,planned_start,offset_minutes,due_at,created_at)
      SELECT ?,?,?,?,?,?,? FROM lessons l JOIN accounts a ON ${participantSql}
      WHERE l.id=? AND a.id=? AND l.planned_start=? AND l.status='scheduled'`).bind(id,lesson.account_id,lesson.id,lesson.planned_start,minutes,new Date(dueMs).toISOString(),now,lesson.id,lesson.account_id,lesson.planned_start));
  }
  // Keep each transactional batch bounded for a large course list.
  for(let i=0;i<statements.length;i+=60) await db.batch(statements.slice(i,i+60));
}

export async function notificationState(account:Account) {
  // Also records reminders when the centre is open; this is not a substitute
  // for the cloud scheduler, whose last successful dispatch is shown separately.
  await generateReminders(Date.now(),account.id);
  const [items,health]=await Promise.all([
    rows(`SELECT n.id,n.offset_minutes AS minutes,n.due_at AS dueAt,n.read_at AS readAt,l.subject,l.teacher_name AS teacherName,l.planned_start AS plannedStart,l.planned_end AS plannedEnd
      FROM notification_items n JOIN lessons l ON l.id=n.lesson_id JOIN accounts a ON a.id=n.account_id
      WHERE n.account_id=? AND n.planned_start=l.planned_start AND l.status<>'cancelled' AND ${participantSql}
      ORDER BY n.due_at DESC LIMIT 100`,account.id),
    first<{last_dispatch_at:string}>("SELECT last_dispatch_at FROM notification_runtime WHERE id=1"),
  ]);
  return {items,configured:pushConfigured(),publicKey:pushConfigured()?env.VAPID_PUBLIC_KEY:null,
    schedulerReady:Boolean(health && Date.now()-Date.parse(health.last_dispatch_at)<10*60_000),lastDispatchAt:health?.last_dispatch_at || null};
}

export async function sendPush(subscription:Subscription, data:Record<string,unknown>, ttl = 600) {
  if(!allowedPushEndpoint(subscription.endpoint)) throw new NotificationError("通知设备资料无效，请重新开启通知");
  if(!pushConfigured()) throw new NotificationError("通知服务尚未配置，请稍后重试",503);
  const payload=await buildPushPayload({data:JSON.stringify(data),options:{ttl,urgency:"high"}},
    {endpoint:subscription.endpoint,expirationTime:null,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},
    {subject:env.VAPID_SUBJECT!,publicKey:env.VAPID_PUBLIC_KEY!,privateKey:env.VAPID_PRIVATE_KEY!});
  // Explicit provider allow-list, no redirects, and bounded timeout prevent SSRF.
  // Workers supports manual/follow only. Manual never follows a provider's
  // redirect; non-2xx responses are handled as failures by the caller.
  return fetch(subscription.endpoint,{...payload,redirect:"manual",signal:AbortSignal.timeout(8000)});
}
export function reminderPayload(id:string,minutes:number,language:string) {
  const en=language==="en";
  return {id,visual:minutes===0?"class-start":"class-reminder",title:en?"Tickminder · Lesson reminder":"Tickminder · 上课提醒",body:minutes===0?(en?"Your lesson is starting. Open Tickminder to view it.":"课程开始了，打开 Tickminder 查看课程。"):(en?`Your lesson starts in ${minutes} minutes.`:`你的课程将在 ${minutes} 分钟后开始。`),url:"/?view=notifications"};
}
export async function sendTest(account:Account,id:string) {
  const db=learningDb(), now=new Date().toISOString();
  const claimed=await db.prepare(`UPDATE push_subscriptions SET last_test_at=? WHERE id=? AND account_id=?
    AND (last_test_at IS NULL OR last_test_at<?) RETURNING *`).bind(now,id,account.id,new Date(Date.now()-60_000).toISOString()).first<Subscription>();
  if(!claimed) {
    const exists=await first<{id:string}>("SELECT id FROM push_subscriptions WHERE id=? AND account_id=?",id,account.id);
    if(!exists) throw new NotificationError("此设备通知已失效，请重新开启通知",409);
    throw new NotificationError("请等待一分钟后再发送测试提醒",429);
  }
  let response:Response;
  try { response=await sendPush(claimed,{id:crypto.randomUUID(),title:"Tickminder",body:claimed.language==="en"?"Test reminder. Notifications are enabled on this device.":"测试提醒：此设备已开启通知。",url:"/?view=notifications"}); }
  catch { throw new NotificationError("暂时无法发送通知，请检查网络后重试",503); }
  if([404,410].includes(response.status)) { await removeSubscription(id,account.id); throw new NotificationError("此设备通知已失效，请重新开启通知",409); }
  if(!response.ok) throw new NotificationError("通知服务暂时不可用，请稍后重试",503);
}

export async function dispatchReminders(nowMs=Date.now()) {
  if(!pushConfigured()) throw new NotificationError("通知服务尚未配置",503);
  const db=learningDb(),now=new Date(nowMs).toISOString(),cutoff=new Date(nowMs-GRACE_MS).toISOString();
  await generateReminders(nowMs);
  await db.prepare(`INSERT OR IGNORE INTO notification_deliveries (id,item_id,subscription_id,next_attempt_at)
    SELECT lower(hex(randomblob(16))),n.id,s.id,? FROM notification_items n JOIN push_subscriptions s ON s.account_id=n.account_id
    WHERE n.due_at>=? AND n.due_at<=? AND s.created_at<=n.due_at`).bind(now,cutoff,now).run();
  const jobs=await rows<{id:string}>(`SELECT id FROM notification_deliveries WHERE status IN ('pending','sending')
    AND next_attempt_at<=? AND (lock_until IS NULL OR lock_until<=?) AND attempts<3 LIMIT 32`,now,now);
  let sent=0,expired=0,failed=0;
  const deliver=async(job:{id:string})=>{
    const locked=await db.prepare(`UPDATE notification_deliveries SET status='sending',attempts=attempts+1,lock_until=?
      WHERE id=? AND status IN ('pending','sending') AND next_attempt_at<=? AND (lock_until IS NULL OR lock_until<=?) AND attempts<3 RETURNING *`)
      .bind(new Date(nowMs+90_000).toISOString(),job.id,now,now).first<{item_id:string;subscription_id:string;attempts:number}>();
    if(!locked) return;
    const item=await first<Subscription & {item_id:string;minutes:number;due_at:string}>(`SELECT s.*,n.id AS item_id,n.offset_minutes AS minutes,n.due_at FROM notification_items n
      JOIN push_subscriptions s ON s.id=? AND s.account_id=n.account_id JOIN lessons l ON l.id=n.lesson_id JOIN accounts a ON a.id=n.account_id
      WHERE n.id=? AND n.planned_start=l.planned_start AND l.status='scheduled' AND ${participantSql}`,
      locked.subscription_id,locked.item_id);
    if(!item || Date.parse(item.due_at)<nowMs-GRACE_MS) { await db.prepare("UPDATE notification_deliveries SET status='expired',lock_until=NULL WHERE id=?").bind(job.id).run(); expired++;return; }
    try {
      const response=await sendPush(item,reminderPayload(item.item_id,item.minutes,item.language),item.minutes === 30 ? 25*60 : item.minutes === 5 ? 5*60 : 10*60);
      if(response.ok) { await db.prepare("UPDATE notification_deliveries SET status='sent',sent_at=?,lock_until=NULL WHERE id=?").bind(now,job.id).run(); sent++; }
      else if([404,410].includes(response.status)) { await removeSubscription(item.id,item.account_id);expired++; }
      else if(response.status===429 || response.status>=500) throw new Error("Provider retry");
      else { await db.prepare("UPDATE notification_deliveries SET status='failed',lock_until=NULL WHERE id=?").bind(job.id).run(); failed++; }
    } catch {
      await db.prepare("UPDATE notification_deliveries SET status=?,next_attempt_at=?,lock_until=NULL WHERE id=?")
        .bind(locked.attempts>=3?"failed":"pending",new Date(nowMs+60_000).toISOString(),job.id).run();failed++;
    }
  };
  // Eight concurrent providers, four bounded groups. One slow device cannot
  // serialize the whole course list; the claim lasts beyond this request.
  for(let i=0;i<jobs.length;i+=8) await Promise.all(jobs.slice(i,i+8).map(deliver));
  // Ninety-day inbox retention and orphan cleanup, including removed courses.
  await db.batch([
    db.prepare("DELETE FROM notification_deliveries WHERE item_id IN (SELECT id FROM notification_items WHERE created_at<? OR NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id=notification_items.lesson_id)) OR NOT EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.id=notification_deliveries.subscription_id)").bind(new Date(nowMs-90*86400_000).toISOString()),
    db.prepare("DELETE FROM notification_items WHERE created_at<? OR NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id=notification_items.lesson_id)").bind(new Date(nowMs-90*86400_000).toISOString()),
    db.prepare("INSERT INTO notification_runtime (id,last_dispatch_at) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET last_dispatch_at=excluded.last_dispatch_at").bind(now),
  ]);
  return {sent,expired,failed,at:now};
}
