'use client';

import {lazy, Suspense, useEffect, useRef, useState, type MouseEvent} from 'react';
import {ArrowLeft} from 'lucide-react';
import {TickQuizBrand} from '@/components/tickquiz-brand';
import {TICK_QUIZ_NAME, TICK_QUIZ_PAGE_TITLE} from '@/lib/brand';
import {AppearanceToggle} from '@/components/appearance-toggle';
import {canAdminAction} from '@/lib/admin-permission-client';
import {t, type Language} from '@/lib/i18n';
import {tikQuizPath, tikQuizRoute} from '@/lib/tikquiz-route';
import {useDisplayPreferences} from '@/lib/use-display-preferences';
import type {Account} from '@/lib/workspace-client-types';
import {AdminPermissionContext} from './admin-permission-context';
import {AuthLanguageSwitcher} from './login-form';
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
      setLocation(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function go(href: string, options: {replace?: boolean; returnTo?: string | null; guarded?: boolean} = {}) {
    const url = internalLocation(href);
    if (!url || (options.guarded && !allowNavigation())) return;
    const next = {href: url.pathname + url.search, returnTo: options.returnTo ?? null};
    if (next.href === current.current.href) return;
    const state = {...window.history.state, tikQuizReturnTo: next.returnTo};
    if (options.replace) window.history.replaceState(state, '', next.href);
    else window.history.pushState(state, '', next.href);
    current.current = next;
    setLocation(next);
    window.scrollTo(0, 0);
  }

  const label = (zh: string, en: string) => language === 'zh' ? zh : en;
  const role = account.role === 'pending' ? 'student' : account.role;
  const author = role === 'teacher' || role === 'admin';
  const can = (grant: Parameters<typeof canAdminAction>[1]) => canAdminAction(account, grant);
  const catalogue = can('quizzes.view');
  const assignments = role !== 'parent' && can('quizAssignments.view');
  const history = catalogue || assignments;
  const defaultTab = assignments ? 'assigned' : 'bank';
  const url = new URL(location.href, window.location.origin);
  const route = tikQuizRoute(url.pathname) || {section: 'home'};
  const section = route.section === 'home' ? defaultTab : route.section;
  const loading = <p className="tikquiz-loading" role="status">{t('quiz.loading')}</p>;
  const unavailable = <p className="quiz-error" role="alert">{t('quiz.forbidden')}</p>;
  const playing = (section === 'play' || section === 'results') && route.id;
  const showTabs = ['bank', 'mine', 'assigned', 'history', 'manage'].includes(section);
  const landing = tikQuizPath(defaultTab);
  const appHome = role === 'admin' || role === 'teacher' ? '/teaching' : '/learning';

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
    {section: 'assigned', label: author ? label('已布置', 'Assigned work') : t('quiz.assignedTab'), visible: assignments},
    {section: 'bank', label: t('quiz.catalogTab'), visible: catalogue},
    {section: 'mine', label: t('quiz.mineTab'), visible: catalogue && author},
    {section: 'history', label: author ? label('作答记录', 'Answer records') : t('quiz.historyTab'), visible: history},
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
      return <LinkLanding key={location.href} quizId={route.id} role={role} language={language}
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
      return <AuthorPage key={location.href} section={section} id={route.id} language={language} bank={url.searchParams.get('bank') === '1'}
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
    <div className="tikquiz-shell" data-testid="tikquiz">
      {!playing && <header className="tikquiz-header"><div className="tikquiz-header-inner">
        <a href={landing} className="tikquiz-logo" onClick={event => {
          if (navigateClick(event)) { event.preventDefault(); go(landing, {guarded: true}); }
        }}><TickQuizBrand/></a>
        <div className="tikquiz-header-actions">
          <AuthLanguageSwitcher language={language} change={changeLanguage}/>
          <AppearanceToggle language={language}/>
        </div>
        <a className="tikquiz-app-link" href={appHome}><ArrowLeft size={17} aria-hidden="true"/><span>{label('返回 Tickminder', 'Back to Tickminder')}</span></a>
      </div></header>}
      <main className={'tikquiz-content' + (playing ? ' tikquiz-content-player' : '')}>
        {showTabs && <nav aria-label={TICK_QUIZ_NAME} className="tikquiz-nav">
          {nav.filter(item => item.visible).map(item => <a key={item.section} href={tikQuizPath(item.section)}
            aria-current={section === item.section ? 'page' : undefined}
            onClick={event => {
              if (navigateClick(event)) { event.preventDefault(); go(tikQuizPath(item.section), {guarded: true}); }
            }}>{item.label}</a>)}
          {section === 'manage' && <a href={tikQuizPath('manage')} aria-current="page">{t('quiz.manageTab')}</a>}
        </nav>}
        <Suspense fallback={loading}>{activeContent()}</Suspense>
      </main>
    </div>
  </AdminPermissionContext.Provider>;
}
