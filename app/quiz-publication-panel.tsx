'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import QuizCopyLinkButton from './quiz-copy-link-button';
import {groupFetch} from '@/lib/group-client';
import {alertActionFailure,readApiJson} from '@/lib/action-feedback';
import {getLanguage,t} from '@/lib/i18n';
import type {QuizVisibility} from '@/lib/quiz';
import '@/lib/quiz-upgrade-i18n';
import '@/lib/quiz-sharing-i18n';

type SharingMode='private'|'public'|'selected';
export type QuizSharingSelection={visibility:SharingMode;recipientIds:string[];sharingRevision:number};
export type QuizSharingPlan={selection:QuizSharingSelection;dirty:boolean;ready:boolean;shared:boolean};
type Person={id:string;name:string;role:string;studentName?:string;teacherName?:string};
export type QuizSharingState={visibility:QuizVisibility;sharedRevision:number|null;sharingMode?:SharingMode|'organisation';sharingRevision?:number;recipientIds?:string[];creator?:string};
type Targets={items:Person[];hasMore:boolean;selected?:Person[];selectedIds?:string[];scope?:'students'|'group';legacyOrganisation?:boolean};
const text=(zh:string,en:string)=>getLanguage()==='zh'?zh:en;
const modeFor=(value:string):SharingMode=>value==='public'?'public':value==='private'?'private':'selected';
const stamp=(mode:SharingMode,ids:string[])=>JSON.stringify([mode,mode==='selected'?[...ids].sort():[]]);
async function api<T>(url:string,signal?:AbortSignal):Promise<T>{const response=await groupFetch(url,{cache:'no-store',signal});const data=await readApiJson<T&{error?:string}>(response);if(!response.ok)throw Object.assign(Error(data.error||'quiz.unavailable'),{status:response.status});return data;}

