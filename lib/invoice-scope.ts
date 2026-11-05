import {InvoiceError,type InvoiceBillingScope} from './invoice';
import type {BillingLine} from './billing';
export function invoiceBillingScope(value:unknown):InvoiceBillingScope{if(value===undefined||value===null||value==='')return'all';if(value==='all'||value==='monthly'||value==='hourly')return value;throw new InvoiceError('请选择有效账单范围');}
export function invoiceScopedLines(lines:BillingLine[],scope:InvoiceBillingScope){return scope==='all'?lines:lines.filter(line=>scope==='monthly'?line.mode==='month'||line.mode===null:line.mode!=='month');}
/** Old per-lesson prices remain in the non-monthly invoice unchanged. Unknown
 * sources stay review blockers instead of disappearing from both scopes. */
export function invoiceUpcomingCount(basis:string,scope:InvoiceBillingScope,lines:BillingLine[],asOf=Date.now()){
 const data=JSON.parse(basis),decode=(v:unknown)=>typeof v==='string'?JSON.parse(v):v;
 const sessions=(data.sessions||[]).map(decode),subjects=(data.subjects||[]).map(decode),rates=(data.rates||[]).map(decode);
 return(data.lessons||[]).map(decode).filter((lesson:{id:string;session:string|null;actualStart:string|null;start:string;status:string;attendance:string|null;subject:string})=>{
  const session=sessions.find((s:{id:string})=>s.id===lesson.session);
  const future=lesson.status!=='cancelled'&&session?.status!=='cancelled'&&!session?.start&&!lesson.actualStart&&(session?.teaching==='pending'||lesson.status==='scheduled'||['pending','scheduled'].includes(lesson.attendance||''))&&Date.parse(lesson.start)>asOf;
  if(!future)return false;
  const exact=lines.find(line=>line.lessonId===lesson.id);
  if(scope==='monthly'&&exact?.mode==='month'&&exact.includedSessions!=null&&exact.status!=='pending')return false;
  // A known other-scope future lesson does not prevent independent invoicing.
  // Ambiguous legacy labels remain a blocker rather than guessing a rate.
  const matches=subjects.filter((s:{key:string;subject:string})=>session?.classSubject? s.key.endsWith(':'+session.classSubject):s.subject.trim().toLowerCase()===lesson.subject.trim().toLowerCase());
  const day=new Date(Date.parse(lesson.start)+8*3600000).toISOString().slice(0,10),rate=matches.length===1?rates.filter((r:{key:string;date:string})=>r.key===matches[0].key&&r.date<=day).sort((a:{date:string;rev:number},b:{date:string;rev:number})=>b.date.localeCompare(a.date)||b.rev-a.rev)[0]:null;
  if(scope==='monthly'&&rate&&rate.mode!=='month')return false;
  if(scope==='hourly'&&rate?.mode==='month')return false;
  return true;
 }).length;
}
export function invoiceScopeLocks(scope:InvoiceBillingScope,studentId:string,lines:BillingLine[],basis:string){
 const locks=new Map<string,{type:string;id:string}>(),add=(type:string,id:string|null|undefined)=>{if(id)locks.set(type+':'+id,{type,id});};
 if(scope==='all')add('student_month',studentId);
 for(const line of lines){add('billing_line',line.id);add('rate',line.rateVersionId);if(scope!=='monthly'){add('lesson',line.lessonId);add('session',line.sessionId);}}
 if(scope!=='monthly'){
  const lessons=(JSON.parse(basis).lessons||[]).map((v:unknown)=>typeof v==='string'?JSON.parse(v):v) as {id:string;session:string|null;replacement:string|null}[],selected=new Set(lines.map(line=>line.lessonId).filter(Boolean));
  if(scope==='all')for(const lesson of lessons)selected.add(lesson.id);
  else{let changed=true;while(changed){changed=false;for(const lesson of lessons)if(selected.has(lesson.id)||lesson.replacement&&selected.has(lesson.replacement)||lessons.some(other=>selected.has(other.id)&&other.replacement===lesson.id)){if(!selected.has(lesson.id)){selected.add(lesson.id);changed=true;}}}}
  for(const lesson of lessons)if(selected.has(lesson.id)){add('lesson',lesson.id);add('session',lesson.session);}
 }
 return[...locks.values()];
}
