'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {QuizMath} from '@/components/quiz-math';
import {t,type Language} from '@/lib/i18n';
import {practiceApi,practiceError} from '@/lib/quiz-practice-client';
import type {QuizAnalysis as Analysis,QuizAnalysisMode} from '@/lib/quiz-analytics';
const modes:QuizAnalysisMode[]=['latest','first','best','all'];
export default function QuizAnalysis({assignmentId,versionId,language,reload}:{assignmentId:string;versionId:string;language:Language;reload:number}){
 const [mode,setMode]=useState<QuizAnalysisMode>('latest'),[page,setPage]=useState(0),[data,setData]=useState<Analysis|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0),generation=useRef(0);
 useEffect(()=>{const current=++generation.current;setLoading(true);setData(null);setError('');void practiceApi<Analysis>({analytics:'1',assignmentId,versionId,attemptMode:mode,page:String(page)}).then(result=>{if(current===generation.current)setData(result);}).catch(reason=>{if(current===generation.current)setError(practiceError(reason));}).finally(()=>{if(current===generation.current)setLoading(false);});return()=>{generation.current++;};},[assignmentId,versionId,mode,page,reload,retry]);
 const percentage=(value:number|null|undefined)=>value==null?'—':new Intl.NumberFormat(language==='zh'?'zh-CN':'en-GB',{maximumFractionDigits:2}).format(value)+'%';
 return <section className="quiz-assignment-settings" aria-label={t('quiz.analysis')}>
  <h4>{t('quiz.analysis')}</h4><div className="quiz-fields"><label className="quiz-field">{t('quiz.analysisMode')}<select value={mode} onChange={event=>{setMode(event.target.value as QuizAnalysisMode);setPage(0);}}>{modes.map(value=><option value={value} key={value}>{t('quiz.analysis'+value[0].toUpperCase()+value.slice(1))}</option>)}</select></label></div>
  <p className="quiz-note">{t('quiz.analysisScope')}</p>
  {loading&&<p role="status">{t('quiz.loading')}</p>}
  {error&&<div className="quiz-error" role="alert"><p>{t(error)}</p><Button variant="outline" onClick={()=>setRetry(value=>value+1)}>{t('quiz.retry')}</Button></div>}
  {data&&!loading&&<><div className="quiz-report-counts">{(['averagePercent','highestPercent','lowestPercent'] as const).map((key,index)=><div key={key}><strong>{percentage(data.summary[key])}</strong><span>{t(['quiz.analysisAverage','quiz.analysisHighest','quiz.analysisLowest'][index])}</span></div>)}<div><strong>{data.summary.analysedAttempts}</strong><span>{t('quiz.analysisIncluded')}</span></div><div><strong>{data.summary.inProgressAttempts}</strong><span>{t('quiz.analysisInProgress')}</span></div><div><strong>{data.summary.pendingGradingAttempts}</strong><span>{t('quiz.analysisPending')}</span></div><div><strong>{data.summary.notStartedStudents}</strong><span>{t('quiz.analysisNotStarted')}</span></div></div>
   {!data.summary.analysedAttempts&&<p className="quiz-note">{t('quiz.analysisNoScores')}</p>}
   <h4>{t('quiz.analysisQuestions')}</h4><p className="quiz-note">{t('quiz.analysisDenominator')}</p>
   {data.questions.map(question=><article className="quiz-recipient-card" key={question.questionId}><div><strong>{t('quiz.questionNumber').replace('{number}',String(question.number))} · {t('quiz.'+question.type)}</strong><p className="quiz-analysis-prompt"><QuizMath text={question.prompt}/></p><p>{t('quiz.analysisReceived')} · {question.receivedCount}</p>{!question.receivedCount?<p>{t('quiz.analysisNoExposure')}</p>:<><p>{t(question.manual?'quiz.analysisQuestionScore':'quiz.analysisErrorRate')} · {percentage(question.manual?question.averageScorePercent:question.errorRatePercent)}</p>{!question.manual&&<p>{t('quiz.analysisWrong')} · {question.incorrectCount}</p>}</>}</div></article>)}
   <div className="quiz-confirm-actions"><Button variant="outline" disabled={page===0} onClick={()=>setPage(value=>value-1)}>{t('quiz.previous')}</Button><Button variant="outline" disabled={!data.hasMore} onClick={()=>setPage(value=>value+1)}>{t('quiz.next')}</Button></div>
  </>}
 </section>;
}
