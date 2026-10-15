import {QuizError,type QuizContent} from '@/lib/quiz';
import type {QuizAssignmentSettings,QuizReleasePolicy} from '@/lib/quiz-practice-types';

const invalid=(key='quiz.invalidAssignmentSettings'):never=>{throw new QuizError(key);};
export function assignmentDate(value:unknown):string|null {
 if(value===null||value===undefined||value==='')return null;
 if(typeof value!=='string')return invalid('quiz.invalidSchedule');
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)){
  const stamp=Date.parse(value+':00+08:00');
  if(!Number.isFinite(stamp)||new Date(stamp+8*3600000).toISOString().slice(0,16)!==value)return invalid('quiz.invalidSchedule');
  return new Date(stamp).toISOString();
 }
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return invalid('quiz.invalidSchedule');
 const stamp=Date.parse(value);if(!Number.isFinite(stamp))return invalid('quiz.invalidSchedule');
 const out=new Date(stamp).toISOString();if(out.slice(0,19)!==value.slice(0,19))return invalid('quiz.invalidSchedule');return out;
}
export function assignmentSettings(value:unknown,content:QuizContent):QuizAssignmentSettings {
 if(value!==undefined&&(!value||typeof value!=='object'||Array.isArray(value)))return invalid();
 const data=(value||{}) as Record<string,unknown>,kind=data.kind??'practice';
 if(!['practice','quiz','homework'].includes(String(kind)))return invalid();
 const startsAt=assignmentDate(data.startsAt),dueAt=assignmentDate(data.dueAt);
 if(dueAt&&startsAt&&dueAt<=startsAt||kind!=='practice'&&!dueAt)return invalid('quiz.invalidSchedule');
 const time=data.timeLimitSeconds===undefined?content.timeLimitSeconds:data.timeLimitSeconds;
 if(time!==null&&(typeof time!=='number'||!Number.isInteger(time)||time<60||time>21600))return invalid();
 const max=data.maxAttempts===undefined?(kind==='practice'?null:1):data.maxAttempts;
 if(max!==null&&(typeof max!=='number'||!Number.isInteger(max)||max<1||max>20))return invalid();
 const late=data.latePolicy??'reject';if(!['reject','allow'].includes(String(late)))return invalid();
 const scoreMax=data.scoreMax??null;if(scoreMax!==null&&(typeof scoreMax!=='number'||!Number.isFinite(scoreMax)||scoreMax<=0||scoreMax>100000||Math.abs(scoreMax*100-Math.round(scoreMax*100))>1e-8))return invalid();
 const release=(v:unknown,defaultValue:QuizReleasePolicy)=>{const policy=v??defaultValue;if(!['submission','deadline','manual'].includes(String(policy))||policy==='deadline'&&!dueAt)return invalid();return policy as QuizReleasePolicy;};
 return {kind:kind as QuizAssignmentSettings['kind'],startsAt,dueAt,timeLimitSeconds:time as number|null,maxAttempts:max as number|null,latePolicy:late as 'reject'|'allow',scoreMax:scoreMax as number|null,scoreRelease:release(data.scoreRelease,kind==='quiz'?'deadline':'submission'),answerRelease:release(data.answerRelease,kind==='practice'?'submission':'deadline')};
}
export function effectiveQuizDeadline(personal:string|null,settings:QuizAssignmentSettings,recipientDue:string|null):string|null {
 const due=settings.latePolicy==='reject'?(recipientDue||settings.dueAt):null;
 return personal&&due?(personal<due?personal:due):personal||due;
}
export function quizReleaseVisible(policy:QuizReleasePolicy,releasedAt:string|null,dueAt:string|null,now:string) {
 return Boolean(releasedAt)||policy==='submission'||policy==='deadline'&&Boolean(dueAt&&dueAt<=now);
}
export function scaledQuizScore(score:number,total:number,max:number|null){return max===null?score:Math.round(score/total*max*100)/100;}
