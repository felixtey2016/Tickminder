"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {groupFetch} from '@/lib/group-client';
import {readApiJson} from '@/lib/action-feedback';
import {getLanguage,t} from '@/lib/i18n';
import type {ResourcePage} from '@/lib/resource-catalog';
import styles from './shared-file-picker.module.css';

export function SharedFilePicker({value,onChange,disabled=false}:{value:string;onChange:(id:string)=>void;disabled?:boolean}){
  const [query,setQuery]=useState(''),[filter,setFilter]=useState(''),[page,setPage]=useState(1),[data,setData]=useState<ResourcePage|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const selected=useRef<{id:string;title:string}|null>(null);
  useEffect(()=>{let current=true;const controller=new AbortController();setLoading(true);setError('');
    const params=new URLSearchParams({view:'catalog',kind:'file',scope:'group',page:String(page),q:filter,lang:getLanguage()});
    void groupFetch('/api/resources?'+params,{cache:'no-store',signal:controller.signal}).then(async response=>{
      const result=await readApiJson<ResourcePage & {error?:string}>(response);
      if(!response.ok)throw new Error(t(result.error||'共享文件加载失败，请重试'));
      if(current)setData(result);
    }).catch(caught=>{if(current)setError(caught instanceof Error?caught.message:t('共享文件加载失败，请重试'));}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;controller.abort();};
  },[filter,page,retry]);
  const items=data?.items||[],prior=selected.current?.id===value&&!items.some(item=>item.id===value)?selected.current:null;
  const search=()=>{setFilter(query.trim());setPage(1);};
  return <div className={styles.picker}>
    <div className={styles.search}><label>{t('查找集团共享 PDF')}<input value={query} maxLength={200} disabled={disabled} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();search();}}}/></label><Button type="button" variant="outline" disabled={disabled||loading} onClick={search}>{t('查找')}</Button></div>
    {error?<div role="alert">{error}<Button type="button" variant="outline" onClick={()=>setRetry(x=>x+1)}>{t('重试')}</Button></div>:<>
      <label>{t('集团共享 PDF')}<select required value={value} disabled={disabled||loading} onChange={e=>{const item=items.find(item=>item.id===e.target.value);selected.current=item?{id:item.id,title:item.title}:null;onChange(e.target.value);}}><option value="">{t(loading?'正在加载…':'请选择')}</option>{prior&&<option value={prior.id}>{prior.title}</option>}{items.map(item=><option key={item.id} value={item.id}>{item.title}{item.subjectName?' · '+item.subjectName:''}</option>)}</select></label>
      {!loading&&!items.length&&<p>{t('暂无可复用的集团共享 PDF。请先在资源目录发布获授权的文件。')}</p>}
      {data&&data.pages>1&&<div className={styles.pages}><Button type="button" size="sm" variant="outline" disabled={disabled||loading||data.page<=1} onClick={()=>setPage(data.page-1)}>{t('上一页')}</Button><span>{data.page} / {data.pages}</span><Button type="button" size="sm" variant="outline" disabled={disabled||loading||data.page>=data.pages} onClick={()=>setPage(data.page+1)}>{t('下一页')}</Button></div>}
    </>}
    <small>{t('复用同一文件，不重复占用空间；当前内容和历史版本固定引用此 PDF。')}</small>
  </div>;
}
