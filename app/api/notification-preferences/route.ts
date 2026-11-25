import {NextResponse} from 'next/server';
import {learningDb} from '@/lib/learning-server';
import {settingsAccount,settingsAuthority,settingsBody,SettingsError} from '@/lib/settings-authority';
import {authorityGuard} from '@/lib/admin-authority';
import {notificationCategories,type NotificationCategory} from '@/lib/notification-preferences';
import {pushConfigured} from '@/lib/notifications-server';
import type {Account} from '@/lib/auth';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
async function available(account:Account):Promise<NotificationCategory[]>{
 if(account.role==='teacher')return ['courses'];if(account.role==='student')return ['courses','homework'];
 if(account.role!=='parent')return [];
 const row=await learningDb().prepare(`SELECT count(*) AS children,max(EXISTS(SELECT 1 FROM parent_financial_access f WHERE f.link_id=l.id AND f.parent_account_id=l.parent_account_id AND f.group_id=l.group_id AND f.active=1 AND f.link_revision=l.revision)) AS finance FROM parent_child_links l JOIN tuition_groups g ON g.id=l.group_id AND g.active=1 WHERE l.parent_account_id=? AND l.group_id=? AND l.active=1`).bind(account.id,account.groupId).first<{children:number;finance:number}>();
 return [...(row?.children?['courses' as const]:[]),...(row?.finance?['fees' as const]:[])];
}
async function state(account:Account){
 const db=learningDb(),guard=settingsAuthority(account);
 await db.batch([authorityGuard(guard,'account_settings_changed')]);
 const row=await db.prepare('SELECT courses_enabled,homework_enabled,fees_enabled FROM notification_preferences WHERE account_id=?').bind(account.id).first<Record<string,number>>();
 return {preferences:Object.fromEntries(notificationCategories.map(c=>[c,row?.[c+'_enabled']!==0])),availableCategories:await available(account),pushConfigured:pushConfigured()};
}
function failure(error:unknown){return json({error:error instanceof SettingsError?error.message:'设置暂时无法保存，请刷新后重试'},error instanceof SettingsError?error.status:/account_settings_changed/.test(String(error))?409:503);}
export async function GET(){try{return json(await state(await settingsAccount()));}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const body=await settingsBody(request),account=await settingsAccount();
 if(Object.keys(body).some(k=>!['category','enabled'].includes(k))||!notificationCategories.includes(body.category as NotificationCategory)||typeof body.enabled!=='boolean')throw new SettingsError('设置资料格式无效');
 const category=body.category as NotificationCategory;if(!(await available(account)).includes(category))throw new SettingsError('此账号没有该提醒类别',403);
 const db=learningDb(),now=new Date().toISOString(),guard=settingsAuthority(account),enabled=body.enabled?1:0;
 const statements=[authorityGuard(guard,'account_settings_changed'),db.prepare(`INSERT INTO notification_preferences(account_id,${category}_enabled,${category}_since,updated_at) VALUES(?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET ${category}_since=CASE WHEN notification_preferences.${category}_enabled=0 AND excluded.${category}_enabled=1 THEN excluded.updated_at ELSE notification_preferences.${category}_since END,${category}_enabled=excluded.${category}_enabled,updated_at=excluded.updated_at`).bind(account.id,enabled,'',now)];
 if(!enabled){
  if(category==='courses')statements.push(db.prepare("UPDATE notification_deliveries SET status='expired',lock_until=NULL WHERE status IN('pending','sending') AND item_id IN(SELECT id FROM notification_items WHERE account_id=?)").bind(account.id));
  if(category==='homework')statements.push(db.prepare("UPDATE learning_notification_deliveries SET status='expired',lock_until=NULL WHERE status IN('pending','sending') AND notification_id IN(SELECT id FROM learning_notifications WHERE account_id=?)").bind(account.id));
  if(category!=='homework')statements.push(db.prepare(`UPDATE parent_notification_deliveries SET status='cancelled',lock_until=NULL,claim_token=NULL,last_error='preference_disabled' WHERE status IN('pending','sending') AND item_id IN(SELECT id FROM parent_notifications WHERE account_id=? AND ${category==='courses'?"kind='student_absent'":"kind<>'student_absent'"})`).bind(account.id));
 }
 await db.batch(statements);return json({ok:true,...await state(account)});
}catch(error){return failure(error);}}
