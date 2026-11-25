import {quizActor,quizFailure,quizResponse,saveQuiz} from '@/lib/quiz-server';
import {isOwnerAccount} from '@/lib/owner';
import {QuizError} from '@/lib/quiz';
import {originalQuizSeed} from '@/lib/quiz-original-seed';
export async function POST(request:Request){try{
 if(request.headers.get('origin')!==new URL(request.url).origin)throw new QuizError('quiz.forbidden',403);
 const actor=await quizActor();if(!isOwnerAccount(actor))throw new QuizError('quiz.forbidden',403);
 const seed=originalQuizSeed();return quizResponse(await saveQuiz(actor,{id:'tickminder-original-spm-foundations-2026',operationId:'tickminder-original-spm-foundations-v1',revision:0,sourceKey:'d8c0fa81ac12f1fbc8a79c8b41a6b036a6095c314ad46b01d4c00530705da747',content:seed.content,keys:seed.keys},undefined,true));
 }catch(error){return quizFailure(error);}}
