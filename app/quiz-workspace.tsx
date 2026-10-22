'use client';
import {usePageHistoryState} from '@/lib/page-history';

import { useAdminAction } from "./admin-permission-context";

import {lazy,Suspense,useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Copy,Eye,MoreHorizontal,Play,Plus,Search,SquarePen,Trash2,Upload,UsersRound,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {t,type Language} from '@/lib/i18n';
import {groupFetch} from '@/lib/group-client';
import {readApiJson,showActionToast} from '@/lib/action-feedback';
import {emptyQuiz,newQuestion,type QuizContent} from '@/lib/quiz';
import type {LocalQuiz} from './quiz-editor';
import QuizPracticePanel,{QuizAllocateDialog,QuizPracticeStart,type PracticeSource} from './quiz-practice-panel';
import {useAcademicCatalogue} from '@/lib/use-academic-catalogue';
import {findCatalogueSyllabus,findCatalogueSubject} from '@/lib/academic-catalogue';
import './quiz.css';
import './quiz-layout.css';
import '@/lib/quiz-upgrade-i18n';
const QuizModerationWorkspace=lazy(()=>import('./quiz-moderation-workspace'));
const QuizReportDialog=lazy(()=>import('./quiz-moderation-workspace').then(module=>({default:module.QuizReportDialog})));
const QuizComposeDialog=lazy(()=>import('./quiz-compose-dialog'));

const QuizEditor=lazy(()=>import('./quiz-editor'));
const QuizPlayer=lazy(()=>import('@/components/quiz-player'));
const QuizPracticePlayer=lazy(()=>import('@/components/quiz-practice-player'));

type Catalog={kind:'subtopic'|'chapter_overall'|'level_overall';level:string;chapterCode:string;chapterTitle:string;subtopicCode:string;subtopicTitle:string;setNumber:number};
type Item={id:string;title:string;subject:string;exam:string;difficulty:string;questionCount:number;totalScore:number;visibility:string;creator:string;organisation:string;canEdit:boolean|number;canShare?:boolean|number;canDelete?:boolean|number;revision?:number;sharedRevision:number|null;bankKind?:'platform'|'creator';catalog?:Catalog|null;updatedAt?:string;createdAt?:string};
type Topic={key:string;bankKind:'platform';subject:string;exam:string;catalog:Omit<Catalog,'setNumber'>;difficulties:{easy:number;medium:number;hard:number};setCount:number;updatedAt?:string;latestAt?:string};
type Facets={subjects:string[];levels:string[];chapters:{code:string;title:string;level:string;subject:string;exam:string}[];maintenanceImport?:boolean;manageQuizzes?:boolean;canModerate?:boolean};
type Reply={items?:Item[];topics?:Topic[];hasMore?:boolean;facets?:Facets;error?:string};
type Filters={search:string;syllabus:string;subject:string;level:string;chapterCode:string;difficulty:string;sort:'latest'|'oldest'|'title'};
type CopyOperation={id:string;operationId:string;sourceId:string;bank:boolean;title:string;resultId?:string};
type Opening={item:Item;mode:'edit'|'preview'|'copy';token:number;error:string};
const EMPTY_FILTERS:Filters={search:'',syllabus:'',subject:'',level:'',chapterCode:'',difficulty:'',sort:'latest'};
const EMPTY_FACETS:Facets={subjects:[],levels:[],chapters:[]};
const DIFFICULTIES=['easy','medium','hard'] as const;
type SelectedDifficulty=typeof DIFFICULTIES[number];

function errorCode(error:unknown){return error instanceof Error&&error.message.startsWith('quiz.')?error.message:error instanceof TypeError?'quiz.network':'quiz.unavailable';}
async function api<T extends {error?:string}>(url:string,init?:RequestInit){const response=await groupFetch(url,init);const data=await readApiJson<T>(response);if(!response.ok)throw new Error(data.error||'quiz.unavailable');return data;}
function query(filters:Filters,bank:boolean,extra:Record<string,string>={}){const params=new URLSearchParams({bank:bank?'1':'0',...extra});for(const [name,value] of Object.entries(filters))if(value)params.set(name,value);return '/api/quizzes?'+params.toString();}
function mergeFacets(values:(Facets|undefined)[]):Facets{
 const chapters=new Map<string,Facets['chapters'][number]>();for(const value of values)for(const chapter of value?.chapters||[])chapters.set(JSON.stringify([chapter.exam,chapter.subject,chapter.level,chapter.code]),chapter);
 return {canModerate:values.some(value=>value?.canModerate===true),maintenanceImport:values.some(value=>value?.maintenanceImport===true),manageQuizzes:values.some(value=>value?.manageQuizzes===true),subjects:[...new Set(values.flatMap(value=>value?.subjects||[]))].sort((a,b)=>a.localeCompare(b)),levels:[...new Set(values.flatMap(value=>value?.levels||[]))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),chapters:[...chapters.values()].sort((a,b)=>a.code.localeCompare(b.code,undefined,{numeric:true}))};
}
function topicTitle(topic:Topic){const c=topic.catalog;if(c.kind==='level_overall')return c.level+' · '+t('quiz.levelOverall');if(c.kind==='chapter_overall')return [c.chapterCode,t('quiz.chapterOverall')].filter(Boolean).join(' · ');return [c.subtopicCode,c.subtopicTitle].filter(Boolean).join(' · ');}
function topicContext(topic:Topic){return [topic.exam,topic.subject,topic.catalog.level,topic.catalog.kind==='level_overall'?'':topic.catalog.chapterTitle||topic.catalog.chapterCode].filter(Boolean).join(' · ');}
function FilterField({label,children,className=''}:{label:string;children:(id:string)=>ReactNode;className?:string}){const id=useId();return <div className={'quiz-field '+className}><label htmlFor={id}>{label}</label>{children(id)}</div>;}

export default function QuizWorkspace({view,language,role='teacher'}:{view:'quizzes'|'quizBank';language:Language;role?:'student'|'teacher'|'admin'}){
 const can=useAdminAction();
 const author=role!=='student';
 const catalogueAllowed=can('quizzes.view'),assignmentsAllowed=can('quizAssignments.view');
 const {catalogue,loading:catalogueLoading,error:catalogueError,reload:reloadCatalogue}=useAcademicCatalogue('quiz');
 const [tab,setTab]=usePageHistoryState<'bank'|'mine'|'assigned'|'history'|'manage'>('quiz.tab','bank');
 const [composeOpen,setComposeOpen]=useState(false),[reviewOpen,setReviewOpen]=useState(false),[reporting,setReporting]=useState<string|null>(null);
 const [source,setSource]=useState<'all'|'platform'|'creator'>('all');
 const [filters,setFilters]=useState<Filters>(EMPTY_FILTERS),[searchInput,setSearchInput]=useState('');
 const [facets,setFacets]=useState<Facets>(EMPTY_FACETS),[items,setItems]=useState<Item[]>([]),[topics,setTopics]=useState<Topic[]>([]);
 const [selectedTopic,setSelectedTopic]=useState<Topic|null>(null),[selectedDifficulty,setSelectedDifficulty]=useState<SelectedDifficulty|null>(null),[sets,setSets]=useState<Item[]>([]);
 const [loading,setLoading]=useState(true),[setsLoading,setSetsLoading]=useState(false),[busy,setBusy]=useState<string|null>(null),[more,setMore]=useState(false),[topicsMore,setTopicsMore]=useState(false),[topicsLoading,setTopicsLoading]=useState(false),[setsMore,setSetsMore]=useState(false);
 const [loadError,setLoadError]=useState(''),[setsError,setSetsError]=useState(''),[actionError,setActionError]=useState(''),[actionRetry,setActionRetry]=useState<(()=>void)|null>(null);
 const [importStatus,setImportStatus]=useState(''),[importDetail,setImportDetail]=useState('');
 const [editor,setEditor]=useState<LocalQuiz|null>(null),[preview,setPreview]=useState<QuizContent|null>(null),[reload,setReload]=useState(0);
 const [opening,setOpening]=useState<Opening|null>(null);
 const [practiceSource,setPracticeSource]=useState<PracticeSource|null>(null),[allocation,setAllocation]=useState<PracticeSource|null>(null),[attemptId,setAttemptId]=useState<string|null>(null);
 const [deleting,setDeleting]=useState<Item|null>(null),deleteOperation=useRef<{id:string;operationId:string}|null>(null);
 const generation=useRef(0),setGeneration=useRef(0),copyOperations=useRef(new Map<string,CopyOperation>()),importInput=useRef<HTMLInputElement>(null);
 const listAbort=useRef<AbortController|null>(null),setsAbort=useRef<AbortController|null>(null),openAbort=useRef<AbortController|null>(null),openGeneration=useRef(0),actionLocks=useRef(new Set<string>());
 // Scheduler keys this workspace by groupId; caches never survive a group switch.
 const facetCache=useRef(new Map<string,Facets>());
 const dateFormatter=useMemo(()=>new Intl.DateTimeFormat(language==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),[language]);
 function dateLabel(value:string|undefined){if(!value||!Number.isFinite(Date.parse(value)))return null;return <time dateTime={value}>{t('quiz.updatedAt')} {dateFormatter.format(new Date(value))} GMT+8</time>;}
 const bank=tab==='bank',catalogTab=catalogueAllowed&&(bank||tab==='mine'||tab==='manage');
 const suspended=Boolean(editor||opening||preview||practiceSource||allocation||attemptId);
 const tabs:typeof tab[]=(author?['bank','mine','assigned','history',...(facets.manageQuizzes?['manage' as const]:[])]:['bank','assigned','history']).filter(value=>value==='assigned'?assignmentsAllowed:value==='history'?(catalogueAllowed||assignmentsAllowed):catalogueAllowed) as typeof tab[];
 useEffect(()=>{if(!tabs.includes(tab)&&tabs[0])setTab(tabs[0]);},[tab,tabs.join(',')]);
 const selectedSyllabus=catalogue?findCatalogueSyllabus(catalogue,filters.syllabus):null;
 const chapters=useMemo(()=>facets.chapters.filter(chapter=>(chapter.subject===filters.subject||Boolean(selectedSyllabus&&findCatalogueSubject(selectedSyllabus,filters.subject)?.name===chapter.subject))&&(!filters.level||chapter.level===filters.level)),[facets.chapters,filters.subject,filters.level,selectedSyllabus]);
 const subjectOptions=selectedSyllabus?selectedSyllabus.subjects.filter(s=>s.active):catalogue?[...new Map(catalogue.syllabuses.filter(s=>s.active).flatMap(s=>s.subjects.filter(x=>x.active)).map(s=>[s.id,s])).values()]:[];
 const hasFilters=Boolean(filters.search||filters.syllabus||filters.subject||filters.level||filters.chapterCode||filters.difficulty);

 // Both legacy menu IDs resolve to this single hub.
 useEffect(()=>{setSelectedTopic(null);setSelectedDifficulty(null);},[view]);
 useEffect(()=>{
  const timer=window.setTimeout(()=>setFilters(old=>old.search===searchInput.trim()?old:{...old,search:searchInput.trim()}),300);return()=>window.clearTimeout(timer);
 },[searchInput]);
 useEffect(()=>{setSelectedTopic(null);setSelectedDifficulty(null);setSets([]);setSetsError('');},[tab,source,filters]);

 async function load(offset=0){
  if(!catalogueAllowed||!catalogTab||suspended||!catalogue)return;
  listAbort.current?.abort();const controller=new AbortController();listAbort.current=controller;
  const gen=++generation.current;setLoading(true);setLoadError('');if(!offset){setItems([]);setTopics([]);setMore(false);setTopicsMore(false);}
  try{
   const scopeKey=JSON.stringify([catalogue?.revision,filters.syllabus,filters.subject,filters.level]),listKey=(bank?'bank:creator':tab)+scopeKey,topicKey='bank:platform'+scopeKey,listFacets=!offset&&!facetCache.current.has(listKey),topicFacets=!facetCache.current.has(topicKey);
   const creatorRequest=!bank||source!=='platform'?api<Reply>(query(filters,bank,{...(listFacets?{facets:'1'}:{}),offset:String(offset),...(bank?{bankKind:'creator'}:{}),...(tab==='manage'?{manage:'1'}:{})}),{signal:controller.signal}):null;
   const topicRequest=bank&&source!=='creator'&&!offset?api<Reply>(query(filters,true,{topics:'1',bankKind:'platform',...(topicFacets?{facets:'1'}:{})}),{signal:controller.signal}):null;
   const [listReply,topicReply]=await Promise.all([creatorRequest,topicRequest]);
   if(gen!==generation.current)return;
   if(listReply){setItems(old=>offset?[...old,...(listReply.items||[])].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index):listReply.items||[]);setMore(Boolean(listReply.hasMore));}
   if(!offset){if(listReply?.facets)facetCache.current.set(listKey,listReply.facets);if(topicReply?.facets)facetCache.current.set(topicKey,topicReply.facets);setTopics(topicReply?.topics||[]);setTopicsMore(Boolean(topicReply?.hasMore));setFacets(mergeFacets([!bank||source!=='platform'?facetCache.current.get(listKey):undefined,bank&&source!=='creator'?facetCache.current.get(topicKey):undefined]));}
  }catch(error){if(gen===generation.current&&!controller.signal.aborted)setLoadError(errorCode(error));}finally{if(gen===generation.current)setLoading(false);}
 }
 useEffect(()=>{if(!suspended)void load();return()=>{generation.current++;listAbort.current?.abort();};},[tab,source,filters,reload,suspended,catalogue?.revision,catalogueAllowed]);

 async function loadTopics(){
  if(!topicsMore||topicsLoading||suspended)return;const controller=listAbort.current,gen=generation.current;setTopicsLoading(true);setLoadError('');
  try{const data=await api<Reply>(query(filters,true,{topics:'1',bankKind:'platform',offset:String(topics.length)}),{signal:controller?.signal});if(gen!==generation.current)return;setTopics(old=>[...old,...(data.topics||[])].filter((topic,index,all)=>all.findIndex(other=>other.key===topic.key)===index));setTopicsMore(Boolean(data.hasMore));}
  catch(error){if(gen===generation.current&&!controller?.signal.aborted)setLoadError(errorCode(error));}finally{setTopicsLoading(false);}
 }
 async function loadSets(offset=0){
  if(!selectedTopic||!selectedDifficulty||suspended)return;setsAbort.current?.abort();const controller=new AbortController();setsAbort.current=controller;const gen=++setGeneration.current;setSetsLoading(true);setSetsError('');if(!offset){setSets([]);setSetsMore(false);}
  try{
   const c=selectedTopic.catalog,data=await api<Reply>(query({search:filters.search,syllabus:selectedTopic.exam||'__unclassified__',subject:selectedTopic.subject,level:c.level,chapterCode:c.chapterCode,difficulty:'',sort:filters.sort},true,{bankKind:'platform',catalogKind:c.kind,subtopicCode:c.subtopicCode,difficulty:selectedDifficulty,offset:String(offset)}),{signal:controller.signal});
   if(gen!==setGeneration.current)return;setSets(old=>offset?[...old,...(data.items||[])].filter((item,index,all)=>all.findIndex(other=>other.id===item.id)===index):data.items||[]);setSetsMore(Boolean(data.hasMore));
  }catch(error){if(gen===setGeneration.current&&!controller.signal.aborted)setSetsError(errorCode(error));}finally{if(gen===setGeneration.current)setSetsLoading(false);}
 }
 useEffect(()=>{if(selectedTopic&&selectedDifficulty&&!suspended)void loadSets();return()=>{setGeneration.current++;setsAbort.current?.abort();};},[selectedTopic,selectedDifficulty,reload,suspended]);
 useEffect(()=>()=>{openGeneration.current++;openAbort.current?.abort();},[]);

 function clearFilters(){setSearchInput('');setFilters({...EMPTY_FILTERS});}
 function cancelOpening(){openGeneration.current++;openAbort.current?.abort();setOpening(null);}
 function changeTab(next:typeof tab){cancelOpening();setTab(next);setActionError('');setActionRetry(null);setImportDetail('');}
 function chooseTopic(topic:Topic){setSelectedTopic(topic);setSelectedDifficulty(null);setSets([]);setSetsError('');setActionError('');setActionRetry(null);}
 async function open(item:Item,previewOnly=false){
  openAbort.current?.abort();const controller=new AbortController(),token=++openGeneration.current;openAbort.current=controller;setOpening({item,mode:previewOnly?'preview':'edit',token,error:''});setActionError('');setActionRetry(null);
  try{const data=await api<LocalQuiz&{error?:string}>('/api/quizzes?id='+encodeURIComponent(item.id)+(bank?'&bank=1':'')+(previewOnly?'&preview=1':''),{signal:controller.signal});if(token!==openGeneration.current)return;if(previewOnly)setPreview(data.content);else setEditor({...data,bank:false,maintenanceImport:Boolean(facets.maintenanceImport&&data.sourceKey)});setOpening(null);}
  catch(error){if(token===openGeneration.current&&!controller.signal.aborted)setOpening({item,mode:previewOnly?'preview':'edit',token,error:errorCode(error)});}
 }
 async function duplicate(item:Item){
  if(!can("quizzes.duplicate"))return;
  const operationKey=(bank?'bank:':'mine:')+item.id,lock='copy:'+operationKey;if(actionLocks.current.has(lock))return;actionLocks.current.add(lock);setBusy(lock);setActionError('');setActionRetry(null);openAbort.current?.abort();const controller=new AbortController(),token=++openGeneration.current;openAbort.current=controller;setOpening({item,mode:'copy',token,error:''});
  let operation=copyOperations.current.get(operationKey);
  if(!operation){operation={id:crypto.randomUUID(),operationId:crypto.randomUUID(),sourceId:item.id,bank,title:(item.title+' · '+(language==='zh'?'副本':'Copy')).slice(0,160)};copyOperations.current.set(operationKey,operation);}
  try{
   if(!operation.resultId){const data=await api<{id:string;error?:string}>('/api/quizzes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'duplicate',...operation})});operation.resultId=data.id;}
   facetCache.current.clear();if(token!==openGeneration.current){setReload(value=>value+1);return;}
   const draft=await api<LocalQuiz&{error?:string}>('/api/quizzes?id='+encodeURIComponent(operation.resultId),{signal:controller.signal});if(token!==openGeneration.current)return;copyOperations.current.delete(operationKey);setTab('mine');setEditor({...draft,bank:false});setOpening(null);setReload(value=>value+1);if(!can('quizzes.edit'))showActionToast('success','quiz.copiedDraft');
  }catch(error){if(token===openGeneration.current&&!controller.signal.aborted)setOpening({item,mode:'copy',token,error:errorCode(error)});}finally{actionLocks.current.delete(lock);setBusy(value=>value===lock?null:value);}
 }
 async function importFile(file:File|undefined){
  if(!can("quizzes.import")||!file||!facets.maintenanceImport||actionLocks.current.has('import'))return;actionLocks.current.add('import');setBusy('import');cancelOpening();setActionError('');setActionRetry(null);setImportDetail('');setImportStatus('quiz.importing');
  try{if(file.size>20*1024*1024)throw new Error('ZIP maximum: 20 MB');const {importQuizZip}=await import('@/lib/quiz-import'),result=await importQuizZip(new Uint8Array(await file.arrayBuffer()),file.name);setTab('mine');clearFilters();setEditor({id:crypto.randomUUID(),revision:0,visibility:'private',sharedRevision:null,canEdit:true,maintenanceImport:true,content:result.content,keys:result.keys,sourceKey:result.sourceKey,pendingImages:result.images,importWarnings:result.warnings});}
  catch(error){setActionError('quiz.importFailed');setImportDetail(error instanceof Error?error.message:'');}finally{actionLocks.current.delete('import');setImportStatus('');setBusy(value=>value==='import'?null:value);}
 }
 function create(){if(!can("quizzes.create"))return;cancelOpening();setImportDetail('');const next=newQuestion(),content=emptyQuiz();content.primaryLanguage=language==='zh'?'zh':'en';content.questions=[next.question];setTab('mine');clearFilters();setActionError('');setActionRetry(null);setEditor({id:crypto.randomUUID(),revision:0,visibility:'private',sharedRevision:null,canEdit:true,content,keys:[next.key]});}
 async function deleteQuiz(){if(!can("quizzes.delete")||!deleting||actionLocks.current.has('delete'))return;actionLocks.current.add('delete');setBusy('delete');setActionError('');if(!deleteOperation.current)deleteOperation.current={id:deleting.id,operationId:crypto.randomUUID()};try{await api<{ok:boolean;error?:string}>('/api/quizzes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'delete',...deleteOperation.current,...(deleting.revision?{revision:deleting.revision}:{})})});facetCache.current.clear();setDeleting(null);deleteOperation.current=null;setReload(value=>value+1);}catch(error){setActionError(errorCode(error));}finally{actionLocks.current.delete('delete');setBusy(value=>value==='delete'?null:value);}}
 function itemCard(item:Item,isSet=false){
  const source:PracticeSource={id:item.id,title:item.title,subject:item.subject,bank},copyBusy=busy==='copy:'+(bank?'bank:':'mine:')+item.id,deleteBusy=busy==='delete'&&deleting?.id===item.id;
  const deleteAction=author&&Boolean(item.canDelete)&&<Button adminGrant="quizzes.delete" variant="outline" disabled={deleteBusy} onClick={()=>{setDeleting(item);deleteOperation.current=null;setActionError('');}}><Trash2 size={17}/>{t('quiz.deleteQuiz')}</Button>;
  return <article className="quiz-library-item" key={item.id} data-testid={isSet?'quiz-set-card':'quiz-library-card'}>
   <div className="quiz-card-content"><div className="quiz-card-heading"><span className="quiz-visibility">{t('quiz.'+item.visibility)}</span><h3>{isSet&&item.catalog?t('quiz.setLabel')+' '+item.catalog.setNumber:item.title}</h3>{isSet&&<p>{item.title}</p>}<p className="quiz-card-context">{[item.subject,item.exam].filter(Boolean).join(' · ')}</p></div>
    <div className="quiz-card-facts"><span>{item.questionCount} {t('quiz.questions')}</span><span>{item.totalScore} {t('quiz.pointsUnit')}</span><span>{t('quiz.'+item.difficulty)}</span></div>
    {(tab==='manage'||bank&&item.bankKind!=='platform')&&<p>{[item.creator,item.organisation].filter(Boolean).join(' · ')}</p>}{dateLabel(item.updatedAt||item.createdAt)&&<p className="quiz-card-date">{dateLabel(item.updatedAt||item.createdAt)}</p>}
   </div>
   <div className="quiz-item-actions">
    {bank&&item.visibility==='public'&&<Button type="button" variant="outline" onClick={()=>setReporting(item.id)}>{t('quiz.report')}</Button>}
    {tab!=='manage'&&<div className="quiz-item-primary-actions"><Button adminGrant="quizzes.view" onClick={()=>setPracticeSource(source)}><Play size={17}/>{t('quiz.practice')}</Button>{author&&<Button adminGrant="quizAssignments.assign" variant="outline" onClick={()=>setAllocation(source)}><UsersRound size={17}/>{t('quiz.assign')}</Button>}</div>}
    {author&&tab!=='manage'&&<details className="quiz-item-more"><summary><MoreHorizontal size={17}/>{t('更多操作')}</summary><div className="quiz-item-secondary-actions">{!bank&&Boolean(item.canEdit)&&<Button adminGrant="quizzes.edit" variant="outline" onClick={()=>void open(item)}><SquarePen size={17}/>{t('quiz.edit')}</Button>}{Boolean(item.canShare)&&(!Boolean(item.canEdit)||!can("quizzes.edit"))&&<Button adminGrant="quizzes.share" variant="outline" onClick={()=>void open(item)}>{t("quiz.bankSettings")}</Button>}<Button variant="outline" onClick={()=>void open(item,true)}><Eye size={17}/>{t('quiz.previewQuiz')}</Button><Button adminGrant="quizzes.duplicate" variant="outline" disabled={copyBusy} onClick={()=>void duplicate(item)}><Copy size={17}/>{t(can('quizzes.edit')?'quiz.copyEdit':'quiz.duplicate')}</Button>{deleteAction}</div></details>}
    {tab==='manage'&&deleteAction}
   </div>
  </article>;
 }
 function loadingState(){return <div className="quiz-loading" role="status"><p>{t('quiz.loading')}</p><div/><div/><div/></div>;}
 function emptyState(message:string){return <section className="quiz-empty"><h3>{t(message)}</h3>{hasFilters&&<div className="quiz-empty-actions"><Button variant="outline" onClick={clearFilters}>{t('quiz.clearFilters')}</Button></div>}</section>;}

 function openingBody(){return <>{opening?.error?<div className="quiz-error" role="alert"><p>{t(opening.error)}</p><Button variant="outline" onClick={()=>{if(opening.mode==='copy')void duplicate(opening.item);else void open(opening.item,opening.mode==='preview');}}>{t('quiz.retry')}</Button></div>:loadingState()}</>;}
 if(reviewOpen)return <Suspense fallback={<p role="status">{t('quiz.loading')}</p>}><QuizModerationWorkspace owner={Boolean(facets.canModerate)} language={language} onBack={()=>{setReviewOpen(false);setReload(value=>value+1);}}/></Suspense>;
 if(editor)return <Suspense fallback={<p role="status">{t('quiz.loading')}</p>}><QuizEditor key={editor.id} initial={editor} onBack={()=>{setEditor(null);setReload(value=>value+1);}} onSaved={()=>{facetCache.current.clear();setReload(value=>value+1);}}/></Suspense>;
 if(opening&&opening.mode!=='preview')return <section className="quiz-editor quiz-opening" aria-busy={!opening.error}><header className="quiz-editor-header"><Button variant="outline" onClick={cancelOpening}><ArrowLeft size={17}/>{t('quiz.back')}</Button><div className="quiz-editor-title"><h2>{opening.item.title}</h2><p>{t(opening.mode==='copy'?'quiz.copying':'quiz.loading')}</p></div></header>{openingBody()}</section>;
 return <div className="quiz-workspace" data-testid="quiz-hub">
  {author&&<div className="quiz-workspace-head"><h2 className="sr-only">{t('quiz.hubTitle')}</h2><div>{facets.maintenanceImport&&<Button adminGrant="quizzes.import" variant="outline" data-testid="quiz-import" disabled={busy==='import'} onClick={()=>importInput.current?.click()}><Upload size={17}/>{t('quiz.import')}</Button>}<Button adminGrant="quizzes.duplicate" variant="outline" disabled={busy!==null} onClick={()=>setComposeOpen(true)}>{t('quiz.compose')}</Button><Button adminGrant="quizzes.create" className="quiz-create-button" data-testid="quiz-create" disabled={busy==='import'} onClick={create}><Plus size={17}/>{t('quiz.createQuiz')}</Button></div></div>}
  <div className="quiz-upgrade-tools"><Button variant="outline" onClick={()=>setReviewOpen(true)}>{t(facets.canModerate?'quiz.moderation':'quiz.reviewReports')}</Button>{facets.canModerate&&<Button variant="outline" disabled={busy!==null} onClick={()=>{setBusy('seed');void api<{id:string;error?:string}>('/api/quiz-seed',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}).then(result=>api<LocalQuiz&{error?:string}>('/api/quizzes?id='+encodeURIComponent(result.id))).then(data=>{setTab('mine');setEditor(data);}).catch(error=>setActionError(errorCode(error))).finally(()=>setBusy(null));}}>{t('quiz.seedDraft')}</Button>}</div>
  {author&&can("quizzes.import")&&facets.maintenanceImport&&<input ref={importInput} className="sr-only" tabIndex={-1} type="file" accept=".zip,application/zip" aria-label={t('quiz.import')} onChange={event=>{void importFile(event.target.files?.[0]);event.target.value='';}}/>}
  <div className="quiz-hub-tabs" role="tablist" aria-label={t('quiz.hubTitle')} onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=tabs.indexOf(tab),next=event.key==='Home'?tabs[0]:event.key==='End'?tabs[tabs.length-1]:tabs[(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];changeTab(next);document.getElementById('quiz-tab-'+next)?.focus();}}>{tabs.map(value=><button type="button" role="tab" key={value} className="quiz-hub-tab" id={'quiz-tab-'+value} data-testid={'quiz-tab-'+value} aria-selected={tab===value} tabIndex={tab===value?0:-1} aria-controls="quiz-hub-panel" onClick={()=>changeTab(value)}>{t(value==='bank'?'quiz.catalogTab':value==='mine'?'quiz.mineTab':value==='assigned'?'quiz.assignedTab':value==='manage'?'quiz.manageTab':'quiz.historyTab')}</button>)}</div>
  <section id="quiz-hub-panel" role="tabpanel" aria-labelledby={'quiz-tab-'+tab}>
   {catalogueError&&<div className="quiz-error" role="alert"><span>{t('quiz.catalogueUnavailable')}</span><Button variant="outline" onClick={()=>void reloadCatalogue()}>{t('quiz.retry')}</Button></div>}
   {!catalogTab?<QuizPracticePanel mode={tab==='assigned'?'assigned':'history'} role={role} language={language} reload={reload} onOpen={setAttemptId} onStart={setPracticeSource}/>:<>
   {!selectedTopic&&<>
    {bank&&<div className="quiz-source-tabs" role="group" aria-label={t('quiz.source')} data-testid="quiz-source-filter">{(['all','platform','creator'] as const).map(value=><button className="quiz-source-tab" type="button" key={value} aria-pressed={source===value} onClick={()=>{setSource(value);setActionError('');setActionRetry(null);}}>{t(value==='all'?'quiz.allBanks':value==='platform'?'quiz.platformBank':'quiz.creatorBank')}</button>)}</div>}
    <form className="quiz-catalog-filters" onSubmit={event=>{event.preventDefault();setFilters(old=>({...old,search:searchInput.trim()}));}}>
     <FilterField label={t('quiz.search')} className="quiz-catalog-search">{id=><div className="quiz-search-input"><Search size={17} aria-hidden="true"/><input id={id} value={searchInput} maxLength={100} placeholder={t('quiz.searchPlaceholder')} onChange={event=>setSearchInput(event.target.value)}/></div>}</FilterField>
     <FilterField label={t('quiz.syllabus')}>{id=><select id={id} data-testid="quiz-syllabus-filter" value={filters.syllabus} disabled={catalogueLoading} onChange={event=>setFilters(old=>({...old,syllabus:event.target.value,subject:'',level:'',chapterCode:''}))}><option value="">{t('quiz.allSyllabuses')}</option>{catalogue?.syllabuses.filter(s=>s.active).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}<option value="__unclassified__">{t('quiz.unclassifiedSyllabus')}</option></select>}</FilterField>
     <FilterField label={t('quiz.subject')}>{id=><select id={id} data-testid="quiz-subject-filter" value={filters.subject} onChange={event=>setFilters(old=>({...old,subject:event.target.value,level:'',chapterCode:''}))}><option value="">{t('quiz.allSubjects')}</option>{subjectOptions.map(subject=><option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>}</FilterField>
     {selectedSyllabus&&selectedSyllabus.grades.length>0&&<FilterField label={t('quiz.catalogLevel')}>{id=><select id={id} data-testid="quiz-level-filter" value={filters.level} onChange={event=>setFilters(old=>({...old,level:event.target.value,chapterCode:''}))}><option value="">{t('quiz.allLevels')}</option>{selectedSyllabus?.grades.map(level=><option value={level} key={level}>{level}</option>)}</select>}</FilterField>}
     {filters.syllabus&&filters.subject&&chapters.length>0&&<FilterField label={t('quiz.catalogChapter')}>{id=><select id={id} data-testid="quiz-chapter-filter" value={filters.chapterCode?JSON.stringify([filters.level,filters.chapterCode]):''} onChange={event=>{const chapter=chapters.find(item=>JSON.stringify([item.level,item.code])===event.target.value);setFilters(old=>({...old,chapterCode:chapter?.code||'',level:chapter?.level||old.level}));}}><option value="">{t('quiz.allChapters')}</option>{chapters.map(chapter=><option value={JSON.stringify([chapter.level,chapter.code])} key={chapter.level+':'+chapter.code}>{[chapter.code,chapter.title,!filters.level?chapter.level:''].filter(Boolean).join(' · ')}</option>)}</select>}</FilterField>}
     <FilterField label={t('quiz.difficulty')}>{id=><select id={id} value={filters.difficulty} onChange={e=>setFilters(old=>({...old,difficulty:e.target.value}))}><option value="">{t('quiz.all')}</option>{['easy','medium','hard','mixed'].map(value=><option key={value} value={value}>{t('quiz.'+value)}</option>)}</select>}</FilterField>
     <FilterField label={t('quiz.sort')}>{id=><select id={id} data-testid="quiz-sort-filter" value={filters.sort} onChange={event=>setFilters(old=>({...old,sort:event.target.value as Filters['sort']}))}><option value="latest">{t('quiz.sortLatest')}</option><option value="oldest">{t('quiz.sortOldest')}</option><option value="title">{t('quiz.sortTitle')}</option></select>}</FilterField>
    </form>
   </>}
   {actionError&&<div className="quiz-error" role="alert"><span>{t(actionError)}</span>{actionRetry&&<Button variant="outline" onClick={actionRetry}>{t('quiz.retry')}</Button>}</div>}
   {importDetail&&<p className="quiz-error-detail" role="alert">{importDetail}</p>}{importStatus&&<p role="status">{t(importStatus)}</p>}
   {selectedTopic?<div className="quiz-catalog-detail">
    <Button className="quiz-catalog-back" variant="ghost" onClick={()=>{if(selectedDifficulty){setSelectedDifficulty(null);setSetsError('');}else setSelectedTopic(null);setActionError('');setActionRetry(null);}}><ArrowLeft size={17}/>{t(selectedDifficulty?'quiz.backToDifficulty':'quiz.backToTopics')}</Button>
    <div className="quiz-catalog-path"><p>{topicContext(selectedTopic)}</p><h3>{topicTitle(selectedTopic)}</h3></div>
    {!selectedDifficulty?<><h4 className="quiz-difficulty-heading">{t('quiz.chooseDifficulty')}</h4><div className="quiz-difficulty-grid">{DIFFICULTIES.map(difficulty=><button className="quiz-difficulty-card" type="button" key={difficulty} data-testid={'quiz-difficulty-'+difficulty} disabled={!selectedTopic.difficulties[difficulty]} onClick={()=>setSelectedDifficulty(difficulty)}><strong>{t('quiz.'+difficulty)}</strong><span>{selectedTopic.difficulties[difficulty]?selectedTopic.difficulties[difficulty]+' '+t('quiz.sets'):t('quiz.noDifficultySets')}</span><ArrowRight size={18} aria-hidden="true"/></button>)}</div></>:<>
     <h4 className="quiz-difficulty-heading">{t('quiz.'+selectedDifficulty)}</h4>
     {setsError&&<div className="quiz-error" role="alert"><span>{t(setsError)}</span><Button variant="outline" onClick={()=>void loadSets()}>{t('quiz.retry')}</Button></div>}
     {setsLoading&&loadingState()}
     {!setsLoading&&!setsError&&!sets.length&&emptyState('quiz.noDifficultySets')}
     <div className="quiz-list">{sets.map(item=>itemCard(item,true))}</div>{setsMore&&!setsLoading&&<Button variant="outline" onClick={()=>void loadSets(sets.length)}>{t('quiz.more')}</Button>}
    </>}
   </div>:<>
    {loadError&&<div className="quiz-error" role="alert"><span>{t(loadError)}</span><Button variant="outline" onClick={()=>void load()}>{t('quiz.retry')}</Button></div>}
    {loading&&!catalogueError&&loadingState()}
    {!loading&&!loadError&&!items.length&&!topics.length&&emptyState(hasFilters?'quiz.noMatches':!bank?'quiz.noDrafts':source==='platform'?'quiz.noPlatform':'quiz.noCreators')}
    {bank&&topics.length>0&&<section className="quiz-catalog-section" aria-label={t('quiz.platformBank')}><h3>{t('quiz.platformBank')}</h3><div className="quiz-topic-grid">{topics.map(topic=><button type="button" className="quiz-topic-card" data-testid="quiz-topic-card" key={topic.key} onClick={()=>chooseTopic(topic)}><BookOpen size={22} aria-hidden="true"/><span className="quiz-topic-content"><strong>{topicTitle(topic)}</strong><span>{topicContext(topic)}</span>{dateLabel(topic.updatedAt||topic.latestAt)&&<span className="quiz-card-date">{dateLabel(topic.updatedAt||topic.latestAt)}</span>}<span className="quiz-topic-count">{topic.setCount} {t('quiz.sets')}</span></span><ArrowRight size={18} aria-hidden="true"/></button>)}</div>{topicsMore&&<Button variant="outline" data-testid="quiz-topics-more" disabled={topicsLoading||loading} onClick={()=>void loadTopics()}>{t(topicsLoading?'quiz.loading':'quiz.more')}</Button>}</section>}
    {bank&&items.length>0&&<h3 className="quiz-catalog-section-title">{t('quiz.creatorBank')}</h3>}
    <div className="quiz-list">{items.map(item=>itemCard(item))}</div>{more&&!loading&&<Button variant="outline" onClick={()=>void load(items.length)}>{t('quiz.more')}</Button>}
   </>}
   </>}
  </section>
  {opening?.mode==='preview'&&<Dialog open onOpenChange={value=>{if(!value)cancelOpening();}}><DialogContent className="quiz-player-dialog quiz-opening" showCloseButton={false}><div className="quiz-player-heading"><DialogTitle>{opening.item.title}</DialogTitle><Button variant="ghost" className="quiz-player-close" aria-label={t('quiz.close')} onClick={cancelOpening}><X size={20}/></Button></div><DialogDescription>{t('quiz.previewNotice')}</DialogDescription>{openingBody()}</DialogContent></Dialog>}
  {composeOpen&&<Suspense fallback={<p role="status">{t('quiz.loading')}</p>}><QuizComposeDialog onClose={()=>setComposeOpen(false)} onCreated={id=>{setComposeOpen(false);setTab('mine');facetCache.current.clear();void api<LocalQuiz&{error?:string}>('/api/quizzes?id='+encodeURIComponent(id)).then(data=>setEditor(data)).catch(error=>setActionError(errorCode(error)));setReload(value=>value+1);}}/></Suspense>}
  {reporting&&<Suspense fallback={<p role="status">{t('quiz.loading')}</p>}><QuizReportDialog quizId={reporting} onClose={()=>setReporting(null)}/></Suspense>}
  {preview&&<Suspense fallback={<p role="status">{t('quiz.loading')}</p>}><QuizPlayer content={preview} onClose={()=>setPreview(null)}/></Suspense>}
  {practiceSource&&<QuizPracticeStart source={practiceSource} onClose={()=>setPracticeSource(null)} onOpen={id=>{setPracticeSource(null);setAttemptId(id);setReload(value=>value+1);}}/>}
  {allocation&&can("quizAssignments.assign")&&<QuizAllocateDialog source={allocation} onClose={()=>setAllocation(null)} onAssigned={()=>{setAllocation(null);setTab('assigned');setReload(value=>value+1);}}/>}
  {attemptId&&<Suspense fallback={<p role="status">{t('quiz.loading')}</p>}><QuizPracticePlayer attemptId={attemptId} language={language} onClose={()=>{setAttemptId(null);setReload(value=>value+1);}} onChanged={()=>setReload(value=>value+1)}/></Suspense>}
  <Dialog open={Boolean(deleting)&&can("quizzes.delete")} onOpenChange={open=>{if(!open&&busy!=='delete'){setDeleting(null);deleteOperation.current=null;}}}><DialogContent className="quiz-confirm-dialog"><DialogTitle>{t('quiz.deleteQuiz')}</DialogTitle><DialogDescription>{t('quiz.deleteQuizConfirm').replace('{title}',deleting?.title||'')}</DialogDescription>{actionError&&deleting&&<p className="quiz-error" role="alert">{t(actionError)}</p>}<div className="quiz-confirm-actions"><Button variant="outline" disabled={busy==='delete'} onClick={()=>{setDeleting(null);deleteOperation.current=null;}}>{t('quiz.cancel')}</Button><Button adminGrant="quizzes.delete" variant="destructive" disabled={busy==='delete'} onClick={()=>void deleteQuiz()}>{t('quiz.removeConfirm')}</Button></div></DialogContent></Dialog>
 </div>;
}
