"use client";
import {useEffect,useState} from 'react';
import {ArrowLeft} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {t} from '@/lib/i18n';
import {canNavigateBack,installNavigationHistory,NAVIGATION_EVENT,setNavigationContext} from '@/lib/page-history';
export function FloatingBackButton({context,isHome,onHome}:{context:string;isHome:boolean;onHome:()=>void}){
 const [available,setAvailable]=useState(false);
 useEffect(()=>{installNavigationHistory();setNavigationContext(context);const sync=()=>setAvailable(canNavigateBack());sync();window.addEventListener(NAVIGATION_EVENT,sync);return()=>window.removeEventListener(NAVIGATION_EVENT,sync);},[context]);
 return <div className="workspace-backbar"><Button type="button" variant="outline" className="workspace-back-button" data-testid="workspace-back" aria-label={t('返回上一页')} disabled={!available&&isHome} onClick={()=>{if(canNavigateBack())window.history.back();else if(!isHome)onHome();}}><ArrowLeft size={18} aria-hidden="true"/><span>{t('返回')}</span></Button></div>;
}

