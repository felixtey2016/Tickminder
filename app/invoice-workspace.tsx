"use client";
import {usePageHistoryState} from '@/lib/page-history';


import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {readApiJson,showActionToast} from '@/lib/action-feedback';
import {getLanguage,t} from '@/lib/i18n';
import {formatDurationSeconds} from '@/lib/duration-format';
import type {InvoiceAddition,InvoiceDetail,InvoiceDocument,InvoiceList,InvoiceSummary} from '@/lib/invoice';
import {invoiceLessonCancelled} from '@/lib/invoice';
import type {InvoiceInstitutionSnapshot} from '@/lib/invoice-settings';

type Operation={signature:string;id:string}|null;
type StudentPage={items:{studentId:string;student:string}[];total:number;page:number;pages:number};
type SettingsResponse={settings:InvoiceInstitutionSnapshot;canManage:boolean;logoUploadAvailable:boolean};
type EditableAddition=Omit<InvoiceAddition,'amountCents'>&{amount:string};
export type InvoiceWorkspaceProps={
  view?:'invoices'|'settings';canView?:boolean;canCreate?:boolean;canEdit?:boolean;canIssue?:boolean;
  canManageSettings?:boolean;canViewBilling?:boolean;onBilling:()=>void;initialStudentId?:string;initialStudentName?:string;initialMonth?:string;
};
const blockerText:Record<string,string>={
  missing_policy:'尚未确认计费规则',missing_rate:'未设置该日期的费率',subject_unmatched:'课程科目尚未对应收费设置',
  attendance_unreviewed:'考勤尚未复核',attendance_pending:'考勤尚未登记',teaching_incomplete:'授课情况尚未确认',
  invalid_attendance_duration:'实际授课时长需要核对',charge_decision_pending:'本课是否收费尚未确认',replacement_pending:'原课或补课尚未完成复核',
  replacement_charge_conflict:'原课与补课收费需要核对',monthly_attendance_pending:'本月尚有考勤或收费决定待核对',
  monthly_partial_review:'月中加入、暂停或退课，请确认整月费用或调整金额',monthly_enrolment_unconfirmed:'本月在读期间需要人工确认',
  monthly_exception_review:'本月有老师缺席或已确认免收费的课次，请核对固定月费金额',adjustment_stale:'计费依据已改变，请重新核对调整金额',
  adjustment_requires_review:'调整金额需要重新核对',source_changed:'invoice.sourceChanged',future_lessons_pending:'invoice.upcoming',
};
const money=(cents:number)=>new Intl.NumberFormat(getLanguage()==='zh'?'zh-MY':'en-MY',{style:'currency',currency:'MYR'}).format(cents/100);
const currentMonth=()=>new Date(Date.now()+8*3600_000).toISOString().slice(0,7);
const validMonth=(value:string)=>/^20\d\d-(?:0[1-9]|1[0-2])$/.test(value);
const date=(value:string|null)=>value?new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'short',day:'numeric'}).format(new Date(value.length===10?value+'T00:00:00+08:00':value)):'—';
const errorMessage=(error:unknown)=>error instanceof Error?error.message:t('invoice.requestFailed');
function operationBody(value:Record<string,unknown>,pending:{current:Operation}){
  const signature=JSON.stringify(value);if(pending.current?.signature!==signature)pending.current={signature,id:crypto.randomUUID()};
  return {...value,operationId:pending.current.id};
}
async function getJSON<T>(url:string,signal?:AbortSignal):Promise<T>{
  const response=await groupFetch(url,{cache:'no-store',signal}),data=await readApiJson<T&{error?:string}>(response);
  if(!response.ok)throw Object.assign(Error(t(data.error||'invoice.requestFailed')),{status:response.status});return data;
}
async function mutate(value:Record<string,unknown>,pending:{current:Operation}){
  const response=await groupFetch('/api/invoices',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(operationBody(value,pending))});
  const data=await readApiJson<{ok?:boolean;invoiceId?:string;error?:string}>(response);
  if(!response.ok)throw Object.assign(Error(t(data.error||'invoice.requestFailed')),{status:response.status});pending.current=null;return data;
}
function PrintButton({id,draft=false,disabled=false}:{id:string;draft?:boolean;disabled?:boolean}){
  return <Button type="button" variant="outline" disabled={disabled} onClick={()=>{
    const opened=window.open('/api/invoices/'+encodeURIComponent(id)+'/print?'+new URLSearchParams({lang:getLanguage(),lessons:'1'}),'_blank');
    if(opened)opened.opener=null;else showActionToast('error','invoice.printBlocked');
  }}>{t(draft?'invoice.preview.draft':'invoice.print')}</Button>;
}
function Notice({message,onRetry}:{message:string;onRetry?:()=>void}){return <div role="alert" className="invoice-notice invoice-notice-error"><p>{message}</p>{onRetry&&<Button type="button" variant="outline" onClick={onRetry}>{t('invoice.reload')}</Button>}</div>;}
function AmountSummary({invoice}:{invoice:InvoiceDocument}){
  const charges=invoice.additions.filter(item=>item.kind==='charge').reduce((sum,item)=>sum+item.amountCents,0);
  return <dl className="invoice-totals"><div><dt>{t('invoice.subtotal')}</dt><dd>{money(invoice.subtotalCents-charges)}</dd></div>{charges>0&&<div><dt>{t('invoice.charges')}</dt><dd>{money(charges)}</dd></div>}{invoice.discountCents>0&&<div><dt>{t('invoice.discounts')}</dt><dd>− {money(invoice.discountCents)}</dd></div>}<div className="invoice-total"><dt>{t('invoice.total')}</dt><dd>{money(invoice.totalCents)}</dd></div></dl>;
}
function IssueDialog({invoice,busy,onClose,onConfirm}:{invoice:InvoiceDocument;busy:boolean;onClose:()=>void;onConfirm:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();return()=>{ref.current?.close();};},[]);
  return <dialog ref={ref} className="invoice-dialog" aria-labelledby="invoice-issue-heading" onCancel={event=>{if(busy)event.preventDefault();else onClose();}}>
    <div className="invoice-dialog-body"><h3 id="invoice-issue-heading">{t('invoice.issue.heading')}</h3><p>{t('invoice.issue.description')}</p>
      <dl className="invoice-confirm-details"><div><dt>{t('invoice.student')}</dt><dd>{invoice.student.name}</dd></div><div><dt>{t('invoice.month')}</dt><dd>{invoice.month}</dd></div><div><dt>{t('invoice.dueDate')}</dt><dd>{date(invoice.dueDate)}</dd></div></dl>
      <AmountSummary invoice={invoice}/><p className="invoice-notice">{t('invoice.issue.lock')}</p>
      <div className="invoice-actions"><Button type="button" variant="outline" autoFocus disabled={busy} onClick={onClose}>{t('invoice.cancel')}</Button><Button type="button" disabled={busy} onClick={onConfirm}>{t(busy?'invoice.issuing':'invoice.issue.confirm')}</Button></div>
    </div>
  </dialog>;
}

