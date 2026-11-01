'use client';
import {AppearanceToggle} from './appearance-toggle';
import type {Language} from '@/lib/i18n';

/** Compact, labelled preferences shared by all signed-in roles. */
export function ShellPreferences({language,onLanguageChange}:{language:Language;onLanguageChange:(language:Language)=>void}){
 return <div className="shell-preferences">
  <select className="shell-language" aria-label={language==='zh'?'语言':'Language'} value={language} onChange={event=>onLanguageChange(event.target.value as Language)}><option value="zh">中文</option><option value="en">EN</option></select>
  <AppearanceToggle language={language}/>
 </div>;
}
