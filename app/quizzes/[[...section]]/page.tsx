import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {SchedulerEntry} from '../../scheduler-entry';
import {tikQuizRoute} from '@/lib/tikquiz-route';

export const metadata: Metadata = {
  title: 'TikQuiz · Tickminder',
  robots: {index: false, follow: false},
};

export default async function TikQuizPage({params}: {params: Promise<{section?: string[]}>}) {
  const {section = []} = await params;
  const path = ['/quizzes', ...section].join('/');
  if (!tikQuizRoute(path)) notFound();
  return <SchedulerEntry quizPath={path}/>;
}
