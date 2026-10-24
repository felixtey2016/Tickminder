"use client";

import {useCallback,useEffect,useId,useMemo,useRef,useState,type FormEvent} from 'react';
import {CalendarDays,ExternalLink,Film,Plus,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {actionFailureMessage,readApiJson,showActionToast} from '@/lib/action-feedback';
import {getLanguage,registerTranslations,t} from '@/lib/i18n';
import {recordingsEn,recordingsZh} from '@/lib/recordings-i18n';

registerTranslations(recordingsZh,recordingsEn);

type Status='draft'|'published';
type AudienceMode='classroom'|'selected';
export type RecordingCreateRequest={key:string;classroomId:string;sessionId?:string;lessonDate?:string;title?:string};
type Classroom={id:string;title:string;subject:string;teacherName:string;archived?:boolean|number};
type Session={id:string;plannedStart:string;plannedEnd:string;title?:string};
type Context={classrooms:Classroom[];students:string[];sessions:Session[];permissions:{canCreate:boolean;canEdit:boolean;canDelete:boolean}};
type Recording={id:string;classroomId:string;classroomTitle:string;subject:string;teacherName:string;sessionId:string|null;lessonDate:string;title:string;description:string;driveUrl:string;status:Status;audienceMode:AudienceMode;revision:number;createdAt:string;updatedAt:string;createdBy:string;canEdit:boolean;canDelete:boolean;recipientCount:number;students?:string[]};
type RecordingPage={recordings:Recording[];nextCursor:string|null};
type EditorRequest={id?:string;classroomId?:string;sessionId?:string;lessonDate?:string;title?:string};
type FormValue={classroomId:string;sessionId:string;lessonDate:string;title:string;description:string;driveUrl:string;students:string[];status:Status;audienceMode:AudienceMode};
type Operation={signature:string;id:string}|null;
const currentDate=()=>new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
const lessonDay=(iso:string)=>new Date(new Date(iso).getTime()+8*3600_000).toISOString().slice(0,10);
const countLabel=(key:string,count:number)=>t(key).replace('{count}',String(count));
const recordingText=(zh:string,en:string)=>getLanguage()==='zh'?zh:en;
const dateLabel=(date:string)=>new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'short',day:'numeric'}).format(new Date(date.length===10?date+'T12:00:00+08:00':date));
const sessionLabel=(session:Session)=>dateLabel(session.plannedStart)+' · '+new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(session.plannedStart))+(session.title?' · '+session.title:'');
async function read<T>(url:string,signal?:AbortSignal):Promise<T>{
  const response=await groupFetch(url,{cache:'no-store',signal}),data=await readApiJson<T&{error?:string}>(response);
  if(!response.ok)throw Object.assign(Error(t(data.error||'recordings.failed')),{status:response.status});
  return data;
}
async function write(body:Record<string,unknown>,pending:{current:Operation}){
  const signature=JSON.stringify(body);
  if(pending.current?.signature!==signature)pending.current={signature,id:crypto.randomUUID()};
  const response=await groupFetch('/api/recordings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,operationId:pending.current.id})});
  const result=await readApiJson<{ok:boolean;id:string;revision?:number;error?:string}>(response);
  if(!response.ok)throw Object.assign(Error(t(result.error||'recordings.failed')),{status:response.status});
  pending.current=null;return result;
}
function initialForm(request:EditorRequest):FormValue{return{classroomId:request.classroomId||'',sessionId:request.sessionId||'',lessonDate:request.lessonDate||currentDate(),title:request.title||'',description:'',driveUrl:'',students:[],status:'draft',audienceMode:'classroom'};}

function RecordingEditor({request,onClose,onSaved}:{request:EditorRequest;onClose:()=>void;onSaved:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),formElement=useRef<HTMLFormElement>(null),heading=useId();
  const [form,setForm]=useState<FormValue>(()=>initialForm(request)),[baseline,setBaseline]=useState<FormValue|null>(null);
  const [recording,setRecording]=useState<Recording|null>(null),[context,setContext]=useState<Context|null>(null),[loading,setLoading]=useState(true),[contextLoading,setContextLoading]=useState(false);
  const [error,setError]=useState(''),[contextError,setContextError]=useState(''),[busy,setBusy]=useState(false),[stale,setStale]=useState(false),[retry,setRetry]=useState(0);
  const pending=useRef<Operation>(null),recipientClass=useRef(''),loadedOptions=useRef(''),closed=useRef(false);
  const dirty=baseline!==null&&JSON.stringify(form)!==JSON.stringify(baseline);
  const close=useCallback(()=>{if(busy)return;if(dirty&&!window.confirm(t('recordings.discard')))return;closed.current=true;onClose();},[busy,dirty,onClose]);
  useEffect(()=>{dialog.current?.showModal();return()=>dialog.current?.close();},[]);
  useEffect(()=>{
    const before=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue='';}};
    const navigate=(event:Event)=>{if(busy||(dirty&&!window.confirm(t('recordings.discard'))))event.preventDefault();};
    window.addEventListener('beforeunload',before);window.addEventListener('tickminder-navigate',navigate);
    return()=>{window.removeEventListener('beforeunload',before);window.removeEventListener('tickminder-navigate',navigate);};
  },[dirty,busy]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setContextError('');setStale(false);recipientClass.current='';loadedOptions.current='';
    void(async()=>{
      try{
        let next=initialForm(request);
        if(request.id){const result=await read<{recording:Recording}>('/api/recordings?id='+encodeURIComponent(request.id),controller.signal);if(controller.signal.aborted)return;if(!result.recording.canEdit)throw Error(t('recordings.noPermission'));setRecording(result.recording);next={classroomId:result.recording.classroomId,sessionId:result.recording.sessionId||'',lessonDate:result.recording.lessonDate,title:result.recording.title,description:result.recording.description||'',driveUrl:result.recording.driveUrl,students:result.recording.students||[],status:result.recording.status,audienceMode:result.recording.audienceMode||'classroom'};recipientClass.current=next.classroomId;}
        const options=await read<Context>('/api/recordings?'+new URLSearchParams({view:'context',...(next.classroomId?{classroomId:next.classroomId}:{}),month:next.lessonDate.slice(0,7)}),controller.signal);
        if(controller.signal.aborted)return;
        if(!request.id&&!options.permissions.canCreate)throw Error(t('recordings.noPermission'));
        if(!request.id&&next.classroomId){next.students=options.students||[];recipientClass.current=next.classroomId;}
        loadedOptions.current=next.classroomId+'|'+next.lessonDate.slice(0,7);
        setContext(options);setForm(next);setBaseline(next);setLoading(false);
      }catch(caught){if(!controller.signal.aborted){setError(actionFailureMessage(caught,'recordings.contextFailed'));setLoading(false);}}
    })();return()=>controller.abort();
  },[request,retry]);
  const optionsKey=form.classroomId+'|'+form.lessonDate.slice(0,7);
  useEffect(()=>{
    if(loading||!baseline||!form.classroomId||loadedOptions.current===optionsKey)return;
    const controller=new AbortController();setContextLoading(true);setContextError('');
    void read<Context>('/api/recordings?'+new URLSearchParams({view:'context',classroomId:form.classroomId,month:form.lessonDate.slice(0,7)}),controller.signal).then(next=>{
      if(controller.signal.aborted)return;setContext(next);loadedOptions.current=optionsKey;
      if(recipientClass.current!==form.classroomId){recipientClass.current=form.classroomId;setForm(current=>({...current,students:next.students||[]}));}
    }).catch(caught=>{if(!controller.signal.aborted)setContextError(actionFailureMessage(caught,'recordings.contextFailed'));}).finally(()=>{if(!controller.signal.aborted)setContextLoading(false);});
    return()=>controller.abort();
  },[optionsKey,loading,baseline!==null]);
  const availableStudents=useMemo(()=>[...new Set([...(context?.students||[]),...form.students])].sort((a,b)=>a.localeCompare(b)),[context?.students,form.students]);
  const selectedClass=context?.classrooms.find(item=>item.id===form.classroomId);
  const disabled=loading||contextLoading||busy||stale||!!contextError||!baseline||!!selectedClass?.archived;
  function update<K extends keyof FormValue>(key:K,value:FormValue[K]){setForm(current=>({...current,[key]:value}));}
  async function save(status:Status){
    if(disabled||!formElement.current?.reportValidity())return;
    if(status==='published'&&form.audienceMode==='selected'&&!form.students.length){setError(t('recordings.selectStudents'));return;}
    if(recording?.status==='published'&&status==='draft'&&!window.confirm(t('recordings.unpublishConfirm')))return;
    setBusy(true);setError('');
    try{
      const {students,...fields}=form;
      await write({action:'save',...(recording?{id:recording.id,revision:recording.revision}:{}),...fields,status,...(form.audienceMode==='selected'?{students}:{})},pending);
      showActionToast('success',status==='published'?'recordings.publishedToast':recording?.status==='published'?'recordings.unpublishedToast':'recordings.saved');
      closed.current=true;setBaseline(form);onSaved();onClose();
    }catch(caught){setError(actionFailureMessage(caught,'recordings.failed'));if((caught as {status?:number}).status===409)setStale(true);}
    finally{if(!closed.current)setBusy(false);}
  }
  function submit(event:FormEvent){event.preventDefault();void save(form.status);}
  return <dialog ref={dialog} className="recording-dialog" aria-labelledby={heading} onCancel={event=>{event.preventDefault();close();}}>
    <header className="recording-dialog-header"><div><h2 id={heading}>{t(request.id?'recordings.edit':'recordings.add')}</h2><p>{t('recordings.formDescription')}</p></div><Button type="button" variant="outline" className="recording-close" aria-label={t('recordings.close')} disabled={busy} onClick={close}><X size={19}/></Button></header>
    {loading?<p className="recording-loading" role="status">{t('recordings.contextLoading')}</p>:<form ref={formElement} className="recording-form" onSubmit={submit}>
      {baseline&&<>
        <div className="recording-form-grid"><label>{t('recordings.classroom')}<select required disabled={!!recording||!!request.classroomId||busy} value={form.classroomId} onChange={event=>setForm(current=>({...current,classroomId:event.target.value,sessionId:'',students:[]}))}><option value="">{t('recordings.chooseClass')}</option>{context?.classrooms.filter(item=>!item.archived||item.id===form.classroomId).map(item=><option key={item.id} value={item.id}>{item.title} · {item.subject}</option>)}</select></label><label>{t('recordings.lessonDate')}<input type="date" required value={form.lessonDate} disabled={busy} onChange={event=>setForm(current=>({...current,lessonDate:event.target.value,sessionId:''}))}/></label></div>
        {selectedClass?.archived?<p className="recording-info">{t('recordings.archived')}</p>:null}
        <label>{t('recordings.session')}<select value={form.sessionId} disabled={!form.classroomId||busy||contextLoading} onChange={event=>{const session=context?.sessions.find(item=>item.id===event.target.value);setForm(current=>({...current,sessionId:event.target.value,...(session?{lessonDate:lessonDay(session.plannedStart)}:{})}));}}><option value="">{t('recordings.noSession')}</option>{form.sessionId&&!context?.sessions.some(item=>item.id===form.sessionId)&&<option value={form.sessionId}>{t('recordings.currentSession')}</option>}{context?.sessions.map(session=><option value={session.id} key={session.id}>{sessionLabel(session)}</option>)}</select><small>{t('recordings.sessionHint')}</small></label>
        <label>{t('recordings.videoTitle')}<input required maxLength={200} value={form.title} placeholder={t('recordings.titlePlaceholder')} disabled={busy} onChange={event=>update('title',event.target.value)}/></label>
        <label>{t('recordings.link')}<input type="url" required maxLength={2000} autoComplete="off" inputMode="url" value={form.driveUrl} placeholder={t('recordings.linkPlaceholder')} disabled={busy} onChange={event=>update('driveUrl',event.target.value)}/><small>{t('recordings.linkHint')}</small></label>
        <label>{t('recordings.descriptionLabel')}<textarea rows={3} maxLength={4000} value={form.description} placeholder={t('recordings.descriptionPlaceholder')} disabled={busy} onChange={event=>update('description',event.target.value)}/></label>
        <label>{t('recordings.audience')}<select value={form.audienceMode} disabled={busy} onChange={event=>{const audienceMode=event.target.value as AudienceMode;setForm(current=>({...current,audienceMode,...(audienceMode==='selected'?{students:context?.students||[]}:{})}));}}><option value="classroom">{t('recordings.audienceClassroom')}</option><option value="selected">{t('recordings.audienceSelected')}</option></select><small>{t(form.audienceMode==='classroom'?'recordings.classroomHint':'recordings.recipientsHint')}</small></label>{form.audienceMode==='selected'&&<fieldset className="recording-recipients" disabled={!form.classroomId||busy||contextLoading}><legend>{t('recordings.recipients')}</legend><p>{t('recordings.recipientsHint')}</p><div className="recording-recipient-toolbar"><span>{countLabel('recordings.selected',form.students.length)}</span><div className="recording-actions"><Button type="button" size="sm" variant="outline" disabled={!availableStudents.length} onClick={()=>update('students',context?.students||[])}>{t('recordings.selectAll')}</Button><Button type="button" size="sm" variant="outline" disabled={!form.students.length} onClick={()=>update('students',[])}>{t('recordings.clearSelection')}</Button></div></div>{contextLoading?<p role="status">{t('recordings.contextLoading')}</p>:availableStudents.length?<div className="recording-student-list">{availableStudents.map(name=><label key={name}><input type="checkbox" checked={form.students.includes(name)} onChange={event=>update('students',event.target.checked?[...form.students,name]:form.students.filter(item=>item!==name))}/><span>{name}{!context?.students.includes(name)&&<small className="recording-former-student">{t('recordings.formerStudent')}</small>}</span></label>)}</div>:<p>{form.classroomId?t('recordings.noStudents'):t('recordings.chooseClass')}</p>}</fieldset>}
        <p className="recording-caption">{t('recordings.caption')}</p>
      </>}
      {(error||contextError)&&<div className="recording-error" role="alert"><p>{stale?t('recordings.stale'):error||contextError}</p>{(stale||!baseline||contextError)&&<Button type="button" variant="outline" disabled={busy} onClick={()=>{if(!dirty||window.confirm(t('recordings.discard')))setRetry(value=>value+1);}}>{t('recordings.reload')}</Button>}</div>}
      <footer className="recording-dialog-actions"><Button type="button" variant="outline" disabled={busy} onClick={close}>{t('recordings.cancel')}</Button>{baseline&&<><Button type="button" variant="outline" disabled={disabled} onClick={()=>void save('draft')}>{t(busy?'recordings.saving':recording?.status==='published'?'recordings.unpublish':'recordings.saveDraft')}</Button><Button type="button" disabled={disabled||!form.classroomId} onClick={()=>void save('published')}>{t(busy?'recordings.saving':recording?.status==='published'?'recordings.saveChanges':'recordings.publish')}</Button></>}</footer>
    </form>}
  </dialog>;
}

