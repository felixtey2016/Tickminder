import { env } from 'cloudflare:workers';
import type { Account } from './auth';
import { learningDb } from './learning-server';
import { OWNER_EMAIL } from './owner';
import { accountSessionPredicate } from './account-session';
import { adminPermissionPredicate } from './admin-permission-access';
import { adminActorGuard, authorityGuard } from './admin-authority';
import { requireBillingManager } from './billing-server';
import { pdfLimits } from './pdf-storage';
import { inspectInvoiceLogo, INVOICE_LOGO_MAX_BYTES, InvoiceLogoError } from './invoice-logo';

export type InvoiceTemplate = 'standard' | 'centered' | 'brand';
export type InvoiceInstitutionSnapshot = {
 institutionName:string;address:string;phone:string;email:string;template:InvoiceTemplate;themeColor:string;
 bankName:string;beneficiary:string;bankAccount:string;paymentNote:string;invoiceNote:string;
 invoicePrefix:string;logoAssetId:string|null;revision:number;dueDays:number;
};
export type InvoiceSettingsResponse = {settings:InvoiceInstitutionSnapshot;canManage:boolean;logoUploadAvailable:boolean};
export class InvoiceSettingsError extends Error {constructor(message:string,readonly status=400){super(message);}}
export function defaultInvoiceSettings(name:string):InvoiceInstitutionSnapshot{return{
 institutionName:name,address:'',phone:'',email:'',template:'standard',themeColor:'#6040bf',bankName:'',beneficiary:'',bankAccount:'',paymentNote:'',invoiceNote:'',invoicePrefix:'INV',logoAssetId:null,revision:0,dueDays:7,
};}
function group(actor:Account){if(actor.role!=='admin'||!actor.groupId||!/^[a-z0-9-]{1,64}$/.test(actor.groupId))throw new InvoiceSettingsError('没有权限查看账单设置',403);return actor.groupId;}
function reader(actor:Account){
 const groupId=group(actor),session=accountSessionPredicate(actor),grants=['invoices.view','invoices.create','invoices.edit','invoices.issue'].map(key=>adminPermissionPredicate(actor,key));
 return{sql:`EXISTS(SELECT 1 FROM accounts ia JOIN tuition_groups ig ON ig.id=? AND ig.active=1 WHERE ia.id=? AND ia.role='admin' AND ia.disabled_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM local_credentials ic WHERE ic.account_id=ia.id AND ic.must_change_password=1)
 AND ((lower(trim(ia.email))=? AND substr(ia.id,1,6)<>'local:') OR ia.group_id=ig.id AND (ig.chief_admin_id=ia.id OR (${grants.map(p=>p.sql).join(' OR ')}))) AND (${session.sql}))`,args:[groupId,actor.id,OWNER_EMAIL,...grants.flatMap(p=>p.args),...session.args]};
}
async function requireReader(actor:Account){const allowed=reader(actor);if(!await learningDb().prepare(`SELECT 1 WHERE ${allowed.sql}`).bind(...allowed.args).first())throw new InvoiceSettingsError('没有权限查看账单设置',403);}
function text(value:unknown,max:number,label:string){if(typeof value!=='string')throw new InvoiceSettingsError(`请填写有效的${label}`);const result=value.trim();if(result.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result))throw new InvoiceSettingsError(`${label}内容过长或含无效字符`);return result;}
export function parseInvoiceSettings(value:unknown,revision=0):InvoiceInstitutionSnapshot{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new InvoiceSettingsError('账单设置格式无效');
 const v=value as Record<string,unknown>,institutionName=text(v.institutionName,160,'机构名称'),email=text(v.email,200,'邮箱'),invoicePrefix=text(v.invoicePrefix,12,'编号前缀');
 if(!institutionName)throw new InvoiceSettingsError('请填写机构名称');
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new InvoiceSettingsError('邮箱格式无效');
 if(!/^[A-Za-z][A-Za-z0-9-]{0,11}$/.test(invoicePrefix))throw new InvoiceSettingsError('编号前缀须以英文字母开头，只可使用英文字母、数字及连字符，最多 12 位');
 if(!['standard','centered','brand'].includes(String(v.template))||typeof v.themeColor!=='string'||!/^#[0-9a-fA-F]{6}$/.test(v.themeColor))throw new InvoiceSettingsError('请选择有效模板及主题颜色');
 if(!Number.isSafeInteger(v.dueDays)||Number(v.dueDays)<0||Number(v.dueDays)>90)throw new InvoiceSettingsError('默认付款期限须为 0 至 90 天');
 const logoAssetId=v.logoAssetId===null||v.logoAssetId===''?null:text(v.logoAssetId,80,'Logo 编号');if(logoAssetId&&!/^[a-zA-Z0-9_-]{1,80}$/.test(logoAssetId))throw new InvoiceSettingsError('Logo 编号无效');
 return{institutionName,address:text(v.address,700,'地址'),phone:text(v.phone,80,'电话'),email,template:v.template as InvoiceTemplate,themeColor:v.themeColor.toLowerCase(),bankName:text(v.bankName,160,'银行名称'),beneficiary:text(v.beneficiary,160,'账户名称'),bankAccount:text(v.bankAccount,100,'银行账号'),paymentNote:text(v.paymentNote,1000,'付款说明'),invoiceNote:text(v.invoiceNote,1000,'账单备注'),invoicePrefix:invoicePrefix.toUpperCase(),logoAssetId,revision,dueDays:Number(v.dueDays)};
}
export async function invoiceSettingsSnapshot(actor:Account,_options?:{skipViewerCheck?:boolean}):Promise<InvoiceInstitutionSnapshot>{
 // Even internal invoice callers get live account, session, tenant and invoice grants checked in the read itself.
 const permission=reader(actor),row=await learningDb().prepare(`SELECT g.name,s.revision,s.settings_json AS settingsJson FROM tuition_groups g LEFT JOIN invoice_brand_settings s ON s.group_id=g.id WHERE g.id=? AND ${permission.sql}`).bind(group(actor),...permission.args).first<{name:string;revision:number|null;settingsJson:string|null}>();
 if(!row)throw new InvoiceSettingsError('没有权限查看账单设置',403);
 return row.settingsJson?parseInvoiceSettings(JSON.parse(row.settingsJson),Number(row.revision)):defaultInvoiceSettings(row.name);
}
export async function invoiceSettings(actor:Account):Promise<InvoiceSettingsResponse>{
 const settings=await invoiceSettingsSnapshot(actor);let canManage=false;try{await requireBillingManager(actor);canManage=true;}catch{/* Ordinary invoice users may read but may not change institution settings. */}
 return{settings,canManage,logoUploadAvailable:canManage&&Boolean(env.BUCKET)};
}
function revision(value:unknown){if(!Number.isSafeInteger(value)||Number(value)<0)throw new InvoiceSettingsError('设置版本无效，请刷新后重试',409);return Number(value);}
function revisionGuard(groupId:string,expected:number){return authorityGuard({sql:'coalesce((SELECT revision FROM invoice_brand_settings WHERE group_id=?),0)=?',args:[groupId,expected]},'invoice_settings_changed');}
function logoGuard(groupId:string,assetId:string|null){return authorityGuard({sql:assetId?'EXISTS(SELECT 1 FROM invoice_brand_assets WHERE group_id=? AND id=?)':'1',args:assetId?[groupId,assetId]:[]},'invoice_logo_changed');}
function settingWrite(groupId:string,actorId:string,settings:InvoiceInstitutionSnapshot,now:string){return learningDb().prepare(`INSERT INTO invoice_brand_settings(group_id,revision,settings_json,updated_at,updated_by) VALUES(?,?,?,?,?) ON CONFLICT(group_id) DO UPDATE SET revision=excluded.revision,settings_json=excluded.settings_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by`).bind(groupId,settings.revision,JSON.stringify(settings),now,actorId);}
function audit(groupId:string,actor:Account,settings:InvoiceInstitutionSnapshot,action:string,now:string){return learningDb().prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) VALUES(?,?,'invoice-settings',?,?,?,?)").bind(groupId,crypto.randomUUID(),actor.id,action,JSON.stringify({revision:settings.revision,template:settings.template,logoAssetId:settings.logoAssetId,invoicePrefix:settings.invoicePrefix}),now);}
function rethrow(error:unknown):never{if(/invoice_settings_changed|invoice_logo_changed|admin_authority_changed/.test(String(error)))throw new InvoiceSettingsError('设置或权限已改变，请刷新后重试',409);throw error;}
export async function saveInvoiceSettings(actor:Account,data:Record<string,unknown>):Promise<InvoiceSettingsResponse>{
 const groupId=await requireBillingManager(actor),expected=revision(data.revision),settings=parseInvoiceSettings(data,expected+1),now=new Date().toISOString();
 try{await learningDb().batch([adminActorGuard(actor,true),revisionGuard(groupId,expected),logoGuard(groupId,settings.logoAssetId),settingWrite(groupId,actor.id,settings,now),audit(groupId,actor,settings,'invoice.settings',now)]);}catch(error){rethrow(error);}
 return invoiceSettings(actor);
}
export async function uploadInvoiceLogo(actor:Account,file:File,expectedValue:unknown):Promise<InvoiceSettingsResponse>{
 const groupId=await requireBillingManager(actor),expected=revision(expectedValue);
 if(!env.BUCKET)throw new InvoiceSettingsError('本站尚未启用 Logo 文件储存，仍可使用不含 Logo 的账单模板。',503);
 if(!file.size||file.size>INVOICE_LOGO_MAX_BYTES)throw new InvoiceSettingsError('Logo 须为 2 MB 以内的透明背景 PNG。',413);
 if(!/\.png$/i.test(file.name)||file.type&&file.type!=='image/png')throw new InvoiceSettingsError('Logo 只接受透明背景 PNG。');
 const bytes=new Uint8Array(await file.arrayBuffer());let dimensions:{width:number;height:number};try{dimensions=inspectInvoiceLogo(bytes);}catch(error){if(error instanceof InvoiceLogoError)throw new InvoiceSettingsError(error.message);throw error;}
 const old=await invoiceSettingsSnapshot(actor);if(old.revision!==expected)throw new InvoiceSettingsError('设置已改变，请刷新后重试',409);
 const id=crypto.randomUUID(),objectKey=`invoice-brand/${groupId}/${id}.png`,now=new Date().toISOString(),settings={...old,revision:expected+1,logoAssetId:id},bucket=env.BUCKET;
 await bucket.put(objectKey,bytes,{httpMetadata:{contentType:'image/png'},customMetadata:{groupId,invoiceBrandAssetId:id}});
 try{await learningDb().batch([
  adminActorGuard(actor,true),revisionGuard(groupId,expected),
  learningDb().prepare('INSERT OR IGNORE INTO storage_quota(group_id,id,used_bytes) VALUES(?,1,0)').bind(groupId),
  authorityGuard({sql:'EXISTS(SELECT 1 FROM storage_quota WHERE group_id=? AND id=1 AND used_bytes+?<=?)',args:[groupId,bytes.length,pdfLimits().total]},'invoice_logo_storage_limit'),
  learningDb().prepare('INSERT INTO invoice_brand_assets(id,group_id,object_key,bytes,width,height,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)').bind(id,groupId,objectKey,bytes.length,dimensions.width,dimensions.height,now,actor.id),
  learningDb().prepare('UPDATE storage_quota SET used_bytes=used_bytes+? WHERE group_id=? AND id=1').bind(bytes.length,groupId),
  settingWrite(groupId,actor.id,settings,now),audit(groupId,actor,settings,'invoice.logo',now),
 ]);}catch(error){try{await bucket.delete(objectKey);}catch{/* The unreferenced private object is harmless and can be cleaned up later. */}if(/invoice_logo_storage_limit/.test(String(error)))throw new InvoiceSettingsError('机构储存空间不足，请先联系管理员处理。',409);rethrow(error);}
 return invoiceSettings(actor);
}
export async function invoiceLogoResponse(actor:Account,id:string):Promise<Response>{
 await requireReader(actor);if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new InvoiceSettingsError('Logo 不存在',404);
 const permission=reader(actor),asset=await learningDb().prepare(`SELECT object_key AS objectKey FROM invoice_brand_assets WHERE group_id=? AND id=? AND ${permission.sql}`).bind(group(actor),id,...permission.args).first<{objectKey:string}>();
 if(!asset||!env.BUCKET)throw new InvoiceSettingsError('Logo 不存在或储存未启用',404);
 const object=await env.BUCKET.get(asset.objectKey);if(!object)throw new InvoiceSettingsError('Logo 暂时无法读取',404);await requireReader(actor);
 return new Response(object.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','Vary':'Cookie, x-tickminder-group','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
}
export async function invoiceLogoDataUrl(actor:Account,id:string|null):Promise<string|null>{
 if(!id)return null;const response=await invoiceLogoResponse(actor,id),bytes=new Uint8Array(await response.arrayBuffer());
 let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return'data:image/png;base64,'+btoa(raw);
}
