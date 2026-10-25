"use client";
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {BarChart3,Bell,BookOpen,CalendarDays,House,LibraryBig,LogOut,Menu,UserRound,WalletCards,X,type LucideIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {FloatingBackButton} from '@/components/floating-back-button';
import {LegalLinks} from '@/components/legal-links';
import {usePageHistoryState} from '@/lib/page-history';
import {t,type Language} from '@/lib/i18n';
import {BRAND_NAME} from '@/lib/brand';
import {PNav} from '@/lib/parent-nav-i18n';
import type {ParentWorkspaceView} from '@/lib/parent-navigation';
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
type ParentShellView=ParentWorkspaceView|'home'|'account'|'notifications'|'quizzes';
const menuItems:Array<{view:ParentShellView;Icon:LucideIcon}>=[
  {view:'home',Icon:House},
  {view:'calendar',Icon:CalendarDays},
  {view:'homework',Icon:BookOpen},
  {view:'materials',Icon:LibraryBig},
  {view:'quizzes',Icon:BookOpen},
  {view:'learning',Icon:BarChart3},
  {view:'finance',Icon:WalletCards},
  {view:'notifications',Icon:Bell},
  {view:'account',Icon:UserRound},
];
const shellViews=new Set<string>([...menuItems.map(item=>item.view),'lessons','attendance','recordings']);
function moduleFor(view:ParentShellView){return view==='calendar'||view==='lessons'||view==='attendance'?'calendar':view==='recordings'?'materials':view;}

export default function ParentShell(props:ParentShellProps){
  return <NotificationsProvider key={props.account.id+':'+props.account.groupId} accountId={props.account.id||''} groupId={props.account.groupId||''} language={props.language} audience="parent"><ParentShellContent {...props}/></NotificationsProvider>;
}

function ParentShellContent({account,language,changeLanguage,logout,refreshIdentity,initialQuizId,onLinkedQuizExit}:ParentShellProps){
  const shellRef=useRef<HTMLDivElement>(null),headerRef=useRef<HTMLElement>(null),menuRef=useRef<HTMLElement>(null),menuButtonRef=useRef<HTMLButtonElement>(null);
  const [storedView,setView,replaceView]=usePageHistoryState<ParentShellView>('parent.shell.view',initialQuizId?'quizzes':'home');
  const view=shellViews.has(storedView)?storedView:'home';
  const [navigation,setNavigation]=useState<ParentNoticeNavigation|null>(null),[pendingNotice,setPendingNotice]=useState('');
  const [target,setTarget]=useState<ParentWorkspaceTarget|null>(null);
  const [desktop,setDesktop]=useState(false),[menuOpen,setMenuOpen]=useState(false);

  useEffect(()=>{
    const update=()=>{if(headerRef.current)shellRef.current?.style.setProperty('--parent-header-height',Math.ceil(headerRef.current.getBoundingClientRect().height)+'px');};
    update();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
    if(headerRef.current)observer?.observe(headerRef.current);
    window.addEventListener('resize',update);
    return()=>{observer?.disconnect();window.removeEventListener('resize',update);};
  },[]);

  useEffect(()=>{
    const query=window.matchMedia('(min-width: 901px)'),update=()=>{setDesktop(query.matches);if(query.matches)setMenuOpen(false);};
    update();query.addEventListener('change',update);
    const close=()=>setMenuOpen(false);window.addEventListener('popstate',close);
    return()=>{query.removeEventListener('change',update);window.removeEventListener('popstate',close);};
  },[]);

  useEffect(()=>{
    if(!menuOpen||desktop)return;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const focusable=()=>Array.from(menuRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')||[]);
    (menuRef.current?.querySelector<HTMLElement>('[aria-current="page"]')||focusable()[0])?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();setMenuOpen(false);}
      if(event.key!=='Tab')return;
      const elements=focusable(),first=elements[0],last=elements.at(-1);
      if(!first||!last)return;
      if(event.shiftKey&&(document.activeElement===first||!menuRef.current?.contains(document.activeElement))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!menuRef.current?.contains(document.activeElement))){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',keydown);
    return()=>{document.body.style.overflow=previousOverflow;document.removeEventListener('keydown',keydown);menuButtonRef.current?.focus();};
  },[menuOpen,desktop]);

  useEffect(()=>{
    const open=(event?:Event)=>{
      const requested=(event as CustomEvent<{id?:string}>|undefined)?.detail?.id;
      setPendingNotice(typeof requested==='string'&&/^parent:[A-Za-z0-9_-]{1,100}$/.test(requested)?requested:'');
      setMenuOpen(false);setView('notifications');
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
    setNavigation(null);setTarget(null);setPendingNotice('');setMenuOpen(false);replaceView('quizzes');
  },[initialQuizId,replaceView]);
  const linkedViewOpened=useRef(false);
  useEffect(()=>{
    if(!initialQuizId){linkedViewOpened.current=false;return;}
    if(view==='quizzes')linkedViewOpened.current=true;
    else if(linkedViewOpened.current)onLinkedQuizExit?.();
  },[initialQuizId,view,onLinkedQuizExit]);

  function choose(next:ParentShellView){
    if(initialQuizId&&next!=='quizzes')onLinkedQuizExit?.();
    if(moduleFor(next)!==moduleFor(view))setNavigation(null);
    setTarget(null);
    setPendingNotice('');setView(next);setMenuOpen(false);
    if(next!==view)window.scrollTo(0,0);
  }
  function openWorkspace(next:Omit<ParentWorkspaceTarget,'targetId'>){
    if(initialQuizId)onLinkedQuizExit?.();
    setNavigation(null);setPendingNotice('');setTarget({...next,targetId:crypto.randomUUID()});setView(next.view);setMenuOpen(false);window.scrollTo(0,0);
  }
  const workspaceView:ParentWorkspaceView=view==='home'||view==='account'||view==='notifications'||view==='quizzes'?'calendar':view;
  const drawerOpen=menuOpen&&!desktop;

  return <div ref={shellRef} className="app-shell parent-shell">
    <header ref={headerRef} className="topbar">
      <div className="brand"><span className="brand-logo small"><img src="/tickminder-logo.svg" width="40" height="40" alt={BRAND_NAME}/></span><div><strong>{BRAND_NAME}</strong><span>{account.groupName||PNav('portal')} · GMT+8</span></div></div>
      <div className="top-actions">
        <div className="language-switch" role="group" aria-label={t('语言')}><button type="button" aria-pressed={language==='zh'} onClick={()=>changeLanguage('zh')}>中文</button><span aria-hidden="true">|</span><button type="button" aria-pressed={language==='en'} onClick={()=>changeLanguage('en')}>EN</button></div>
        <Button ref={menuButtonRef} type="button" variant="outline" className="menu-toggle parent-menu-toggle" onClick={()=>setMenuOpen(value=>!value)} aria-label={PNav(menuOpen?'closeMenu':'openMenu')} aria-expanded={drawerOpen} aria-controls="parent-workspace-menu"><Menu size={20} aria-hidden="true"/><MenuBadge includeUnread header/></Button>
      </div>
    </header>
    {drawerOpen&&<button type="button" className="menu-backdrop parent-menu-backdrop" onClick={()=>setMenuOpen(false)} aria-label={PNav('closeMenu')} tabIndex={-1}/>}
    <div className="parent-shell-body">
      {(desktop||menuOpen)&&<aside ref={menuRef} id="parent-workspace-menu" className="workspace-menu parent-workspace-menu" aria-label={PNav('navigation')} role={drawerOpen?'dialog':undefined} aria-modal={drawerOpen?true:undefined}>
        <div className="parent-menu-heading"><div className="signed-in-identity"><strong>{account.name}</strong><span>{PNav('parent')}</span></div><Button type="button" variant="ghost" className="parent-menu-close" aria-label={PNav('closeMenu')} onClick={()=>setMenuOpen(false)}><X size={20} aria-hidden="true"/></Button></div>
        <nav className="menu-links" aria-label={PNav('navigation')}>{menuItems.map(({view:target,Icon})=><button key={target} type="button" className={'menu-link'+(moduleFor(view)===target?' active':'')} aria-current={moduleFor(view)===target?'page':undefined} onClick={()=>choose(target)} data-testid={'parent-menu-'+target}><Icon size={19} aria-hidden="true"/><span>{PNav(target)}</span>{target==='notifications'&&<MenuBadge includeUnread/>}</button>)}</nav>
        <div className="menu-utilities"><button type="button" className="menu-link" onClick={logout}><LogOut size={19} aria-hidden="true"/><span>{PNav('logout')}</span></button><LegalLinks language={language} className="menu-legal"/></div>
      </aside>}
      <main className="parent-shell-main parent-compact" inert={drawerOpen?true:undefined}>
        <FloatingBackButton context={account.id+':parent:'+account.groupId} isHome={view==='home'} onHome={()=>choose('home')} title={PNav(moduleFor(view))}/>
        <Suspense fallback={<p role="status">{t('正在加载…')}</p>}>
          {view==='home'?<ParentHome name={account.name} onOpen={openWorkspace} onNotifications={()=>choose('notifications')} onAuthorityLost={()=>void refreshIdentity()}/>:view==='account'?<AccountSettings/>:view==='notifications'?<ParentNotificationsPane onOpen={next=>{setTarget(null);setNavigation(next);setView(next.kind==='invoice'?'finance':'lessons');}} pendingNotice={pendingNotice} onPendingHandled={()=>setPendingNotice('')} onAuthorityLost={()=>void refreshIdentity()}/>:view==='quizzes'?<QuizWorkspace key={account.id+':'+account.groupId} view="quizBank" language={language} role="parent" initialQuizId={initialQuizId} onLinkedQuizExit={onLinkedQuizExit}/>:<ParentsWorkspace key={account.id+':'+account.groupId} view={workspaceView} onViewChange={next=>setView(next)} navigation={navigation} target={target} onAuthorityLost={()=>void refreshIdentity()}/>}
        </Suspense>
      </main>
    </div>
  </div>;
}
