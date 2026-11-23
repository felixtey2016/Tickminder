"use client";

import {useRef,useState} from 'react';
import type {FormEvent} from 'react';
import {openWebGameZip} from '@/lib/tickgame-web-zip';
import {detectGameCover,maxCoverBytes} from '@/lib/tickgame-studio-schema';
import type {StudioGame} from '@/lib/tickgame-studio-schema';

type Draft={game:string;version:string};
type Upload={zip:Awaited<ReturnType<typeof openWebGameZip>>;cover:File|null;draft:Draft;sent:number};
export function TickGameStudio({language,game}:{language:'zh'|'en';game?:StudioGame}) {
  const t=(zh:string,en:string)=>language==='zh'?zh:en;
  const [working,setWorking]=useState(false);
  const [ready,setReady]=useState<Draft|null>(null);
  const [progress,setProgress]=useState({done:0,total:0});
  const [error,setError]=useState('');
  const upload=useRef<Upload|null>(null);
  const storageKey='tickgame.studio.ready.'+(game?.id||'new');

  const messages:Record<string,string>={
    'zip-size':t('ZIP 大小上限是 500 MiB。','The ZIP must be 500 MiB or smaller.'),
    'zip-format':t('无法读取这个 ZIP。请重新导出网页版。','Unable to read the ZIP. Export the web build again.'),
    'zip-content':t('ZIP 根目录需有 index.html。请检查文件路径和大小。','The ZIP needs index.html at the root. Check file paths and sizes.'),
    'cover-required':t('请单独选择封面图片。','Choose a separate cover image.'),
    'cover-format':t('封面请用 PNG、JPG 或 WebP。','Use a PNG, JPG or WebP cover.'),
    'version-conflict':t('这款游戏已有新版本发布。请先从游戏页重新打开更新入口。','Another version was published. Reopen the update form from the game page.'),
  };
  function report(reason:unknown){
    setError(messages[reason instanceof Error?reason.message:'']||t('操作失败，请重试。若登录已过期，请从 Tickminder 重新进入。','Try again. If your session expired, reopen TickGame from Tickminder.'));
  }

  async function api<T={ok:true}>(action:string,method:'POST'|'PUT',body?:BodyInit,draft?:Draft,file?:string){
    const query=new URLSearchParams({action,...draft,...(file!==undefined?{file}:{})});
    const res=await fetch('/studio-api?'+query,{method,body,...(typeof body==='string'?{headers:{'Content-Type':'application/json'}}:{})});
    const data=await res.json().catch(()=>({}));
    if(!res.ok){
      const reason=data&&typeof data==='object'&&'error' in data?data.error:null;
      throw new Error(typeof reason==='string'?reason:'upload-failed');
    }
    return data as T;
  }

  async function send(current:Upload){
    const files=current.zip.files;
    const total=files.length+Number(Boolean(current.cover));
    setProgress({done:current.sent,total});
    while(current.sent<total){
      const index=current.sent;
      const isCover=index===0&&current.cover!==null;
      const fileIndex=index-Number(Boolean(current.cover));
      const body=isCover?current.cover!:await current.zip.unpack(fileIndex);
      await api('file','PUT',body,current.draft,isCover?'cover':String(fileIndex));
      current.sent++;
      setProgress({done:current.sent,total});
    }
    await api('finish','POST',undefined,current.draft);
    setReady(current.draft);
    try{localStorage.setItem(storageKey,JSON.stringify(current.draft));}catch{}
  }

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(working||ready)return;
    const form=new FormData(event.currentTarget);
    const zipInput=form.get('zip'),coverInput=form.get('cover');
    setWorking(true);setError('');
    try{
      if(!upload.current){
        if(!(zipInput instanceof File)||!zipInput.size)throw new Error('zip-format');
        const cover=coverInput instanceof File&&coverInput.size?coverInput:null;
        if(!cover&&!game)throw new Error('cover-required');
        const type=cover?detectGameCover(new Uint8Array(await cover.slice(0,12).arrayBuffer())):null;
        if(cover&&(!type||cover.size>maxCoverBytes))throw new Error('cover-format');
        const zip=await openWebGameZip(zipInput);
        const draft=await api<Draft>('create','POST',JSON.stringify({
          ...(game?{game:game.id}:{}),title:form.get('title'),subject:form.get('subject'),
          description:form.get('description'),files:zip.files,cover:cover&&type?{size:cover.size,type}:null,
        }));
        upload.current={zip,cover,draft,sent:0};
      }
      await send(upload.current);
    }catch(reason){report(reason);}
    finally{setWorking(false);}
  }

  async function publish(){
    if(!ready||working)return;
    setWorking(true);setError('');
    try{
      await api('publish','POST',undefined,ready);
      try{localStorage.removeItem(storageKey);}catch{}
      location.assign('/games/'+ready.game+'?lang='+language);
    }catch(reason){report(reason);setWorking(false);}
  }

  async function restore(){
    setWorking(true);setError('');
    try{
      const raw=localStorage.getItem(storageKey);
      if(!raw){
        setError(t('这个浏览器没有待发布的草稿。','There is no unpublished draft on this browser.'));
        return;
      }
      const draft=JSON.parse(raw) as Draft;
      await api('finish','POST',undefined,draft);
      setReady(draft);
    }catch(reason){report(reason);}
    finally{setWorking(false);}
  }

  return <section className="tickgame-demo">
    <h1>{game?t('上传新版本','Upload a new version'):t('新增游戏','Add a game')}</h1>
    {!ready&&<form className="tickgame-upload-form" onSubmit={submit}>
      <fieldset disabled={working||upload.current!==null}>
        <label>{t('游戏名称','Game title')}<input name="title" defaultValue={game?.title} required maxLength={100}/></label>
        <label>{t('科目','Subject')}<input name="subject" defaultValue={game?.subject} list="tickgame-subject-list" required maxLength={55}/></label>
        <datalist id="tickgame-subject-list"><option value="Sejarah"/><option value="Mathematics"/><option value="Science"/></datalist>
        <label>{t('简介（选填）','Description (optional)')}<textarea name="description" defaultValue={game?.description} maxLength={500}/></label>
        <label>{game?t('更换封面（选填）','Replace cover (optional)'):t('封面图片','Cover image')}<input name="cover" type="file" accept="image/png,image/jpeg,image/webp" required={!game}/></label>
        <label>{t('网页版游戏 ZIP','Web game ZIP')}<input name="zip" type="file" accept=".zip,application/zip" required/></label>
        <small>{t('ZIP 根目录需要 index.html。游戏包最大 500 MiB，封面最大 5 MiB。','Put index.html at the root of the ZIP. Game ZIP: up to 500 MiB. Cover: up to 5 MiB.')}</small>
      </fieldset>
      <div className="tickgame-studio-actions">
        <button className="tickgame-fullscreen-button" disabled={working} type="submit">{upload.current?t('继续上传','Resume upload'):t('上传并保存草稿','Upload and save draft')}</button>
        {!upload.current&&<button className="tickgame-fullscreen-button" disabled={working} type="button" onClick={restore}>{t('继续已上传的草稿','Open an uploaded draft')}</button>}
      </div>
    </form>}
    {progress.total>0&&!ready&&<div aria-live="polite">
      <progress value={progress.done} max={progress.total}/>
      <span> {progress.done} / {progress.total} {t('个文件','files')}</span>
    </div>}
    {working&&<p role="status">{t('处理中…','Working…')}</p>}
    {error&&<p role="alert">{error}</p>}
    {ready&&<div className="tickgame-studio-actions">
      <a className="tickgame-fullscreen-button" href={'/games/'+ready.game+'?'+new URLSearchParams({lang:language,version:ready.version})}
        target="_blank" rel="noopener">{t('试玩草稿','Preview draft')}</a>
      <button className="tickgame-fullscreen-button" type="button" disabled={working} onClick={publish}>{t('发布游戏','Publish game')}</button>
    </div>}
  </section>;
}
