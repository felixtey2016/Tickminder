import {learningDb} from './learning-server';
import {generateParentNotifications,parentNoticeAuthorizationSql,parentNoticeSourceSql,parentNoticePayload} from './parent-notifications';
import {sendPush,pushConfigured,removeSubscription,NotificationError,type NotificationSubscription} from './notifications-server';
const AGE=24*3600000;
const eligible=(n='n')=>`${n}.cancelled_at IS NULL AND ${n}.read_at IS NULL AND (${parentNoticeAuthorizationSql(n)}) AND (${parentNoticeSourceSql(n)})`;
type Claimed={item_id:string;subscription_id:string;notification_revision:number;attempts:number};
type JobItem=NotificationSubscription&{notificationId:string;kind:string;createdAt:string;revision:number};
/** Parent queues have independent locks, freshness and health from lesson reminders. */
export async function dispatchParentNotificationPush(nowMs=Date.now()){
 const db=learningDb(),now=new Date(nowMs).toISOString(),cutoff=new Date(nowMs-AGE).toISOString();
 await db.prepare(`UPDATE parent_notification_deliveries AS d SET status='cancelled',lock_until=NULL,claim_token=NULL,last_error='stale_or_revoked' WHERE d.status IN('pending','sending') AND NOT EXISTS(SELECT 1 FROM parent_notifications n JOIN push_subscriptions s ON s.id=d.subscription_id AND s.account_id=n.account_id WHERE n.group_id=d.group_id AND n.id=d.item_id AND n.created_at>=? AND ${eligible()})`).bind(cutoff).run();
 await db.prepare("UPDATE parent_notification_deliveries SET status='failed',lock_until=NULL,claim_token=NULL,last_error='attempts_exhausted' WHERE status='sending' AND attempts>=3 AND lock_until<=?").bind(now).run();
 if(!pushConfigured())return{configured:false,sent:0,expired:0,failed:0};
 // Reconcile an unsent delivery when a partial payment updates the source. A
 // provider-accepted delivery remains accepted across all later revisions.
 await db.prepare(`INSERT INTO parent_notification_deliveries(id,group_id,item_id,subscription_id,notification_revision,next_attempt_at)
 SELECT lower(hex(randomblob(16))),n.group_id,n.id,s.id,n.revision,? FROM parent_notifications n JOIN push_subscriptions s ON s.account_id=n.account_id
 WHERE n.created_at>=? AND n.created_at<=? AND n.due_at<=? AND s.created_at<=n.created_at AND ${eligible()}
 AND NOT EXISTS(SELECT 1 FROM parent_notification_deliveries prior_delivery JOIN parent_notifications prior_notice ON prior_notice.group_id=prior_delivery.group_id AND prior_notice.id=prior_delivery.item_id WHERE prior_delivery.sent_at IS NOT NULL AND prior_notice.group_id=n.group_id AND prior_notice.account_id=n.account_id AND prior_notice.source_id=n.source_id AND prior_notice.cycle_key=n.cycle_key AND prior_notice.id<>n.id)
 ON CONFLICT(item_id,subscription_id) DO UPDATE SET notification_revision=excluded.notification_revision,status='pending',attempts=0,next_attempt_at=excluded.next_attempt_at,lock_until=NULL,claim_token=NULL,last_error=''
 WHERE parent_notification_deliveries.sent_at IS NULL AND parent_notification_deliveries.notification_revision<>excluded.notification_revision`).bind(now,cutoff,now,now).run();
 const jobs=(await db.prepare("SELECT id FROM parent_notification_deliveries WHERE status IN('pending','sending') AND next_attempt_at<=? AND (lock_until IS NULL OR lock_until<=?) AND attempts<3 ORDER BY next_attempt_at,id LIMIT 16").bind(now,now).all<{id:string}>()).results||[];
 let sent=0,expired=0,failed=0;
 async function deliver(job:{id:string}){
  const token=crypto.randomUUID(),claim=await db.prepare("UPDATE parent_notification_deliveries SET status='sending',attempts=attempts+1,lock_until=?,claim_token=? WHERE id=? AND status IN('pending','sending') AND next_attempt_at<=? AND (lock_until IS NULL OR lock_until<=?) AND attempts<3 RETURNING item_id,subscription_id,notification_revision,attempts").bind(new Date(nowMs+45000).toISOString(),token,job.id,now,now).first<Claimed>();if(!claim)return;
  const sql=`SELECT s.id,s.account_id,s.endpoint,s.p256dh,s.auth,s.language,n.id AS notificationId,n.kind,n.created_at AS createdAt,n.revision FROM parent_notification_deliveries d JOIN parent_notifications n ON n.group_id=d.group_id AND n.id=d.item_id JOIN push_subscriptions s ON s.id=d.subscription_id AND s.account_id=n.account_id WHERE d.id=? AND d.claim_token=? AND d.status='sending' AND d.notification_revision=n.revision AND n.created_at>=? AND n.due_at<=? AND ${eligible()}`;
  const item=await db.prepare(sql).bind(job.id,token,cutoff,now).first<JobItem>();
  const finish=(status:string,error:string,sentAt:string|null=null)=>db.prepare('UPDATE parent_notification_deliveries SET status=?,last_error=?,sent_at=coalesce(sent_at,?),lock_until=NULL,claim_token=NULL WHERE id=? AND claim_token=?').bind(status,error,sentAt,job.id,token).run();
  if(!item){await finish('cancelled','stale_or_revoked');expired++;return;}
  try{
   const response=await sendPush(item,parentNoticePayload({id:item.notificationId,kind:item.kind},item.language),3600,async()=>Boolean(await db.prepare(`SELECT 1 FROM (${sql}) live WHERE live.id=? AND live.account_id=? AND live.endpoint=? AND live.p256dh=? AND live.auth=?`).bind(job.id,token,cutoff,new Date().toISOString(),item.id,item.account_id,item.endpoint,item.p256dh,item.auth).first()));
   if(response.ok){await finish('sent','',new Date().toISOString());sent++;}
   else if([404,410].includes(response.status)){await removeSubscription(item.id,item.account_id);expired++;}
   else if(response.status===429||response.status>=500)throw new Error('provider_retry');
   else{await finish('failed','provider_rejected');failed++;}
  }catch(error){
   if(error instanceof NotificationError&&error.status===403){await finish('cancelled','stale_or_revoked');expired++;return;}
   await db.prepare('UPDATE parent_notification_deliveries SET status=?,next_attempt_at=?,lock_until=NULL,claim_token=NULL,last_error=? WHERE id=? AND claim_token=?').bind(claim.attempts>=3?'failed':'pending',new Date(nowMs+60000).toISOString(),'provider_unavailable',job.id,token).run();failed++;
  }
 }
 for(let i=0;i<jobs.length;i+=8)await Promise.all(jobs.slice(i,i+8).map(deliver));
 return{configured:true,sent,expired,failed};
}
export async function runParentNotificationTick(nowMs=Date.now()){
 const db=learningDb(),token=crypto.randomUUID(),now=new Date(nowMs).toISOString();
 const claimed=await db.prepare('UPDATE parent_notification_runtime SET lease_until=?,lease_token=? WHERE id=1 AND (lease_until IS NULL OR lease_until<=?) RETURNING id').bind(new Date(nowMs+45000).toISOString(),token,now).first();
 if(!claimed)return{skipped:true};
 try{
  await generateParentNotifications(nowMs);
  const result=await dispatchParentNotificationPush(nowMs);
  await db.batch([db.prepare('DELETE FROM parent_notifications WHERE created_at<?').bind(new Date(nowMs-90*86400000).toISOString()),db.prepare('UPDATE parent_notification_runtime SET last_dispatch_at=?,lease_until=NULL,lease_token=NULL WHERE id=1 AND lease_token=?').bind(new Date().toISOString(),token)]);
  return{skipped:false,...result};
 }finally{await db.prepare('UPDATE parent_notification_runtime SET lease_until=NULL,lease_token=NULL WHERE id=1 AND lease_token=?').bind(token).run();}
}
