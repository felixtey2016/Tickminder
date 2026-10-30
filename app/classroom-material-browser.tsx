"use client";

import {useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {Download,ExternalLink,FileText,FolderInput,LoaderCircle,MoreHorizontal,RefreshCw,Search,X} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from '@/components/ui/dialog';
import {alertActionFailure,readApiJson} from '@/lib/action-feedback';
import {ClassroomFilesContext,type ClassroomFileSort} from '@/lib/classroom-files-ui';
import {groupFetch} from '@/lib/group-client';
import {getLanguage} from '@/lib/i18n';
import {usePageHistoryState} from '@/lib/page-history';
import type {Material} from './learning-portal';
import {learningLabel as L} from './learning-list-detail';
import './classroom-material-browser.css';

type Props={
 items:Material[];historyKey:string;
 summary?:(item:Material)=>{context?:string;meta?:string;status?:string};
 renderDetail:(item:Material)=>ReactNode;empty?:ReactNode;
};
type Preview={key:string;url:string;error:string;loading:boolean};
const changedAt=(item:Material)=>{const value=Date.parse(item.updatedAt||'');return Number.isFinite(value)?value:0;};

/** A file presentation for classroom materials; actions keep their existing authority. */
export function ClassroomMaterialBrowser({items,historyKey,renderDetail,empty}:Props){
 const shared=useContext(ClassroomFilesContext),language=getLanguage();
 const [localQuery,setLocalQuery]=useState(''),[localSort,setLocalSort]=useState<ClassroomFileSort>('recent');
 const query=shared?.query??localQuery,sort=shared?.sort??localSort;
 const [selectedId,setSelectedId,replaceSelectedId]=usePageHistoryState<string>('classroom.files.preview:'+historyKey,'');
 const [details,setDetails]=useState<{scope:string;id:string}|null>(null),[retry,setRetry]=useState(0);
 const [preview,setPreview]=useState<Preview|null>(null),[mobile,setMobile]=useState(false);
 const lastOpener=useRef<HTMLButtonElement|null>(null),skipRestore=useRef(false);
 const visible=useMemo(()=>{
  const term=query.trim().toLocaleLowerCase();
  return items.filter(item=>!term||[item.title,item.filename].some(value=>String(value||'').toLocaleLowerCase().includes(term))).sort((a,b)=>sort==='recent'?(changedAt(b)-changedAt(a)||a.title.localeCompare(b.title,language==='zh'?'zh-CN':'en')):a.title.localeCompare(b.title,language==='zh'?'zh-CN':'en'));
 },[items,query,sort,language]);
 const selected=visible.find(item=>item.id===selectedId);
 const detailed=details?.scope===historyKey?items.find(item=>item.id===details.id):undefined;
 const previewKey=selected?JSON.stringify([historyKey,selected.id,selected.fileId,selected.revision,selected.updatedAt]):'';
 const current=preview?.key===previewKey?preview:null;
 const fileUrl=selected?'/api/files/'+encodeURIComponent(selected.fileId)+'?lang='+language:'';

 useEffect(()=>{
  const media=window.matchMedia('(max-width: 760px)'),update=()=>setMobile(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>{setLocalQuery('');setLocalSort('recent');},[historyKey]);
 useEffect(()=>{const invalidate=()=>{replaceSelectedId('');setDetails(null);setPreview(null);};window.addEventListener('timelyo:auth-refresh',invalidate);return()=>window.removeEventListener('timelyo:auth-refresh',invalidate);},[replaceSelectedId]);
 useEffect(()=>{if(selectedId&&!visible.some(item=>item.id===selectedId))replaceSelectedId('');},[selectedId,visible,replaceSelectedId]);
 useEffect(()=>{
  if(!previewKey||!fileUrl){setPreview(null);return;}
  const controller=new AbortController();let active=true,objectUrl='';
  setPreview({key:previewKey,url:'',error:'',loading:true});
  void (async()=>{
   const response=await groupFetch(fileUrl,{cache:'no-store',credentials:'same-origin',signal:controller.signal});
   if(!response.ok){
    if(response.headers.get('content-type')?.includes('application/json')){const result=await readApiJson<{error?:string}>(response);throw Error(result.error||L('文件暂时无法预览','The file could not be previewed'));}
    throw Error(L('文件暂时无法预览，请重新打开','The file could not be previewed. Try opening it again.'));
   }
   if(response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/pdf')throw Error(L('服务器未返回有效的 PDF 文件','The server did not return a valid PDF file'));
   const blob=await response.blob();
   if(!blob.size||await blob.slice(0,5).text()!=='%PDF-')throw Error(L('文件不是有效的 PDF，无法预览','This file is not a valid PDF and cannot be previewed'));
   if(!active||controller.signal.aborted)return;
   objectUrl=URL.createObjectURL(new Blob([blob],{type:'application/pdf'}));
   setPreview({key:previewKey,url:objectUrl,error:'',loading:false});
  })().catch(error=>{
   if(!active||controller.signal.aborted)return;
   const message=alertActionFailure(error,L('文件暂时无法预览','The file could not be previewed'));
   setPreview({key:previewKey,url:'',error:message,loading:false});
  });
  return()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[previewKey,fileUrl,retry]);

 function closePreview(){replaceSelectedId('');}
 function choose(item:Material,opener:HTMLButtonElement){lastOpener.current=opener;if(selectedId)replaceSelectedId(item.id);else setSelectedId(item.id);}
 function openDetails(item:Material,opener:HTMLButtonElement){lastOpener.current=opener;setDetails({scope:historyKey,id:item.id});}
 function restoreFocus(event:Event){event.preventDefault();if(skipRestore.current){skipRestore.current=false;return;}lastOpener.current?.isConnected&&lastOpener.current.focus();}
 const date=(item:Material)=>changedAt(item)?new Intl.DateTimeFormat(language==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'short',day:'numeric'}).format(new Date(item.updatedAt!)):'—';
 const previewBody=<div className="classroom-file-preview-body" aria-busy={!current||current.loading}>
  {!current||current.loading?<div className="classroom-file-preview-state" role="status"><LoaderCircle size={22} className="classroom-file-spinner" aria-hidden="true"/><span>{L('正在加载预览…','Loading preview…')}</span></div>:current.error?<div className="classroom-file-preview-state"><p>{current.error}</p><Button type="button" variant="outline" onClick={()=>setRetry(value=>value+1)}><RefreshCw size={16}/>{L('重试','Retry')}</Button></div>:current.url?<iframe key={current.key} title={selected?.title||L('PDF 预览','PDF preview')} src={current.url+'#toolbar=0&navpanes=0'} referrerPolicy="no-referrer"/>:null}
 </div>;
 const fileActions=<div className="classroom-file-preview-actions"><a href={fileUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} aria-hidden="true"/>{L('新窗口打开','Open in new tab')}</a><a href={fileUrl+'&download=1'}><Download size={16} aria-hidden="true"/>{L('下载','Download')}</a></div>;

 if(!items.length)return <>{empty}</>;
 return <div className={'classroom-material-browser'+(selected&&!mobile?' has-preview':'')} data-testid="classroom-material-browser">
  <div className="classroom-file-list">
   {!shared&&<div className="classroom-file-tools"><label><Search size={17} aria-hidden="true"/><input type="search" aria-label={L('搜索文件','Search files')} placeholder={L('搜索文件名','Search file names')} maxLength={200} value={query} onChange={event=>setLocalQuery(event.target.value)}/></label><select aria-label={L('文件排序','File order')} value={sort} onChange={event=>setLocalSort(event.target.value as ClassroomFileSort)}><option value="recent">{L('最近更新','Recently updated')}</option><option value="name">{L('名称','Name')}</option></select></div>}
   <div className="classroom-file-list-head" aria-hidden="true"><div><span>{L('文件','Files')} · {visible.length}</span><span className="classroom-file-uploader">{L('上传者','Uploaded by')}</span><span className="classroom-file-updated">{L('修改日期','Modified')}</span></div><span/></div>
   {visible.length?visible.map(item=><div className={'classroom-file-row'+(selected?.id===item.id?' selected':'')} key={item.id} data-file-id={item.id}>
    <button type="button" className="classroom-file-open" title={[item.title,item.filename].filter(Boolean).join('\n')} aria-label={L('预览 ','Preview ')+item.title} aria-pressed={selected?.id===item.id} onClick={event=>choose(item,event.currentTarget)}><span className="classroom-file-name"><FileText size={22} aria-hidden="true"/><span><strong>{item.title}</strong><small>{item.filename&&item.filename!==item.title?item.filename:'PDF'}</small><small className="classroom-file-mobile-meta">{[item.teacherName,changedAt(item)?date(item):''].filter(Boolean).join(' · ')}</small></span></span><span className="classroom-file-uploader">{item.teacherName||'—'}</span><span className="classroom-file-updated">{date(item)}</span></button>
    <button type="button" className="classroom-file-more" aria-label={L('详情与操作：','Details and actions: ')+item.title} title={L('详情与操作','Details and actions')} onClick={event=>openDetails(item,event.currentTarget)}><MoreHorizontal size={20} aria-hidden="true"/></button>
   </div>):<div className="classroom-files-empty"><p>{L('没有符合的文件','No matching files')}</p><Button type="button" variant="outline" onClick={()=>shared?shared.setQuery(''):setLocalQuery('')}>{L('清除搜索','Clear search')}</Button></div>}
  </div>
  {selected&&!mobile&&<section className="classroom-file-preview" aria-label={L('文件预览','File preview')}><header><div><h3>{selected.title}</h3><small>{selected.filename}</small></div><button type="button" aria-label={L('关闭预览','Close preview')} onClick={closePreview}><X size={20} aria-hidden="true"/></button></header>{fileActions}{previewBody}</section>}
  <Dialog open={Boolean(selected&&mobile)} onOpenChange={open=>{if(!open)closePreview();}}><DialogContent className="classroom-file-mobile-preview" overlayClassName="classroom-file-dialog-overlay" onCloseAutoFocus={restoreFocus}><DialogTitle>{selected?.title||L('文件预览','File preview')}</DialogTitle><DialogDescription className="sr-only">{L('PDF 文件预览','PDF file preview')}</DialogDescription>{fileActions}{previewBody}<p className="classroom-file-preview-fallback">{L('无法显示时，可在新窗口打开。','If the preview does not display, open the file in a new tab.')}</p></DialogContent></Dialog>
  <Dialog open={Boolean(detailed)} onOpenChange={open=>{if(!open)setDetails(null);}}><DialogContent className="classroom-file-details" overlayClassName="classroom-file-dialog-overlay" onCloseAutoFocus={restoreFocus}><DialogTitle>{L('文件详情与操作','File details and actions')}</DialogTitle><DialogDescription className="sr-only">{detailed?.title}</DialogDescription>{detailed&&<>{shared?.moveFile&&<div><Button type="button" variant="outline" onClick={()=>{skipRestore.current=true;setDetails(null);shared.moveFile?.(detailed.id,detailed.title);}}><FolderInput size={16} aria-hidden="true"/>{L('移到文件夹','Move to folder')}</Button></div>}{renderDetail(detailed)}</>}</DialogContent></Dialog>
 </div>;
}
