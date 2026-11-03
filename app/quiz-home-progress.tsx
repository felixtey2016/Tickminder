'use client';

import {lazy, Suspense, useEffect, useState} from 'react';
import {ArrowRight, RefreshCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {getLanguage, t} from '@/lib/i18n';
import {practiceError} from '@/lib/quiz-practice-client';
import type {PracticeAttemptSummary, PracticeState} from '@/lib/quiz-practice-types';
import './quiz.css';
import './quiz-layout.css';
import './quiz-home-progress.css';

const QuizPracticePlayer=lazy(()=>import('@/components/quiz-practice-player'));

export function QuizHomeProgress({onViewAll}:{onViewAll:()=>void}){
 const [attempts,setAttempts]=useState<PracticeAttemptSummary[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0),[attemptId,setAttemptId]=useState<string|null>(null);
 const language=getLanguage(),label=(zh:string,en:string)=>language==='zh'?zh:en;
 const refresh=()=>{setLoading(true);setError('');setReload(value=>value+1);};
 useEffect(()=>{
  const controller=new AbortController();
  void groupFetch('/api/quiz-practice?ownInProgress=1',{signal:controller.signal,cache:'no-store'}).then(async response=>{
   const data=await response.json() as PracticeState&{error?:string};
   if(!response.ok)throw Error(data.error||'quiz.practiceUnavailable');
   if(!controller.signal.aborted)setAttempts(data.attempts.filter(attempt=>attempt.canAnswer&&attempt.status==='in_progress'));
  }).catch(value=>{if(!controller.signal.aborted)setError(practiceError(value));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[reload]);
 if(!loading&&!error&&!attempts.length&&!attemptId)return null;
 return <section className="quiz-home-progress" data-testid="quiz-home-progress" aria-busy={loading}>
  <header><h2>{label('继续作答','Continue a Quiz')}</h2><Button type="button" variant="ghost" onClick={onViewAll}>{label('查看全部','View all')}<ArrowRight size={16} aria-hidden="true"/></Button></header>
  {loading?<p role="status">{label('正在载入作答进度…','Loading your progress…')}</p>:error?<div role="alert" data-error-popup-ignore><p>{t(error)}</p><Button type="button" variant="outline" onClick={refresh}><RefreshCw size={16}/>{label('重试','Retry')}</Button></div>:<div className="quiz-home-progress-list">{attempts.slice(0,3).map(attempt=><article key={attempt.id}>
   <div><h3>{attempt.title}</h3><p>{label(attempt.assignmentId?'老师布置':'自主练习',attempt.assignmentId?'Assigned':'Self-practice')} · {label(`已答 ${attempt.answeredCount}/${attempt.questionCount}`,`${attempt.answeredCount}/${attempt.questionCount} answered`)}</p></div>
   <Button type="button" onClick={()=>setAttemptId(attempt.id)}>{label('继续作答','Continue')}<ArrowRight size={16} aria-hidden="true"/></Button>
  </article>)}</div>}
  {attemptId&&<Suspense fallback={<p role="status">{label('正在打开…','Opening…')}</p>}><QuizPracticePlayer attemptId={attemptId} language={language} onClose={()=>{setAttemptId(null);refresh();}} onChanged={()=>{}}/></Suspense>}
 </section>;
}