export default function QuizPublicationPanel({id,revision,visibility,sharedRevision,disabled,savesQuestions,onChange}:{id:string;revision:number;visibility:QuizVisibility;sharedRevision:number|null;disabled:boolean;savesQuestions:boolean;onChange:(plan:QuizSharingPlan)=>void}){
 const [scope,setScope]=useState<SharingMode>(modeFor(visibility)),[selected,setSelected]=useState<string[]>([]),[saved,setSaved]=useState<QuizSharingState|null>(()=>revision?null:{visibility,sharedRevision});
 const [people,setPeople]=useState<Record<string,Person>>({}),[items,setItems]=useState<Person[]>([]),[audience,setAudience]=useState<'students'|'group'>('students'),[legacy,setLegacy]=useState(false);
 const [search,setSearch]=useState(''),[query,setQuery]=useState(''),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(Boolean(revision)),[targetsLoading,setTargetsLoading]=useState(false),[error,setError]=useState(''),[targetsError,setTargetsError]=useState('');
 const generation=useRef(0),targetGeneration=useRef(0),dirtyRef=useRef(false),searchId=useId();
 const dirty=Boolean(saved&&stamp(scope,selected)!==stamp(modeFor(saved.sharingMode||saved.visibility),saved.recipientIds||[]));
 dirtyRef.current=dirty;
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search.trim()),250);return()=>clearTimeout(timer);},[search]);
 function mergePeople(values:Person[]){setPeople(old=>({...old,...Object.fromEntries(values.map(person=>[person.id,person]))}));}
 async function load(){
  if(!revision){setLoading(false);return;}const token=++generation.current;setLoading(true);setError('');
  try{const data=await api<QuizSharingState>('/api/quizzes?id='+encodeURIComponent(id));if(token!==generation.current)return;setSaved(data);if(!dirtyRef.current){setScope(modeFor(data.sharingMode||data.visibility));setSelected(data.recipientIds||[]);}setLegacy(data.sharingMode==='organisation');}
  catch(error){if(token===generation.current){setError(error instanceof Error?error.message:'quiz.unavailable');alertActionFailure(error);}}finally{if(token===generation.current)setLoading(false);}
 }
 useEffect(()=>{void load();return()=>{generation.current++;};},[id]);
 async function targets(offset=0,signal?:AbortSignal){
  if(scope!=='selected')return;const token=++targetGeneration.current;setTargetsLoading(true);setTargetsError('');
  try{const data=await api<Targets>('/api/quiz-share-targets?'+new URLSearchParams({...(revision?{quizId:id}:{}),search:query,offset:String(offset)}),signal);if(token!==targetGeneration.current||signal?.aborted)return;setItems(old=>offset?[...old,...data.items].filter((person,index,all)=>all.findIndex(other=>other.id===person.id)===index):data.items);setHasMore(data.hasMore);setAudience(data.scope||'students');mergePeople([...data.items,...(data.selected||[])]);if(data.legacyOrganisation!==undefined)setLegacy(data.legacyOrganisation);}
  catch(error){if(token===targetGeneration.current&&!signal?.aborted){setTargetsError(error instanceof Error?error.message:'quiz.unavailable');alertActionFailure(error);}}finally{if(token===targetGeneration.current)setTargetsLoading(false);}
 }
 useEffect(()=>{if(scope!=='selected')return;const controller=new AbortController();setItems([]);setHasMore(false);void targets(0,controller.signal);return()=>{targetGeneration.current++;controller.abort();};},[id,scope,query]);
 function toggle(person:Person,checked:boolean){mergePeople([person]);setSelected(old=>checked?[...new Set([...old,person.id])]:old.filter(value=>value!==person.id));}
 const missing=selected.filter(value=>!people[value]);

 const ready=Boolean(saved&&!loading&&(scope!=='selected'||selected.length&&!missing.length&&!targetsLoading&&!targetsError));
 const shareMode=saved?.sharingMode||saved?.visibility;
 useEffect(()=>{
  onChange({selection:{visibility:scope,recipientIds:scope==='selected'?[...selected].sort():[],sharingRevision:saved?.sharingRevision||0},
   dirty,ready,shared:shareMode==='public'||shareMode==='selected'});
 },[onChange,scope,selected,saved,dirty,ready,shareMode]);
 const inactive=disabled||loading||Boolean(error&&!saved);
 const roleLabel=(role:string)=>({student:text('学生','Student'),teacher:text('老师','Teacher'),admin:text('管理员','Administrator'),parent:text('家长','Parent')}[role]||text('人员','Person'));
 return <section className="quiz-panel quiz-share-panel quiz-audience-panel" data-testid="quiz-sharing-panel">
  <h3>{text('谁可以看到这份 Quiz','Who can see this quiz')}</h3>
  {saved?.creator&&<p className="quiz-share-creator"><span>{t('quiz.creator')}</span><strong>{saved.creator}</strong></p>}
  {savesQuestions&&<p className="quiz-note">{text('点下方「保存草稿」即可保存题目和可见范围。','Use Save draft below to save the questions and visibility.')}</p>}
  {loading&&<p role="status">{t('quiz.loading')}</p>}
  <fieldset className="quiz-sharing-options" disabled={inactive}><legend className="sr-only">{t('quiz.share')}</legend>{(['public','private','selected'] as const).map(value=><label key={value} className={'quiz-sharing-option'+(scope===value?' is-selected':'')}><input type="radio" name={'quiz-scope-'+id} value={value} checked={scope===value} onChange={()=>setScope(value)}/><span><strong>{value==='public'?text('公开','Public'):value==='private'?text('不公开','Private'):text('只给指定人员看','Selected people')}</strong><small>{value==='public'?text('其他集团的用户也能在题库看到。','Users from other organisations can also find it in the library.'):value==='private'?text('保留为我的 Quiz；已有测验分配按原规则处理。','Keep it in My quizzes. Existing assignments follow their saved access.'):text('只有选择的人员可从题库查看。','Only the people you select can find it in the library.')}</small></span></label>)}</fieldset>
  {legacy&&<p className="quiz-note quiz-sharing-legacy">{text('这份 Quiz 仍沿用原来的集团共享范围。选择新的范围并保存后才会更改；指定人员时请重新选人。','This quiz still uses its previous organisation sharing. Saving a new setting replaces it; choose the people explicitly for selected access.')}</p>}
  {scope==='selected'&&<div className="quiz-audience-picker">
   <label className="quiz-field" htmlFor={searchId}><span>{audience==='group'?text('搜索本集团人员','Search people in this organisation'):text('搜索关联学生','Search your linked students')}</span><input id={searchId} type="search" value={search} maxLength={100} disabled={inactive} onChange={event=>setSearch(event.target.value)} autoComplete="off"/></label>
   <div className="quiz-audience-selection"><strong>{text('已选择','Selected')} · {selected.length}</strong>{selected.length>0&&<Button type="button" variant="ghost" disabled={inactive} onClick={()=>setSelected([])}>{text('清空选择','Clear selection')}</Button>}</div>
   {selected.length>0&&<details className="quiz-audience-selected"><summary>{text('查看已选人员','Review selected people')}</summary><div>{selected.map((value,index)=><div key={value}><span>{people[value]?.name||text('已失效或无权查看的人员','Unavailable or inaccessible person')}{people[value]&&<small>{roleLabel(people[value].role)}</small>}</span><Button type="button" variant="outline" size="sm" disabled={inactive} aria-label={text('移除','Remove')+' '+(people[value]?.name||String(index+1))} onClick={()=>setSelected(old=>old.filter(id=>id!==value))}>{text('移除','Remove')}</Button></div>)}</div></details>}
   {missing.length>0&&!targetsLoading&&!targetsError&&<p className="quiz-error" role="alert">{text('部分已选人员已失效或不在当前授权范围内，请移除后再保存。','Some selected people are no longer available or authorised. Remove them before saving.')}</p>}
   <div className="quiz-audience-list" aria-busy={targetsLoading}>{items.map(person=><label key={person.id} className="quiz-audience-person"><input type="checkbox" disabled={inactive} checked={selected.includes(person.id)} onChange={event=>toggle(person,event.target.checked)}/><span><strong>{person.name}</strong><small>{roleLabel(person.role)}{person.studentName&&person.studentName!==person.name?' · '+person.studentName:''}</small></span></label>)}{!targetsLoading&&!targetsError&&!items.length&&<p className="quiz-note">{text('没有符合条件的人员。','No matching people.')}</p>}</div>
   {targetsLoading&&<p role="status">{t('quiz.loading')}</p>}{targetsError&&<div className="quiz-error" role="alert"><span>{t(targetsError)}</span><Button type="button" variant="outline" disabled={inactive} onClick={()=>void targets()}>{t('quiz.retry')}</Button></div>}{hasMore&&!targetsLoading&&<Button type="button" variant="outline" disabled={inactive} onClick={()=>void targets(items.length)}>{t('quiz.more')}</Button>}
  </div>}
  {scope==='selected'&&!selected.length&&<p className="quiz-note">{text('请至少选择一位可查看的人。','Choose at least one person to share with.')}</p>}
  {scope!=='private'&&<p className="quiz-note">{text('保存草稿时，题库会更新到最新版本。','Saving the draft updates the version shown in the library.')}</p>}
  {error&&<div className="quiz-error" role="alert"><span>{t(error)}</span>{!saved&&<Button type="button" variant="outline" disabled={disabled||loading} onClick={()=>void load()}>{t('quiz.retry')}</Button>}</div>}
  <div className="quiz-share-actions">{revision>0&&<QuizCopyLinkButton quizId={id} disabled={inactive}/>} {sharedRevision!==null&&<span className="quiz-note">{t('quiz.sharedVersion')} {sharedRevision}</span>}</div>
 </section>;
}
