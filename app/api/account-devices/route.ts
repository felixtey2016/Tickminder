import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {hashToken,type Account} from '@/lib/auth';
import {learningDb} from '@/lib/learning-server';
import {authorityGuard} from '@/lib/admin-authority';
import {settingsAccount,settingsAuthority,settingsBody,SettingsError} from '@/lib/settings-authority';
import {appendAudit} from '@/lib/audit-log';
import {DEFAULT_GROUP_ID} from '@/lib/group-data';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
async function own(){const account=await settingsAccount(),token=(await cookies()).get('tuition_session')?.value;if(!token)throw new SettingsError('登录已过期，请重新登录',401);return{account,hash:await hashToken(token)};}
async function state(account:Account,hash:string){
 const db=learningDb(),guard=settingsAuthority(account);
 // A live older worker may have created a session during rollout. Enrich only this account.
 await db.batch([authorityGuard(guard,'account_settings_changed'),db.prepare('INSERT OR IGNORE INTO session_devices(id,token_hash) SELECT lower(hex(randomblob(16))),token_hash FROM sessions WHERE account_id=? AND expires_at>?').bind(account.id,new Date().toISOString())]);
 const rows=(await db.prepare('SELECT d.id,d.browser,d.os,d.created_at AS createdAt,s.expires_at AS expiresAt,s.token_hash=? AS current FROM sessions s JOIN session_devices d ON d.token_hash=s.token_hash WHERE s.account_id=? AND s.expires_at>? ORDER BY current DESC,d.created_at DESC,d.id LIMIT 101').bind(hash,account.id,new Date().toISOString()).all()).results;
 const count=await db.prepare('SELECT count(*) AS n FROM sessions WHERE account_id=? AND token_hash<>? AND expires_at>?').bind(account.id,hash,new Date().toISOString()).first<{n:number}>();
 return {devices:rows.slice(0,100),otherCount:Number(count?.n||0),hasMore:rows.length>100};
}
function failure(error:unknown){return json({error:error instanceof SettingsError?error.message:'设备资料已改变，请刷新后重试'},error instanceof SettingsError?error.status:/account_settings_changed/.test(String(error))?409:503);}
export async function GET(){try{const{account,hash}=await own();return json(await state(account,hash));}catch(error){return failure(error);}}
export async function POST(request:Request){try{
 const body=await settingsBody(request),{account,hash}=await own();
 if(Object.keys(body).some(k=>!['action','deviceId'].includes(k))||!['revoke','revokeOthers'].includes(String(body.action))||body.action==='revoke'&&(typeof body.deviceId!=='string'||!/^[a-z0-9-]{16,40}$/i.test(body.deviceId))||body.action==='revokeOthers'&&body.deviceId!==undefined)throw new SettingsError('设置资料格式无效');
 const db=learningDb(),guard=settingsAuthority(account),all=body.action==='revokeOthers';
 if(!all){const found=await db.prepare('SELECT s.token_hash AS hash FROM session_devices d JOIN sessions s ON s.token_hash=d.token_hash WHERE d.id=? AND s.account_id=? AND s.expires_at>?').bind(body.deviceId,account.id,new Date().toISOString()).first<{hash:string}>();if(!found)throw new SettingsError('设备不存在或已退出',404);if(found.hash===hash)throw new SettingsError('请使用退出登录按钮退出此设备',400);}
 const id=crypto.randomUUID();
 const result=await db.batch([authorityGuard(guard,'account_settings_changed'),db.prepare(`DELETE FROM sessions WHERE account_id=? AND token_hash<>? ${all?'':'AND token_hash IN(SELECT token_hash FROM session_devices WHERE id=?)'}`).bind(account.id,hash,...all?[]:[body.deviceId]),appendAudit(db,{id,groupId:account.groupId||DEFAULT_GROUP_ID,lessonId:'account:'+account.id,actorId:account.id,actorName:account.name,action:'accountSessions.revoke',after:{scope:all?'otherDevices':'oneDevice'}})]);
 return json({ok:true,revoked:result[1].meta.changes,...await state(account,hash)});
}catch(error){return failure(error);}}
