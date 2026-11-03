'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,Play,RotateCcw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {readApiJson} from '@/lib/action-feedback';
import {t,type Language} from '@/lib/i18n';
import type {QuizContent} from '@/lib/quiz';
import type {PracticeAssignment,PracticeAttemptSummary,PracticeState} from '@/lib/quiz-practice-types';
import {quizAssignmentFromSearch,validQuizLinkId} from '@/lib/quiz-link';
import QuizPracticePanel,{QuizPracticeStart,type PracticeSource} from './quiz-practice-panel';
import './quiz-player-wave3.css';

type Preview={id:string;creator:string;content:QuizContent};
export default function QuizLinkLanding({quizId,role,language,reload=0,onClose,onOpen}:{quizId:string;role:'student'|'teacher'|'admin'|'parent';language:Language;reload?:number;onClose:()=>void;onOpen:(attemptId:string)=>void}){
 const [preview,setPreview]=useState<Preview|null>(null),[assignment,setAssignment]=useState<PracticeAssignment|null>(null),[attempt,setAttempt]=useState<PracticeAttemptSummary|null>(null);
 const [loading,setLoading]=useState(true),[failure,setFailure]=useState<'access'|'login'|'network'|null>(null),[retry,setRetry]=useState(0),[starting,setStarting]=useState(false),[records,setRecords]=useState(false);
 const label=(zh:string,en:string)=>language==='zh'?zh:en,bank=role==='student'||role==='parent',staff=role==='teacher'||role==='admin';
 useEffect(()=>{
  const controller=new AbortController();setPreview(null);setAssignment(null);setAttempt(null);setFailure(null);setLoading(true);setStarting(false);
  async function read<T>(path:string):Promise<T>{
   const response=await groupFetch(path,{cache:'no-store',signal:controller.signal});
   if(!response.ok)throw new Error(response.status===401?'login':[403,404].includes(response.status)?'access':'network');
   return readApiJson<T>(response);
  }
  async function load(){try{
   if(!validQuizLinkId(quizId))throw new Error('access');
   const intent=quizAssignmentFromSearch(window.location.search);
   if(intent.present){
    if(!intent.id)throw new Error('access');
    // The assignment keeps its allocated version and server access rules.
    // Missing or forbidden intent must never fall back to self-practice.
    const state=await read<PracticeState>('/api/quiz-practice?'+new URLSearchParams({assignmentId:intent.id}));
    const item=state.assignments.find(item=>item.id===intent.id&&item.quizId===quizId);
    if(!item)throw new Error('access');
    if(!controller.signal.aborted){setAssignment(item);setAttempt(state.attempts.find(row=>row.id===item.resumeAttemptId)||state.attempts.find(row=>row.assignmentId===item.id&&row.status==='submitted'&&row.canAnswer)||null);}
   }else{
    const [content,state]=await Promise.all([
     read<Preview>('/api/quizzes?'+new URLSearchParams({id:quizId,preview:'1',...(bank?{bank:'1'}:{})})),
     read<PracticeState>('/api/quiz-practice?'+new URLSearchParams({ownInProgress:'1',scope:'self',quizId})),
    ]);
    if(!controller.signal.aborted){setPreview(content);setAttempt(state.attempts.find(row=>row.quizId===quizId&&!row.assignmentId&&row.status==='in_progress'&&row.canAnswer)||null);}
   }
  }catch(error){if(!controller.signal.aborted)setFailure(error instanceof Error&&['access','login'].includes(error.message)?error.message as 'access'|'login':'network');}
  finally{if(!controller.signal.aborted)setLoading(false);}}
  void load();return()=>controller.abort();
 },[quizId,bank,role,retry,reload]);
 const source:PracticeSource|null=assignment?{id:assignment.quizId,title:assignment.title,subject:assignment.subject,bank:true,assignmentId:assignment.id,assignment,immediate:assignment.immediate}:preview?{id:preview.id,title:preview.content.title,subject:preview.content.subject,bank}:null;
 if(records&&assignment&&staff)return <QuizPracticePanel mode="assigned" role={role} language={language} reload={reload} initialAssignmentId={assignment.id} onAssignmentBack={()=>setRecords(false)} onOpen={onOpen} onStart={()=>{}}/>;
 const resume=attempt?.status==='in_progress'&&attempt.canAnswer?attempt:null;
 return <section className="quiz-workspace quiz-link-landing quiz-link-wave3" data-testid="quiz-link-landing" aria-busy={loading}>
  <div className="quiz-link-back"><Button variant="ghost" onClick={onClose}><ArrowLeft size={17}/>{label('返回 Quiz','Back to Quiz')}</Button></div>
  {loading&&<p role="status">{t('quiz.loading')}</p>}
  {failure&&<div className="quiz-empty"><p role="alert" data-error-popup-ignore>{failure==='login'?label('登录已过期，请重新登录。','Your session expired. Please sign in again.'):failure==='access'?label('这份测验或作业已不可用，或未布置给当前账号。','This quiz or assignment is unavailable or is not assigned to this account.'):label('暂时无法打开，请重试。','Unable to open this quiz. Please retry.')}</p><Button variant="outline" onClick={()=>failure==='login'?window.location.reload():setRetry(value=>value+1)}>{failure==='login'?label('重新登录','Sign in again'):t('quiz.retry')}</Button></div>}
  {!loading&&!failure&&source&&<article className="quiz-library-item">
   <div className="quiz-card-content"><div className="quiz-assignment-badges"><span className="quiz-visibility">{assignment?label('老师布置','Assigned work'):label('自主练习','Self-practice')}</span>{assignment&&<span className="quiz-assignment-state">{t('quiz.assignmentState.'+assignment.state)}</span>}</div>
    <h2>{source.title}</h2><p className="quiz-card-context">{assignment?[assignment.subject,assignment.classroomTitle].filter(Boolean).join(' · '):[preview?.content.subject,preview?.content.exam].filter(Boolean).join(' · ')}</p>
    <p className="quiz-card-creator"><span>{assignment?label('布置老师','Assigned by'):t('quiz.creator')}</span><strong>{assignment?.teacherName||preview?.creator}</strong></p>
    {resume&&<p className="quiz-progress-summary">{t('quiz.answeredProgress').replace('{answered}',String(resume.answeredCount)).replace('{total}',String(resume.questionCount))}</p>}
    {!assignment&&preview&&!resume&&<p>{preview.content.questions.length} {t('quiz.questions')}</p>}
    {assignment?.effectiveDueAt&&<p className="quiz-card-date">{t('quiz.dueAt')} · {new Intl.DateTimeFormat(language==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',dateStyle:'medium',timeStyle:'short'}).format(new Date(assignment.effectiveDueAt))} GMT+8</p>}
    {assignment&&!staff&&!resume&&!assignment.canStart&&<p role="status">{t(assignment.startBlockedReason||'quiz.assignmentClosed')}</p>}
   </div>
   <div className="quiz-item-actions">{assignment&&staff?<Button onClick={()=>setRecords(true)}>{label('查看学生作答','View student responses')}</Button>:resume?<Button onClick={()=>onOpen(resume.id)} data-testid="quiz-link-resume"><RotateCcw size={17}/>{t('quiz.resume')}</Button>:(!assignment||assignment.canStart)&&<Button onClick={()=>setStarting(true)} data-testid="quiz-link-start"><Play size={17}/>{assignment?label('开始作业','Start assignment'):t('quiz.practice')}</Button>}{assignment&&attempt?.status==='submitted'&&!staff&&<Button variant="outline" onClick={()=>onOpen(attempt.id)}>{t('quiz.review')}</Button>}</div>
  </article>}
  {starting&&source&&<QuizPracticeStart source={source} onClose={()=>setStarting(false)} onOpen={id=>{setStarting(false);onOpen(id);}}/>}
 </section>;
}
