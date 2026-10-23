"use client";
import {lazy,Suspense,useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {FloatingBackButton} from '@/components/floating-back-button';
import {LegalLinks} from '@/components/legal-links';
import {usePageHistoryState} from '@/lib/page-history';
import {t,type Language,registerTranslations} from '@/lib/i18n';
import {BRAND_NAME} from '@/lib/brand';
import './parent-shell.css';
import '@/lib/parent30-i18n';
import {PN} from '@/lib/parent31-i18n';
import {MenuBadge,NotificationsProvider} from './notifications';
import type {ParentNoticeNavigation} from './parent-notifications-pane';
const ParentsWorkspace=lazy(()=>import('./parents-workspace'));
const ParentNotificationsPane=lazy(()=>import('./parent-notifications-pane'));
const AccountSettings=lazy(()=>import('./account-settings').then(m=>({default:m.AccountSettings})));
registerTranslations({'家长':'家长','我的孩子':'我的孩子','家长工作台':'家长工作台'},{'家长':'Parent','我的孩子':'My children','家长工作台':'Parent portal'});
type ParentIdentity={id?:string;name:string;groupId?:string|null;groupName?:string|null};
type ParentShellProps={account:ParentIdentity;language:Language;changeLanguage:(value:Language)=>void;logout:()=>void;refreshIdentity:()=>Promise<void>};
export default function ParentShell(props:ParentShellProps){return <NotificationsProvider key={props.account.id+':'+props.account.groupId} accountId={props.account.id||''} groupId={props.account.groupId||''} language={props.language} audience="parent"><ParentShellContent {...props}/></NotificationsProvider>;}
function ParentShellContent({account,language,changeLanguage,logout,refreshIdentity}:ParentShellProps){
 const shellRef=useRef<HTMLDivElement>(null),headerRef=useRef<HTMLElement>(null);
 useEffect(()=>{const update=()=>{if(headerRef.current)shellRef.current?.style.setProperty('--parent-header-height',Math.ceil(headerRef.current.getBoundingClientRect().height)+'px');};update();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;if(headerRef.current)observer?.observe(headerRef.current);window.addEventListener('resize',update);return()=>{observer?.disconnect();window.removeEventListener('resize',update);};},[]);
 const [view,setView]=usePageHistoryState<'children'|'account'|'notifications'>('parent.shell.view','children'),[navigation,setNavigation]=useState<ParentNoticeNavigation|null>(null),[pendingNotice,setPendingNotice]=useState('');
 useEffect(()=>{const open=(event?:Event)=>{const requested=(event as CustomEvent<{id?:string}>|undefined)?.detail?.id;setPendingNotice(typeof requested==='string'&&/^parent:[A-Za-z0-9_-]{1,100}$/.test(requested)?requested:'');setView('notifications');};window.addEventListener('tickminder:open-notifications',open);const params=new URLSearchParams(window.location.search);if(params.get('view')==='notifications'){const id=params.get('parentNotice');setPendingNotice(id&&/^parent:[A-Za-z0-9_-]{1,100}$/.test(id)?id:'');setView('notifications');params.delete('view');params.delete('parentNotice');const query=params.toString();window.history.replaceState(window.history.state,'',window.location.pathname+(query?'?'+query:'')+window.location.hash);}return()=>window.removeEventListener('tickminder:open-notifications',open);},[setView]);
 const showChildren=()=>{setNavigation(null);setPendingNotice('');setView('children');};
 return <div ref={shellRef} className="app-shell parent-shell"><header ref={headerRef} className="topbar"><div className="brand"><span className="brand-logo small"><img src="/tickminder-logo.svg" width="40" height="40" alt={BRAND_NAME}/></span><div><strong>{BRAND_NAME}</strong><span>{account.groupName||t('家长工作台')} · GMT+8</span></div></div><div className="top-actions"><div className="language-switch" role="group" aria-label={t('语言')}><button type="button" aria-pressed={language==='zh'} onClick={()=>changeLanguage('zh')}>中文</button><span aria-hidden="true">|</span><button type="button" aria-pressed={language==='en'} onClick={()=>changeLanguage('en')}>EN</button></div></div></header><main className="parent-shell-main"><FloatingBackButton context={account.id+':parent:'+account.groupId} isHome={view==='children'} onHome={showChildren}/><div className="parent-shell-intro"><p>{t('家长工作台')}</p><h1>{account.name}</h1></div><nav className="parent-shell-navigation" aria-label={t('功能菜单')}><Button variant={view==='children'?'default':'outline'} aria-current={view==='children'?'page':undefined} onClick={showChildren}>{t('我的孩子')}</Button><Button className="parent-shell-notice-button" variant={view==='notifications'?'default':'outline'} aria-current={view==='notifications'?'page':undefined} onClick={()=>{setPendingNotice('');setView('notifications');}}>{PN('title')}<MenuBadge includeUnread/></Button><Button variant={view==='account'?'default':'outline'} aria-current={view==='account'?'page':undefined} onClick={()=>setView('account')}>{t('我的账号')}</Button><Button variant="outline" onClick={logout}>{t('退出登录')}</Button></nav><Suspense fallback={<p role="status">{t('正在加载…')}</p>}>{view==='account'?<AccountSettings/>:view==='notifications'?<ParentNotificationsPane onOpen={target=>{setNavigation(target);setView('children');}} pendingNotice={pendingNotice} onPendingHandled={()=>setPendingNotice('')} onAuthorityLost={()=>void refreshIdentity()}/>:<ParentsWorkspace key={account.id+':'+account.groupId} navigation={navigation} onAuthorityLost={()=>void refreshIdentity()}/>}</Suspense><LegalLinks language={language}/></main></div>;
}
