'use client';
import {useEffect,useRef} from 'react';
import {AppearanceToggle} from './appearance-toggle';
import type {Language} from '@/lib/i18n';

/** Compact, labelled preferences shared by all signed-in roles. */
export function ShellPreferences({language,onLanguageChange}:{language:Language;onLanguageChange:(language:Language)=>void}){
 const preferences=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const header=preferences.current?.closest<HTMLElement>('.topbar'),shell=header?.closest<HTMLElement>('.app-shell');
  if(!header||!shell)return;
  const measure=()=>shell.style.setProperty('--shell-header-height',Math.ceil(header.getBoundingClientRect().height)+'px');
  measure();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(header);
  window.addEventListener('resize',measure);
  return()=>{observer?.disconnect();window.removeEventListener('resize',measure);shell.style.removeProperty('--shell-header-height');};
 },[]);
 return <div ref={preferences} className="shell-preferences">
  <select className="shell-language" aria-label={language==='zh'?'语言':'Language'} value={language} onChange={event=>onLanguageChange(event.target.value as Language)}><option value="zh">中文</option><option value="en">EN</option></select>
  <AppearanceToggle language={language}/>
 </div>;
}
