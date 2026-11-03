import {currentIdentity,type Account} from './auth';
import {accountSessionPredicate} from './account-session';
export class SettingsError extends Error {constructor(message:string,public status=400){super(message);}}
export async function settingsAccount(){
 const identity=await currentIdentity();
 if(!identity)throw new SettingsError('登录已过期，请重新登录',401);
 if(!identity.local||identity.local.mustChangePassword)throw new SettingsError('请先完成账号及密码设置',403);
 return identity.account;
}
export function settingsAuthority(account:Account){
 const session=accountSessionPredicate(account);
 return {sql:`EXISTS(SELECT 1 FROM accounts settings_account JOIN local_credentials settings_local ON settings_local.account_id=settings_account.id WHERE settings_account.id=? AND settings_account.disabled_at IS NULL AND settings_local.must_change_password=0 AND (settings_account.role<>'pending' OR settings_account.activated_at IS NOT NULL OR coalesce(settings_account.teacher_name,'')<>'' OR coalesce(settings_account.student_name,'')<>'' OR settings_account.pending_expires_at IS NULL OR settings_account.pending_expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AND ${session.sql}`,args:[account.id,...session.args]};
}
export async function settingsBody(request:Request){
 if(new URL(request.url).origin!==request.headers.get('origin'))throw new SettingsError('请求来源无效',403);
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new SettingsError('设置资料格式无效');
 const raw=await request.text();if(raw.length>2048)throw new SettingsError('设置资料格式无效');
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new SettingsError('设置资料格式无效');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SettingsError('设置资料格式无效');
 return value as Record<string,unknown>;
}
