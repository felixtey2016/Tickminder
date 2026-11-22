'use client';
import {displayFormatter} from '@/lib/display-preferences';
import {useAdminAction} from "@/app/admin-permission-context";
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,Check,ChevronLeft,ChevronRight,Clock3,Flag,Save,Timer,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import '@/app/quiz-player-wave3.css';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {QuizMath} from '@/components/quiz-math';
import {QuizPicture} from '@/components/quiz-picture';
import {QuizSoundMenu} from '@/components/quiz-sound-menu';
import {TickQuizBrand} from '@/components/tickquiz-brand';
import {t,type Language} from '@/lib/i18n';
import {practiceApi,practiceError} from '@/lib/quiz-practice-client';
import {quizDurationSeconds,formatQuizDuration} from '@/lib/quiz-duration';
import {quizQuestionLanguages,quizReadText,quizReadingLanguageLabel,type QuizAnswer,type QuizQuestion,type QuizReadingLanguage} from '@/lib/quiz';
import type {PracticeAttempt,PracticeResult} from '@/lib/quiz-practice-types';
import {useQuizSound} from '@/lib/quiz-sound';

const filled=(answer:QuizAnswer|undefined)=>Boolean(answer?.optionId||answer?.text?.trim());
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const sameFlags=(a:string[],b:string[])=>a.length===b.length&&a.every(id=>b.includes(id));
const blockedRefresh=(error:string)=>['quiz.conflict','quiz.practiceFinished','quiz.practiceLocked','quiz.notFound','quiz.forbidden'].includes(error);
function answerText(q:QuizQuestion,answer:QuizAnswer|undefined,lang:QuizReadingLanguage){
 if(!filled(answer))return t('quiz.noAnswer');const option=q.options.find(o=>o.id===answer?.optionId);return option?(quizReadText(option.text,lang)||t('quiz.option')+' '+String.fromCharCode(65+q.options.indexOf(option))):answer?.text||'';
}
function resultAnswer(q:QuizQuestion,result:PracticeResult|undefined,lang:QuizReadingLanguage){
 const key=result?.key;if(!key)return '';const option=q.options.find(o=>o.id===key.correctOptionId);return option?(quizReadText(option.text,lang)||t('quiz.option')+' '+String.fromCharCode(65+q.options.indexOf(option))):key.accepted.join(' / ')+(key.unit?' '+key.unit:'');
}
function outcome(q:QuizQuestion,result:PracticeResult|undefined){
 if(result?.status!=='graded'||result.points==null)return result?.status;
 if(result.points===q.points)return 'correct';
 if(result.points===0)return 'incorrect';
 return 'graded';
}
function solutionText(result:PracticeResult|undefined){
 return (result?.solution||result?.key?.explanation)?.trim();
}
function SolutionDetails({solution,label}:{solution:string;label?:ReactNode}){
 return <details className="quiz-solution">
  <summary>{label}<span className="quiz-solution-action">{t('quiz.viewSolution')}<ChevronRight size={16} aria-hidden="true"/></span></summary>
  <div className="quiz-solution-steps"><QuizMath text={solution}/></div>
 </details>;
}

function ElapsedTime({startedAt,deadlineAt,clockOffset}:{startedAt:string;deadlineAt:string|null;clockOffset:number}){
 const valueAtCurrentTime=()=>quizDurationSeconds(startedAt,Math.min(Date.now()+clockOffset,deadlineAt?Date.parse(deadlineAt):Infinity));
 const [seconds,setSeconds]=useState(valueAtCurrentTime);
 useEffect(()=>{
  const update=()=>setSeconds(valueAtCurrentTime());
  update();const timer=window.setInterval(update,1000);
  return()=>window.clearInterval(timer);
 },[startedAt,deadlineAt,clockOffset]);
 if(seconds===null)return null;
 return <span className="quiz-elapsed-timer" role="timer" aria-label={t('quiz.timeElapsed')}><Timer size={16} aria-hidden="true"/>{t('quiz.timeElapsed')} <time dateTime={'PT'+seconds+'S'}>{formatQuizDuration(seconds)}</time></span>;
}

