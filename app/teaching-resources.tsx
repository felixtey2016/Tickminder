"use client";
import {lazy,Suspense,useEffect,useId,type ReactNode} from 'react';
import {FileText,Film,Library} from 'lucide-react';
import {PageState} from '@/components/page-state';
import {usePageHistoryState} from '@/lib/page-history';
import {getLanguage,t} from '@/lib/i18n';
import {useAdminAction,useAdminPermissionAccount} from './admin-permission-context';

const RecordingsWorkspace=lazy(()=>import('./recordings-workspace').then(module=>({default:module.RecordingsWorkspace})));
const ResourceCatalog=lazy(()=>import('./resource-catalog').then(module=>({default:module.ResourceCatalog})));

/** Materials and recording links share an entry, while fetching independently. */
export function TeachingResources({children,ready,error,load,setActiveScopes}:{children:ReactNode;ready:boolean;error?:string;load:(force?:boolean)=>Promise<void>;setActiveScopes:(scopes:[]|['learning'])=>void}){
  const can=useAdminAction(),account=useAdminPermissionAccount(),canPdf=can('materials.view'),canRecordings=can('recordings.view'),canResources=(account?.role==='admin'||account?.role==='teacher')&&can('resources.view');
  const [selected,setSelected]=usePageHistoryState<'pdf'|'recordings'|'catalog'>('teaching-resources.tab','pdf');
  const available={pdf:canPdf,recordings:canRecordings,catalog:canResources},tab=available[selected]?selected:canPdf?'pdf':canRecordings?'recordings':'catalog';
  const id=useId(),zh=getLanguage()==='zh';
  useEffect(()=>{if(tab==='pdf'&&canPdf&&!ready&&!error)void load();},[tab,canPdf,ready,error,load]);
  useEffect(()=>{setActiveScopes(tab==='pdf'&&canPdf?['learning']:[]);return()=>setActiveScopes([]);},[tab,canPdf,setActiveScopes]);
  const tabs=[...(canPdf?[{id:'pdf' as const,label:zh?'PDF 资料':'PDF materials',Icon:FileText}]:[]),...(canRecordings?[{id:'recordings' as const,label:zh?'课堂录影':'Class recordings',Icon:Film}]:[]),...(canResources?[{id:'catalog' as const,label:zh?'资源目录':'Resource catalogue',Icon:Library}]:[])];
  return <div className="teaching-resources"><div className="classroom-tabs" role="tablist" aria-label={t('教学资料')} onKeyDown={event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!tabs.length)return;
    event.preventDefault();const index=tabs.findIndex(item=>item.id===tab),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
    setSelected(tabs[next].id);document.getElementById(id+'-'+tabs[next].id)?.focus();
  }}>{tabs.map(({id:key,label,Icon})=><button key={key} id={id+'-'+key} type="button" role="tab" aria-selected={tab===key} aria-controls={id+'-panel'} tabIndex={tab===key?0:-1} className={tab===key?'active':''} onClick={()=>setSelected(key)}><Icon size={17}/>{label}</button>)}</div>
    <div role="tabpanel" id={id+'-panel'} aria-labelledby={id+'-'+tab} tabIndex={0}>
      {tab==='catalog'&&canResources?<Suspense fallback={<PageState kind="loading" title="正在加载…"/>}><ResourceCatalog/></Suspense>:tab==='recordings'&&canRecordings?<Suspense fallback={<PageState kind="loading" title="正在加载…"/>}><RecordingsWorkspace/></Suspense>:tab==='pdf'&&canPdf?(ready?children:<PageState kind={error?'error':'loading'} title={error?'页面加载失败':'正在加载…'} description={error} action={error?'重试':undefined} onAction={()=>void load(true)}/>):null}
    </div>
  </div>;
}
