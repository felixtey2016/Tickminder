"use client";
import {DateInput} from '@/components/date-time-input';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {readApiJson,showActionToast,alertActionFailure} from '@/lib/action-feedback';
import {getLanguage,t} from '@/lib/i18n';
import type {BillingMode,BillingRateResponse} from '@/lib/billing';
import {studentRateModes} from '@/lib/course-setup-flow';

export const billingModeLabel:Record<BillingMode,string>={hour:'按小时',lesson:'按堂',month:'固定月费'};
export function billingMoney(cents:number|null|undefined){return cents==null?'—':`RM ${(cents/100).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
function localDate(offset=0){return new Date(Date.now()+8*3600000+offset*86400000).toISOString().slice(0,10);}
export function BillingRateEditor({planKey,onPreview,onSaved,onBusyChange,onDirtyChange,saveLabel}:{planKey:string;onPreview?:()=>void;onSaved?:()=>void;onBusyChange?:(busy:boolean)=>void;onDirtyChange?:(dirty:boolean)=>void;saveLabel?:string}){
 const [data,setData]=useState<BillingRateResponse|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const operation=useRef<{key:string;id:string}|null>(null),inFlight=useRef(false);
 const committedRate=useRef<string|null>(null),timingOperation=useRef<{key:string;id:string}|null>(null);
 const [timingUnconfirmed,setTimingUnconfirmed]=useState(false);
 useEffect(()=>{onBusyChange?.(busy);},[busy,onBusyChange]);
 const [timing,setTiming]=useState<'advance'|'arrears'>('arrears');
 const [mode,setMode]=useState<BillingMode>('hour'),[amount,setAmount]=useState(''),[includedSessions,setIncludedSessions]=useState(''),[date,setDate]=useState(localDate().slice(0,7)+'-01');
 useEffect(()=>{const controller=new AbortController();operation.current=null;committedRate.current=null;timingOperation.current=null;setTimingUnconfirmed(false);onDirtyChange?.(false);setLoading(true);setData(null);setError('');void(async()=>{try{const response=await groupFetch('/api/billing?view=rates&planKey='+encodeURIComponent(planKey),{cache:'no-store',signal:controller.signal});const result=await readApiJson<BillingRateResponse&{error?:string}>(response);if(!response.ok)throw Error(t(result.error||'收费设置暂时无法载入'));if(controller.signal.aborted)return;setData(result);setTiming(result.context.collectionTiming);const latest=result.context.history[0]||result.context.currentRate;setMode(latest?.mode||'hour');setIncludedSessions(latest?.includedSessions==null?'':String(latest.includedSessions));setAmount(latest?String((latest.amountCents/100).toFixed(2)):'');const nextDate=latest?localDate(1):localDate().slice(0,7)+'-01';setDate(latest&&latest.effectiveFrom>=nextDate?new Date(Date.parse(latest.effectiveFrom+'T00:00:00Z')+86400000).toISOString().slice(0,10):nextDate);}catch(e){if(!controller.signal.aborted)setError(alertActionFailure(e));}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>controller.abort();},[planKey,reload]);
 async function save(event:React.FormEvent){
  event.preventDefault();if(!data?.context.active||inFlight.current)return;
  const body={action:'saveRate',studentId:data.context.studentId,subjectKey:data.context.subjectKey,revision:data.context.revision,mode,amount,includedSessions:mode==='month'?Number(includedSessions):null,effectiveFrom:date},key=JSON.stringify(body);
  if(operation.current?.key!==key)operation.current={key,id:crypto.randomUUID()};
  inFlight.current=true;setBusy(true);setError('');
  const signature=JSON.stringify({mode,amount,includedSessions:mode==='month'?Number(includedSessions):null,effectiveFrom:date});
  try{
   if(!onSaved||committedRate.current!==signature){
    const response=await groupFetch("/api/billing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,operationId:operation.current.id})});
    const result=await readApiJson<{error?:string;revision?:number}>(response);if(!response.ok)throw Error(t(result.error||"收费设置未能保存"));
    committedRate.current=signature;operation.current=null;if(result.revision)setData(value=>value?{...value,context:{...value.context,revision:result.revision!}}:value);
   }
   if(onSaved&&(timingOperation.current||timing!==data.context.collectionTiming)){
    const timingBody={action:"saveCollectionTiming",studentId:data.context.studentId,subjectKey:data.context.subjectKey,revision:data.context.collectionRevision,timing},timingKey=JSON.stringify(timingBody);
    if(timingOperation.current?.key!==timingKey)timingOperation.current={key:timingKey,id:crypto.randomUUID()};
    setTimingUnconfirmed(true);
    const response=await groupFetch("/api/billing",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...timingBody,operationId:timingOperation.current.id})});
    const result=await readApiJson<{error?:string}>(response);if(!response.ok)throw Error(t(result.error||"收款时点未能保存"));timingOperation.current=null;setTimingUnconfirmed(false);
   }
   onDirtyChange?.(false);showActionToast("success","收费设置已保存");if(onSaved)onSaved();else setReload(x=>x+1);
  }catch(e){const message=alertActionFailure(e);setError(onSaved&&committedRate.current===signature?(getLanguage()==="zh"?"费率已保存；收款时点尚未确认。请重试完成保存。 ":"Rate saved; collection timing is not confirmed. Retry to finish. ")+message:message);}finally{inFlight.current=false;setBusy(false);}
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
   <div className="billing-form-grid"><label>{t('计费方式')}<select disabled={busy||timingUnconfirmed} value={mode} onChange={e=>{setMode(e.target.value as BillingMode);onDirtyChange?.(true);}}>{studentRateModes([...data.context.history,...data.context.currentRate?[data.context.currentRate]:[]]).map(value=><option key={value} value={value}>{t(billingModeLabel[value])}</option>)}</select></label><label>{t('收费金额')} · MYR<input aria-label={t('收费金额')} inputMode="decimal" type="text" required disabled={busy||timingUnconfirmed} maxLength={11} value={amount} placeholder="0.00" onChange={e=>{setAmount(e.target.value);onDirtyChange?.(true);}}/></label>{mode==='month'&&<label>{getLanguage()==='zh'?'每月包含堂数':'Included lessons per month'}<input aria-label={getLanguage()==='zh'?'每月包含堂数':'Included lessons per month'} type="number" inputMode="numeric" required min={1} max={62} step={1} disabled={busy||timingUnconfirmed} value={includedSessions} onChange={e=>{setIncludedSessions(e.target.value);onDirtyChange?.(true);}}/></label>}<label>{t('生效日期')}<DateInput type="date" required disabled={busy||timingUnconfirmed} value={date} onChange={e=>{setDate(e.target.value);onDirtyChange?.(true);}}/></label></div>
   {mode==='month'&&<p className="muted">{getLanguage()==='zh'?'按已排课程核对包含堂数。超出后逐次选择免收或填写额外金额，不会自动加收。':'Included lessons are checked against the schedule. Choose a waiver or enter an extra charge for any excess; nothing is added automatically.'}{data.context.history.some(rate=>rate.mode==='month'&&rate.includedSessions==null)&&(getLanguage()==='zh'?' 旧月费没有包含堂数设定，旧记录保留；新版本请明确填写。':' Legacy monthly rates have no allowance recorded and stay unchanged; enter an allowance for the new version.')}</p>}
   {mode==='month'&&<p className="notice">{getLanguage()==='zh'?'固定月费不会因学生缺席自动减少；需要调整时另行核对。':'A fixed monthly fee is not automatically reduced for student absence; any adjustment is reviewed separately.'}</p>}
   <p className="muted">{t('修改收费会新增历史版本。已生效版本保留；之后的变更从新的生效日期开始。')}</p>
   {onSaved&&<label>{t('收款安排')}<select aria-label={t('收款安排')} disabled={busy||timingUnconfirmed} value={timing} onChange={e=>{setTiming(e.target.value as 'advance'|'arrears');onDirtyChange?.(true);}}><option value="arrears">{t('课后结算')}</option><option value="advance">{t('课前预收')}</option></select></label>}
   {timingUnconfirmed&&<p role="status" className="notice">{getLanguage()==='zh'?'上次收款安排尚未确认。请重试同一保存，或重新载入后再修改。':'The last collection timing change is not confirmed. Retry the same save, or reload before making changes.'}</p>}{error&&<p role="alert" className="error" data-error-popup-ignore>{error}</p>}<div className="billing-actions"><Button disabled={busy}>{busy?t('正在保存…'):saveLabel|| (onSaved?(getLanguage()==='zh'?'保存并完成':'Save and finish'):t('保存收费设置'))}</Button>{error&&<Button type="button" variant="outline" disabled={busy} onClick={()=>setReload(x=>x+1)}>{t('重新载入收费设置')}</Button>}</div>
  </form>}
  {!onSaved&&<section className="billing-form"><h3>{t('收款时点')}</h3><label>{t('收款安排')}<select aria-label={t('收款安排')} disabled={busy||!data.context.active} value={timing} onChange={e=>setTiming(e.target.value as 'advance'|'arrears')}><option value="arrears">{t('课后结算')}</option><option value="advance">{t('课前预收')}</option></select></label><p className="muted">{t('课前预收先发预收费单，收款保留为学生余额；完成课程后用余额抵扣正式账单。收款时点不改变费率、课程日期或原账单。')}</p>{data.context.active&&<div className="billing-actions"><Button type="button" disabled={busy||timing===data.context.collectionTiming} onClick={()=>void saveTiming()}>{t('保存收款时点')}</Button></div>}</section>}
  <section className="billing-rate-history"><h3>{t('费率历史')}</h3>{data.context.history.length?<ol>{data.context.history.map(rate=><li key={rate.id}><div><strong>{billingMoney(rate.amountCents)} · {t(billingModeLabel[rate.mode])}</strong><span>{t('生效日期')} {rate.effectiveFrom}</span></div><small>{t('版本')} {rate.revision}{rate.mode==='month'&&<span> · {getLanguage()==='zh'?(rate.includedSessions==null?'旧月费：未设包含堂数':`每月包含 ${rate.includedSessions} 堂`):(rate.includedSessions==null?'Legacy monthly rate: no allowance recorded':`${rate.includedSessions} included lessons per month`)}</span>}</small></li>)}</ol>:<p className="muted">{t('暂无费率记录')}</p>}</section>
 </div>;
}
