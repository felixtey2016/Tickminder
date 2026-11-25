import {quizActor,quizFailure,quizResponse} from '@/lib/quiz-server';
import {readQuizShareTargets} from '@/lib/quiz-sharing';

export async function GET(request:Request){try{return quizResponse(await readQuizShareTargets(await quizActor(),new URL(request.url)));}catch(error){return quizFailure(error);}}
