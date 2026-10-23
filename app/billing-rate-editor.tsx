"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {readApiJson,showActionToast,alertActionFailure} from '@/lib/action-feedback';
import {t} from '@/lib/i18n';
import type {BillingMode,BillingRateResponse} from '@/lib/billing';

export const billingModeLabel:Record<BillingMode,string>={hour:'按小时',lesson:'按堂',month:'固定月费'};
export function billingMoney(cents:number|null|undefined){return cents==null?'—':`RM ${(cents/100).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
function localDate(offset=0){return new Date(Date.now()+8*3600000+offset*86400000).toISOString().slice(0,10);}
export function BillingRateEditor({planKey,onPreview}:{planKey:string;onPreview?:()=>void}){
 const [data,setData]=useState<BillingRateResponse|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const operation=useRef<{key:string;id:string}|null>(null),inFlight=useRef(false);
 const [timing,setTiming]=useState<'advance'|'arrears'>('arrears');
 const [mode,setMode]=useState<BillingMode>('hour'),[amount,setAmount]=useState(''),[date,setDate]=useState(localDate().slice(0,7)+'-01');
 useEffect(()=>{const controller=new AbortController();operation.current=null;setLoading(true);setData(null);setError('');void(async()=>{try{const response=await groupFetch('/api/billing?view=rates&planKey='+encodeURIComponent(planKey),{cache:'no-store',signal:controller.signal});const result=await readApiJson<BillingRateResponse&{error?:string}>(response);if(!response.ok)throw Error(t(result.error||'收费设置暂时无法载入'));if(controller.signal.aborted)return;setData(result);setTiming(result.context.collectionTiming);const latest=result.context.history[0]||result.context.currentRate;setMode(latest?.mode||'hour');setAmount(latest?String((latest.amountCents/100).toFixed(2)):'');const nextDate=latest?localDate(1):localDate().slice(0,7)+'-01';setDate(latest&&latest.effectiveFrom>=nextDate?new Date(Date.parse(latest.effectiveFrom+'T00:00:00Z')+86400000).toISOString().slice(0,10):nextDate);}catch(e){if(!controller.signal.aborted)setError(alertActionFailure(e));}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>controller.abort();},[planKey,reload]);
 async function save(event:React.FormEvent){
  event.preventDefault();if(!data?.context.active||inFlight.current)return;
  const body={action:'saveRate',studentId:data.context.studentId,subjectKey:data.context.subjectKey,revision:data.context.revision,mode,amount,effectiveFrom:date},key=JSON.stringify(body);
  if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
  inFlight.current=true;setBusy(true);setError('');
  try{const response=await groupFetch('/api/billing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,operationId:operation.current.id})});const result=await readApiJson<{error?:string}>(response);if(!response.ok)throw Error(t(result.error||'收费设置未能保存'));operation.current=null;showActionToast('success','收费设置已保存');setReload(x=>x+1);}catch(e){setError(alertActionFailure(e));}finally{inFlight.current=false;setBusy(false);}
 }
 async function saveTiming(){
  if(!data?.context.active||inFlight.current)return;
  const body={action:'saveCollectionTiming',studentId:data.context.studentId,subjectKey:data.context.subjectKey,revision:data.context.collectionRevision,timing},key=JSON.stringify(body);
  if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
  inFlight.current=true;setBusy(true);setError('');
  try{const response=await groupFetch('/api/billing',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,operationId:operation.current.id})});const result=await readApiJson<{error?:string}>(response);if(!response.ok){if(response.status===409)setReload(x=>x+1);throw Error(t(result.error||'收款时点未能保存'));}operation.current=null;showActionToast('success','收款时点已保存');setReload(x=>x+1);}catch(e){setError(alertActionFailure(e));}finally{inFlight.current=false;setBusy(false);}
 }
 if(loading)return <p role="status">{t('正在加载收费设置…')}</p>;
 if(!data)return <div className="billing-error" role="alert"><p>{error}</p><Button variant="outline" onClick={()=>setReload(x=>x+1)}>{t('重试')}</Button></div>;
 return <div className="billing-rate-editor" aria-busy={busy}>
  <div className="billing-context"><strong>{data.context.student} · {data.context.subject}</strong><p className="muted">{t('收费设置由平台最高管理员及本集团最高管理员管理。')}</p></div>
  {!data.policy&&data.policyRevision===0&&<div className="notice billing-notice"><p>{t('首次保存收费时会启用默认规则：MYR、普通打卡按课程预设时长、明确早退才调整、月中变动人工核对。')}</p>{onPreview&&<Button type="button" variant="outline" onClick={onPreview}>{t('前往费用预览')}</Button>}</div>}
  <div className="billing-current-rate"><span>{t('当前费率')}</span><strong>{billingMoney(data.context.currentRate?.amountCents)}</strong><small>{data.context.currentRate?`${t(billingModeLabel[data.context.currentRate.mode])} · ${t('生效日期')} ${data.context.currentRate.effectiveFrom}`:t('尚未设置已生效的费率')}</small></div>
  {!data.context.active&&<p className="notice" role="status">{t('该学生或课程已停用，收费设置为只读。费率历史保留。')}</p>}
  {data.context.active&&<form className="billing-form" onSubmit={save}>
   <h3>{t(data.context.revision?'新增费率版本':'设置收费')}</h3>
   <div className="billing-form-grid"><label>{t('计费方式')}<select disabled={busy} value={mode} onChange={e=>setMode(e.target.value as BillingMode)}><option value="hour">{t('按小时')}</option><option value="lesson">{t('按堂')}</option><option value="month">{t('固定月费')}</option></select></label><label>{t('收费金额')} · MYR<input aria-label={t('收费金额')} inputMode="decimal" type="text" required disabled={busy} maxLength={11} value={amount} placeholder="0.00" onChange={e=>setAmount(e.target.value)}/></label><label>{t('生效日期')}<input type="date" required disabled={busy} value={date} onChange={e=>setDate(e.target.value)}/></label></div>
   <p className="muted">{t('修改收费会新增历史版本。已生效版本保留；之后的变更从新的生效日期开始。')}</p>
   {error&&<p role="alert" className="error">{error}</p>}<div className="billing-actions"><Button disabled={busy}>{t(busy?'正在保存…':'保存收费设置')}</Button>{error&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setReload(x=>x+1)}>{t('重新载入收费设置')}</Button>}</div>
  </form>}
  <section className="billing-form"><h3>{t('收款时点')}</h3><label>{t('收款安排')}<select aria-label={t('收款安排')} disabled={busy||!data.context.active} value={timing} onChange={e=>setTiming(e.target.value as 'advance'|'arrears')}><option value="arrears">{t('课后结算')}</option><option value="advance">{t('课前预收')}</option></select></label><p className="muted">{t('课前预收先发预收费单，收款保留为学生余额；完成课程后用余额抵扣正式账单。收款时点不改变费率、课程日期或原账单。')}</p>{data.context.active&&<div className="billing-actions"><Button type="button" disabled={busy||timing===data.context.collectionTiming} onClick={()=>void saveTiming()}>{t('保存收款时点')}</Button></div>}</section>
  <section className="billing-rate-history"><h3>{t('费率历史')}</h3>{data.context.history.length?<ol>{data.context.history.map(rate=><li key={rate.id}><div><strong>{billingMoney(rate.amountCents)} · {t(billingModeLabel[rate.mode])}</strong><span>{t('生效日期')} {rate.effectiveFrom}</span></div><small>{t('版本')} {rate.revision}</small></li>)}</ol>:<p className="muted">{t('暂无费率记录')}</p>}</section>
 </div>;
}
