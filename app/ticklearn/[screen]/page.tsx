import type {Metadata} from 'next';
import {notFound, redirect} from 'next/navigation';
import {currentIdentity} from '@/lib/auth';
import {tickLearnAuthLink, tickLearnContinue, tickLearnLanguage, tickLearnReturn, tickMinderEntry, tickMinderEntryQuery} from '@/lib/ticklearn-routes';
import {readTickLearnDashboard} from '@/lib/ticklearn-dashboard';
import {TickLearnPortal} from '../ticklearn-portal';

export const metadata: Metadata = {title: 'TickLearn', robots: {index: false, follow: false}};
export const dynamic = 'force-dynamic';

export default async function Page({params, searchParams}: {
  params: Promise<{screen: string}>;
  searchParams: Promise<{lang?: string; next?: string; google?: string; link?: string; minderFrom?: string}>;
}) {
  const [{screen}, query] = await Promise.all([params, searchParams]);
  if (screen !== 'login' && screen !== 'signup' && screen !== 'study' && screen !== 'settings') notFound();
  const privateScreen=screen==='study'||screen==='settings';
  const language = tickLearnLanguage(query.lang);
  const minderEntry = privateScreen ? tickMinderEntry(query.minderFrom) : undefined;
  const destination = tickLearnReturn(privateScreen ? '/ticklearn/'+screen+'?lang='+language+tickMinderEntryQuery(minderEntry) : query.next, language);
  const googleBridge = !privateScreen && query.google === '1';
  const identity = googleBridge ? null : await currentIdentity();
  if (privateScreen && !identity) redirect(tickLearnAuthLink(destination, language));
  if (!privateScreen && identity) redirect(tickLearnContinue(destination).href);
  const dashboard = screen === 'study' ? await readTickLearnDashboard().catch(error=>{
    console.error('TickLearn dashboard failed',error);
    return null;
  }) : null;
  return <TickLearnPortal minderEntry={minderEntry} dashboard={dashboard} googleBridge={googleBridge} googleLinking={googleBridge && query.link === '1'} screen={screen} language={language} next={destination.href} name={identity?.account.name}/>;
}
