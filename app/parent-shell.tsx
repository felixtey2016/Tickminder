"use client";
import {lazy,Suspense,useEffect,useRef} from 'react';
import {Button} from '@/components/ui/button';
import {FloatingBackButton} from '@/components/floating-back-button';
import {LegalLinks} from '@/components/legal-links';
import {usePageHistoryState} from '@/lib/page-history';
import {t,type Language,registerTranslations} from '@/lib/i18n';
import {BRAND_NAME} from '@/lib/brand';
import './parent-shell.css';
import '@/lib/parent30-i18n';
const ParentsWorkspace=lazy(()=>import('./parents-workspace'));
const AccountSettings=lazy(()=>import('./account-settings').then(m=>({default:m.AccountSettings})));
registerTranslations({'家长':'家长','我的孩子':'我的孩子','家长工作台':'家长工作台'},{'家长':'Parent','我的孩子':'My children','家长工作台':'Parent portal'});
type ParentIdentity={id?:string;name:string;groupId?:string|null;groupName?:string|null};
export default function ParentShell({account,language,changeLanguage,logout,refreshIdentity}:{account:ParentIdentity;language:Language;changeLanguage:(value:Language)=>void;logout:()=>void;refreshIdentity:()=>Promise<void>}){
 const shellRef=useRef<HTMLDivElement>(null),headerRef=useRef<HTMLElement>(null);
 useEffect(()=>{const update=()=>{if(headerRef.current)shellRef.current?.style.setProperty('--parent-header-height',Math.ceil(headerRef.current.getBoundingClientRect().height)+'px');};update();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;if(headerRef.current)observer?.observe(headerRef.current);window.addEventListener('resize',update);return()=>{observer?.disconnect();window.removeEventListener('resize',update);};},[]);
 const [view,setView]=usePageHistoryState<'children'|'account'>('parent.shell.view','children');
 return <div ref={shellRef} className="app-shell parent-shell"><header ref={headerRef} className="topbar"><div className="brand"><span className="brand-logo small"><img src="/tickminder-logo.svg" width="40" height="40" alt={BRAND_NAME}/></span><div><strong>{BRAND_NAME}</strong><span>{account.groupName||t('家长工作台')} · GMT+8</span></div></div><div className="top-actions"><div className="language-switch" role="group" aria-label={t('语言')}><button type="button" aria-pressed={language==='zh'} onClick={()=>changeLanguage('zh')}>中文</button><span aria-hidden="true">|</span><button type="button" aria-pressed={language==='en'} onClick={()=>changeLanguage('en')}>EN</button></div></div></header><main className="parent-shell-main"><FloatingBackButton context={account.id+':parent:'+account.groupId} isHome={view==='children'} onHome={()=>setView('children')}/><div className="parent-shell-intro"><p>{t('家长工作台')}</p><h1>{account.name}</h1></div><nav className="parent-shell-navigation" aria-label={t('功能菜单')}><Button variant={view==='children'?'default':'outline'} aria-current={view==='children'?'page':undefined} onClick={()=>setView('children')}>{t('我的孩子')}</Button><Button variant={view==='account'?'default':'outline'} aria-current={view==='account'?'page':undefined} onClick={()=>setView('account')}>{t('我的账号')}</Button><Button variant="outline" onClick={logout}>{t('退出登录')}</Button></nav><Suspense fallback={<p role="status">{t('正在加载…')}</p>}>{view==='account'?<AccountSettings/>:<ParentsWorkspace key={account.id+':'+account.groupId} onAuthorityLost={()=>void refreshIdentity()}/>}</Suspense><LegalLinks language={language}/></main></div>;
}
