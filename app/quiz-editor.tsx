'use client';

import {cloneElement,isValidElement,useEffect,useId,useMemo,useRef,useState,type ReactElement,type ReactNode} from 'react';
import {ArrowDown,ArrowLeft,ArrowUp,Check,Copy,Eye,ImagePlus,Plus,Save,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import QuizPlayer,{QuizPicture} from '@/components/quiz-player';
import {QuizMath} from '@/components/quiz-math';
import {checkQuiz,newQuestion,quizImageIds,type Difficulty,type QuizCatalog,type QuizContent,type QuizDraft,type QuizKey,type QuizQuestion,type QuizType,type QuizVisibility} from '@/lib/quiz';
import {groupFetch} from '@/lib/group-client';
import {readApiJson,showActionToast} from '@/lib/action-feedback';
import {t} from '@/lib/i18n';
import {uploadQuizImages} from '@/lib/quiz-upload';

export type LocalQuiz=QuizDraft & {sourceKey?:string;pendingImages?:Map<string,Uint8Array>;importWarnings?:string[];bank?:boolean;maintenanceImport?:boolean};
type SaveReply={id:string;revision:number;existingImport?:boolean;error?:string};
type Confirmation={title:string;description:string;accept:string;run:()=>void};
const TYPES:QuizType[]=['mcq','true_false','blank','math','written'];
const DIFFICULTIES:Difficulty[]=['easy','medium','hard','mixed'];
const copy=<T,>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const payloadStamp=(draft:LocalQuiz)=>JSON.stringify({id:draft.id,revision:draft.revision,sourceKey:draft.sourceKey,content:draft.content,keys:draft.keys});
const contentStamp=(draft:LocalQuiz)=>JSON.stringify({content:draft.content,keys:draft.keys});
function errorCode(error:unknown){return error instanceof Error&&error.message.startsWith('quiz.')?error.message:error instanceof TypeError?'quiz.network':'quiz.unavailable';}
async function api<T extends {error?:string}>(url:string,init?:RequestInit){const response=await groupFetch(url,init);const data=await readApiJson<T>(response);if(!response.ok)throw new Error(data.error||'quiz.unavailable');return data;}
function Field({label,children,wide=false}:{label:string;children:ReactNode;wide?:boolean}){const labelId=useId();return <label className={'quiz-field'+(wide?' quiz-field-wide':'')}><span id={labelId}>{label}</span>{isValidElement(children)?cloneElement(children as ReactElement<{'aria-labelledby'?:string}>,{'aria-labelledby':labelId}):children}</label>;}

export default function QuizEditor({initial,onBack,onSaved}:{initial:LocalQuiz;onBack:()=>void;onSaved:(draft:LocalQuiz)=>void}){
 const [draft,setDraft]=useState<LocalQuiz>(()=>({...copy({...initial,pendingImages:undefined}),pendingImages:initial.pendingImages}));
 const [savedStamp,setSavedStamp]=useState(()=>initial.revision?contentStamp(initial):'');
 const [activeId,setActiveId]=useState(initial.content.questions[0]?.id||'');
 const [newType,setNewType]=useState<QuizType>('mcq');
 const [busy,setBusy]=useState<'save'|'upload'|'preview'|'share'|null>(null);
 const [error,setError]=useState('');
 const [status,setStatus]=useState('');
 const [uploadProgress,setUploadProgress]=useState<{completed:number;total:number}|null>(null);
 const [confirmation,setConfirmation]=useState<Confirmation|null>(null);
 const [preview,setPreview]=useState<QuizContent|null>(null);
 const [visibility,setVisibility]=useState<QuizVisibility>(initial.visibility);
 const [rights,setRights]=useState(false);
 const [answerInputs,setAnswerInputs]=useState<Record<string,string>>({});
 const [imageSources,setImageSources]=useState<Record<string,string>>({});
 const saveOperation=useRef<{stamp:string;id:string}|null>(null);
 const shareOperation=useRef<{stamp:string;id:string}|null>(null);
 const uploadCache=useRef(new Map<string,string>());
 const operationActive=useRef(false);
 const savedContent=useRef<QuizContent|null>(initial.revision?copy(initial.content):null);
 const locked=Boolean(busy)||!draft.canEdit;
 const dirty=contentStamp(draft)!==savedStamp;
 const visibilityDirty=visibility!==draft.visibility;
 const dirtyRef=useRef(dirty||visibilityDirty);
 dirtyRef.current=dirty||visibilityDirty;
 const active=draft.content.questions.find(q=>q.id===activeId)||draft.content.questions[0];
 const activeIndex=active?draft.content.questions.findIndex(q=>q.id===active.id):-1;
 const key=active?draft.keys.find(k=>k.questionId===active.id):undefined;
 const total=useMemo(()=>Math.round(draft.content.questions.reduce((n,q)=>n+(Number.isFinite(q.points)?q.points:0),0)*100)/100,[draft.content.questions]);

 useEffect(()=>{
  const unload=(event:BeforeUnloadEvent)=>{if(operationActive.current||dirtyRef.current){event.preventDefault();event.returnValue='';}};
  const navigate=(event:Event)=>{if(operationActive.current){event.preventDefault();return;}if(dirtyRef.current&&!window.confirm(t('quiz.leave')))event.preventDefault();};
  window.addEventListener('beforeunload',unload);window.addEventListener('tickminder-navigate',navigate);
  return()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('tickminder-navigate',navigate);};
 },[]);
 useEffect(()=>{
  const sources:Record<string,string>={};
  for(const [path,bytes] of draft.pendingImages||[]){const buffer=new Uint8Array(bytes).buffer;sources[path]=URL.createObjectURL(new Blob([buffer]));}
  setImageSources(sources);return()=>Object.values(sources).forEach(url=>URL.revokeObjectURL(url));
 },[draft.pendingImages]);

 function updateContent(patch:Partial<QuizContent>){setDraft(d=>({...d,content:{...d.content,...patch}}));setStatus('');}
 function changeCatalog(kind:string){
  if(kind==='none'){updateContent({catalog:null});return;}
  const previous=draft.content.catalog,c:QuizCatalog={kind:kind as QuizCatalog['kind'],level:previous?.level||'Form 1',chapterCode:previous?.chapterCode||'1',chapterTitle:previous?.chapterTitle||'',subtopicCode:previous?.subtopicCode||'1.1',subtopicTitle:previous?.subtopicTitle||'',setNumber:previous?.setNumber||1};
  if(c.kind==='level_overall'){c.chapterCode='';c.chapterTitle='';c.subtopicCode='';c.subtopicTitle='';}else if(c.kind==='chapter_overall'){c.subtopicCode='';c.subtopicTitle='';}updateContent({catalog:c});
 }
 function updateCatalog(patch:Partial<QuizCatalog>){if(draft.content.catalog)updateContent({catalog:{...draft.content.catalog,...patch}});}
 function updateQuestion(id:string,patch:Partial<QuizQuestion>){setDraft(d=>({...d,content:{...d.content,questions:d.content.questions.map(q=>q.id===id?{...q,...patch}:q)}}));setStatus('');}
 function updateKey(id:string,patch:Partial<QuizKey>){setDraft(d=>({...d,keys:d.keys.map(k=>k.questionId===id?{...k,...patch}:k)}));setStatus('');}
 function addQuestion(){if(draft.content.questions.length>=150){setError('quiz.questionCount');return;}const next=newQuestion(newType);setDraft(d=>({...d,content:{...d.content,questions:[...d.content.questions,next.question]},keys:[...d.keys,next.key]}));setActiveId(next.question.id);setStatus('');}
 function moveQuestion(index:number,delta:number){const questions=[...draft.content.questions],to=index+delta;if(to<0||to>=questions.length)return;[questions[index],questions[to]]=[questions[to],questions[index]];updateContent({questions});}
 function duplicateQuestion(q:QuizQuestion){if(draft.content.questions.length>=150){setError('quiz.questionCount');return;}const previous=draft.keys.find(k=>k.questionId===q.id);if(!previous)return;const duplicate=copy(q),newId=crypto.randomUUID(),optionIds=new Map(duplicate.options.map(o=>[o.id,crypto.randomUUID()]));duplicate.id=newId;duplicate.sourceId='';duplicate.options=duplicate.options.map(o=>({...o,id:optionIds.get(o.id)!}));const duplicateKey={...copy(previous),questionId:newId,correctOptionId:previous.correctOptionId?optionIds.get(previous.correctOptionId)||null:null};const index=draft.content.questions.findIndex(x=>x.id===q.id);setDraft(d=>({...d,content:{...d.content,questions:[...d.content.questions.slice(0,index+1),duplicate,...d.content.questions.slice(index+1)]},keys:[...d.keys,duplicateKey]}));setActiveId(newId);setStatus('');}
 function removeQuestion(q:QuizQuestion){setConfirmation({title:t('quiz.remove'),description:t('quiz.deleteConfirm'),accept:t('quiz.removeConfirm'),run:()=>{const index=draft.content.questions.findIndex(x=>x.id===q.id),questions=draft.content.questions.filter(x=>x.id!==q.id);setDraft(d=>({...d,content:{...d.content,questions},keys:d.keys.filter(k=>k.questionId!==q.id)}));setActiveId(questions[Math.min(index,questions.length-1)]?.id||'');setStatus('');}});}
 function changeType(q:QuizQuestion,type:QuizType){if(type===q.type)return;setConfirmation({title:t('quiz.type'),description:t('quiz.typeChangeConfirm'),accept:t('quiz.confirmType'),run:()=>{const next=newQuestion(type);updateQuestion(q.id,{type,options:next.question.options});updateKey(q.id,{...next.key,questionId:q.id});setAnswerInputs(v=>{const result={...v};delete result[q.id];return result;});}});}
 function leave(){if(operationActive.current)return;if(!dirty&&!visibilityDirty){onBack();return;}setConfirmation({title:t('quiz.unsaved'),description:t('quiz.leave'),accept:t('quiz.back'),run:onBack});}

 async function uploadImage(file:File){
  if(!file.size||file.size>5242880)throw new Error('quiz.imageSize');
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)&&!/^.+\.(?:png|jpe?g|webp)$/i.test(file.name))throw new Error('quiz.imageType');
  const form=new FormData();form.set('file',file);return (await api<{id:string;error?:string}>('/api/quiz-images',{method:'POST',body:form})).id;
 }
 async function selectImage(file:File,qid:string,optionId?:string,extraIndex?:number){if(operationActive.current)return;operationActive.current=true;setBusy('upload');setError('');try{const id=await uploadImage(file);setDraft(d=>({...d,content:{...d.content,questions:d.content.questions.map(q=>q.id!==qid?q:optionId?{...q,options:q.options.map(o=>o.id===optionId?{...o,imageId:id}:o)}:extraIndex!==undefined?{...q,extraImageIds:q.extraImageIds.map((old,index)=>index===extraIndex?id:old)}:{...q,imageId:id})}}));setStatus('');}catch(e){setError(errorCode(e));}finally{operationActive.current=false;setBusy(null);}}
 async function prepareImages(current:LocalQuiz){
  const entries=quizImageIds(current.content).flatMap(path=>{const bytes=current.pendingImages?.get(path);return bytes?[{path,bytes}]:[];});
  const replacements=await uploadQuizImages(entries,uploadCache.current,async({path,bytes})=>{const mime=bytes[0]===137?'image/png':bytes[0]===255?'image/jpeg':'image/webp';return uploadImage(new File([new Uint8Array(bytes).buffer],path.split('/').pop()||'question.png',{type:mime}));},(completed,total)=>setUploadProgress(total?{completed,total}:null));
  setUploadProgress(null);
  if(!replacements.size)return current;
  const replace=(id:string|null)=>id?replacements.get(id)||id:null;
  const next={...current,content:{...current.content,questions:current.content.questions.map(q=>({...q,imageId:replace(q.imageId),extraImageIds:q.extraImageIds.map(id=>replace(id)!),options:q.options.map(o=>({...o,imageId:replace(o.imageId)}))}))}};
  setDraft(next);return next;
 }
 async function save(){
  if(locked||operationActive.current)return;operationActive.current=true;setBusy('save');setError('');setStatus('');setUploadProgress(null);
  try{
   // Validate content before uploading any imported images. Temporary ZIP paths
   // are replaced only for this local validation; the server receives real IDs.
   const validation=copy(draft.content);const pending=draft.pendingImages;
   const temporary=(id:string|null)=>id&&pending?.has(id)?'pending_image':id;
   validation.questions=validation.questions.map(q=>({...q,imageId:temporary(q.imageId),extraImageIds:q.extraImageIds.map(id=>temporary(id)!),options:q.options.map(o=>({...o,imageId:temporary(o.imageId)}))}));
   checkQuiz(validation,draft.keys);
   const prepared=await prepareImages(draft),checked=checkQuiz(prepared.content,prepared.keys),normalised={...prepared,content:checked.content,keys:checked.keys};
   const stamp=payloadStamp(normalised);if(saveOperation.current?.stamp!==stamp)saveOperation.current={stamp,id:crypto.randomUUID()};
   const result=await api<SaveReply>('/api/quizzes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:normalised.maintenanceImport||normalised.content.bankKind==='platform'?'maintenanceImport':'save',id:normalised.id,revision:normalised.revision,content:normalised.content,keys:normalised.keys,sourceKey:normalised.sourceKey,operationId:saveOperation.current.id})});
   let saved:LocalQuiz;
   if(result.existingImport){saved=await api<LocalQuiz & {error?:string}>('/api/quizzes?id='+encodeURIComponent(result.id));saved.sourceKey=normalised.sourceKey;setActiveId(saved.content.questions[0]?.id||'');setAnswerInputs({});}
   else saved={...normalised,id:result.id,revision:result.revision,pendingImages:undefined,importWarnings:undefined};
   savedContent.current=copy(saved.content);setDraft(saved);setSavedStamp(contentStamp(saved));if(result.existingImport){setVisibility(saved.visibility);setRights(false);}setStatus(result.existingImport?'quiz.importExisting':'quiz.saved');saveOperation.current=null;onSaved(saved);showActionToast('success',t(result.existingImport?'quiz.importExisting':'quiz.saved'));
  }catch(e){setError(errorCode(e));}finally{operationActive.current=false;setBusy(null);setUploadProgress(null);}
 }
 function openPreview(){if(operationActive.current)return;if(!draft.revision||!savedContent.current){setError('quiz.saveFirst');return;}setError('');setPreview(copy(savedContent.current));}
 async function share(){if(locked||operationActive.current)return;if(dirty||!draft.revision){setError('quiz.saveFirst');return;}if(visibility!=='private'&&!rights){setError('quiz.publicRights');return;}operationActive.current=true;setBusy('share');setError('');try{const stamp=JSON.stringify({id:draft.id,revision:draft.revision,visibility});if(shareOperation.current?.stamp!==stamp)shareOperation.current={stamp,id:crypto.randomUUID()};await api<{ok:boolean;error?:string}>('/api/quizzes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'share',id:draft.id,revision:draft.revision,visibility,operationId:shareOperation.current.id})});const saved={...draft,visibility,sharedRevision:visibility==='private'?null:draft.revision};setDraft(saved);setRights(false);setStatus('quiz.shareUpdated');shareOperation.current=null;onSaved(saved);showActionToast('success',t('quiz.shareUpdated'));}catch(e){setError(errorCode(e));}finally{operationActive.current=false;setBusy(null);}}

 const source=(id:string)=>imageSources[id]||'/api/quiz-images?id='+encodeURIComponent(id);
 const busyLabel=uploadProgress?t('quiz.uploadProgress').replace('{completed}',String(uploadProgress.completed)).replace('{total}',String(uploadProgress.total)):t(busy==='upload'?'quiz.uploading':busy==='save'?'quiz.savingContent':busy==='share'?'quiz.publishing':'quiz.loading');
 function imageEditor(id:string|null,onRemove:()=>void,qid:string,optionId?:string,extraIndex?:number){return <div className="quiz-image-editor">{id&&<><QuizPicture id={id} source={source} alt={t(optionId?'quiz.optionImage':'quiz.promptImage')}/>{draft.canEdit&&<Button type="button" variant="outline" disabled={locked} onClick={onRemove}><Trash2 size={16}/>{t('quiz.imageRemove')}</Button>}</>}{draft.canEdit&&<label className={'quiz-image-upload'+(locked?' is-disabled':'')}><ImagePlus size={17}/><span>{t('quiz.image')}</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={locked} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void selectImage(file,qid,optionId,extraIndex);}}/></label>}</div>;}

 return <section className="quiz-editor" aria-busy={Boolean(busy)}>
  <header className="quiz-editor-header"><Button type="button" variant="outline" onClick={leave} disabled={Boolean(busy)}><ArrowLeft size={17}/>{t('quiz.back')}</Button><div className="quiz-editor-title"><h2>{draft.content.title||t('quiz.new')}</h2><span className="quiz-status" role="status">{busy?busyLabel:status?t(status):t(dirty?'quiz.unsaved':draft.canEdit?'quiz.saved':'quiz.readOnly')}</span></div><div className="quiz-editor-tools"><Button type="button" variant="outline" disabled={Boolean(busy)||!draft.revision} onClick={()=>void openPreview()}><Eye size={17}/>{t('quiz.preview')}</Button>{draft.canEdit&&<Button type="button" disabled={Boolean(busy)||!dirty} onClick={()=>void save()}><Save size={17}/>{t('quiz.save')}</Button>}</div></header>
  {busy&&<div className="quiz-upload-progress" role="status" aria-live="polite"><span>{busyLabel}</span>{uploadProgress&&<progress value={uploadProgress.completed} max={uploadProgress.total} aria-label={busyLabel}/>}</div>}
  {error&&<div className="quiz-alert" role="alert">{t(error)}</div>}
  {draft.importWarnings?.length?<section className="quiz-alert quiz-import-warnings"><h3>{t('quiz.importReview')}</h3><ul>{draft.importWarnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul></section>:null}
  <fieldset className="quiz-panel" disabled={locked}><legend>{t('quiz.settings')}</legend><div className="quiz-fields">
   {draft.maintenanceImport&&<Field label={t('quiz.source')} wide><select value={draft.content.bankKind||'creator'} onChange={e=>{const bankKind=e.target.value as 'creator'|'platform';setDraft(d=>({...d,content:{...d.content,bankKind,catalog:bankKind==='platform'&&!d.content.catalog?{kind:'subtopic',level:'Form 1',chapterCode:'1',chapterTitle:'',subtopicCode:'1.1',subtopicTitle:'',setNumber:1}:d.content.catalog}}));setStatus('');}}><option value="creator">{t('quiz.creatorBank')}</option><option value="platform">{t('quiz.platformBank')}</option></select></Field>}
   {draft.content.bankKind==='platform'&&<p className="quiz-note quiz-field-wide">{t('quiz.standardSetHint')}</p>}
   <Field label={t('quiz.quizTitle')} wide><input required maxLength={160} value={draft.content.title} onChange={e=>updateContent({title:e.target.value})}/></Field>
   <Field label={t('quiz.instructions')} wide><textarea rows={3} maxLength={4000} value={draft.content.instructions} onChange={e=>updateContent({instructions:e.target.value})}/></Field>
   <Field label={t('quiz.subject')}><input required maxLength={100} value={draft.content.subject} onChange={e=>updateContent({subject:e.target.value})}/></Field>
   <Field label={t('quiz.difficulty')}><select value={draft.content.difficulty} onChange={e=>updateContent({difficulty:e.target.value as Difficulty})}>{DIFFICULTIES.map(level=><option key={level} value={level}>{t('quiz.'+level)}</option>)}</select></Field>
   <Field label={t('quiz.language')}><select value={draft.content.primaryLanguage} onChange={e=>updateContent({primaryLanguage:e.target.value as QuizContent['primaryLanguage']})}><option value="zh">中文</option><option value="en">English</option><option value="ms">Bahasa Melayu</option></select></Field>
   <Field label={t('quiz.timed')}><select value={draft.content.timeLimitSeconds===null?'untimed':'timed'} onChange={e=>updateContent({timeLimitSeconds:e.target.value==='untimed'?null:1800})}><option value="untimed">{t('quiz.untimed')}</option><option value="timed">{t('quiz.timed')}</option></select></Field>
   {draft.content.timeLimitSeconds!==null&&<Field label={t('quiz.minutes')}><input type="number" min={1} max={360} step={1} value={draft.content.timeLimitSeconds/60} onChange={e=>updateContent({timeLimitSeconds:Number(e.target.value)*60})}/></Field>}
  </div><div className="quiz-checks"><label className="quiz-check"><input type="checkbox" checked={draft.content.shuffleQuestions} onChange={e=>updateContent({shuffleQuestions:e.target.checked})}/>{t('quiz.shuffleQuestions')}</label><label className="quiz-check"><input type="checkbox" checked={draft.content.shuffleOptions} onChange={e=>updateContent({shuffleOptions:e.target.checked})}/>{t('quiz.shuffleOptions')}</label></div>
  <details className="quiz-source-details"><summary>{t('quiz.catalogFields')}</summary><div className="quiz-fields"><Field label={t('quiz.catalogFields')} wide><select value={draft.content.catalog?.kind||'none'} onChange={e=>changeCatalog(e.target.value)}><option value="none">{t('quiz.catalogNone')}</option><option value="subtopic">{t('quiz.subtopic')}</option><option value="chapter_overall">{t('quiz.chapterOverall')}</option><option value="level_overall">{t('quiz.levelOverall')}</option></select></Field>
  {draft.content.catalog&&<><Field label={t('quiz.catalogLevel')}><select value={draft.content.catalog.level} onChange={e=>updateCatalog({level:e.target.value as QuizCatalog['level']})}>{[1,2,3,4,5].map(n=><option key={n} value={'Form '+n}>{'Form '+n}</option>)}</select></Field><Field label={t('quiz.setNumber')}><input type="number" min={1} max={10000} step={1} value={draft.content.catalog.setNumber} onChange={e=>updateCatalog({setNumber:Number(e.target.value)})}/></Field>
  {draft.content.catalog.kind!=='level_overall'&&<><Field label={t('quiz.chapterCode')}><input inputMode="numeric" maxLength={16} value={draft.content.catalog.chapterCode} onChange={e=>updateCatalog({chapterCode:e.target.value})}/></Field><Field label={t('quiz.chapterTitle')}><input maxLength={160} value={draft.content.catalog.chapterTitle} onChange={e=>updateCatalog({chapterTitle:e.target.value})}/></Field></>}
  {draft.content.catalog.kind==='subtopic'&&<><Field label={t('quiz.subtopicCode')}><input inputMode="decimal" maxLength={32} value={draft.content.catalog.subtopicCode} onChange={e=>updateCatalog({subtopicCode:e.target.value})}/></Field><Field label={t('quiz.subtopicTitle')}><input maxLength={160} value={draft.content.catalog.subtopicTitle} onChange={e=>updateCatalog({subtopicTitle:e.target.value})}/></Field></>}
  </>}</div></details><details className="quiz-source-details"><summary>{t('quiz.sourceMetadata')}</summary><div className="quiz-fields"><Field label={t('quiz.exam')}><input maxLength={80} value={draft.content.exam} onChange={e=>updateContent({exam:e.target.value})}/></Field><Field label={t('quiz.year')}><input type="number" min={1900} max={2200} step={1} value={draft.content.year??''} onChange={e=>updateContent({year:e.target.value===''?null:Number(e.target.value)})}/></Field><Field label={t('quiz.region')}><input maxLength={100} value={draft.content.region} onChange={e=>updateContent({region:e.target.value})}/></Field><Field label={t('quiz.paper')}><input maxLength={80} value={draft.content.paper} onChange={e=>updateContent({paper:e.target.value})}/></Field></div></details></fieldset>
  <div className="quiz-question-layout"><aside className="quiz-question-list"><div className="quiz-question-list-head"><h3>{t('quiz.questions')} · {draft.content.questions.length}</h3><span>{t('quiz.total')} {total}</span></div><nav aria-label={t('quiz.questions')}>{draft.content.questions.map((q,index)=><button type="button" key={q.id} aria-current={active?.id===q.id?'true':undefined} className={active?.id===q.id?'is-active':''} onClick={()=>setActiveId(q.id)}><strong>{index+1}</strong><span>{q.prompt.primary||q.prompt.en||t('quiz.'+q.type)}</span><small>{q.points} {t('quiz.points')}</small></button>)}</nav>{draft.canEdit&&<div className="quiz-add-question"><label className="sr-only" htmlFor="quiz-new-question-type">{t('quiz.type')}</label><select id="quiz-new-question-type" value={newType} disabled={locked} onChange={e=>setNewType(e.target.value as QuizType)}>{TYPES.map(type=><option key={type} value={type}>{t('quiz.'+type)}</option>)}</select><Button type="button" disabled={locked||draft.content.questions.length>=150} onClick={addQuestion}><Plus size={17}/>{t('quiz.addQuestion')}</Button></div>}</aside>
  {active&&key?<article className="quiz-question-card" key={active.id}><header className="quiz-question-head"><h3>{t('quiz.questions')} {activeIndex+1}</h3>{draft.canEdit&&<div className="quiz-question-actions"><Button type="button" variant="outline" disabled={locked||activeIndex===0} aria-label={t('quiz.up')} title={t('quiz.up')} onClick={()=>moveQuestion(activeIndex,-1)}><ArrowUp size={17}/></Button><Button type="button" variant="outline" disabled={locked||activeIndex===draft.content.questions.length-1} aria-label={t('quiz.down')} title={t('quiz.down')} onClick={()=>moveQuestion(activeIndex,1)}><ArrowDown size={17}/></Button><Button type="button" variant="outline" disabled={locked||draft.content.questions.length>=150} aria-label={t('quiz.copyQuestion')} title={t('quiz.copyQuestion')} onClick={()=>duplicateQuestion(active)}><Copy size={17}/></Button><Button type="button" variant="outline" disabled={locked} aria-label={t('quiz.remove')} title={t('quiz.remove')} onClick={()=>removeQuestion(active)}><Trash2 size={17}/></Button></div>}</header>
   <fieldset disabled={locked}><div className="quiz-fields"><Field label={t('quiz.type')}><select value={active.type} onChange={e=>changeType(active,e.target.value as QuizType)}>{TYPES.map(type=><option key={type} value={type}>{t('quiz.'+type)}</option>)}</select></Field><Field label={t('quiz.points')}><input type="number" min={0.01} max={1000} step={0.01} value={active.points} onChange={e=>updateQuestion(active.id,{points:Number(e.target.value)})}/></Field><Field label={t('quiz.difficulty')}><select value={active.difficulty} onChange={e=>updateQuestion(active.id,{difficulty:e.target.value as QuizQuestion['difficulty']})}>{DIFFICULTIES.filter(x=>x!=='mixed').map(level=><option key={level} value={level}>{t('quiz.'+level)}</option>)}</select></Field><Field label={t('quiz.level')}><input maxLength={100} value={active.level} onChange={e=>updateQuestion(active.id,{level:e.target.value})}/></Field><Field label={t('quiz.chapter')} wide><input maxLength={200} value={active.chapter} onChange={e=>updateQuestion(active.id,{chapter:e.target.value})}/></Field><Field label={t('quiz.sourceId')} wide><input maxLength={120} value={active.sourceId} onChange={e=>updateQuestion(active.id,{sourceId:e.target.value})}/></Field>
   <Field label={t('quiz.prompt')} wide><textarea rows={5} maxLength={6000} value={active.prompt.primary} onChange={e=>updateQuestion(active.id,{prompt:{...active.prompt,primary:e.target.value}})}/></Field><Field label={t('quiz.english')} wide><textarea rows={4} maxLength={6000} value={active.prompt.en} onChange={e=>updateQuestion(active.id,{prompt:{...active.prompt,en:e.target.value}})}/></Field></div>
   <div className="quiz-formula-tools"><span>{t('quiz.formulaHelp')}</span>{draft.canEdit&&<Button type="button" variant="outline" onClick={()=>updateQuestion(active.id,{prompt:{...active.prompt,primary:active.prompt.primary+' $\\frac{a}{b}$ '}})}>{t('quiz.formula')}</Button>}</div>
   </fieldset>
   <section className="quiz-live-preview"><h4>{t('quiz.livePreview')}</h4><QuizMath text={active.prompt.primary}/>{active.prompt.en&&<div className="quiz-english-preview"><QuizMath text={active.prompt.en}/></div>}</section>
   <p className="quiz-note">{t('quiz.imageNote')}</p>{imageEditor(active.imageId,()=>updateQuestion(active.id,{imageId:null}),active.id)}{active.extraImageIds.map((id,index)=><div key={index}>{imageEditor(id,()=>updateQuestion(active.id,{extraImageIds:active.extraImageIds.filter((_,i)=>i!==index)}),active.id,undefined,index)}</div>)}
   {active.options.length>0&&<section className="quiz-options">{active.options.map((option,index)=><div key={option.id} className="quiz-option-editor"><fieldset disabled={locked}><div className="quiz-option-editor-head"><h4>{t('quiz.option')} {String.fromCharCode(65+index)}</h4><label className="quiz-check"><input type="radio" name={'quiz-correct-'+active.id} checked={key.correctOptionId===option.id} onChange={()=>updateKey(active.id,{correctOptionId:option.id})}/><Check size={15}/>{t('quiz.correct')}</label></div><div className="quiz-fields"><Field label={t('quiz.option')} wide><textarea rows={2} maxLength={6000} value={option.text.primary} onChange={e=>updateQuestion(active.id,{options:active.options.map(o=>o.id===option.id?{...o,text:{...o.text,primary:e.target.value}}:o)})}/></Field><Field label={t('quiz.optionEnglish')} wide><textarea rows={2} maxLength={6000} value={option.text.en} onChange={e=>updateQuestion(active.id,{options:active.options.map(o=>o.id===option.id?{...o,text:{...o.text,en:e.target.value}}:o)})}/></Field></div></fieldset>{(option.text.primary.includes('$')||option.text.en.includes('$'))&&<div className="quiz-live-preview"><QuizMath text={option.text.primary}/><QuizMath text={option.text.en}/></div>}{imageEditor(option.imageId,()=>updateQuestion(active.id,{options:active.options.map(o=>o.id===option.id?{...o,imageId:null}:o)}),active.id,option.id)}{draft.canEdit&&active.type==='mcq'&&active.options.length>2&&<Button type="button" variant="outline" disabled={locked} onClick={()=>{const options=active.options.filter(o=>o.id!==option.id);updateQuestion(active.id,{options});if(key.correctOptionId===option.id)updateKey(active.id,{correctOptionId:options[0].id});}}>{t('quiz.removeOption')} {String.fromCharCode(65+index)}</Button>}</div>)}{draft.canEdit&&active.type==='mcq'&&active.options.length<6&&<Button type="button" variant="outline" disabled={locked} onClick={()=>updateQuestion(active.id,{options:[...active.options,{id:crypto.randomUUID(),text:{primary:'',en:''},imageId:null}]})}><Plus size={16}/>{t('quiz.addOption')}</Button>}</section>}
   <fieldset className="quiz-answer-settings" disabled={locked}><legend>{t('quiz.answer')}</legend>
    {active.type==='math'&&<Field label={t('quiz.answer')}><select value={key.mode} onChange={e=>updateKey(active.id,{mode:e.target.value as 'numeric'|'manual'})}><option value="numeric">{t('quiz.numericGrading')}</option><option value="manual">{t('quiz.manual')}</option></select></Field>}
    {(active.type==='blank'||active.type==='math'&&key.mode==='numeric')&&<Field label={t('quiz.accepted')} wide><textarea rows={3} maxLength={6020} value={answerInputs[active.id]??key.accepted.join('\n')} onChange={e=>{const raw=e.target.value;setAnswerInputs(v=>({...v,[active.id]:raw}));updateKey(active.id,{accepted:raw.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)});}}/></Field>}
    {active.type==='blank'&&<label className="quiz-check"><input type="checkbox" checked={key.caseSensitive} onChange={e=>updateKey(active.id,{caseSensitive:e.target.checked})}/>{t('quiz.case')}</label>}
    {active.type==='math'&&key.mode==='numeric'&&<div className="quiz-fields"><Field label={t('quiz.tolerance')}><input type="number" min={0} max={1000000} step="any" value={key.tolerance} onChange={e=>updateKey(active.id,{tolerance:Number(e.target.value)})}/></Field><Field label={t('quiz.unit')}><input maxLength={40} value={key.unit} onChange={e=>updateKey(active.id,{unit:e.target.value})}/></Field></div>}
    {key.mode==='manual'&&<><p className="quiz-note">{t('quiz.manual')}</p><Field label={t('quiz.rubric')} wide><textarea rows={4} maxLength={4000} value={key.rubric} onChange={e=>updateKey(active.id,{rubric:e.target.value})}/></Field></>}
    <Field label={t('quiz.explanation')} wide><textarea rows={3} maxLength={4000} value={key.explanation} onChange={e=>updateKey(active.id,{explanation:e.target.value})}/></Field>
   </fieldset>
  </article>:<div className="quiz-question-card quiz-question-empty"><p>{t('quiz.createFirst')}</p></div>}</div>
  {draft.canEdit&&<section className="quiz-panel quiz-share-panel"><h3>{t('quiz.bankSettings')}</h3><Field label={t('quiz.share')}><select value={visibility} disabled={Boolean(busy)} onChange={e=>{setVisibility(e.target.value as QuizVisibility);setRights(false);setStatus('');}}>{(['private','organisation','public'] as const).map(scope=><option key={scope} value={scope}>{t('quiz.'+scope)}</option>)}</select></Field><p className="quiz-note">{t(visibility==='private'?'quiz.privateNote':'quiz.shareNote')}</p>{visibility!=='private'&&<label className="quiz-check"><input type="checkbox" checked={rights} disabled={Boolean(busy)} onChange={e=>setRights(e.target.checked)}/>{t('quiz.publicRights')}</label>}<Button type="button" variant="outline" disabled={Boolean(busy)||!draft.revision||dirty||visibility!=='private'&&!rights||visibility==='private'&&draft.visibility==='private'&&draft.sharedRevision===null} onClick={()=>void share()}>{t('quiz.shareSave')}</Button>{draft.sharedRevision!==null&&<span className="quiz-note">{t('quiz.sharedVersion')} {draft.sharedRevision} · {t('quiz.draftVersion')} {draft.revision}</span>}</section>}
  <footer className="quiz-editor-footer"><span>{t('quiz.questions')} {draft.content.questions.length} · {t('quiz.total')} {total}</span><div className="quiz-editor-tools"><Button type="button" variant="outline" disabled={Boolean(busy)||!draft.revision} onClick={()=>void openPreview()}><Eye size={17}/>{t('quiz.preview')}</Button>{draft.canEdit&&<Button type="button" disabled={Boolean(busy)||!dirty} onClick={()=>void save()}><Save size={17}/>{t(busy==='save'?'quiz.saving':'quiz.save')}</Button>}</div><p className="quiz-note">{t('quiz.savedVersionNotice')}</p></footer>
  {confirmation&&<Dialog open onOpenChange={open=>{if(!open)setConfirmation(null);}}><DialogContent className="quiz-confirm-dialog" overlayClassName="content-edit-overlay"><DialogTitle>{confirmation.title}</DialogTitle><DialogDescription>{confirmation.description}</DialogDescription><div className="quiz-editor-tools"><Button type="button" variant="outline" onClick={()=>setConfirmation(null)}>{t('quiz.cancel')}</Button><Button type="button" onClick={()=>{const action=confirmation.run;setConfirmation(null);action();}}>{confirmation.accept}</Button></div></DialogContent></Dialog>}
  {preview&&<QuizPlayer content={preview} onClose={()=>setPreview(null)}/>}
 </section>;
}
