"use client";

import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import {ThemeProvider,useTheme} from 'next-themes';

const cookieName='ticklearn_theme';
const storageKey='tickminder.appearance';
const supportedTheme=(value:unknown)=>value==='dark'||value==='light'?value:null;

function sharedTheme() {
  return supportedTheme(document.cookie.match(/(?:^|;\s*)ticklearn_theme=(light|dark)(?:;|$)/)?.[1]);
}

function rememberSharedTheme(theme:'light'|'dark') {
  const host=window.location.hostname;
  if(host.endsWith('.tickminder-qa-ngedu.workers.dev')) {
    document.cookie=cookieName+'='+theme+'; Max-Age=31536000; Domain=tickminder-qa-ngedu.workers.dev; Path=/; Secure; SameSite=Lax';
  }
}

function SynchronizeAppearance() {
  const {setTheme}=useTheme();
  useEffect(()=>{
    const sync=()=>{
      const preferred=sharedTheme();
      if(preferred){setTheme(preferred);return;}
      try{
        const saved=supportedTheme(localStorage.getItem(storageKey));
        if(saved)rememberSharedTheme(saved);
      }catch{}
    };
    sync();
    window.addEventListener('pageshow',sync);
    document.addEventListener('visibilitychange',sync);
    return ()=>{
      window.removeEventListener('pageshow',sync);
      document.removeEventListener('visibilitychange',sync);
    };
  },[setTheme]);
  return null;
}


export function AppearanceProvider({children}:{children:React.ReactNode}) {
  return <ThemeProvider attribute="class" storageKey={storageKey} defaultTheme="light" enableSystem={false} disableTransitionOnChange><SynchronizeAppearance/>{children}</ThemeProvider>;
}

export function useAppearance() {
  const {theme,setTheme}=useTheme();
  const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  return {dark:ready&&theme==='dark',changeAppearance(next:'light'|'dark'){rememberSharedTheme(next);setTheme(next);}};
}

export function AppearanceToggle({language='zh',showLabel=false,compact=false}:{language?:'zh'|'en'|'ms';showLabel?:boolean;compact?:boolean}) {
  const {dark,changeAppearance}=useAppearance();
  const label=language==='zh'?(dark?'切换浅色外观':'切换深色外观'):language==='ms'?(dark?'Gunakan tema cerah':'Gunakan tema gelap'):(dark?'Use light appearance':'Use dark appearance');
  return <button type="button" className={'appearance-toggle'+(compact?' ticklearn-appearance':'')} aria-label={label} title={label} aria-pressed={dark} onClick={()=>changeAppearance(dark?'light':'dark')}>
    {dark?<Sun size={19} aria-hidden="true"/>:<Moon size={19} aria-hidden="true"/>}
    {showLabel&&<span>{label}</span>}
  </button>;
}
