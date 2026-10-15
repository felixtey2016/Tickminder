import {QuizError} from '@/lib/quiz';
import {quizFailure,quizResponse,quizRequestBytes} from '@/lib/quiz-server';
import {practiceActor,practiceState,practiceTargets,getPracticeAttempt,startPractice,assignPractice,updatePractice,gradePractice,withdrawPractice,releasePractice,accommodatePractice} from '@/lib/quiz-practice';
export async function GET(request:Request){try{
 const actor=await practiceActor(),url=new URL(request.url),attemptId=url.searchParams.get('attemptId');
 if(attemptId)return quizResponse(await getPracticeAttempt(actor,attemptId));
 if(url.searchParams.get('targets')==='1')return quizResponse(await practiceTargets(actor,url.searchParams.get('subject')||undefined));
 return quizResponse(await practiceState(actor,url));
}catch(error){return quizFailure(error);}}
export async function POST(request:Request){try{
 if(new URL(request.url).origin!==request.headers.get('origin'))throw new QuizError('quiz.forbidden',403);
 const actor=await practiceActor(),bytes=await quizRequestBytes(request,1000000);let data:Record<string,unknown>;
 try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new QuizError('quiz.invalidFields');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new QuizError('quiz.invalidFields');
 if(data.action==='start')return quizResponse(await startPractice(actor,data));
 if(data.action==='assign')return quizResponse(await assignPractice(actor,data));
 if(['save','check','submit'].includes(String(data.action)))return quizResponse(await updatePractice(actor,data));
 if(data.action==='grade')return quizResponse(await gradePractice(actor,data));
 if(data.action==='withdraw')return quizResponse(await withdrawPractice(actor,data));
 if(data.action==='release')return quizResponse(await releasePractice(actor,data));
 if(data.action==='accommodate')return quizResponse(await accommodatePractice(actor,data));
 throw new QuizError('quiz.invalidFields');
}catch(error){return quizFailure(error);}}
