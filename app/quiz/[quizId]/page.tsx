import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {SchedulerEntry} from '../../scheduler-entry';
import {validQuizLinkId} from '@/lib/quiz-link';

export const metadata:Metadata={title:'Quiz · Tickminder',robots:{index:false,follow:false}};

// No Quiz metadata is loaded before authentication. The existing workspace
// preserves this path through sign-in, setup and optional Google linking.
export default async function QuizLinkPage({params}:{params:Promise<{quizId:string}>}){
 const {quizId}=await params;
 if(!validQuizLinkId(quizId))notFound();
 return <SchedulerEntry initialQuizId={quizId}/>;
}
