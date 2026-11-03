"use client";
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {BarChart3,Bell,BookOpen,CalendarDays,House,LibraryBig,ListChecks,LogOut,NotebookPen,UserRound,Video,WalletCards} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {FloatingBackButton} from '@/components/floating-back-button';
import {MobileBottomNavigation} from '@/components/mobile-bottom-navigation';
import {NavigationHub} from '@/components/navigation-hub';
import {ShellPreferences} from '@/components/shell-preferences';
import './shell-wave1.css';
import {LegalLinks} from '@/components/legal-links';
import {navigationAllowed,usePageHistoryState} from '@/lib/page-history';
import {t,type Language} from '@/lib/i18n';
import {BRAND_NAME} from '@/lib/brand';
import {PNav} from '@/lib/parent-nav-i18n';
import type {ParentWorkspaceView} from '@/lib/parent-navigation';
import {isParentShellView,parentPrimaryFor,type ParentShellView} from '@/lib/parent-shell-navigation';
import type {ParentWorkspaceTarget} from '@/lib/parent-workspace-ui';
import './parent-shell.css';
import './parent-compact.css';
import '@/lib/parent30-i18n';
import {MenuBadge,NotificationsProvider} from './notifications';
import type {ParentNoticeNavigation} from './parent-notifications-pane';

const ParentsWorkspace=lazy(()=>import('./parents-workspace'));
const ParentHome=lazy(()=>import('./parent-home'));
const ParentNotificationsPane=lazy(()=>import('./parent-notifications-pane'));
const AccountSettings=lazy(()=>import('./account-settings').then(m=>({default:m.AccountSettings})));
const QuizWorkspace=lazy(()=>import('./quiz-workspace'));

type ParentIdentity={id?:string;name:string;groupId?:string|null;groupName?:string|null};
type ParentShellProps={account:ParentIdentity;language:Language;changeLanguage:(value:Language)=>void;logout:()=>void;refreshIdentity:()=>Promise<void>;initialQuizId?:string;onLinkedQuizExit?:()=>void};

export default function ParentShell(props:ParentShellProps){
  return <NotificationsProvider key={props.account.id+':'+props.account.groupId} accountId={props.account.id||''} groupId={props.account.groupId||''} language={props.language} audience="parent"><ParentShellContent {...props}/></NotificationsProvider>;
}

