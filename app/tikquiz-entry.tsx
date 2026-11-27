'use client';

import {lazy, Suspense, useEffect, useRef, useState, type MouseEvent} from 'react';
import {ArrowLeft} from 'lucide-react';
import {TickQuizBrand} from '@/components/tickquiz-brand';
import {tickLearnStudyOrigin,tickMinderEntry,tickMinderEntryQuery} from '@/lib/ticklearn-routes';
import {TickLearnBack,TickLearnNavigation} from '@/components/ticklearn-navigation';
import {TICK_QUIZ_NAME, TICK_QUIZ_PAGE_TITLE} from '@/lib/brand';
import {TickLearnPreferences} from '@/components/ticklearn-preferences';
import {canAdminAction} from '@/lib/admin-permission-client';
import {t, type Language} from '@/lib/i18n';
import {tikQuizPath, tikQuizRoute} from '@/lib/tikquiz-route';
import {useDisplayPreferences} from '@/lib/use-display-preferences';
import type {Account} from '@/lib/workspace-client-types';
import {AdminPermissionContext} from './admin-permission-context';
import './quiz.css';
import './quiz-layout.css';
import './tikquiz.css';
import '@/lib/quiz-i18n';
import '@/lib/quiz-practice-i18n';
import '@/lib/quiz-upgrade-i18n';

const QuizWorkspace = lazy(() => import('./quiz-workspace'));
const AuthorPage = lazy(() => import('./tikquiz-author-page'));
const PracticePlayer = lazy(() => import('@/components/quiz-practice-player'));
const LinkLanding = lazy(() => import('./quiz-link-landing'));
const Moderation = lazy(() => import('./quiz-moderation-workspace'));

type Location = {href: string; returnTo: string | null};
const readLocation = (): Location => ({
  href: window.location.pathname + window.location.search,
  returnTo: window.history.state?.tikQuizReturnTo ?? null,
});
function internalLocation(href: unknown) {
  if (typeof href !== 'string' || !href.startsWith('/') || href.startsWith('//')) return null;
  const url = new URL(href, window.location.origin);
  return url.origin === window.location.origin && tikQuizRoute(url.pathname) ? url : null;
}
function allowNavigation() {
  return window.dispatchEvent(new Event('tickminder-navigate', {cancelable: true}));
}
function navigateClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.defaultPrevented && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

