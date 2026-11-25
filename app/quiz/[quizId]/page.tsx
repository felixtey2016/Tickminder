import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {TICK_QUIZ_PAGE_TITLE} from '@/lib/brand';
import {SchedulerEntry} from '../../scheduler-entry';
import {validQuizLinkId} from '@/lib/quiz-link';
import {currentIdentity} from '@/lib/auth';
import {tickLearnAuthLink,tickLearnLanguage} from '@/lib/ticklearn-routes';

export const metadata:Metadata={title:TICK_QUIZ_PAGE_TITLE,robots:{index:false,follow:false}};

// No Quiz metadata is loaded before authentication. The existing workspace
// preserves this path through sign-in, setup and optional Google linking.
export default async function QuizLinkPage({params,searchParams}:{params:Promise<{quizId:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {quizId}=await params;
 if(!validQuizLinkId(quizId))notFound();
 if(!await currentIdentity()){
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(await searchParams)){
   for(const item of Array.isArray(value)?value:value!==undefined?[value]:[])query.append(key,item);
  }
  redirect(tickLearnAuthLink('/quiz/'+quizId+'?'+query,tickLearnLanguage(query.get('lang'))));
 }
 return <SchedulerEntry initialQuizId={quizId} quizPath={'/quiz/'+quizId}/>;
}