function InvoiceEditor({detail,canEdit,canIssue,canViewBilling,onBilling,onChanged,onDirtyChange}:{detail:InvoiceDetail;canEdit:boolean;canIssue:boolean;canViewBilling:boolean;onBilling:()=>void;onChanged:()=>void;onDirtyChange:(dirty:boolean)=>void}){
  const invoice=detail.invoice,isDraft=invoice.status==='draft',visibleSourceLines=invoice.sourceLines.filter(line=>!invoiceLessonCancelled(line));
  const [dueDate,setDueDate]=useState(invoice.dueDate),[notes,setNotes]=useState(invoice.notes),[additions,setAdditions]=useState<EditableAddition[]>(()=>invoice.additions.map(({amountCents,...item})=>({...item,amount:(amountCents/100).toFixed(2)})));
  const [error,setError]=useState(''),[busy,setBusy]=useState(''),[confirm,setConfirm]=useState(false),[stale,setStale]=useState(false);
  const pending=useRef<Operation>(null);
  const dirty=dueDate!==invoice.dueDate||notes!==invoice.notes||JSON.stringify(additions)!==JSON.stringify(invoice.additions.map(({amountCents,...item})=>({...item,amount:(amountCents/100).toFixed(2)})));
  useEffect(()=>{onDirtyChange(dirty);const prevent=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};const navigate=(event:Event)=>{if(dirty&&!window.confirm(t('invoice.discardChanges')))event.preventDefault();};window.addEventListener('beforeunload',prevent);window.addEventListener('tickminder-navigate',navigate);return()=>{window.removeEventListener('beforeunload',prevent);window.removeEventListener('tickminder-navigate',navigate);};},[dirty,onDirtyChange]);
  const editedCharges=additions.filter(item=>item.kind==='charge').reduce((sum,item)=>sum+(Number.isFinite(Number(item.amount))?Math.round(Number(item.amount)*100):0),0);
  const editedDiscounts=additions.filter(item=>item.kind==='discount').reduce((sum,item)=>sum+(Number.isFinite(Number(item.amount))?Math.round(Number(item.amount)*100):0),0);
  const editedTotal=invoice.sourceLines.reduce((sum,line)=>sum+(line.amountCents??0),0)+editedCharges-editedDiscounts;
  async function action(kind:'save'|'refresh'|'issue'){
    if(busy)return;setError('');
    let parsed:InvoiceAddition[]=[];
    if(kind==='save'){
      if(additions.some(item=>!item.label.trim()||!item.reason.trim()||!/^\d{1,7}(?:\.\d{1,2})?$/.test(item.amount.trim())||Number(item.amount)<=0)){setError(t('invoice.additionInvalid'));return;}
      parsed=additions.map(({amount,...item})=>({...item,label:item.label.trim(),reason:item.reason.trim(),amountCents:Math.round(Number(amount)*100)}));
    }
    setBusy(kind);
    try{await mutate({action:kind,invoiceId:invoice.id,revision:invoice.revision,...(kind==='save'?{dueDate,notes,additions:parsed}:{}),...(kind==='issue'?{expectedSourceHash:invoice.sourceHash}:{})},pending);setConfirm(false);showActionToast('success',kind==='save'?'invoice.saved':kind==='refresh'?'invoice.refreshed':'invoice.issued');onChanged();}
    catch(e){setError(errorMessage(e));if((e as {status?:number}).status===409){setStale(true);setConfirm(false);}}
    finally{setBusy('');}
  }
  function add(kind:InvoiceAddition['kind']){setAdditions(items=>[...items,{id:crypto.randomUUID(),kind,label:'',amount:'',reason:''}]);}
  const blockers=[...new Set(detail.review.blockers)].filter(code=>code!=='source_changed');
  return <div className="invoice-document-editor">
    <section className="panel invoice-document-header"><div className="invoice-heading"><div><span className={'invoice-badge invoice-badge-'+invoice.status}>{t('invoice.status.'+invoice.status)}</span><h2>{invoice.number||t('invoice.draft')}</h2><p>{invoice.student.name} · {invoice.month}</p><small>{invoice.number?t('invoice.issuedAt')+' · '+date(invoice.issuedAt):t('invoice.numberPending')}</small></div><div className="invoice-actions"><PrintButton id={invoice.id} draft={isDraft} disabled={dirty||!!busy}/></div></div>
      {!isDraft&&<p className="invoice-notice">{t('invoice.issued.readonly')}</p>}
      <dl className="invoice-summary"><div><dt>{t('invoice.lessons')}</dt><dd>{invoice.lessonCount}</dd></div><div><dt>{t('invoice.duration')}</dt><dd>{formatDurationSeconds(invoice.durationSeconds,getLanguage())}</dd></div><div><dt>{t('invoice.total')}</dt><dd>{money(invoice.totalCents)}</dd></div></dl>
    </section>
    {isDraft&&<section className="panel invoice-review"><h3>{t(blockers.length||detail.review.sourceChanged?'invoice.blocked':'invoice.review.heading')}</h3>{detail.review.sourceChanged&&<p className="invoice-notice">{t('invoice.sourceChanged')}</p>}{blockers.length>0?<ul>{blockers.map(code=><li key={code}>{t(blockerText[code]||'此项计费依据需要核对')}</li>)}</ul>:!detail.review.sourceChanged&&<p>{t('invoice.clear')}</p>}<div className="invoice-actions">{canViewBilling&&<Button type="button" variant="outline" onClick={onBilling}>{t('invoice.toBilling')}</Button>}{canEdit&&<Button type="button" variant="outline" disabled={!!busy||dirty} onClick={()=>void action('refresh')}>{t(busy==='refresh'?'invoice.saving':'invoice.refreshDraft')}</Button>}</div>{!canViewBilling&&blockers.length>0&&<p className="invoice-muted">{t('invoice.contactManager')}</p>}{canEdit&&<small>{t('invoice.refreshDescription')}</small>}</section>}
    {error&&<Notice message={error} onRetry={stale?onChanged:undefined}/>}
    <section className="panel"><h3>{t('invoice.fees')}</h3><div className="invoice-fee-lines">{invoice.lines.filter(line=>line.lessonCount>0||line.amountCents!==0||line.mode==='month').map(line=><article className="invoice-fee-line" key={line.id}><div><strong>{line.subject}</strong><div className="invoice-line-meta"><span>{t('invoice.lessons')} · {line.lessonCount}</span><span>{formatDurationSeconds(line.durationSeconds,getLanguage())}</span></div>{line.description&&<p>{line.description}</p>}</div><strong>{money(line.amountCents)}</strong></article>)}</div><p className="invoice-muted">{t('invoice.sourceNotice')}</p>
      <details className="invoice-source"><summary>{t('invoice.source')}</summary><div className="invoice-source-lines">{visibleSourceLines.map(line=><article key={line.id}><strong>{line.date} · {line.subject}</strong><div className="invoice-line-meta">{line.classroomTitle&&<span>{line.classroomTitle}</span>}{line.teacherName&&<span>{line.teacherName}</span>}<span>{t('invoice.durationLabel')} · {formatDurationSeconds(line.billableSeconds,getLanguage())}</span><span>{line.amountCents==null?t('待核对'):money(line.amountCents)}</span></div>{line.adjustment&&<p>{line.adjustment.reason}</p>}{line.warnings.length>0&&<ul>{line.warnings.map(code=><li key={code}>{t(blockerText[code]||'此项计费依据需要核对')}</li>)}</ul>}</article>)}{!visibleSourceLines.length&&<p>{t('invoice.sourceEmpty')}</p>}</div></details>
    </section>
    {isDraft&&canEdit?<form className="panel invoice-draft-form" onSubmit={event=>{event.preventDefault();void action('save');}}><fieldset disabled={!!busy||stale} className="invoice-editable-fields">
      <h3>{t('invoice.additions')}</h3><p>{t('invoice.additionsDescription')}</p>
      <div className="invoice-additions">{additions.map((item,index)=><fieldset key={item.id} className="invoice-addition"><legend>{t(item.kind==='discount'?'invoice.discount':'invoice.charge')} {index+1}</legend><div className="invoice-form-grid"><label>{t('invoice.lineLabel')}<input required maxLength={150} value={item.label} list={item.kind==='charge'?'invoice-charge-labels':undefined} onChange={e=>setAdditions(items=>items.map(row=>row.id===item.id?{...row,label:e.target.value}:row))}/></label><label>{t('invoice.money')}<input required type="text" inputMode="decimal" maxLength={11} value={item.amount} onChange={e=>setAdditions(items=>items.map(row=>row.id===item.id?{...row,amount:e.target.value}:row))}/></label></div><label>{t('invoice.reason')}<textarea required maxLength={1000} value={item.reason} onChange={e=>setAdditions(items=>items.map(row=>row.id===item.id?{...row,reason:e.target.value}:row))}/></label><div className="invoice-actions"><Button type="button" variant="outline" onClick={()=>setAdditions(items=>items.filter(row=>row.id!==item.id))}>{t('invoice.remove')}</Button></div></fieldset>)}</div>
      <datalist id="invoice-charge-labels">{['invoice.materials','invoice.registration','invoice.other'].map(key=><option key={key} value={t(key)}/>)}</datalist>
      <div className="invoice-actions"><Button type="button" variant="outline" disabled={additions.length>=50||!!busy} onClick={()=>add('charge')}>{t('invoice.addCharge')}</Button><Button type="button" variant="outline" disabled={additions.length>=50||!!busy} onClick={()=>add('discount')}>{t('invoice.addDiscount')}</Button></div>
      <div className="invoice-form-grid"><label>{t('invoice.dueDate')}<input type="date" required value={dueDate} onChange={event=>setDueDate(event.target.value)}/></label></div><label>{t('invoice.notes')}<textarea maxLength={2000} value={notes} onChange={event=>setNotes(event.target.value)}/><small>{t('invoice.notesHint')}</small></label>
      {dirty&&<><p className="invoice-notice">{t('invoice.unsaved')}</p><dl className="invoice-totals"><div><dt>{t('invoice.editedTotal')}</dt><dd>{money(editedTotal)}</dd></div></dl>{editedTotal<0&&<p role="alert" className="invoice-notice invoice-notice-error">{t('invoice.invalidTotal')}</p>}</>}<div className="invoice-actions"><Button disabled={!!busy||stale||!dirty||editedTotal<0}>{t(busy==='save'?'invoice.saving':'invoice.save')}</Button></div></fieldset>
    </form>:<section className="panel"><h3>{t('invoice.additions')}</h3>{invoice.additions.map(item=><div className="invoice-readonly-addition" key={item.id}><div><strong>{item.label}</strong><p>{item.reason}</p></div><strong>{item.kind==='discount'?'− ':''}{money(item.amountCents)}</strong></div>)}<dl className="invoice-confirm-details"><div><dt>{t('invoice.dueDate')}</dt><dd>{date(invoice.dueDate)}</dd></div></dl>{invoice.notes&&<p className="invoice-preserve-space">{invoice.notes}</p>}</section>}
    <section className="panel invoice-final-section"><AmountSummary invoice={invoice}/>{isDraft&&canIssue&&<div className="invoice-actions"><Button type="button" disabled={!!busy||dirty||stale||detail.review.sourceChanged||blockers.length>0} onClick={()=>setConfirm(true)}>{t('invoice.issue')}</Button></div>}{!isDraft&&<p className="invoice-muted">{t('invoice.printHint')}</p>}</section>
    {confirm&&<IssueDialog invoice={invoice} busy={busy==='issue'} onClose={()=>setConfirm(false)} onConfirm={()=>void action('issue')}/>}
  </div>;
}

