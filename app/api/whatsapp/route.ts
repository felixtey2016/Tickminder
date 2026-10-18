import {env} from 'cloudflare:workers';
import {NextResponse} from 'next/server';
import {currentIdentity,hashToken} from '@/lib/auth';
import {selectedGroup} from '@/lib/groups-server';
import {studentNameKey} from '@/lib/student-names';
import {normalizeWhatsAppPhone,whatsappIdentity} from '@/lib/whatsapp-phone';

function db(){if(!env.DB)throw new Error('网站连接暂不可用');return env.DB;}
type Contact={phone:string;identity_role:string;identity_name:string;verified_at:string};
function json(data:object,status=200){return NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}});}
async function actor(){
  const identity=await currentIdentity();
  if(!identity)throw new Error('请先登录正式站');
  if(identity.local?.mustChangePassword||(!identity.local&&identity.google)||!identity.account.nameConfirmedAt)throw new Error('请先完成姓名和登录账号设置');
  const account=identity.account,group=await selectedGroup(account);
  if(!group||account.groupId!==group.id||!['teacher','student','pending'].includes(account.role))throw new Error('当前身份不支持师生 WhatsApp 绑定');
  if(!String((env as unknown as Record<string,string>).WHATSAPP_SELF_ENROLL_GROUPS||'').split(',').includes(group.id))throw new Error('当前中心尚未连接 WhatsApp');
  const name=whatsappIdentity(account);if(!name)throw new Error('请先确认网站身份');
  return {account,group,name,google:identity.google};
}
async function own(accountId:string,groupId:string){return db().prepare('SELECT phone,identity_role,identity_name,verified_at FROM whatsapp_contacts WHERE account_id=? AND group_id=?').bind(accountId,groupId).first<Contact>();}
export async function GET(){
  try{
    const {account,group,name}=await actor(),contact=await own(account.id,group.id);
    const verified=Boolean(contact&&contact.identity_role===account.role&&contact.identity_name===name);
    const suggestion=await db().prepare('SELECT phone FROM whatsapp_contact_requests WHERE account_id=? AND group_id=? AND identity_role=? AND identity_name=?').bind(account.id,group.id,account.role,name).first<{phone:string}>();
    return json({verified,phone:verified?contact!.phone:'',suggestedPhone:suggestion?.phone||'',role:account.role,newStudent:account.role==='pending',website:'https://tickminder.com'});
  }catch(error){return json({error:(error as Error).message},403);}
}
export async function POST(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'请求来源无效'},403);
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||Number(request.headers.get('content-length')||0)>2048)return json({error:'请求格式无效'},400);
  try{
    const {account,group,name,google}=await actor(),body=await request.json() as {action?:string;phone?:unknown;consent?:boolean};
    if(body.action==='finish'){
      const contact=await own(account.id,group.id);
      if(!contact||contact.identity_role!==account.role||contact.identity_name!==name)return json({error:'请先用本人 WhatsApp 完成验证'},409);
      if(account.role!=='pending')return json({ok:true});
      const groups=String((env as unknown as Record<string,string>).WHATSAPP_SELF_ENROLL_GROUPS||'').split(',');
      if(!google||!groups.includes(group.id))return json({error:'请管理员分配学生身份'},403);
      const key=studentNameKey(name),now=new Date().toISOString();
      if(!key||name.length>80)return json({error:'请先填写有效姓名'},400);
      if(await db().prepare('SELECT name FROM students WHERE group_id=? AND name_key=?').bind(group.id,key).first())return json({error:'此姓名已有学生资料，请管理员确认已有账号；不会自动合并同名人员'},409);
      // D1 batch is atomic. Never attach a new registration to an existing student.
      await db().batch([
        db().prepare("INSERT INTO students(group_id,name,name_key,active,created_at) SELECT ?,?,?,1,? WHERE EXISTS(SELECT 1 FROM accounts a JOIN whatsapp_contacts c ON c.account_id=a.id AND c.group_id=a.group_id WHERE a.id=? AND a.group_id=? AND a.role='pending' AND a.name=? AND a.disabled_at IS NULL AND c.identity_role='pending' AND c.identity_name=a.name AND c.phone=?)").bind(group.id,name,key,now,account.id,group.id,name,contact.phone),
        db().prepare("UPDATE accounts SET role='student',student_name=?,activated_at=?,activation_reason='whatsapp-self-enrolled',pending_expires_at=NULL WHERE id=? AND group_id=? AND role='pending' AND name=? AND disabled_at IS NULL AND EXISTS(SELECT 1 FROM students s WHERE s.group_id=accounts.group_id AND s.name=? AND s.created_at=?)").bind(name,now,account.id,group.id,name,name,now),
        db().prepare("UPDATE whatsapp_contacts SET identity_role='student',identity_name=?,revision=revision+1 WHERE account_id=? AND group_id=? AND phone=? AND EXISTS(SELECT 1 FROM accounts a WHERE a.id=account_id AND a.group_id=whatsapp_contacts.group_id AND a.role='student' AND a.student_name=?)").bind(name,account.id,group.id,contact.phone,name),
      ]);
      const assigned=await db().prepare("SELECT id FROM accounts WHERE id=? AND group_id=? AND role='student' AND student_name=? AND disabled_at IS NULL").bind(account.id,group.id,name).first();
      return assigned?json({ok:true}):json({error:'网站身份已改变，请刷新后重试'},409);
    }
    if(body.action!=='start'||body.consent!==true)return json({error:'请确认使用本人号码连接 WhatsApp'},400);
    const phone=normalizeWhatsAppPhone(body.phone),now=new Date(),stamp=now.toISOString();
    if(['teacher','student'].includes(account.role)&&await db().prepare('SELECT account_id FROM whatsapp_contacts WHERE group_id=? AND identity_role=? AND identity_name=? AND account_id<>?').bind(group.id,account.role,name,account.id).first())return json({error:'此师生身份已有绑定账号，请使用原账号或联系管理员核对'},409);
    const conflict=await db().prepare('SELECT account_id FROM whatsapp_contacts WHERE phone=? AND account_id<>?').bind(phone,account.id).first();
    if(conflict)return json({error:'此号码暂时无法绑定，请管理员核对'},409);
    const recent=await db().prepare('SELECT count(*) AS n FROM whatsapp_challenges WHERE (account_id=? OR phone=?) AND created_at>?').bind(account.id,phone,new Date(now.getTime()-3600000).toISOString()).first<{n:number}>();
    if((recent?.n||0)>=5)return json({error:'验证请求过多，请稍后再试'},429);
    const bot=String((env as unknown as Record<string,string>).WHATSAPP_BOT_NUMBER||'');
    if(!/^[1-9][0-9]{7,14}$/.test(bot))return json({error:'WhatsApp 连接暂不可用，请稍后再试'},503);
    const code='NG-'+Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const hash=await hashToken(code),expires=new Date(now.getTime()+8*60000).toISOString();
    await db().batch([
      db().prepare("UPDATE whatsapp_challenges SET status='cancelled' WHERE account_id=? AND status='pending'").bind(account.id),
      db().prepare('INSERT INTO whatsapp_challenges(token_hash,account_id,group_id,phone,identity_role,identity_name,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').bind(hash,account.id,group.id,phone,account.role,name,stamp,expires),
    ]);
    return json({code,expiresAt:expires,url:'https://wa.me/'+bot+'?text='+encodeURIComponent(code),phone});
  }catch(error){
    const message=(error as Error).message;
    if(/填写|请先|当前身份|网站身份/.test(message))return json({error:message},400);
    return json({error:'号码绑定暂时失败，请刷新后重试'},409);
  }
}