export default function QuizPracticePlayer({attemptId,language,onClose,onChanged,presentation='dialog',onResultChange}:{attemptId:string;language:Language;onClose:()=>void;onChanged?:()=>void;presentation?:'dialog'|'page';onResultChange?:(submitted:boolean)=>void}){
 const page=presentation==='page';
 const Title=page?'h1':DialogTitle;
 const [desktopNavigation,setDesktopNavigation]=useState(false);
 useEffect(()=>{
  if(!page)return;
  const media=window.matchMedia('(min-width: 900px)');
  const update=()=>setDesktopNavigation(media.matches);
  update();media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[page]);
 const can=useAdminAction();
 const [attempt,setAttempt]=useState<PracticeAttempt|null>(null),[answers,setAnswers]=useState<Record<string,QuizAnswer>>({}),[flags,setFlags]=useState<string[]>([]),[index,setIndex]=useState(0),[preferredLanguage,setPreferredLanguage]=useState<QuizReadingLanguage>('primary'),[clockOffset,setClockOffset]=useState(0);
 const [error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),[confirm,setConfirm]=useState(false),[recoveryConfirm,setRecoveryConfirm]=useState<'leave'|'reload'|null>(null),[remaining,setRemaining]=useState<number|null>(null),[wrongOnly,setWrongOnly]=useState(false),[gradePoints,setGradePoints]=useState(''),[gradeFeedback,setGradeFeedback]=useState(''),[gradeReason,setGradeReason]=useState(''),[gradeSaved,setGradeSaved]=useState(false);
 const current=useRef<PracticeAttempt|null>(null),local=useRef<Record<string,QuizAnswer>>({}),localFlags=useRef<string[]>([]),localQuestion=useRef<string|null>(null),serverOffset=useRef(0),saving=useRef(false),pending=useRef<{body:Record<string,unknown>;snapshot:Record<string,QuizAnswer>;flags:string[]}|null>(null),mounted=useRef(true),deadlineSent=useRef(false),exitRequested=useRef(false);
 const done=attempt?.status==='submitted',answering=Boolean(attempt?.canAnswer&&!done);
 const timeTaken=attempt?.submittedAt?quizDurationSeconds(attempt.startedAt,attempt.submittedAt):null;
 const resultChange=useRef(onResultChange);
 resultChange.current=onResultChange;
 useEffect(()=>{if(attempt)resultChange.current?.(attempt.status==='submitted');},[attempt?.id,attempt?.status]);
 const audio=useQuizSound(attempt?.accountId,answering?attempt?.id:undefined);
 const editingText=useRef(false),queuedCheck=useRef<string|null>(null);
 const [checkingQuestionId,setCheckingQuestionId]=useState<string|null>(null);
 const requestCompletesSelf=Boolean(pending.current&&!attempt?.assignmentId&&pending.current.body.deferCompletion!==true&&attempt?.content.questions.every(question=>filled(pending.current!.snapshot[question.id])&&(!attempt.immediate||attempt.manualQuestionIds.includes(question.id)||attempt.checkedQuestionIds.includes(question.id)||pending.current!.body.action==='check'&&pending.current!.body.questionId===question.id)));
 const dateFormatter=useMemo(()=>displayFormatter(language==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),[language]);
 function syncClock(value:string|undefined){if(value&&Number.isFinite(Date.parse(value))){serverOffset.current=Date.parse(value)-Date.now();setClockOffset(serverOffset.current);}}
 async function load(){queuedCheck.current=null;setCheckingQuestionId(null);setLoading(true);setError('');try{const {attempt:next,serverNow}=await practiceApi<{attempt:PracticeAttempt;serverNow?:string}>({attemptId});if(!mounted.current)return;syncClock(serverNow);current.current=next;local.current=next.answers;localFlags.current=next.flaggedQuestionIds;setAttempt(next);setAnswers(next.answers);setFlags(next.flaggedQuestionIds);const resumeIndex=next.status==='in_progress'&&next.canAnswer?Math.max(0,next.content.questions.findIndex(question=>question.id===next.currentQuestionId)):0;setIndex(resumeIndex);localQuestion.current=next.content.questions[resumeIndex]?.id||null;setDirty(false);pending.current=null;deadlineSent.current=false;exitRequested.current=false;}catch(e){if(mounted.current)setError(practiceError(e));}finally{if(mounted.current)setLoading(false);}}
 useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false;};},[attemptId]);
 useEffect(()=>{if(!attempt?.deadlineAt||done){setRemaining(null);return;}const update=()=>setRemaining(Math.max(0,Math.ceil((Date.parse(attempt.deadlineAt!)-Date.now()-clockOffset)/1000)));update();const id=window.setInterval(update,500);return()=>clearInterval(id);},[attempt?.deadlineAt,done,clockOffset]);
 useEffect(()=>{const unload=(event:BeforeUnloadEvent)=>{if(dirty||saving.current||pending.current){event.preventDefault();event.returnValue='';}},navigate=(event:Event)=>{if(dirty||saving.current||pending.current){event.preventDefault();if(dirty&&!saving.current&&!pending.current)void mutate('save');}};window.addEventListener('beforeunload',unload);window.addEventListener('tickminder-navigate',navigate);return()=>{window.removeEventListener('beforeunload',unload);window.removeEventListener('tickminder-navigate',navigate);};},[dirty]);

 async function perform(request:NonNullable<typeof pending.current>){
  if(saving.current)return false;let succeeded=false;saving.current=true;setBusy(true);setError('');pending.current=request;
  if(request.body.action==='check')setCheckingQuestionId(String(request.body.questionId));
  try{
   const {attempt:next,serverNow}=await practiceApi<{attempt:PracticeAttempt;serverNow?:string}>({},request.body);succeeded=true;if(!mounted.current)return false;syncClock(serverNow);if(request.body.automatic===true&&next.status==='in_progress')deadlineSent.current=false;
   const before=current.current;
   const checked=request.body.questionId;
   if(request.body.action==='check'&&typeof checked==='string'&&before?.id===next.id&&before.immediate&&
      !exitRequested.current&&!before.checkedQuestionIds.includes(checked)&&next.checkedQuestionIds.includes(checked)){
    const outcome=next.results.find(result=>result.questionId===checked)?.status;
    if(outcome==='correct'||outcome==='incorrect')void audio.playEffect(outcome);
   }
   const merged={...next.answers};if(next.status==='in_progress')for(const [id,value] of Object.entries(local.current))if(!same(value,request.snapshot[id])&&!next.checkedQuestionIds.includes(id))merged[id]=value;
   const mergedFlags=next.status==='in_progress'&&!sameFlags(localFlags.current,request.flags)?localFlags.current:next.flaggedQuestionIds;
   const finishAfterBlur=next.status==='in_progress'&&!next.assignmentId&&request.body.deferCompletion===true&&!editingText.current&&next.content.questions.every(question=>filled(merged[question.id]));
   current.current=next;local.current=merged;localFlags.current=mergedFlags;setAttempt(next);setAnswers(merged);setFlags(mergedFlags);setDirty(next.status==='in_progress'&&(finishAfterBlur||!same(merged,next.answers)||!sameFlags(mergedFlags,next.flaggedQuestionIds)||localQuestion.current!==next.currentQuestionId));pending.current=null;if(next.status==='submitted'||request.body.action==='grade')onChanged?.();if(request.body.action==='grade')setGradeSaved(true);return true;
  }catch(e){if(mounted.current){const code=practiceError(e);setError(code);if(!['quiz.network','quiz.unavailable','quiz.practiceUnavailable'].includes(code))pending.current=null;if(request.body.action==='submit')deadlineSent.current=false;}return false;}
  finally{
   saving.current=false;
   if(mounted.current){
    setBusy(false);
    const questionId=queuedCheck.current;
    if(succeeded||!pending.current||request.body.action!=='save')queuedCheck.current=null;
    const next=current.current;
    // If an autosave is in flight, grade the selected answer using its updated revision.
    if(questionId&&succeeded&&!pending.current&&next&&next.id===request.body.attemptId&&next.canAnswer&&next.status==='in_progress'&&!next.checkedQuestionIds.includes(questionId)&&filled(local.current[questionId])&&(!next.deadlineAt||Date.parse(next.deadlineAt)>Date.now()+serverOffset.current)){
     void mutate('check',{questionId});
    }else{
     if(questionId||request.body.action==='check')setCheckingQuestionId(null);
     if(exitRequested.current){exitRequested.current=false;if(!succeeded||pending.current){/* Keep the player and unsaved answers available for retry. */}else if(current.current?.status==='in_progress'&&(!same(local.current,current.current.answers)||!sameFlags(localFlags.current,current.current.flaggedQuestionIds)||localQuestion.current!==current.current.currentQuestionId||request.body.deferCompletion===true&&!current.current.assignmentId&&current.current.content.questions.every(question=>filled(local.current[question.id])))){exitRequested.current=true;void mutate('save');}else onClose();}
    }
   }
  }
 }
 function confirmAnswer(questionId:string){
  const a=current.current;
  if(!a?.canAnswer||a.status!=='in_progress'||!a.immediate||a.checkedQuestionIds.includes(questionId)||a.manualQuestionIds.includes(questionId)||!filled(local.current[questionId])||queuedCheck.current||a.deadlineAt&&Date.parse(a.deadlineAt)<=Date.now()+serverOffset.current)return;
  audio.prepareEffect();
  if(saving.current&&pending.current?.body.action==='save'){
   queuedCheck.current=questionId;setCheckingQuestionId(questionId);return;
  }
  if(saving.current||pending.current)return;
  void mutate('check',{questionId});
 }
 function mutate(action:'save'|'check'|'submit',extra:Record<string,unknown>={}){const a=current.current;if(!a||!a.canAnswer||a.status!=='in_progress'||saving.current||pending.current)return Promise.resolve(false);const snapshot=structuredClone(local.current),savedFlags=[...localFlags.current];if(action==='submit'&&extra.automatic!==true&&a.content.questions.some(question=>!filled(snapshot[question.id]))){setError('quiz.allAnswersRequired');return Promise.resolve(false);}return perform({body:{action,attemptId:a.id,revision:a.revision,answers:snapshot,flaggedQuestionIds:savedFlags,...(localQuestion.current?{currentQuestionId:localQuestion.current}:{}),operationId:crypto.randomUUID(),...(action==='save'&&!a.assignmentId&&editingText.current?{deferCompletion:true}:{}),...extra},snapshot,flags:savedFlags});}
 useEffect(()=>{if(!dirty||busy||error||done||!attempt?.canAnswer)return;const timer=window.setTimeout(()=>{void mutate('save');},700);return()=>clearTimeout(timer);},[answers,flags,index,dirty,busy,error,done,attempt?.revision]);
 useEffect(()=>{if(remaining!==0||done||!attempt?.canAnswer||busy||error||deadlineSent.current)return;if(current.current?.deadlineAt&&Date.parse(current.current.deadlineAt)>Date.now()+serverOffset.current)return;deadlineSent.current=true;void mutate('submit',{automatic:true});},[remaining,done,attempt?.revision,busy,error,clockOffset]);
 function updateAnswer(q:QuizQuestion,value:QuizAnswer){
  if(answerDisabled||queuedCheck.current===q.id||current.current?.checkedQuestionIds.includes(q.id)||pending.current&&!saving.current||pending.current?.body.action==='check')return;
  local.current={...local.current,[q.id]:value};
  setAnswers(local.current);setDirty(true);setError('');
  if(value.optionId)confirmAnswer(q.id);
 }
 function toggleFlag(id:string){if(!answering||pending.current&&!saving.current||['quiz.conflict','quiz.practiceFinished','quiz.practiceLocked'].includes(error))return;localFlags.current=localFlags.current.includes(id)?localFlags.current.filter(value=>value!==id):[...localFlags.current,id];setFlags(localFlags.current);setDirty(true);setError('');}
 async function close(){
  editingText.current=false;
  if(saving.current){exitRequested.current=true;return;}
  if(pending.current||error&&dirty){setRecoveryConfirm('leave');return;}
  if(!done&&dirty&&current.current?.canAnswer){exitRequested.current=true;await mutate('save');return;}
  onClose();
 }
 function changeQuestion(position:number){
  const next=Math.max(0,Math.min(position,(current.current?.content.questions.length||1)-1));setIndex(next);
  if(page&&next!==index)requestAnimationFrame(()=>document.querySelector('.tikquiz-question-card')?.scrollIntoView({block:'start'}));
  const a=current.current;if(!a?.canAnswer||a.status!=='in_progress')return;
  const questionId=a.content.questions[next]?.id||null;if(questionId!==localQuestion.current){localQuestion.current=questionId;setDirty(true);}
 }
 const resultsByQuestion=useMemo(()=>new Map(attempt?.results.map(result=>[result.questionId,result])),[attempt?.results]);
 const questions=attempt?.content.questions||[];
 const showQuestionResults=done&&attempt?.answersVisible;
 const showCorrectCount=showQuestionResults&&attempt?.scoreVisible;
 const reviewQuestions=wrongOnly&&showCorrectCount?questions.filter(question=>outcome(question,resultsByQuestion.get(question.id))!=='correct'):questions;
 const correctCount=showCorrectCount?questions.filter(question=>outcome(question,resultsByQuestion.get(question.id))==='correct').length:0;
 const q=reviewQuestions[Math.min(index,Math.max(0,reviewQuestions.length-1))],result=q?resultsByQuestion.get(q.id):undefined,locked=Boolean(q&&attempt?.checkedQuestionIds.includes(q.id)),unanswered=questions.filter(q=>!filled(answers[q.id])).length,answerDisabled=!answering||requestCompletesSelf||checkingQuestionId===q?.id||locked||Boolean(error&&pending.current)||['quiz.conflict','quiz.practiceFinished','quiz.practiceLocked'].includes(error)||busy&&pending.current?.body.action!=='save'||remaining===0;
 const immediateChoiceResult=Boolean(q?.options.length&&attempt?.immediate&&locked&&(result?.status==='correct'||result?.status==='incorrect'));
 const correctChoiceId=immediateChoiceResult&&q?(result?.correctOptionId??result?.key?.correctOptionId??(result?.status==='correct'?answers[q.id]?.optionId:undefined)):undefined;
 const correctChoiceIndex=q?.options.findIndex(option=>option.id===correctChoiceId)??-1;
 const showOutcome=attempt?.scoreVisible||!done||immediateChoiceResult;
 const currentSolution=immediateChoiceResult?solutionText(result):undefined;
 useEffect(()=>{setGradePoints(result?.points==null?'':String(result.points));setGradeFeedback(result?.feedback||'');setGradeReason('');},[q?.id,result?.points,result?.feedback]);
 useEffect(()=>{setGradeSaved(false);},[q?.id]);
 async function grade(){const a=current.current;if(!a||!q||saving.current||pending.current)return;const points=Number(gradePoints);if(!gradePoints.trim()||!Number.isFinite(points)||points<0||points>q.points||Math.abs(Math.round(points*100)-points*100)>1e-8){setError('quiz.invalidGrade');return;}if(result?.status==='graded'&&!gradeReason.trim()){setError('quiz.gradeReasonRequired');return;}await perform({body:{action:'grade',operationId:crypto.randomUUID(),attemptId:a.id,revision:a.revision,questionId:q.id,points,feedback:gradeFeedback.trim(),...(gradeReason.trim()?{reason:gradeReason.trim()}:{})},snapshot:structuredClone(local.current),flags:[...localFlags.current]});}
 function finishTextEditing(){editingText.current=false;const a=current.current;if(a&&!a.assignmentId&&a.canAnswer&&a.status==='in_progress'&&a.content.questions.every(question=>filled(local.current[question.id])))setDirty(true);}
 function goToRemaining(){const position=questions.findIndex(question=>!filled(answers[question.id])||Boolean(attempt?.immediate&&!attempt.manualQuestionIds.includes(question.id)&&!attempt.checkedQuestionIds.includes(question.id)));if(position>=0)changeQuestion(position);}
 function retry(){if(pending.current)void perform(pending.current);else if(blockedRefresh(error)&&dirty)setRecoveryConfirm('reload');else if(dirty&&current.current?.canAnswer)void mutate('save');else void load();}

 const label=(zh:string,en:string)=>language==='zh'?zh:en;
 const primaryLanguage=attempt?.content.primaryLanguage||'zh';
 const languages=q?quizQuestionLanguages(q,primaryLanguage):[];
 const questionLanguage=languages.includes(preferredLanguage)?preferredLanguage:languages[0]||'primary';
 const saveLabel=t(busy?'quiz.savingAnswers':dirty?'quiz.unsaved':'quiz.answersSaved');
 const backgroundSave=Boolean(saving.current&&pending.current?.body.action==='save');
 const body=<>
  {page&&<div className="tikquiz-player-header"><div className="tikquiz-player-header-inner"><Button type="button" variant="outline" size="icon" disabled={busy} aria-label={t(attempt?.assignmentId?'quiz.backToHub':'quiz.exitPractice')} onClick={()=>void close()}><ArrowLeft size={20} aria-hidden="true"/></Button><span className="tikquiz-logo"><TickQuizBrand/></span></div></div>}
  <div className="quiz-player-heading"><div className="quiz-practice-heading-copy"><Title className="quiz-practice-title" title={attempt?.title||t('quiz.practiceTitle')}>{attempt?.title||t('quiz.practiceTitle')}</Title><div className="quiz-practice-meta">{attempt?.creator&&<p className="quiz-creator" title={t('quiz.creator')+' · '+attempt.creator}>{t('quiz.creator')} · {attempt.creator}</p>}{answering&&<span className="quiz-autosave" role="status" aria-label={saveLabel} title={saveLabel}><Save size={14} aria-hidden="true"/>{busy?label('保存中…','Saving…'):dirty?label('未保存','Unsaved'):label('已保存','Saved')}</span>}</div></div>{!page&&<div className="quiz-player-heading-actions">{answering&&<QuizSoundMenu language={language} audio={audio}/>}<Button type="button" variant="ghost" className="quiz-player-close" aria-label={t(attempt?.assignmentId?'quiz.backToHub':'quiz.exitPractice')} disabled={busy} onClick={()=>void close()}><X size={20} aria-hidden="true"/></Button></div>}</div>{!page&&<DialogDescription className="sr-only">{t('quiz.practiceTitle')}</DialogDescription>}
  {page&&answering&&<div className="tikquiz-audio-bar"><QuizSoundMenu language={language} audio={audio} showTrack/></div>}
  {loading&&<p role="status">{t('quiz.loading')}</p>}
  {error&&<div className="quiz-error" role="alert" data-error-popup-ignore><p>{t(error==='quiz.conflict'?'quiz.attemptConflict':error)}</p>{dirty&&<p>{label('未保存的作答仍保留在这里。','Your unsaved answers are still here.')}</p>}<Button variant="outline" onClick={retry} disabled={busy}>{t(blockedRefresh(error)?'quiz.refresh':'quiz.retry')}</Button>{dirty&&<Button variant="ghost" disabled={busy} onClick={()=>setRecoveryConfirm('leave')}>{label('离开选项','Leave options')}</Button>}</div>}
  {attempt&&!loading&&<>
   {!done&&!attempt.canAnswer&&<p className="quiz-note">{t('quiz.practiceReadOnly')}</p>}
   {attempt.content.instructions&&<details className="quiz-practice-instructions"><summary>{label('说明','Instructions')}</summary><div><QuizMath text={attempt.content.instructions}/></div></details>}
   {done&&<section className="quiz-result-summary" aria-label={t('quiz.practiceComplete')}><Check size={24} aria-hidden="true" className="quiz-result-check"/><div><h3>{t('quiz.practiceComplete')}</h3>{attempt.scoreVisible&&attempt.score!==null?<><p><strong>{t(attempt.pendingManual?'quiz.provisionalScore':'quiz.score')} {attempt.score} / {attempt.totalScore}</strong></p>{showCorrectCount&&<p className="quiz-correct-count">{t('quiz.questionsCorrect').replace('{correct}',String(correctCount)).replace('{total}',String(questions.length))}</p>}{attempt.rawScore!==null&&attempt.rawTotalScore!==attempt.totalScore&&<p>{t('quiz.rawScore')} · {attempt.rawScore} / {attempt.rawTotalScore}</p>}{attempt.pendingManual>0&&<p>{t('quiz.resultPending')}</p>}</>:<p>{t('quiz.scoreNotReleased')}</p>}{!attempt.answersVisible&&<p>{t('quiz.answersNotReleased')}</p>}{attempt.late&&<p className="quiz-assignment-blocked">{t('quiz.late')}</p>}{attempt.submissionReason==='timer'&&<p>{t('quiz.autoSubmittedTimer')}</p>}{attempt.submissionReason==='deadline'&&<p>{t('quiz.autoSubmittedDeadline')}</p>}{timeTaken!==null&&<p className="quiz-time-taken" data-testid="quiz-time-taken"><Timer size={16} aria-hidden="true"/><strong>{t('quiz.timeTaken')}</strong><time dateTime={'PT'+timeTaken+'S'}>{formatQuizDuration(timeTaken)}</time></p>}{attempt.submittedAt&&<time dateTime={attempt.submittedAt}>{dateFormatter.format(new Date(attempt.submittedAt))} GMT+8</time>}</div></section>}
   {done&&(!attempt.scoreVisible||!attempt.answersVisible)&&<Button variant="outline" disabled={loading||busy} onClick={()=>void load()}>{t('quiz.refresh')}</Button>}
   {done&&attempt.scoreVisible&&attempt.answersVisible&&<label className="quiz-check"><input type="checkbox" checked={wrongOnly} onChange={e=>{setWrongOnly(e.target.checked);setIndex(0);}}/>{t('quiz.wrongQuestions')}</label>}
   {showQuestionResults&&reviewQuestions.length>0&&<section className="quiz-question-results" aria-label={t('quiz.questionResults')}>
    <h3>{t('quiz.questionResults')}</h3>
    <ol>{reviewQuestions.map(question=>{
     const saved=resultsByQuestion.get(question.id),status=attempt.scoreVisible?outcome(question,saved):undefined;
     const solution=solutionText(saved),number=questions.indexOf(question)+1;
     const title=<span className="quiz-result-question">
      <strong>{t('quiz.questionNumber').replace('{number}',String(number))}</strong>
      {status&&<span className={'quiz-result-mark '+status}>
       {status==='correct'&&<Check size={15} aria-hidden="true"/>}
       {status==='incorrect'&&<X size={15} aria-hidden="true"/>}
       {status==='graded'?t('quiz.score')+' '+saved!.points+' / '+question.points:t(status==='correct'?'quiz.correctResult':status==='incorrect'?'quiz.incorrectResult':'quiz.pendingManual')}
      </span>}
     </span>;
     return <li key={question.id}>{solution?<SolutionDetails solution={solution} label={title}/>:title}</li>;
    })}</ol>
   </section>}
   <div className={page?'tikquiz-practice-layout':undefined}>
   <details className="quiz-attempt-navigation" open={page&&desktopNavigation?true:undefined}><summary aria-label={t('quiz.questionNavigation')+' · '+t('quiz.navSummary').replace('{answered}',String(questions.filter(question=>filled(answers[question.id])).length)).replace('{total}',String(questions.length)).replace('{flagged}',String(flags.length))}><ChevronRight size={16} aria-hidden="true"/><span>{label('题目','Questions')}</span><span className="quiz-navigation-count">{questions.filter(question=>filled(answers[question.id])).length} / {questions.length}{flags.length>0&&<><Flag size={13} aria-hidden="true"/>{flags.length}</>}</span></summary><nav aria-label={t('quiz.questionNavigation')}>{reviewQuestions.map((question,position)=>{const answered=filled(answers[question.id]),flagged=flags.includes(question.id),number=questions.findIndex(item=>item.id===question.id)+1;return <button type="button" key={question.id} className={(position===index?'is-current ':'')+(answered?'is-answered ':'')+(flagged?'is-flagged':'')} aria-current={position===index?'step':undefined} aria-label={[t('quiz.questionNumber').replace('{number}',String(number)),t(answered?'quiz.answered':'quiz.unanswered'),flagged?t('quiz.flagged'):''].filter(Boolean).join(' · ')} onClick={()=>changeQuestion(position)}><span>{number}</span>{flagged&&<Flag size={12} aria-hidden="true"/>}</button>;})}</nav></details>
   <div className={page?'tikquiz-question-card':undefined}>
   {!reviewQuestions.length&&done&&<p className="quiz-empty">{t('quiz.noWrongQuestions')}</p>}
   {q&&<>
    <div className="quiz-player-top quiz-practice-question-bar"><span className="quiz-question-position">{Math.min(index+1,reviewQuestions.length)} / {reviewQuestions.length} · {q.points} {t('quiz.pointsUnit')}</span>{answering&&<ElapsedTime startedAt={attempt.startedAt} deadlineAt={attempt.deadlineAt} clockOffset={clockOffset}/>}{!done&&remaining!==null&&<span className="quiz-practice-timer" role="timer" aria-label={t('quiz.deadline')} title={label('离开页面后计时仍会继续','The timer keeps running when you leave')}><Clock3 size={16} aria-hidden="true"/>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</span>}<div className="quiz-question-tools">{languages.length>1&&<><label className="sr-only" htmlFor="quiz-practice-language">{t('quiz.questionDisplayLanguage')}</label><select id="quiz-practice-language" value={questionLanguage} onChange={event=>setPreferredLanguage(event.target.value as QuizReadingLanguage)}>{languages.map(code=><option key={code} value={code}>{quizReadingLanguageLabel(code,primaryLanguage)}</option>)}</select></>}{answering&&<Button type="button" variant="ghost" className="quiz-flag-question" aria-label={t(flags.includes(q.id)?'quiz.unflagQuestion':'quiz.flagQuestion')} title={t(flags.includes(q.id)?'quiz.unflagQuestion':'quiz.flagQuestion')} aria-pressed={flags.includes(q.id)} disabled={busy&&pending.current?.body.action!=='save'||Boolean(error&&pending.current)||['quiz.conflict','quiz.practiceFinished','quiz.practiceLocked'].includes(error)} onClick={()=>toggleFlag(q.id)}><Flag size={16} aria-hidden="true"/></Button>}</div></div>
    <progress value={Math.min(index+1,reviewQuestions.length)} max={reviewQuestions.length} aria-label={t('quiz.questions')}/>
    {answering&&remaining===0&&<p role="status">{t('quiz.practiceTimeUp')}</p>}
    <section className="quiz-player-question"><h3><QuizMath text={quizReadText(q.prompt,questionLanguage)}/></h3>{q.imageId&&<QuizPicture id={q.imageId} alt={t('quiz.promptImage')}/>} {q.extraImageIds.map(id=><QuizPicture key={id} id={id} alt={t('quiz.promptImage')}/>)}</section>
    {q.options.length?<div className="quiz-answer-grid" aria-busy={checkingQuestionId===q.id}>{q.options.map((option,position)=>{
      const selected=answers[q.id]?.optionId===option.id;
      const correct=correctChoiceId===option.id;
      const incorrect=immediateChoiceResult&&selected&&result?.status==='incorrect';
      const state=correct?'is-correct':incorrect?'is-incorrect':selected?'is-selected':'';
      const letter=String.fromCharCode(65+position);
      return <div key={option.id} className={state?'quiz-answer-cell '+state:'quiz-answer-cell'}>
       <button type="button" className="quiz-option-button" disabled={answerDisabled} aria-pressed={selected} onClick={()=>updateAnswer(q,{optionId:option.id})}>
        <span className="quiz-option-letter">{letter}</span>
        <QuizMath text={quizReadText(option.text,questionLanguage)}/>
        {incorrect?<X size={20} className="quiz-option-result-icon" aria-hidden="true"/>:(selected||correct)&&<Check size={20} className="quiz-option-result-icon" aria-hidden="true"/>}
        {(correct||incorrect)&&<span className="sr-only">{t(correct?'quiz.correctAnswer':'quiz.incorrectResult')}</span>}
       </button>
       {option.imageId&&<QuizPicture id={option.imageId} alt={t('quiz.optionImage')+' '+letter}/>}
      </div>;
    })}</div>:<label className="quiz-field">{t('quiz.yourAnswer')}{q.answerUnit&&<span>{t('quiz.answerUnit')} · {q.answerUnit}</span>}<textarea onFocus={()=>{editingText.current=true;}} onBlur={finishTextEditing} rows={q.type==='written'?5:2} maxLength={6000} disabled={answerDisabled} value={answers[q.id]?.text||''} onChange={e=>updateAnswer(q,{text:e.target.value,...(q.answerUnit?{unit:q.answerUnit}:{})})}/></label>}
    {q.options.length>0&&checkingQuestionId===q.id&&<p className="quiz-note" role="status">{t('quiz.checkingAnswer')}</p>}
    {answering&&attempt.immediate&&!q.options.length&&!attempt.manualQuestionIds.includes(q.id)&&<div className="quiz-check-answer"><Button type="button" aria-busy={checkingQuestionId===q.id} disabled={locked||Boolean(checkingQuestionId)||busy&&!backgroundSave||Boolean(pending.current)&&!backgroundSave||!filled(answers[q.id])||remaining===0||blockedRefresh(error)} onClick={()=>confirmAnswer(q.id)}>{t(checkingQuestionId===q.id?'quiz.checkingAnswer':'quiz.submitAnswer')}</Button>{locked&&<p className="quiz-note">{t('quiz.answerLocked')}</p>}</div>}
    {!done&&attempt.manualQuestionIds.includes(q.id)&&<p className="quiz-note">{t(attempt.assignmentId?'quiz.pendingManual':'quiz.pendingSelfManual')}</p>}
    {(done&&(attempt.scoreVisible||attempt.answersVisible)||locked)&&result&&<section className={'quiz-answer-feedback '+(showOutcome?result.status:'released-answer')} aria-live="polite">
     {showOutcome&&<strong>{t(result.status==='correct'?'quiz.correctResult':result.status==='incorrect'?'quiz.incorrectResult':result.status==='graded'?'quiz.score':attempt.assignmentId?'quiz.pendingManual':'quiz.pendingSelfManual')}{attempt.scoreVisible&&result.points!==null&&' · '+result.points+' / '+q.points}</strong>}
     {result.status==='incorrect'&&correctChoiceIndex>=0&&(!done||!attempt.answersVisible)&&<p>{t('quiz.correctAnswer')} · {String.fromCharCode(65+correctChoiceIndex)}</p>}
     {done&&<><p>{t('quiz.yourAnswer')} · <QuizMath text={answerText(q,answers[q.id],questionLanguage)}/></p>{attempt.answersVisible&&result.key&&resultAnswer(q,result,questionLanguage)&&<p>{t('quiz.correctAnswer')} · <QuizMath text={resultAnswer(q,result,questionLanguage)}/></p>}{attempt.answersVisible&&result.key?.correctOptionId&&q.options.find(o=>o.id===result.key?.correctOptionId)?.imageId&&<QuizPicture id={q.options.find(o=>o.id===result.key?.correctOptionId)!.imageId!} alt={t('quiz.correctAnswer')}/>} {attempt.scoreVisible&&result.feedback&&<p>{t('quiz.manualFeedback')} · {result.feedback}</p>}</>}
     {currentSolution&&<SolutionDetails key={q.id} solution={currentSolution}/>}
    </section>}
    {done&&attempt.canGrade&&can("quizAssignments.grade")&&(result?.status==='manual'||result?.status==='graded')&&<fieldset className="quiz-grade-panel"><legend>{t('quiz.grade')}</legend><label className="quiz-field">{t('quiz.gradePoints')}<input type="number" min="0" max={q.points} step="0.01" value={gradePoints} onChange={e=>{setGradePoints(e.target.value);setGradeSaved(false);}}/></label><label className="quiz-field">{t('quiz.gradeFeedback')}<textarea maxLength={2000} value={gradeFeedback} onChange={e=>{setGradeFeedback(e.target.value);setGradeSaved(false);}}/></label>{result.status==='graded'&&<label className="quiz-field">{t('quiz.gradeReason')}<textarea required maxLength={1000} value={gradeReason} onChange={e=>{setGradeReason(e.target.value);setGradeSaved(false);}}/></label>}<Button adminGrant="quizAssignments.grade" disabled={busy} onClick={()=>void grade()}>{t('quiz.gradeSave')}</Button>{gradeSaved&&<p role="status">{t('quiz.gradeSaved')}</p>}</fieldset>}
    <div className="quiz-player-nav"><Button variant="outline" disabled={index===0} onClick={()=>changeQuestion(index-1)}><ChevronLeft size={17}/>{t('quiz.previous')}</Button>{index<reviewQuestions.length-1?<Button variant="outline" onClick={()=>changeQuestion(Math.min(index+1,reviewQuestions.length-1))}>{t('quiz.next')}<ChevronRight size={17}/></Button>:answering&&attempt.assignmentId?<Button disabled={unanswered>0||busy||Boolean(pending.current)} onClick={()=>setConfirm(true)}>{t('quiz.submitPractice')}</Button>:answering&&(unanswered>0||attempt.immediate&&questions.some(question=>!attempt.manualQuestionIds.includes(question.id)&&!attempt.checkedQuestionIds.includes(question.id)))?<Button variant="outline" onClick={goToRemaining}>{t(unanswered?'quiz.backToUnanswered':'quiz.backToUnconfirmed')}</Button>:null}</div>
   </>}
   </div></div>
   {answering&&attempt.assignmentId&&<div className="quiz-practice-submit"><p className="quiz-note" role="status">{t((unanswered?'quiz.remainingToSubmit':'quiz.readyToSubmit')).replace('{count}',String(unanswered))}</p>{q&&index!==reviewQuestions.length-1&&<Button variant="outline" disabled={unanswered>0||busy||Boolean(pending.current)} onClick={()=>setConfirm(true)}>{t('quiz.submitPractice')}</Button>}</div>}
   {done&&<div className="quiz-practice-submit"><Button onClick={onClose}>{t('quiz.closeResults')}</Button></div>}
  </>}
  <Dialog open={confirm&&Boolean(attempt?.assignmentId)} onOpenChange={setConfirm}><DialogContent className="quiz-confirm-dialog quiz-player-wave3"><DialogTitle>{t('quiz.submitPractice')}</DialogTitle><DialogDescription>{t('quiz.formalSubmitConfirm')}</DialogDescription>{unanswered>0&&<p className="quiz-note">{t('quiz.allAnswersRequired')}</p>}<div className="quiz-confirm-actions"><Button variant="outline" disabled={busy} onClick={()=>setConfirm(false)}>{t('quiz.cancel')}</Button><Button disabled={unanswered>0||busy||Boolean(pending.current)} onClick={()=>{if(unanswered)return;setConfirm(false);void mutate('submit');}}>{t('quiz.confirmSubmit')}</Button></div></DialogContent></Dialog>
  <Dialog open={Boolean(recoveryConfirm)} onOpenChange={open=>{if(!open)setRecoveryConfirm(null);}}><DialogContent className="quiz-confirm-dialog quiz-player-wave3"><DialogTitle>{label('还有未保存的作答','Some answers have not been saved')}</DialogTitle><DialogDescription>{recoveryConfirm==='reload'?label('重新载入会放弃未保存的修改，并读取最近保存的记录。','Reloading discards unsaved changes and reads the latest saved record.'):label('可以先返回重试保存。直接离开会失去尚未保存的修改。','Return to retry saving. Leaving now will lose changes that have not been saved.')}</DialogDescription><div className="quiz-confirm-actions"><Button variant="outline" onClick={()=>setRecoveryConfirm(null)}>{label('保留作答','Keep my answers')}</Button><Button variant="destructive" onClick={()=>{const action=recoveryConfirm;setRecoveryConfirm(null);pending.current=null;exitRequested.current=false;if(action==='reload')void load();else onClose();}}>{recoveryConfirm==='reload'?label('放弃修改并重新载入','Discard changes and reload'):label('不保存并离开','Leave without saving')}</Button></div></DialogContent></Dialog>
 </>;
 if(page)return <section className="quiz-player-dialog quiz-practice-player quiz-practice-compact quiz-player-wave3 tikquiz-practice-page">{body}</section>;
 return <Dialog open onOpenChange={open=>{if(!open)void close();}}><DialogContent className="quiz-player-dialog quiz-practice-player quiz-practice-compact quiz-player-wave3" overlayClassName="content-edit-overlay" showCloseButton={false}>{body}</DialogContent></Dialog>;
}