export default function TikQuizEntry({initialPath, account, language, changeLanguage}: {
  initialPath: string;
  account: Account;
  language: Language;
  changeLanguage: (next: Language) => void;
}) {
  useDisplayPreferences();
  const [location, setLocation] = useState<Location>(() => {
    const current = readLocation();
    return tikQuizRoute(window.location.pathname) ? current : {href: initialPath, returnTo: null};
  });
  const current = useRef(location);
  const approvedBack = useRef<string | null>(null);
  const activeLanguage = useRef(language);
  activeLanguage.current = language;
  const fromLearn = useRef(new URLSearchParams(window.location.search).get('learn')==='1');
  const minderEntry = useRef(tickMinderEntry(new URLSearchParams(window.location.search).get('minderFrom'))).current;
  current.current = location;
  useEffect(() => {
    document.title = TICK_QUIZ_PAGE_TITLE;
    if (!tikQuizRoute(window.location.pathname)) {
      window.history.replaceState({...window.history.state, tikQuizReturnTo: null}, '', current.current.href);
    }
    const onPop = () => {
      const next = readLocation();
      const approved = next.href === approvedBack.current;
      approvedBack.current = null;
      if (!approved && next.href !== current.current.href && !allowNavigation()) {
        window.history.pushState({...window.history.state, tikQuizReturnTo: current.current.returnTo}, '', current.current.href);
        return;
      }
      if (!tikQuizRoute(window.location.pathname)) {
        window.location.reload();
        return;
      }
      const url=new URL(next.href,window.location.origin);
      if(url.searchParams.get('lang')!==activeLanguage.current){
        url.searchParams.set('lang',activeLanguage.current);
        next.href=url.pathname+url.search;
        window.history.replaceState(window.history.state,'',next.href);
      }
      setLocation(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function quizHref(path:string,selected:Language=language) {
    const url = new URL(path,window.location.origin);
    url.searchParams.set('lang',selected);
    if(fromLearn.current)url.searchParams.set('learn','1');
    if(minderEntry)url.searchParams.set('minderFrom',minderEntry);
    return url.pathname+url.search;
  }

  function go(href: string, options: {replace?: boolean; returnTo?: string | null; guarded?: boolean; language?: Language} = {}) {
    const url = internalLocation(href);
    if (!url || (options.guarded && !allowNavigation())) return;
    const next = {href: quizHref(url.pathname+url.search,options.language), returnTo: options.returnTo ?? null};
    if (next.href === current.current.href) return;
    const state = {...window.history.state, tikQuizReturnTo: next.returnTo};
    if (options.replace) window.history.replaceState(state, '', next.href);
    else window.history.pushState(state, '', next.href);
    current.current = next;
    setLocation(next);
    if(!options.language)window.scrollTo(0, 0);
  }

  const label = (zh: string, en: string) => language === 'zh' ? zh : en;
  const free = account.role === 'learner' ? account.tickLearnFree : undefined;
  const learningOnly = account.role === 'learner';
  const learnNavigation = learningOnly || fromLearn.current || (typeof window !== 'undefined' && window.location.origin === tickLearnStudyOrigin);
  const role = account.role === 'pending' || account.role === 'learner' ? 'student' : account.role;
  const author = role === 'teacher' || role === 'admin';
  const can = (grant: Parameters<typeof canAdminAction>[1]) => canAdminAction(account, grant);
  const catalogue = can('quizzes.view');
  const assignments = !learningOnly && role !== 'parent' && can('quizAssignments.view');
  const history = catalogue || assignments;
  const defaultTab = catalogue || !assignments ? 'bank' : 'assigned';
  const url = new URL(location.href, window.location.origin);
  const routeParams=new URLSearchParams(url.search);
  routeParams.delete('lang');
  const routeKey=url.pathname+'?'+routeParams;
  const route = tikQuizRoute(url.pathname) || {section: 'home'};
  const section = route.section === 'home' ? defaultTab : route.section;
  const loading = <p className="tikquiz-loading" role="status">{t('quiz.loading')}</p>;
  const unavailable = <p className="quiz-error" role="alert">{t('quiz.forbidden')}</p>;
  const playing = (section === 'play' || section === 'results') && route.id;
  const showTabs = ['bank', 'mine', 'assigned', 'history', 'manage'].includes(section);
  const landing = tikQuizPath(defaultTab);
  const appHome = learnNavigation ? tickLearnStudyOrigin+'/ticklearn/study?lang='+language+tickMinderEntryQuery(minderEntry) : role === 'admin' || role === 'teacher' ? '/teaching' : '/learning';

  function openAttempt(id: string, submitted = false) {
    go(tikQuizPath(submitted ? 'results' : 'play', id), {returnTo: location.href});
  }
  function returnToList(fallback = landing) {
    const destination = internalLocation(location.returnTo);
    if (destination && !['play', 'results'].includes(tikQuizRoute(destination.pathname)!.section)) {
      // This entry was pushed from the saved URL. Return to the original entry.
      approvedBack.current = destination.pathname + destination.search;
      window.history.back();
    } else go(fallback, {replace: true});
  }
  const nav = [
    {section: 'bank', label: 'Quiz', visible: catalogue},
    {section: 'history', label: author ? label('作答记录', 'Answer records') : t('quiz.historyTab'), visible: history},
    {section: 'assigned', label: label('测验任务', 'Assignments'), visible: assignments},
    {section: 'mine', label: t('quiz.mineTab'), visible: catalogue && author},
  ] as const;
  function activeContent() {
    if ((section === 'play' || section === 'results') && route.id) {
      if (!history) return unavailable;
      const id = route.id;
      return <PracticePlayer key={id} attemptId={id} language={language} presentation="page"
        onClose={() => returnToList(tikQuizPath('history'))}
        onResultChange={submitted => {
          const path = tikQuizPath(submitted ? 'results' : 'play', id);
          if (path !== url.pathname) go(path, {replace: true, returnTo: location.returnTo});
        }}/>;
    }
    if (section === 'shared' && route.id) {
      return <LinkLanding key={routeKey} quizId={route.id} role={role} language={language}
        onClose={() => go(landing, {replace: true})} onOpen={openAttempt}
        onAssignmentDetails={id => go(tikQuizPath('assigned', id), {returnTo: location.href})}/>;
    }
    if (section === 'moderation') {
      return catalogue
        ? <Moderation language={language} owner={Boolean(account.isOwner)} onBack={() => returnToList(tikQuizPath('bank'))}/>
        : unavailable;
    }
    if (section === 'new' || section === 'edit' || section === 'preview' || section === 'import' || section === 'compose') {
      if (!catalogue || (section !== 'preview' && !author)) return unavailable;
      return <AuthorPage key={routeKey} section={section} id={route.id} language={language} bank={url.searchParams.get('bank') === '1'}
        onClose={() => returnToList(tikQuizPath('bank'))}
        onSave={() => go(tikQuizPath('bank'), {replace: true})}
        onEdit={id => go(tikQuizPath('edit', id), {replace: true, returnTo: location.returnTo})}/>;
    }
    if (section === 'bank' || section === 'mine' || section === 'assigned' || section === 'history' || section === 'manage') {
      if (section === 'assigned' ? !assignments : section === 'history' ? !history : !catalogue || ((section === 'mine' || section === 'manage') && !author)) return unavailable;
      return <QuizWorkspace key={section} view="quizzes" language={language} role={role}
        standalone={{
          tab: section,
          assignmentId: section === 'assigned' ? route.id : undefined,
          open: href => go(href, {returnTo: location.href}),
          changeTab: href => go(href),
          openAttempt,
        }}/>;
    }
    return unavailable;
  }

  return <AdminPermissionContext.Provider value={account}>
    <div className={'tikquiz-shell'+(learnNavigation?' ticklearn-app-view':'')} data-testid="tikquiz">
      {learnNavigation&&<TickLearnNavigation active="quiz" language={language} minderEntry={minderEntry}/>}
      {!playing && <header className="tikquiz-header"><div className="tikquiz-header-inner">
        <a href={quizHref(landing)} className="tikquiz-logo" onClick={event => {
          if (navigateClick(event)) { event.preventDefault(); go(landing, {guarded: true}); }
        }}><TickQuizBrand/></a>
        <div className="tikquiz-header-actions">
          <TickLearnPreferences language={language} languages={['zh','en']} onLanguageChange={next=>{
            changeLanguage(next);
            go(location.href,{replace:true,returnTo:location.returnTo,language:next});
          }}/>
          {learnNavigation?<TickLearnBack href={appHome} language={language} minderEntry={minderEntry}/>:
          <a className="tikquiz-app-link" href={appHome} aria-label={label('返回 Tickminder', 'Back to Tickminder')} title={label('返回 Tickminder', 'Back to Tickminder')}>
            <ArrowLeft size={17} aria-hidden="true"/>
            <span className="tikquiz-app-link-full">{label('返回 Tickminder', 'Back to Tickminder')}</span>
            <span className="tikquiz-app-link-short">{label('返回', 'Back')}</span>
          </a>}
        </div>
      </div></header>}
      <main className={'tikquiz-content' + (playing ? ' tikquiz-content-player' : '')}>
        {free && section==='bank' && <p className="ticklearn-free-note">{free.unlimited
          ? label('免费方案 · 不限刷题次数','Free plan · Unlimited quiz attempts')
          : label(`免费方案 · 可访问 ${free.quizzes} 份测验 · 每天最多作答 ${free.dailyAttempts} 次`,
            `Free plan · ${free.quizzes} quizzes · Up to ${free.dailyAttempts} attempts a day`)}</p>}
        {showTabs && <nav aria-label={TICK_QUIZ_NAME} className="tikquiz-nav">
          {nav.filter(item => item.visible).map(item => <a key={item.section} href={quizHref(tikQuizPath(item.section))}
            aria-current={section === item.section ? 'page' : undefined}
            onClick={event => {
              if (navigateClick(event)) { event.preventDefault(); go(tikQuizPath(item.section), {guarded: true}); }
            }}>{item.label}</a>)}
          {section === 'manage' && <a href={quizHref(tikQuizPath('manage'))} aria-current="page">{t('quiz.manageTab')}</a>}
        </nav>}
        <Suspense fallback={loading}>{activeContent()}</Suspense>
      </main>
    </div>
  </AdminPermissionContext.Provider>;
}
