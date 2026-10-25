import {quizActor,quizFailure,quizResponse,quizRequestBytes} from '@/lib/quiz-server';
import {QuizError} from '@/lib/quiz';
import {listQuizModeration,requestQuizPublic,reviewQuizPublic,withdrawQuizPublicRequest,takeDownQuizPublic,reportQuizPublic,resolveQuizReport,appealQuizPublication,resolveQuizAppeal} from '@/lib/quiz-moderation';
export async function GET(request:Request){try{return quizResponse(await listQuizModeration(await quizActor(true),new URL(request.url).searchParams));}catch(error){return quizFailure(error);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new QuizError('quiz.forbidden',403);
 const actor=await quizActor(true),bytes=await quizRequestBytes(request,16000);let data:Record<string,unknown>;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new QuizError('quiz.invalidFields');}if(!data||typeof data!=='object'||Array.isArray(data))throw new QuizError('quiz.invalidFields');
 if(['student','parent'].includes(actor.role)&&data.action!=='report')throw new QuizError('quiz.forbidden',403);
 const actions:Record<string,(a:typeof actor,d:Record<string,unknown>)=>Promise<unknown>>={requestPublic:requestQuizPublic,review:reviewQuizPublic,withdrawRequest:withdrawQuizPublicRequest,takeDown:takeDownQuizPublic,report:reportQuizPublic,resolveReport:resolveQuizReport,appeal:appealQuizPublication,resolveAppeal:resolveQuizAppeal};
 if(typeof data.action!=='string'||!Object.hasOwn(actions,data.action))throw new QuizError('quiz.invalidFields');return quizResponse(await actions[data.action](actor,data));
 }catch(error){return quizFailure(error);}}
