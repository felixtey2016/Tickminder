'use client';
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {readApiJson,alertActionFailure} from '@/lib/action-feedback';
import {t,type Language} from '@/lib/i18n';
import type {NotificationDestination as Target,NotificationLessonRecord} from '@/lib/notification-navigation';
import type {PracticeAttempt} from '@/lib/quiz-practice-types';
import type {Homework,Submission,Material,LearningMutate} from './learning-portal';
import {FileLinks,StudentHomeworkCard} from './learning-portal';
import {ContentActions} from './learning-content-actions';
import {LessonHistory} from './lesson-history';
import {OnlineLessonLink} from './online-lesson-link';
import QuizPracticePanel,{QuizPracticeStart,type PracticeSource} from './quiz-practice-panel';
import {GroupSessionBoard,type GroupSession,type GroupSessionRequest} from './class-session-schedule';
import './notification-workspace.css';
const QuizPracticePlayer=lazy(()=>import('@/components/quiz-practice-player'));
type Data={kind:string;lesson?:NotificationLessonRecord;session?:GroupSession;requests?:GroupSessionRequest[];item?:Homework&Material;submissions?:Submission[];limits?:{pdfMaxBytes:number}};

export default function NotificationDestination({target,role,language,onBack,learningMutate,courseMutate,onLesson,busy}:{target:Target;role:'student'|'teacher'|'admin';language:Language;onBack:()=>void;learningMutate:LearningMutate;courseMutate:LearningMutate;onLesson:(lesson:NotificationLessonRecord)=>void;busy:boolean}){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[version,setVersion]=useState(0),[source,setSource]=useState<PracticeSource|null>(null),[attemptId,setAttemptId]=useState<string|null>(null);
 const announceLoadFailure=useRef(true);
 const label=(zh:string,en:string)=>language==='zh'?zh:en;
 useEffect(()=>{if(target.kind!=='lesson')return;const refresh=()=>setVersion(v=>v+1);window.addEventListener('tickminder:data-changed',refresh);return()=>window.removeEventListener('tickminder:data-changed',refresh);},[target.kind]);
 useEffect(()=>{
  const controller=new AbortController(),announce=announceLoadFailure.current;announceLoadFailure.current=false;setData(null);setError('');setLoading(true);setAttemptId(null);setSource(null);
  async function load(){try{
   if(target.kind==='quiz'){
    if(target.attemptId){const response=await groupFetch('/api/quiz-practice?'+new URLSearchParams({attemptId:target.attemptId}),{signal:controller.signal,cache:'no-store'});const result=await readApiJson<{attempt?:PracticeAttempt;error?:string}>(response);if(!response.ok||!result.attempt||result.attempt.assignmentId!==target.assignmentId)throw Error(result.error||'quiz.notFound');if(!controller.signal.aborted)setAttemptId(result.attempt.id);}
    if(!controller.signal.aborted)setData({kind:'quiz'});
   }else{
    const response=await groupFetch('/api/notification-target?'+new URLSearchParams({kind:target.kind,id:target.recordId}),{signal:controller.signal,cache:'no-store'});const result=await readApiJson<Data&{error?:string}>(response);if(!response.ok)throw Error(response.status===401?label('请重新登录','Please sign in again.'):[403,404].includes(response.status)?label('内容已移除或没有查看权限，请返回通知或重试。','This item was removed or you no longer have access. Return to notifications or retry.'):label('通知内容暂时无法载入，请重试','Unable to load this notification. Please retry.'));if(!controller.signal.aborted)setData(result);
   }
  }catch(value){if(!controller.signal.aborted){const failure=value instanceof Error?value:new Error(label('内容不存在或没有查看权限','Content is unavailable or you do not have access.'));setError(announce?alertActionFailure(failure):t(failure.message));}}finally{if(!controller.signal.aborted)setLoading(false);}}
  void load();return()=>controller.abort();
 },[target.kind,target.kind==='quiz'?target.assignmentId:target.recordId,target.kind==='quiz'?target.attemptId:'',version]);
 const date=(value:string)=>new Intl.DateTimeFormat(language==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));
 const lesson=data?.lesson,bytes=data?.limits?.pdfMaxBytes||10485760;
 return <section className="notification-destination" data-testid="notification-destination">
  <div className="notification-destination-back"><Button type="button" variant="outline" onClick={onBack}><ArrowLeft size={17}/>{label('返回通知','Back to notifications')}</Button></div>
  {loading&&<p role="status">{t('正在加载…')}</p>}
  {error&&<div className="panel notification-target-error" role="alert" data-error-popup-ignore><p>{t(error)}</p><Button type="button" variant="outline" onClick={()=>{announceLoadFailure.current=true;setVersion(v=>v+1);}}>{t('重试')}</Button></div>}
  {!loading&&!error&&data&&<>
   {lesson&&(!data.session||role==='student')&&<article className="panel" data-testid="notification-lesson-detail"><header className="notification-record-heading"><h2>{lesson.classroomTitle||lesson.student} · {lesson.subject}</h2><span>{t(({scheduled:'已安排',completed:'已上课',cancelled:'已取消',student_absent:'学生缺席',teacher_absent:'老师缺席'} as Record<string,string>)[lesson.status]||lesson.status)}</span></header><p>{date(lesson.plannedStart)} – {date(lesson.plannedEnd)} · GMT+8</p><p>{t('老师')} · {lesson.teacherName}{lesson.sessionType==='group'&&<> · {lesson.participantCount||1} {label('位学生','students')}</>}</p><OnlineLessonLink href={lesson.onlineLink}/><LessonHistory lessonId={lesson.id}/>{role==='admin'&&lesson.sessionType!=='group'&&<Button type="button" variant="outline" adminGrant="lessons.edit" onClick={()=>onLesson(lesson)}>{label('查看／处理此课程','View / manage this lesson')}</Button>}</article>}
   {data.session&&role!=='student'&&<GroupSessionBoard sessions={[data.session]} requests={data.requests||[]} role={role} busy={busy} serverMode mutate={async body=>{const ok=await courseMutate(body);if(ok)setVersion(v=>v+1);return ok;}}/>}
   {target.kind==='material'&&data.item&&<article className="panel learning-card" data-testid="notification-material-detail"><header className="learning-record-head"><strong>{data.item.title}</strong><small>{data.item.subject}</small></header>{data.item.description&&<p>{data.item.description}</p>}<div className="learning-action-row"><FileLinks fileId={data.item.fileId}/><ContentActions kind="material" id={data.item.id}/></div></article>}
   {target.kind==='homework'&&data.item&&<div className="panel notification-homework-detail" data-testid="notification-homework-detail"><StudentHomeworkCard item={data.item} submissions={data.submissions||[]} mutate={learningMutate} busy={busy} maxLabel={Math.round(bytes/1048576)+' MB'} maxBytes={bytes} illustrateSuccess={false} onSubmitted={()=>setVersion(v=>v+1)}/></div>}
   {target.kind==='quiz'&&!target.attemptId&&<div className="quiz-workspace" data-testid="notification-quiz-assignment"><QuizPracticePanel mode="assigned" role={role} language={language} reload={version} initialAssignmentId={target.assignmentId} onOpen={setAttemptId} onStart={setSource}/></div>}
   {target.kind==='quiz'&&target.attemptId&&!attemptId&&<p>{label('此作答记录暂不可用。','This attempt is unavailable.')}</p>}
  </>}
  {source&&<QuizPracticeStart source={source} onClose={()=>setSource(null)} onOpen={id=>{setSource(null);setAttemptId(id);}}/>}
  {attemptId&&<Suspense fallback={<p role="status">{t('正在加载…')}</p>}><QuizPracticePlayer attemptId={attemptId} language={language} onClose={()=>{setAttemptId(null);if(target.kind==='quiz'&&target.attemptId)onBack();else setVersion(v=>v+1);}} onChanged={()=>{}}/></Suspense>}
 </section>;
}
