"use client";
import {useCallback,useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';

export function WhatsAppBinding({onComplete}:{onComplete?:()=>void|Promise<void>}){
 const [phone,setPhone]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [status,setStatus]=useState<{verified:boolean;phone:string;newStudent:boolean;botAccess?:string}|null>(null);
 const [challenge,setChallenge]=useState<{code:string;url:string;expiresAt:string}|null>(null);
 const refresh=useCallback(async()=>{
  const r=await groupFetch('/api/whatsapp',{cache:'no-store'}),d=await r.json() as {verified:boolean;phone:string;suggestedPhone?:string;newStudent:boolean;botAccess?:string;error?:string};
  if(!r.ok)throw Error(d.error||'暂时无法读取绑定状态');setStatus(d);setError('');if(d.suggestedPhone)setPhone(previous=>previous||'+'+d.suggestedPhone);return d;
 },[]);
 useEffect(()=>{let active=true;void refresh().catch(e=>{if(active)setError(e.message)});return()=>{active=false};},[refresh]);
 useEffect(()=>{if(!challenge||status?.verified)return;const timer=setInterval(()=>{if(Date.now()>Date.parse(challenge.expiresAt)){clearInterval(timer);setChallenge(null);setError('绑定码已过期，请重新生成');return;}void refresh().catch(()=>{});},4000);return()=>clearInterval(timer);},[challenge,status?.verified,refresh]);
 async function submit(action:'start'|'finish'){
  if(busy)return;setBusy(true);setError('');
  try{const r=await groupFetch('/api/whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,phone,consent})}),d=await r.json() as {code:string;url:string;expiresAt:string;error?:string};
   if(!r.ok)throw Error(d.error||'操作失败，请重试');
   if(action==='start')setChallenge(d);else{await refresh();if(onComplete)await onComplete();else window.location.assign('/');}
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="panel account-settings" aria-label="WhatsApp 号码绑定"><h2>连接 WhatsApp</h2>
 {status?.botAccess==='contact_only'?<p>当前为管理员账号，可验证并保存本人号码。管理员通过 Bot 管理教务的功能尚未开放，请继续在网站操作。</p>:<p>老师和学生可使用本人号码接收课程通知，并通过 Bot 查询自己的课程、功课与申请调课。</p>}
 {status?.verified?<><p role="status">号码已验证：+{status.phone}</p>{status.newStudent?<p>验证已完成。继续后会建立你的学生资料；已有同名资料时需管理员核对。课程以网站实际安排为准。</p>:status.botAccess==='contact_only'?<p>管理员号码已保存到当前网站账号。</p>:<p>系统会自动同步，通常约一分钟。</p>}<Button disabled={busy} onClick={()=>void submit('finish')}>{status.newStudent?'完成注册并加入学生名册':'返回课程网站'}</Button></>:status?<>
 <form onSubmit={e=>{e.preventDefault();void submit('start')}}><label>本人 WhatsApp 号码（含国家代码）<input type="tel" autoComplete="tel" required maxLength={40} placeholder="+60123456789" value={phone} onChange={e=>setPhone(e.target.value)}/></label>
 <label style={{display:'flex',alignItems:'center',gap:8,margin:'12px 0'}}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required style={{width:18}}/>我同意将本人号码连接到当前网站账号，用于教务沟通。</label><Button disabled={busy||!status}>生成 WhatsApp 绑定码</Button></form>
 {challenge&&<div style={{marginTop:16}}><p>请用刚填写的 WhatsApp 号码，向 Bot 发送下面的绑定码。绑定码 8 分钟内有效，请勿转发给别人。</p><p><code>{challenge.code}</code></p><a href={challenge.url} target="_blank" rel="noopener noreferrer">打开 WhatsApp 发送绑定码</a><p role="status">等待本人 WhatsApp 消息验证…</p><Button variant="outline" disabled={busy} onClick={()=>void refresh().catch(e=>setError(e.message))}>检查验证结果</Button></div>}
 </>:!error?<p role="status">正在读取绑定状态…</p>:null}{error&&<><p className="error" role="alert">{error}</p>{!status&&<Button variant="outline" onClick={()=>void refresh().catch(e=>setError(e.message))}>重新读取绑定状态</Button>}</>}</section>;
}
