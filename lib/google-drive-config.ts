import {env} from 'cloudflare:workers';
import type {Account} from './auth';
import {MaterialImportError,requireMaterialCreateAuthority} from './material-import-access';
import {learningDb} from './learning-server';
import {pdfLimits} from './pdf-storage';
export async function googleDriveConfig(actor:Account,params:URLSearchParams){
 const classroomId=params.get('classroomId')||'',folderId=params.get('folderId')||'';
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(classroomId)||folderId&&!/^[a-zA-Z0-9_-]{1,128}$/.test(folderId))throw Object.assign(Error('请选择有效的班级和文件夹'),{status:400});
 const authority=await requireMaterialCreateAuthority(actor,{classroomId,folderId});
 const vars=env as unknown as {GOOGLE_CLIENT_ID?:string;GOOGLE_PICKER_API_KEY?:string;GOOGLE_DRIVE_APP_ID?:string};
 const clientId=typeof vars.GOOGLE_CLIENT_ID==='string'&&/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(vars.GOOGLE_CLIENT_ID)?vars.GOOGLE_CLIENT_ID:null;
 const apiKey=typeof vars.GOOGLE_PICKER_API_KEY==='string'&&/^[A-Za-z0-9_-]{20,100}$/.test(vars.GOOGLE_PICKER_API_KEY)?vars.GOOGLE_PICKER_API_KEY:null;
 const projectNumber=typeof vars.GOOGLE_DRIVE_APP_ID==='string'&&/^[0-9]{5,30}$/.test(vars.GOOGLE_DRIVE_APP_ID)?vars.GOOGLE_DRIVE_APP_ID:null;
 const configured=Boolean(clientId&&apiKey&&projectNumber);
 // Project the verified binding only while the original live authority still holds.
 // A local account email is not proof of ownership of a Google account.
 const identity=await learningDb().prepare('SELECT drive_identity.subject AS loginHint FROM accounts drive_actor LEFT JOIN google_identities drive_identity ON drive_identity.account_id=drive_actor.id WHERE drive_actor.id=? AND ('+authority.sql+')').bind(actor.id,...authority.values).first<{loginHint:string|null}>();
 if(!identity)throw new MaterialImportError('没有此班级的教学资料上传权限，或账号、班级与文件夹已改变');
 const loginHint=typeof identity.loginHint==='string'&&identity.loginHint.length>0&&identity.loginHint.length<=255&&!/[\u0000-\u0020\u007f]/.test(identity.loginHint)?identity.loginHint:null;
 return{configured,loginHint,clientId:configured?clientId:null,apiKey:configured?apiKey:null,projectNumber:configured?projectNumber:null,accountId:actor.id,groupId:actor.groupId!,maxBytes:pdfLimits().perFile,maxFiles:20};
}
