import {learningDb,rows,first} from "./learning-server";
import {learningNoticeAccess} from "./learning-notices";
import {sendPush,pushConfigured,removeSubscription} from "./notifications-server";

const MAX_AGE=24*3600_000;
export async function dispatchLearningNotifications(nowMs=Date.now()) {
  if(!pushConfigured())return {sent:0,expired:0,failed:0,configured:false};
  const now=new Date(nowMs).toISOString(),db=learningDb(),cutoff=new Date(nowMs-MAX_AGE).toISOString();
  await db.prepare(`INSERT OR IGNORE INTO learning_notification_deliveries(id,notification_id,subscription_id,next_attempt_at)
    SELECT lower(hex(randomblob(16))),n.id,s.id,? FROM learning_notifications n JOIN accounts a ON a.id=n.account_id
    JOIN push_subscriptions s ON s.account_id=n.account_id WHERE n.created_at>=? AND n.created_at<=? AND s.created_at<=n.created_at AND ${learningNoticeAccess}`).bind(now,cutoff,now).run();
  const jobs=await rows<{id:string}>("SELECT id FROM learning_notification_deliveries WHERE status IN ('pending','sending') AND next_attempt_at<=? AND (lock_until IS NULL OR lock_until<=?) AND attempts<3 LIMIT 32",now,now);
  let sent=0,expired=0,failed=0;
  const deliver=async(job:{id:string})=>{
    const locked=await db.prepare("UPDATE learning_notification_deliveries SET status='sending',attempts=attempts+1,lock_until=? WHERE id=? AND status IN ('pending','sending') AND next_attempt_at<=? AND (lock_until IS NULL OR lock_until<=?) AND attempts<3 RETURNING notification_id,subscription_id,attempts").bind(new Date(nowMs+90_000).toISOString(),job.id,now,now).first<{notification_id:string;subscription_id:string;attempts:number}>();
    if(!locked)return;
    const item=await first<{id:string;account_id:string;endpoint:string;p256dh:string;auth:string;language:string;kind:string;notificationId:string;createdAt:string}>(`SELECT s.*,n.id AS notificationId,n.kind,n.created_at AS createdAt FROM learning_notifications n JOIN accounts a ON a.id=n.account_id JOIN push_subscriptions s ON s.id=? AND s.account_id=n.account_id WHERE n.id=? AND ${learningNoticeAccess}`,locked.subscription_id,locked.notification_id);
    if(!item || item.createdAt<cutoff){await db.prepare("UPDATE learning_notification_deliveries SET status='expired',lock_until=NULL WHERE id=?").bind(job.id).run();expired++;return;}
    const en=item.language==="en",heading=item.kind==="feedback_published"?(en?"Homework feedback":"功课批改反馈"):item.kind==="resubmission_granted"?(en?"Homework resubmission":"功课重交授权"):item.kind==="material_updated"?(en?"Teaching material updated":"教学资料已更新"):(en?"Homework updated":"功课已更新");
    const payload={id:"learning:"+item.notificationId,title:"Tickminder · "+heading,body:en?"Open Tickminder to review your assigned content and latest status.":"请打开 Tickminder 查看已分配内容及最新状态。",url:"/?view=notifications"};
    try {
      const response=await sendPush(item,payload,3600);
      if(response.ok){await db.prepare("UPDATE learning_notification_deliveries SET status='sent',sent_at=?,lock_until=NULL WHERE id=?").bind(new Date().toISOString(),job.id).run();sent++;}
      else if([404,410].includes(response.status)){await removeSubscription(item.id,item.account_id);expired++;}
      else if(response.status===429 || response.status>=500)throw new Error("Provider retry");
      else{await db.prepare("UPDATE learning_notification_deliveries SET status='failed',lock_until=NULL WHERE id=?").bind(job.id).run();failed++;}
    }catch{
      await db.prepare("UPDATE learning_notification_deliveries SET status=?,next_attempt_at=?,lock_until=NULL WHERE id=?").bind(locked.attempts>=3?"failed":"pending",new Date(nowMs+60_000).toISOString(),job.id).run();failed++;
    }
  };
  for(let i=0;i<jobs.length;i+=8)await Promise.all(jobs.slice(i,i+8).map(deliver));
  await db.batch([
    db.prepare("DELETE FROM learning_notifications WHERE created_at<? OR NOT EXISTS(SELECT 1 FROM accounts WHERE id=learning_notifications.account_id)").bind(new Date(nowMs-90*86400_000).toISOString()),
    db.prepare("DELETE FROM learning_notification_deliveries WHERE NOT EXISTS(SELECT 1 FROM push_subscriptions WHERE id=learning_notification_deliveries.subscription_id)"),
  ]);
  return {sent,expired,failed,configured:true};
}
