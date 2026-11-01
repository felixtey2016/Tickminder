"use client";

import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import {ThemeProvider,useTheme} from 'next-themes';

export function AppearanceProvider({children}:{children:React.ReactNode}) {
  return <ThemeProvider attribute="class" storageKey="tickminder.appearance" defaultTheme="light" enableSystem={false} disableTransitionOnChange>{children}</ThemeProvider>;
}

export function AppearanceToggle({language='zh'}:{language?:'zh'|'en'}) {
  const {theme,setTheme}=useTheme();
  const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  const dark=ready&&theme==='dark';
  const label=language==='zh'?(dark?'切换浅色外观':'切换深色外观'):(dark?'Use light appearance':'Use dark appearance');
  return <button type="button" className="appearance-toggle" aria-label={label} title={label} aria-pressed={dark} onClick={()=>setTheme(dark?'light':'dark')}>
    {dark?<Sun size={19} aria-hidden="true"/>:<Moon size={19} aria-hidden="true"/>}
  </button>;
}
