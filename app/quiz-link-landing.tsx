'use client';
import {useEffect,useState} from 'react';
import {ArrowLeft,Play} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {alertActionFailure,readApiJson} from '@/lib/action-feedback';
import {t,type Language} from '@/lib/i18n';
import type {QuizContent} from '@/lib/quiz';
import {validQuizLinkId} from '@/lib/quiz-link';
import {QuizPracticeStart,type PracticeSource} from './quiz-practice-panel';

type Preview={id:string;creator:string;content:QuizContent};
export default function QuizLinkLanding({quizId,role,language,onClose,onOpen}:{quizId:string;role:'student'|'teacher'|'admin'|'parent';language:Language;onClose:()=>void;onOpen:(attemptId:string)=>void}){
 const [preview,setPreview]=useState<Preview|null>(null),[loading,setLoading]=useState(true),[failure,setFailure]=useState<'access'|'login'|'network'|null>(null),[retry,setRetry]=useState(0),[starting,setStarting]=useState(false);
 const label=(zh:string,en:string)=>language==='zh'?zh:en,bank=role==='student'||role==='parent';
 useEffect(()=>{const controller=new AbortController();setPreview(null);setFailure(null);setLoading(true);setStarting(false);
  async function load(){try{
   if(!validQuizLinkId(quizId)){setFailure('access');return;}
   const params=new URLSearchParams({id:quizId,preview:'1',...(bank?{bank:'1'}:{})});
   const response=await groupFetch('/api/quizzes?'+params,{cache:'no-store',signal:controller.signal});
   if(!response.ok){const reason=response.status===401?'login':[403,404].includes(response.status)?'access':'network';if(!controller.signal.aborted){setFailure(reason);alertActionFailure(new Error(reason==='login'?label('登录已过期，请重新登录。','Your session expired. Please sign in again.'):reason==='access'?label('这份 Quiz 已删除或你没有查看权限。','This quiz is unavailable or you do not have access.'):label('暂时无法打开 Quiz，请重试。','Unable to open this quiz. Please retry.')));}return;}
   const data=await readApiJson<Preview>(response);if(!controller.signal.aborted)setPreview(data);
  }catch{if(!controller.signal.aborted){setFailure('network');alertActionFailure(new Error(label('暂时无法打开 Quiz，请重试。','Unable to open this quiz. Please retry.')));}}
  finally{if(!controller.signal.aborted)setLoading(false);}}
  void load();return()=>controller.abort();
 },[quizId,bank,retry]);
 const source:PracticeSource|null=preview?{id:preview.id,title:preview.content.title,subject:preview.content.subject,bank}:null;
 return <section className="quiz-workspace quiz-panel quiz-link-landing" data-testid="quiz-link-landing" aria-busy={loading}>
  <div className="quiz-workspace-head"><Button variant="outline" onClick={onClose}><ArrowLeft size={17}/>{label('返回题库','Back to library')}</Button><h2>Quiz</h2></div>
  {loading&&<p role="status">{t('quiz.loading')}</p>}
  {failure&&<div className="quiz-empty"><p role="alert">{failure==='login'?label('登录已过期，请重新登录。','Your session expired. Please sign in again.'):failure==='access'?label('这份 Quiz 已删除或你没有查看权限。','This quiz is unavailable or you do not have access.'):label('暂时无法打开 Quiz，请重试。','Unable to open this quiz. Please retry.')}</p><Button variant="outline" onClick={()=>failure==='login'?window.location.reload():setRetry(value=>value+1)}>{failure==='login'?label('重新登录','Sign in again'):t('quiz.retry')}</Button></div>}
  {preview&&<article className="quiz-library-item"><div className="quiz-card-content"><h2>{preview.content.title}</h2><p className="quiz-card-context">{[preview.content.subject,preview.content.exam].filter(Boolean).join(' · ')}</p><p className="quiz-card-creator"><span>{t('quiz.creator')}</span><strong>{preview.creator}</strong></p><p>{preview.content.questions.length} {t('quiz.questions')}</p></div><div className="quiz-item-actions"><Button onClick={()=>setStarting(true)} data-testid="quiz-link-start"><Play size={17}/>{t('quiz.practice')}</Button></div></article>}
  {starting&&source&&<QuizPracticeStart source={source} onClose={()=>setStarting(false)} onOpen={id=>{setStarting(false);onOpen(id);}}/>}
 </section>;
}