export function RecordingCreateButton({classroomId,sessionId,lessonDate,title,onChanged}:{classroomId:string;sessionId?:string;lessonDate?:string;title?:string;onChanged?:()=>void}){
  const [editor,setEditor]=useState<EditorRequest|null>(null);
  return <><Button type="button" size="sm" variant="outline" onClick={()=>setEditor({classroomId,sessionId,lessonDate,title})}><Film size={16}/>{t('recordings.lessonShortcut')}</Button>{editor&&<RecordingEditor request={editor} onClose={()=>setEditor(null)} onSaved={()=>onChanged?.()}/>}</>;
}

export function RecordingsWorkspace({classroomId,createRequest,onCreateRequestHandled}:{classroomId?:string;createRequest?:RecordingCreateRequest|null;onCreateRequestHandled?:()=>void}){
  const [context,setContext]=useState<Context|null>(null),[contextError,setContextError]=useState(''),[records,setRecords]=useState<Recording[]>([]),[cursor,setCursor]=useState<string|null>(null),[loading,setLoading]=useState(true),[loadingMore,setLoadingMore]=useState(false),[error,setError]=useState('');
  const [draftFilters,setDraftFilters]=useState({q:'',classroomId:'',subject:'',month:'',status:''}),[filters,setFilters]=useState(draftFilters),[revision,setRevision]=useState(0),[editor,setEditor]=useState<EditorRequest|null>(null),[deleting,setDeleting]=useState('');
  const pending=useRef<Operation>(null),requestSequence=useRef(0),handledCreate=useRef('');
  const query=useMemo(()=>new URLSearchParams({...filters,classroomId:classroomId||filters.classroomId}),[filters,classroomId]);
  useEffect(()=>{
    const controller=new AbortController();setContextError('');setContext(null);
    void read<Context>('/api/recordings?'+new URLSearchParams({view:'context',...(classroomId?{classroomId}:{})}),controller.signal).then(value=>{if(!controller.signal.aborted)setContext(value);}).catch(caught=>{if(!controller.signal.aborted)setContextError(actionFailureMessage(caught,'recordings.contextFailed'));});
    return()=>controller.abort();
  },[classroomId,revision]);
  useEffect(()=>{
    const controller=new AbortController(),id=++requestSequence.current;setLoading(true);setLoadingMore(false);setError('');setRecords([]);setCursor(null);
    void read<RecordingPage>('/api/recordings?'+query,controller.signal).then(value=>{if(!controller.signal.aborted&&id===requestSequence.current){setRecords(value.recordings);setCursor(value.nextCursor);}}).catch(caught=>{if(!controller.signal.aborted)setError(actionFailureMessage(caught,'recordings.loadFailed'));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[query,revision]);
  useEffect(()=>{if(createRequest&&context?.permissions.canCreate&&handledCreate.current!==createRequest.key){handledCreate.current=createRequest.key;setEditor(createRequest);onCreateRequestHandled?.();}},[createRequest,context,onCreateRequestHandled]);
  async function loadMore(){
    if(!cursor||loadingMore||loading)return;const sequence=requestSequence.current;setLoadingMore(true);setError('');
    try{const result=await read<RecordingPage>('/api/recordings?'+new URLSearchParams({...Object.fromEntries(query),cursor}));if(sequence!==requestSequence.current)return;setRecords(current=>[...current,...result.recordings.filter(item=>!current.some(existing=>existing.id===item.id))]);setCursor(result.nextCursor);}
    catch(caught){if(sequence===requestSequence.current)setError(actionFailureMessage(caught,'recordings.loadFailed'));}
    finally{if(sequence===requestSequence.current)setLoadingMore(false);}
  }
  async function remove(item:Recording){
    if(deleting||!window.confirm(t('recordings.deleteConfirm').replace('{title}',item.title)))return;setDeleting(item.id);setError('');
    try{await write({action:'delete',id:item.id,revision:item.revision},pending);showActionToast('success','recordings.deleted');setRevision(value=>value+1);}
    catch(caught){setError(actionFailureMessage(caught,'recordings.failed'));}
    finally{setDeleting('');}
  }
  const manage=context?.permissions.canCreate||context?.permissions.canEdit||context?.permissions.canDelete;
  const selectedClass=context?.classrooms.find(item=>item.id===classroomId),classes=context?.classrooms||[],subjects=[...new Set(classes.map(item=>item.subject))].sort((a,b)=>a.localeCompare(b));
  return <section className="recordings-workspace recordings-compact" aria-label={t('recordings.title')}>
    <header className="recordings-heading"><div><h2><Film size={20}/>{t('recordings.title')}</h2></div>{context?.permissions.canCreate&&!selectedClass?.archived&&<Button type="button" disabled={!classes.some(item=>!item.archived)} onClick={()=>setEditor({classroomId})}><Plus size={18}/>{t('recordings.add')}</Button>}</header>
    <form className="recordings-compact-filter-form" onSubmit={event=>{event.preventDefault();setFilters({...draftFilters});}}>
      <div className="recordings-compact-search"><label className="recordings-search">{t('recordings.search')}<div><input type="search" maxLength={120} value={draftFilters.q} placeholder={t('recordings.searchPlaceholder')} onChange={event=>setDraftFilters(current=>({...current,q:event.target.value}))}/></div></label><Button type="submit" variant="outline" size="sm">{t('recordings.apply')}</Button></div>
      <details className="recordings-filter-disclosure"><summary>{recordingText('筛选','Filters')}{Object.entries(filters).some(([key,value])=>key!=='q'&&value)&&<span>{recordingText('已启用','Active')}</span>}</summary><div className="recordings-filters">
        {!classroomId&&<label>{t('recordings.classroom')}<select value={draftFilters.classroomId} onChange={event=>setDraftFilters(current=>({...current,classroomId:event.target.value}))}><option value="">{t('recordings.allClasses')}</option>{classes.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></label>}
        {!classroomId&&<label>{t('recordings.subject')}<select value={draftFilters.subject} onChange={event=>setDraftFilters(current=>({...current,subject:event.target.value}))}><option value="">{t('recordings.allSubjects')}</option>{subjects.map(subject=><option value={subject} key={subject}>{subject}</option>)}</select></label>}
        <label>{t('recordings.month')}<input type="month" value={draftFilters.month} onChange={event=>setDraftFilters(current=>({...current,month:event.target.value}))}/></label>
        {manage&&<label>{t('recordings.status')}<select value={draftFilters.status} onChange={event=>setDraftFilters(current=>({...current,status:event.target.value}))}><option value="">{t('recordings.allStatuses')}</option><option value="published">{t('recordings.published')}</option><option value="draft">{t('recordings.draft')}</option></select></label>}
        <div className="recording-actions recordings-filter-actions"><Button type="submit" size="sm" variant="outline">{t('recordings.apply')}</Button><Button type="button" size="sm" variant="outline" onClick={()=>{const empty={q:'',classroomId:'',subject:'',month:'',status:''};setDraftFilters(empty);setFilters(empty);}}>{t('recordings.reset')}</Button></div>
      </div></details>
    </form>
    {(error||contextError)&&<div className="recording-error" role="alert"><p>{error||contextError}</p><Button type="button" variant="outline" onClick={()=>setRevision(value=>value+1)}>{t('recordings.retry')}</Button></div>}
    {loading?<p className="recording-loading" role="status">{t('recordings.loading')}</p>:<>
      {!records.length&&!error&&<div className="recordings-empty"><Film size={30} aria-hidden="true"/><p>{t('recordings.empty')}</p>{!manage&&<small>{t('recordings.emptyStudent')}</small>}</div>}
      <div className="recordings-list">{records.map(item=><article className="recording-card" key={item.id}>
        <div className="recording-row-main"><div className="recording-row-copy"><h3>{item.title}</h3><div className="recording-row-meta"><span className="recording-date"><CalendarDays size={14}/>{dateLabel(item.lessonDate)}</span><span className={'recording-badge recording-badge-'+item.status}>{t('recordings.'+item.status)}</span>{!classroomId&&<span className="recording-row-context">{item.classroomTitle} · {item.subject}</span>}</div></div><a className="recording-watch" href={item.driveUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{t('recordings.watch')}</a></div>
        <details className="recording-row-details"><summary>{item.canEdit||item.canDelete?recordingText('详情与管理','Details and management'):recordingText('查看详情','View details')}</summary><div className="recording-detail-content"><p className="recording-teacher">{t('recordings.teacher')} · {item.teacherName}</p>{item.description&&<p className="recording-description">{item.description}</p>}{(item.canEdit||item.canDelete)&&<><p className="recording-caption">{item.status==='draft'?t('recordings.draftHint'):item.audienceMode==='classroom'?t('recordings.classroomShared'):countLabel('recordings.recipientCount',item.recipientCount)}</p><dl className="recording-history"><div><dt>{recordingText('添加时间','Added')}</dt><dd>{dateLabel(item.createdAt)}</dd></div><div><dt>{recordingText('最近更新','Updated')}</dt><dd>{dateLabel(item.updatedAt)}</dd></div></dl><div className="recording-actions">{item.canEdit&&<Button type="button" size="sm" variant="outline" disabled={!!deleting} onClick={()=>setEditor({id:item.id})}>{t('recordings.edit')}</Button>}{item.canDelete&&<Button type="button" size="sm" variant="outline" className="recording-delete" disabled={!!deleting} onClick={()=>void remove(item)}>{t(deleting===item.id?'recordings.deleting':'recordings.delete')}</Button>}</div></>}</div></details>
      </article>)}</div>
      {!!records.length&&<small className="recording-watch-hint">{t('recordings.watchHint')}</small>}
      {!!records.length&&<div className="recordings-pagination"><p role="status">{countLabel('recordings.loaded',records.length)}</p>{cursor&&<Button type="button" variant="outline" disabled={loadingMore} onClick={()=>void loadMore()}>{t(loadingMore?'recordings.loadingMore':'recordings.loadMore')}</Button>}</div>}
    </>}
    {editor&&<RecordingEditor request={editor} onClose={()=>setEditor(null)} onSaved={()=>setRevision(value=>value+1)}/>}
  </section>;
}