function ParentShellContent({account,language,changeLanguage,logout,refreshIdentity,initialQuizId,onLinkedQuizExit}:ParentShellProps){
  const shellRef=useRef<HTMLDivElement>(null),headerRef=useRef<HTMLElement>(null);
  const [storedView,setView,replaceView]=usePageHistoryState<ParentShellView>('parent.shell.view',initialQuizId?'quizzes':'home');
  const view=isParentShellView(storedView)?storedView:'home';
  const [navigation,setNavigation]=useState<ParentNoticeNavigation|null>(null),[pendingNotice,setPendingNotice]=useState('');
  const [target,setTarget]=useState<ParentWorkspaceTarget|null>(null);
  const activePrimary=parentPrimaryFor(view);

  useEffect(()=>{
    const update=()=>{if(headerRef.current)shellRef.current?.style.setProperty('--parent-header-height',Math.ceil(headerRef.current.getBoundingClientRect().height)+'px');};
    update();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
    if(headerRef.current)observer?.observe(headerRef.current);
    window.addEventListener('resize',update);
    return()=>{observer?.disconnect();window.removeEventListener('resize',update);};
  },[]);

  useEffect(()=>{
    const open=(event?:Event)=>{
      if(!navigationAllowed())return;
      const requested=(event as CustomEvent<{id?:string}>|undefined)?.detail?.id;
      setPendingNotice(typeof requested==='string'&&/^parent:[A-Za-z0-9_-]{1,100}$/.test(requested)?requested:'');
      setView('notifications');
    };
    window.addEventListener('tickminder:open-notifications',open);
    const params=new URLSearchParams(window.location.search);
    if(params.get('view')==='notifications'){
      const id=params.get('parentNotice');
      setPendingNotice(id&&/^parent:[A-Za-z0-9_-]{1,100}$/.test(id)?id:'');setView('notifications');
      params.delete('view');params.delete('parentNotice');
      const query=params.toString();
      window.history.replaceState(window.history.state,'',window.location.pathname+(query?'?'+query:'')+window.location.hash);
    }
    return()=>window.removeEventListener('tickminder:open-notifications',open);
  },[setView]);

  useEffect(()=>{
    if(!initialQuizId)return;
    setNavigation(null);setTarget(null);setPendingNotice('');replaceView('quizzes');
  },[initialQuizId,replaceView]);
  const linkedViewOpened=useRef(false);
  useEffect(()=>{
    if(!initialQuizId){linkedViewOpened.current=false;return;}
    if(view==='quizzes')linkedViewOpened.current=true;
    else if(linkedViewOpened.current)onLinkedQuizExit?.();
  },[initialQuizId,view,onLinkedQuizExit]);

  function choose(next:ParentShellView){
    if(next!==view&&!navigationAllowed())return;
    if(initialQuizId&&next!=='quizzes')onLinkedQuizExit?.();
    setNavigation(null);setTarget(null);setPendingNotice('');setView(next);
    if(next!==view)window.scrollTo(0,0);
  }
  function openWorkspace(next:Omit<ParentWorkspaceTarget,'targetId'>){
    if(!navigationAllowed())return;
    if(initialQuizId)onLinkedQuizExit?.();
    setNavigation(null);setPendingNotice('');setTarget({...next,targetId:crypto.randomUUID()});setView(next.view);window.scrollTo(0,0);
  }
  function openNotice(next:ParentNoticeNavigation){
    if(!navigationAllowed())return;
    setTarget(null);setNavigation(next);setView(next.kind==='invoice'?'finance':'lessons');window.scrollTo(0,0);
  }
  const workspaceView:ParentWorkspaceView=['home','account','notifications','quizzes','learnHub','mineHub'].includes(view)?'calendar':view as ParentWorkspaceView;
  const title=view==='finance'?PNav('fees'):PNav(view);
  const learningSections=[
    {id:'courses',title:PNav('courses'),layout:'list' as const,items:[
      {id:'calendar',label:PNav('calendar'),Icon:CalendarDays},
      {id:'lessons',label:PNav('lessons'),Icon:ListChecks},
    ]},
    {id:'content',title:PNav('learningContent'),layout:'grid' as const,items:[
      {id:'homework',label:PNav('homework'),Icon:BookOpen},
      {id:'quizzes',label:PNav('quizzes'),Icon:NotebookPen},
      {id:'materials',label:PNav('materials'),Icon:LibraryBig},
      {id:'recordings',label:PNav('recordings'),Icon:Video},
    ]},
    {id:'records',title:PNav('records'),layout:'list' as const,items:[
      {id:'attendance',label:PNav('attendance'),Icon:ListChecks},
      {id:'learning',label:PNav('learning'),Icon:BarChart3},
    ]},
  ];
  const personalSections=[{id:'account',title:PNav('accountAndMessages'),layout:'list' as const,items:[
    {id:'account',label:PNav('account'),description:account.name,Icon:UserRound},
    {id:'notifications',label:PNav('notifications'),Icon:Bell,badge:<MenuBadge includeUnread/>},
  ]}];

  return <div ref={shellRef} className="app-shell parent-shell shell-wave1 four-entry-shell" data-home-view={view==='home'?'true':undefined}>
    <header ref={headerRef} className="topbar">
      <button type="button" className="brand brand-home" data-testid="brand-home" aria-label={`${BRAND_NAME} · ${PNav('home')}`} onClick={()=>choose('home')}><span className="brand-logo small"><img src="/tickminder-logo.svg" width="40" height="40" alt={BRAND_NAME}/></span><div><strong>{BRAND_NAME}</strong><span>{account.groupName||PNav('portal')} · GMT+8</span></div></button>
      <div className="top-actions">
        <ShellPreferences language={language} onLanguageChange={changeLanguage}/>
        <Button type="button" variant="ghost" className="shell-notifications" aria-label={PNav('notifications')} onClick={()=>choose('notifications')}><Bell size={20} aria-hidden="true"/><MenuBadge includeUnread header/></Button>
      </div>
    </header>
    <div className="parent-shell-body">
      <main className="parent-shell-main parent-compact">
        <FloatingBackButton context={account.id+':parent:'+account.groupId} isHome={view==='home'} onHome={()=>choose('home')} title={title} subtitle={account.groupName||undefined}/>
        <Suspense fallback={<p role="status">{t('正在加载…')}</p>}>
          {view==='learnHub'?<NavigationHub sections={learningSections} onChoose={id=>{if(isParentShellView(id))choose(id);}}/>:
          view==='mineHub'?<NavigationHub sections={personalSections} onChoose={id=>{if(isParentShellView(id))choose(id);}}><div className="navigation-hub-actions" data-testid="hub-utility-actions"><Button type="button" variant="outline" data-testid="hub-signout" onClick={()=>{if(navigationAllowed())logout();}}><LogOut size={18} aria-hidden="true"/><span>{PNav('logout')}</span></Button></div><LegalLinks language={language} className="navigation-hub-legal"/></NavigationHub>:
          view==='home'?<ParentHome name={account.name} onOpen={openWorkspace} onNotifications={()=>choose('notifications')} onAuthorityLost={()=>void refreshIdentity()}/>:view==='account'?<AccountSettings/>:view==='notifications'?<ParentNotificationsPane onOpen={openNotice} pendingNotice={pendingNotice} onPendingHandled={()=>setPendingNotice('')} onAuthorityLost={()=>void refreshIdentity()}/>:view==='quizzes'?<QuizWorkspace key={account.id+':'+account.groupId} view="quizBank" language={language} role="parent" initialQuizId={initialQuizId} onLinkedQuizExit={onLinkedQuizExit}/>:<ParentsWorkspace key={account.id+':'+account.groupId} view={workspaceView} onViewChange={next=>{if(next===view||navigationAllowed())setView(next);}} navigation={navigation} target={target} onAuthorityLost={()=>void refreshIdentity()}/>}
        </Suspense>
      </main>
    </div>
    <MobileBottomNavigation primary items={[{value:'home',label:PNav('home'),Icon:House},{value:'learnHub',label:PNav('learnHub'),Icon:BookOpen},{value:'finance',label:PNav('fees'),Icon:WalletCards},{value:'mineHub',label:PNav('mineHub'),Icon:UserRound,badge:<MenuBadge includeUnread/>}]} active={activePrimary} onNavigate={value=>{if(isParentShellView(value))choose(value);}} ariaLabel={PNav('primaryNavigation')}/>
  </div>;
}