function InvoiceCard({invoice,onOpen,onDelete,busy}:{invoice:InvoiceSummary;onOpen:()=>void;onDelete?:()=>void;busy?:boolean}){return <article className="invoice-list-card"><div><span className={'invoice-badge invoice-badge-'+invoice.status}>{t('invoice.status.'+invoice.status)}</span><h3>{invoice.student}</h3><p>{invoice.number||t('invoice.numberPending')}</p><div className="invoice-line-meta"><span>{invoice.month}</span><span>{t('invoice.lessons')} · {invoice.lessonCount}</span><span>{formatDurationSeconds(invoice.durationSeconds,getLanguage())}</span></div></div><div className="invoice-card-actions"><strong>{money(invoice.totalCents)}</strong><Button type="button" variant="outline" onClick={onOpen}>{t('invoice.open')}</Button>{onDelete&&<Button type="button" variant="destructive" disabled={busy} onClick={onDelete}>{t(busy?'invoice.deleting':'invoice.deleteDraft')}</Button>}</div></article>;}

export default function InvoiceWorkspace({view='invoices',canView=true,canCreate=false,canEdit=false,canIssue=false,canManageSettings=false,canViewBilling=true,onBilling,initialStudentId,initialStudentName,initialMonth}:InvoiceWorkspaceProps){
  const [month,setMonth]=useState(initialMonth&&validMonth(initialMonth)?initialMonth:currentMonth()),[status,setStatus]=useState(''),[page,setPage]=useState(1),[version,setVersion]=useState(0);
  const [list,setList]=useState<InvoiceList|null>(null),[items,setItems]=useState<InvoiceSummary[]>([]),[loading,setLoading]=useState(false),[listError,setListError]=useState('');
  const [invoiceId,setInvoiceId,replaceInvoiceId]=usePageHistoryState('invoice.detail',''),[detail,setDetail]=useState<InvoiceDetail|null>(null),[detailVersion,setDetailVersion]=useState(0),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState('');
  const [editorDirty,setEditorDirty]=useState(false);
  const [creating,setCreating]=useState(false),[createOpen,setCreateOpen]=useState(Boolean(initialStudentId)),[studentId,setStudentId]=useState(initialStudentId||''),[createError,setCreateError]=useState('');
  const [students,setStudents]=useState<StudentPage['items']>([]),[studentPage,setStudentPage]=useState(1),[studentPages,setStudentPages]=useState(0),[studentsLoading,setStudentsLoading]=useState(false),[studentError,setStudentError]=useState('');
  const [deleteBusy,setDeleteBusy]=useState('');const deleteOperation=useRef<Operation>(null);
  const createOperation=useRef<Operation>(null),detailSection=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(initialStudentId){setStudentId(initialStudentId);setCreateOpen(true);setInvoiceId('');if(initialMonth&&validMonth(initialMonth))setMonth(initialMonth);}},[initialStudentId,initialMonth]);
  useEffect(()=>{
    if(view!=='invoices'||!canView||invoiceId)return;const controller=new AbortController();setLoading(true);setListError('');
    void getJSON<InvoiceList>('/api/invoices?'+new URLSearchParams({month,page:String(page),...(status?{status}:{})}),controller.signal).then(data=>{if(controller.signal.aborted)return;setList(data);setItems(old=>page===1?data.items:[...old,...data.items.filter(item=>!old.some(row=>row.id===item.id))]);}).catch(error=>{if(!controller.signal.aborted)setListError(errorMessage(error));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();
  },[view,canView,month,status,page,version,invoiceId]);
  useEffect(()=>{
    if(view!=='invoices'||!createOpen||!canCreate)return;const controller=new AbortController();setStudentsLoading(true);setStudentError('');
    void getJSON<StudentPage>('/api/invoices?'+new URLSearchParams({view:'students',month,page:String(studentPage)}),controller.signal).then(data=>{if(controller.signal.aborted)return;setStudents(old=>studentPage===1?data.items:[...old,...data.items.filter(item=>!old.some(row=>row.studentId===item.studentId))]);setStudentPages(data.pages);}).catch(error=>{if(!controller.signal.aborted)setStudentError(errorMessage(error));}).finally(()=>{if(!controller.signal.aborted)setStudentsLoading(false);});return()=>controller.abort();
  },[view,createOpen,canCreate,month,studentPage,version]);
  useEffect(()=>{
    if(!invoiceId||view!=='invoices'||!canView)return;const controller=new AbortController();setDetailLoading(true);setDetailError('');setDetail(null);
    void getJSON<InvoiceDetail>('/api/invoices?'+new URLSearchParams({id:invoiceId}),controller.signal).then(data=>{if(!controller.signal.aborted)setDetail(data);}).catch(error=>{if(!controller.signal.aborted)setDetailError(errorMessage(error));}).finally(()=>{if(!controller.signal.aborted)setDetailLoading(false);});return()=>controller.abort();
  },[invoiceId,detailVersion,view,canView]);
  useEffect(()=>{if(invoiceId){detailSection.current?.focus({preventScroll:true});detailSection.current?.scrollIntoView({behavior:'smooth',block:'start'});}},[invoiceId]);
  function refreshList(){setPage(1);setVersion(value=>value+1);}
  async function deleteDraft(invoice:InvoiceSummary|InvoiceDocument){if(!canEdit||deleteBusy||invoice.status!=='draft')return;if(!window.confirm(t('invoice.deleteConfirm')))return;setDeleteBusy(invoice.id);try{await mutate({action:'delete',invoiceId:invoice.id,revision:invoice.revision},deleteOperation);setEditorDirty(false);if(invoiceId===invoice.id){replaceInvoiceId('');setDetail(null);}refreshList();showActionToast('success','invoice.deleted');}catch(error){showActionToast('error',errorMessage(error));}finally{setDeleteBusy('');}}
  async function generate(event:FormEvent){event.preventDefault();if(creating)return;if(!studentId){setCreateError(t('invoice.studentMissing'));return;}setCreating(true);setCreateError('');try{const result=await mutate({action:'generate',studentId,month},createOperation);if(!result.invoiceId)throw Error(t('invoice.requestFailed'));setInvoiceId(result.invoiceId);setDetailVersion(value=>value+1);setCreateOpen(false);refreshList();showActionToast('success','invoice.created');}catch(error){setCreateError(errorMessage(error));}finally{setCreating(false);}}
  if(view==='settings')return <InstitutionSettings canManage={canManageSettings}/>;
  if(!canView)return <p className="invoice-notice">{t('invoice.noPermission')}</p>;
  return <div className="invoice-workspace">
    {invoiceId?<div ref={detailSection} tabIndex={-1} className="invoice-detail-region"><div className="invoice-actions"><Button type="button" variant="outline" onClick={()=>{if(editorDirty&&!window.confirm(t('invoice.discardChanges')))return;setEditorDirty(false);setInvoiceId('');setDetail(null);refreshList();}}>{t('invoice.back')}</Button>{canEdit&&detail?.invoice.status==='draft'&&<Button type="button" variant="destructive" disabled={!!deleteBusy} onClick={()=>void deleteDraft(detail.invoice)}>{t(deleteBusy?'invoice.deleting':'invoice.deleteDraft')}</Button>}</div>{detailLoading?<p role="status">{t('invoice.loading')}</p>:detailError?<Notice message={detailError} onRetry={()=>setDetailVersion(value=>value+1)}/>:detail&&<InvoiceEditor key={detail.invoice.id+':'+detail.invoice.revision+':'+detailVersion} detail={detail} canEdit={canEdit} canIssue={canIssue} canViewBilling={canViewBilling} onDirtyChange={setEditorDirty} onBilling={()=>{if(!editorDirty||window.confirm(t('invoice.discardChanges')))onBilling();}} onChanged={()=>{setEditorDirty(false);setDetailVersion(value=>value+1);refreshList();}}/>}</div>:<>
      <section className="panel"><div className="invoice-heading"><div><h2>{t('invoice.list.title')}</h2><p>{t('invoice.list.description')}</p></div>{canCreate&&<Button type="button" onClick={()=>{setCreateOpen(value=>!value);setCreateError('');}}>{t(createOpen?'invoice.cancel':'invoice.create')}</Button>}</div>
        <div className="invoice-form-grid"><label>{t('invoice.month')}<input type="month" required value={month} onChange={event=>{if(validMonth(event.target.value)){setMonth(event.target.value);setPage(1);setStudentPage(1);setStudentId('');setStudents([]);setItems([]);}}}/></label><label>{t('invoice.status')}<select value={status} onChange={event=>{setStatus(event.target.value);setPage(1);setItems([]);}}><option value="">{t('invoice.status.all')}</option><option value="draft">{t('invoice.status.draft')}</option><option value="issued">{t('invoice.status.issued')}</option></select></label></div>
      </section>
      {createOpen&&canCreate&&<form className="panel invoice-create-form" onSubmit={generate}><h3>{t('invoice.create.heading')}</h3><p>{t('invoice.create.description')}</p><p className="invoice-muted">{t('invoice.month')} · {month}</p><label>{t('invoice.student')}<select required disabled={creating} value={studentId} onChange={event=>setStudentId(event.target.value)}><option value="">{t(studentsLoading&&!students.length?'invoice.loadingStudents':'invoice.chooseStudent')}</option>{studentId===initialStudentId&&!students.some(student=>student.studentId===studentId)&&<option value={studentId}>{initialStudentName||t('invoice.selectedStudent')}</option>}{students.map(student=><option key={student.studentId} value={student.studentId}>{student.student}</option>)}</select></label>{studentError&&<Notice message={studentError} onRetry={()=>setVersion(value=>value+1)}/>}<div className="invoice-actions">{studentPage<studentPages&&!studentError&&<Button type="button" variant="outline" disabled={studentsLoading} onClick={()=>setStudentPage(value=>value+1)}>{t('invoice.loadMore')}</Button>}<Button disabled={creating||!studentId}>{t(creating?'invoice.creating':'invoice.create')}</Button></div>{!studentsLoading&&!students.length&&!studentError&&<p>{t('invoice.emptyStudents')}</p>}{createError&&<Notice message={createError}/>}</form>}
      <section className="panel invoice-list-panel" aria-busy={loading}><div className="invoice-heading"><h3>{t('invoice.nav.invoices')}</h3><Button type="button" variant="outline" disabled={loading} onClick={refreshList}>{t('invoice.refresh')}</Button></div>{listError&&<Notice message={listError} onRetry={refreshList}/>}<div className="invoice-list">{items.map(invoice=><InvoiceCard invoice={invoice} key={invoice.id} onOpen={()=>setInvoiceId(invoice.id)} onDelete={canEdit&&invoice.status==='draft'?()=>void deleteDraft(invoice):undefined} busy={deleteBusy===invoice.id}/>)}</div>{loading&&<p role="status">{t('invoice.loading')}</p>}{!loading&&!items.length&&!listError&&<p className="empty">{t('invoice.empty')}</p>}{list&&items.length>0&&<div className="invoice-load-more"><p>{t('invoice.loaded').replace('{count}',String(items.length)).replace('{total}',String(list.total))}</p>{page<list.pages&&!listError&&<Button type="button" variant="outline" disabled={loading} onClick={()=>setPage(value=>value+1)}>{t('invoice.loadMore')}</Button>}</div>}</section>
    </>}
  </div>;
}

function InvoicePreview({html}:{html:string}){
  const container=useRef<HTMLDivElement>(null),[scale,setScale]=useState(1);
  useEffect(()=>{const element=container.current;if(!element)return;const observer=new ResizeObserver(()=>setScale(Math.min(1,element.clientWidth/794)));observer.observe(element);setScale(Math.min(1,element.clientWidth/794));return()=>observer.disconnect();},[]);
  return <div ref={container} className="invoice-preview-container"><div className="invoice-preview-scaled" style={{height:1123*scale}}><iframe title={t('invoice.preview.title')} sandbox="allow-same-origin" srcDoc={html} style={{width:794,height:1123,transform:`scale(${scale})`}}/></div></div>;
}

function InstitutionSettings({canManage}:{canManage:boolean}){
  const [result,setResult]=useState<SettingsResponse|null>(null),[draft,setDraft]=useState<InvoiceInstitutionSnapshot|null>(null),[version,setVersion]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState(''),[stale,setStale]=useState(false),[html,setHtml]=useState('');
  const file=useRef<HTMLInputElement>(null),photos=useRef<HTMLInputElement>(null),previewAbort=useRef<AbortController|null>(null);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');void getJSON<SettingsResponse>('/api/invoice-settings',controller.signal).then(data=>{if(!controller.signal.aborted){setResult(data);setDraft(data.settings);setStale(false);}}).catch(e=>{if(!controller.signal.aborted)setError(errorMessage(e));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>{controller.abort();previewAbort.current?.abort();};},[version]);
  const editable=canManage&&Boolean(result?.canManage),dirty=!!draft&&JSON.stringify(draft)!==JSON.stringify(result?.settings);
  useEffect(()=>{const navigate=(event:Event)=>{if(dirty&&!window.confirm(t('invoice.settings.discardChanges')))event.preventDefault();};const unload=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};window.addEventListener('tickminder-navigate',navigate);window.addEventListener('beforeunload',unload);return()=>{window.removeEventListener('tickminder-navigate',navigate);window.removeEventListener('beforeunload',unload);};},[dirty]);
  function field<K extends keyof InvoiceInstitutionSnapshot>(key:K,value:InvoiceInstitutionSnapshot[K]){setDraft(current=>current?{...current,[key]:value}:current);setHtml('');}
  async function save(event:FormEvent){event.preventDefault();if(!draft||busy||!editable)return;setBusy('save');setError('');try{const response=await groupFetch('/api/invoice-settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(draft)}),data=await readApiJson<SettingsResponse&{error?:string}>(response);if(!response.ok)throw Object.assign(Error(t(data.error||'invoice.requestFailed')),{status:response.status});setResult(data);setDraft(data.settings);setStale(false);setHtml('');showActionToast('success','invoice.settings.saved');}catch(e){setError(errorMessage(e));if((e as {status?:number}).status===409)setStale(true);}finally{setBusy('');}}
  async function upload(selected:File){
    if(!draft||busy||!editable)return;if(dirty){setError(t('invoice.settings.logoSaveFirst'));return;}if(!/\.png$/i.test(selected.name)){setError(t('invoice.settings.logoInvalid'));return;}
    setBusy('upload');setError('');const body=new FormData();body.set('file',selected);body.set('revision',String(draft.revision));
    try{const response=await groupFetch('/api/invoice-settings/logo',{method:'POST',body}),data=await readApiJson<SettingsResponse&{error?:string}>(response);if(!response.ok)throw Object.assign(Error(t(data.error||'invoice.requestFailed')),{status:response.status});setResult(data);setDraft(data.settings);setHtml('');showActionToast('success','invoice.settings.logoSaved');}catch(e){setError(errorMessage(e));if((e as {status?:number}).status===409)setStale(true);}finally{setBusy('');if(file.current)file.current.value='';if(photos.current)photos.current.value='';}
  }
  async function preview(){if(!draft||busy)return;setBusy('preview');setError('');const controller=new AbortController();previewAbort.current=controller;try{const response=await groupFetch('/api/invoice-settings/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({settings:draft,lang:getLanguage(),lessons:true}),signal:controller.signal});if(!response.ok){const data=await readApiJson<{error?:string}>(response);throw Error(t(data.error||'invoice.requestFailed'));}if(!response.headers.get('content-type')?.includes('text/html'))throw Error(t('invoice.requestFailed'));const value=await response.text();if(!controller.signal.aborted)setHtml(value);}catch(e){if(!controller.signal.aborted)setError(errorMessage(e));}finally{if(!controller.signal.aborted)setBusy('');}}
  if(loading)return <p role="status">{t('invoice.loading')}</p>;
  if(!draft)return <Notice message={error||t('invoice.requestFailed')} onRetry={()=>setVersion(value=>value+1)}/>;
  return <div className="invoice-workspace invoice-settings"><section className="panel"><h2>{t('invoice.settings.title')}</h2><p>{t('invoice.settings.description')}</p>{!editable&&<p className="invoice-notice">{t('invoice.settings.readonly')}</p>}</section>
    <form className="invoice-settings-form" onSubmit={save}>
      <section className="panel"><h3>{t('invoice.settings.institution')}</h3><div className="invoice-form-grid"><label>{t('invoice.settings.name')}<input required maxLength={160} disabled={!editable||!!busy} value={draft.institutionName} onChange={e=>field('institutionName',e.target.value)}/></label><label>{t('invoice.settings.phone')}<input type="tel" maxLength={80} disabled={!editable||!!busy} value={draft.phone} onChange={e=>field('phone',e.target.value)}/></label></div><label>{t('invoice.settings.address')}<textarea maxLength={700} disabled={!editable||!!busy} value={draft.address} onChange={e=>field('address',e.target.value)}/></label><label>{t('invoice.settings.email')}<input type="email" maxLength={200} disabled={!editable||!!busy} value={draft.email} onChange={e=>field('email',e.target.value)}/></label>
        <div className="invoice-logo-section"><h4>{t('invoice.settings.logo')}</h4>{draft.logoAssetId?<img className="invoice-settings-logo" src={'/api/invoice-settings/logo?id='+encodeURIComponent(draft.logoAssetId)} alt={draft.institutionName||t('invoice.settings.logo')}/>:<p className="invoice-muted">{t('invoice.settings.noLogo')}</p>}<p className="invoice-muted">{t('invoice.settings.logoHint')}</p><p className="invoice-muted">{t('invoice.settings.fileHint')}</p>{!result?.logoUploadAvailable?<p className="invoice-notice">{t('invoice.settings.logoUnavailable')}</p>:editable&&<><input className="invoice-file-input" ref={file} type="file" data-testid="invoice-logo-file" aria-label={t('invoice.settings.uploadFile')} onChange={event=>{const selected=event.target.files?.[0];event.target.value="";if(selected)void upload(selected);}}/><input className="invoice-file-input" ref={photos} type="file" accept="image/png,.png" data-testid="invoice-logo-photo" aria-label={t('invoice.settings.uploadPhoto')} onChange={event=>{const selected=event.target.files?.[0];event.target.value="";if(selected)void upload(selected);}}/><div className="invoice-actions"><Button type="button" variant="outline" disabled={!!busy||dirty||stale} onClick={()=>file.current?.click()}>{t(busy==='upload'?'invoice.settings.uploading':'invoice.settings.uploadFile')}</Button><Button type="button" variant="outline" disabled={!!busy||dirty||stale} onClick={()=>photos.current?.click()}>{t('invoice.settings.uploadPhoto')}</Button></div>{dirty&&<small>{t('invoice.settings.logoSaveFirst')}</small>}</>}</div>
      </section>
      <section className="panel"><h3>{t('invoice.settings.template')}</h3><div className="invoice-template-options">{(['standard','centered','brand'] as const).map((template,index)=><label className={'invoice-template-option'+(draft.template===template?' selected':'')} key={template}><input type="radio" name="invoice-template" value={template} checked={draft.template===template} disabled={!editable||!!busy} onChange={()=>field('template',template)}/><span className={'invoice-template-mini invoice-mini-'+template} aria-hidden="true"><i/><b/><em/><em/><em/><strong/></span><span><strong>{String.fromCharCode(65+index)} · {t('invoice.settings.'+template)}</strong><small>{t('invoice.settings.'+template+'Hint')}</small></span></label>)}</div><label className="invoice-color-field">{t('invoice.settings.color')}<input type="color" disabled={!editable||!!busy} value={draft.themeColor} onChange={e=>field('themeColor',e.target.value)}/></label><div className="invoice-actions"><Button type="button" variant="outline" disabled={!!busy} onClick={()=>void preview()}>{t(busy==='preview'?'invoice.settings.previewLoading':'invoice.settings.preview')}</Button></div><p className="invoice-muted">{t('invoice.previewDescription')}</p></section>
      <section className="panel"><h3>{t('invoice.settings.payment')}</h3><div className="invoice-form-grid"><label>{t('invoice.settings.bank')}<input maxLength={160} disabled={!editable||!!busy} value={draft.bankName} onChange={e=>field('bankName',e.target.value)}/></label><label>{t('invoice.settings.beneficiary')}<input maxLength={160} disabled={!editable||!!busy} value={draft.beneficiary} onChange={e=>field('beneficiary',e.target.value)}/></label></div><label>{t('invoice.settings.bankAccount')}<input maxLength={100} disabled={!editable||!!busy} value={draft.bankAccount} onChange={e=>field('bankAccount',e.target.value)}/></label><label>{t('invoice.settings.paymentNote')}<textarea maxLength={1000} disabled={!editable||!!busy} value={draft.paymentNote} onChange={e=>field('paymentNote',e.target.value)}/></label></section>
      <section className="panel"><h3>{t('invoice.settings.defaults')}</h3><div className="invoice-form-grid"><label>{t('invoice.settings.prefix')}<input required maxLength={12} pattern="[A-Za-z][A-Za-z0-9-]{0,11}" disabled={!editable||!!busy} value={draft.invoicePrefix} onChange={e=>field('invoicePrefix',e.target.value)}/><small>{t('invoice.settings.prefixHint')}</small></label><label>{t('invoice.settings.dueDays')}<input type="number" min={0} max={90} required disabled={!editable||!!busy} value={draft.dueDays} onChange={e=>field('dueDays',Number(e.target.value))}/></label></div><label>{t('invoice.settings.invoiceNote')}<textarea maxLength={1000} disabled={!editable||!!busy} value={draft.invoiceNote} onChange={e=>field('invoiceNote',e.target.value)}/></label></section>
      {error&&<Notice message={error} onRetry={stale?()=>setVersion(value=>value+1):undefined}/>}{editable&&<div className="invoice-actions"><Button disabled={!!busy||stale||!dirty}>{t(busy==='save'?'invoice.saving':'invoice.settings.save')}</Button></div>}
    </form>
    {html&&<section className="panel invoice-preview-panel"><div className="invoice-heading"><h3>{t('invoice.preview.title')}</h3><Button type="button" variant="outline" onClick={()=>setHtml('')}>{t('invoice.close')}</Button></div><InvoicePreview html={html}/></section>}
  </div>;
}
