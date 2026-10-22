import {QuizError} from '@/lib/quiz';
import {quizActor,quizFailure,quizResponse,quizRequestBytes} from '@/lib/quiz-server';
import {composeQuestions,composeQuiz} from '@/lib/quiz-compose';

export async function GET(request:Request){try{return quizResponse(await composeQuestions(await quizActor(),new URL(request.url)));}catch(error){return quizFailure(error);}}
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new QuizError('quiz.forbidden',403);
 const actor=await quizActor(),bytes=await quizRequestBytes(request,50000);let data:unknown;
 try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new QuizError('quiz.composeInvalid');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw new QuizError('quiz.composeInvalid');
 return quizResponse(await composeQuiz(actor,data as Record<string,unknown>));
}catch(error){return quizFailure(error);}}
