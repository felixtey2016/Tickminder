import type {Metadata} from 'next';
import {notFound,redirect} from 'next/navigation';
import {TICK_QUIZ_PAGE_TITLE} from '@/lib/brand';
import {SchedulerEntry} from '../../scheduler-entry';
import {tikQuizRoute} from '@/lib/tikquiz-route';
import {currentIdentity} from '@/lib/auth';
import {tickLearnAuthLink,tickLearnLanguage} from '@/lib/ticklearn-routes';

export const metadata: Metadata = {
  title: TICK_QUIZ_PAGE_TITLE,
  robots: {index: false, follow: false},
};

export default async function TikQuizPage({params,searchParams}: {params: Promise<{section?: string[]}>; searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {section = []} = await params;
  const path = ['/quizzes', ...section].join('/');
  if (!tikQuizRoute(path)) notFound();
  if (!await currentIdentity()) {
    const query = new URLSearchParams();
    for (const [key,value] of Object.entries(await searchParams)) {
      for (const item of Array.isArray(value)?value:value!==undefined?[value]:[]) query.append(key,item);
    }
    redirect(tickLearnAuthLink(path+'?'+query,tickLearnLanguage(query.get('lang'))));
  }
  return <SchedulerEntry quizPath={path}/>;
}
