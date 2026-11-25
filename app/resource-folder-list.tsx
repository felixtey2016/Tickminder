"use client";

import {useContext,useEffect,useRef,useState} from "react";
import {ExternalLink,FileText} from "lucide-react";
import {Button} from "@/components/ui/button";
import {alertActionFailure,readApiJson} from "@/lib/action-feedback";
import {groupFetch} from "@/lib/group-client";
import {getLanguage} from "@/lib/i18n";
import {resourceApi,resourceLabel as label,resourceMessage} from "@/lib/resource-catalog-client";
import type {ResourceEntry,ResourcePage} from "@/lib/resource-catalog";
import {useAdminAction} from "./admin-permission-context";
import {ClassroomFilesContext} from '@/lib/classroom-files-ui';
import "./resource-folder-list.css";

/** This surface always reads the current classroom assignment, including for staff. */
export function ResourceFolderList({classroomId,folderId,contentRevision}:{classroomId:string;folderId:string;contentRevision:number}) {
  const can=useAdminAction(),allowed=can("resources.view")&&can("folders.view");
  const shared=useContext(ClassroomFilesContext),queryText=shared?.query||'',[search,setSearch]=useState('');
  const [page,setPage]=useState(1),[refresh,setRefresh]=useState(0),[data,setData]=useState<ResourcePage|null>(null),[error,setError]=useState("");
  const [loading,setLoading]=useState(false),[opening,setOpening]=useState("");
  const request=useRef(0),denied=useRef(false),listRequest=useRef<AbortController|null>(null),fileRequest=useRef<AbortController|null>(null);
  useEffect(()=>{const timer=window.setTimeout(()=>{setSearch(queryText.trim());setPage(1);},300);return()=>window.clearTimeout(timer);},[queryText]);
  const query=allowed?new URLSearchParams({view:"assigned",classroomId,folderId,page:String(page),...(search?{q:search}:{})}).toString():null;
  function authChanged(status:unknown) {
    if(status!==401&&status!==403)return;
    denied.current=true;
    window.dispatchEvent(new CustomEvent("timelyo:auth-refresh",{detail:{source:"resources",status,message:resourceMessage("resource.error.denied")}}));
  }
  useEffect(()=>{
    const id=++request.current,controller=new AbortController();listRequest.current=controller;
    setData(null);setError(denied.current?resourceMessage("resource.error.denied"):"");setLoading(Boolean(query)&&!denied.current);
    if(query&&!denied.current)void resourceApi<ResourcePage>(query,controller.signal).then(result=>{
      if(id!==request.current||controller.signal.aborted)return;
      denied.current=false;setData(result);setLoading(false);
      if(result.page!==page)setPage(result.page);
    }).catch(caught=>{
      if(id!==request.current||controller.signal.aborted)return;
      authChanged((caught as {status?:number})?.status);
      setError(alertActionFailure(new Error(resourceMessage(caught))));setLoading(false);
    });
    return()=>{controller.abort();};
  },[query,contentRevision,refresh]);
  useEffect(()=>{
    const update=()=>{if(document.visibilityState==="visible"&&!denied.current)setRefresh(value=>value+1);};
    const changed=()=>{denied.current=false;setData(null);setError("");fileRequest.current?.abort();setRefresh(value=>value+1);};
    const auth=(event:Event)=>{
      const detail=(event as CustomEvent<{source?:string;message?:string}>).detail;
      if(detail?.source==="resources"){denied.current=true;++request.current;listRequest.current?.abort();fileRequest.current?.abort();setData(null);setError(detail.message||resourceMessage("resource.error.denied"));setLoading(false);}
      else changed();
    };
    window.addEventListener("focus",update);window.addEventListener("tickminder:data-changed",changed);window.addEventListener("timelyo:auth-refresh",auth);
    return()=>{window.removeEventListener("focus",update);window.removeEventListener("tickminder:data-changed",changed);window.removeEventListener("timelyo:auth-refresh",auth);fileRequest.current?.abort();};
  },[]);
  useEffect(()=>{if(!allowed)fileRequest.current?.abort();},[allowed]);
  async function openPdf(item:ResourceEntry) {
    if(opening||!item.assignmentId)return;
    const popup=window.open("","_blank");
    if(!popup){alertActionFailure(new Error(label("请允许此网站打开新窗口后重试。","Allow this site to open a new window, then try again.")));return;}
    popup.opener=null;
    const controller=new AbortController();fileRequest.current=controller;setOpening(item.id);
    try {
      const params=new URLSearchParams({resourceId:item.id,assignmentId:item.assignmentId,lang:getLanguage()});
      const response=await groupFetch("/api/resources/file?"+params,{cache:"no-store",signal:controller.signal});
      if(!response.ok){const result=await readApiJson<{error?:string}>(response);alertActionFailure(new Error(resourceMessage(result.error)));authChanged(response.status);popup.close();return;}
      if(!response.headers.get("content-type")?.includes("application/pdf"))throw new Error(label("服务器未返回 PDF，请重试。","The server did not return a PDF. Please retry."));
      const blob=await response.blob();
      if(controller.signal.aborted){popup.close();return;}
      const url=URL.createObjectURL(blob);popup.location.replace(url);
      // The PDF viewer keeps its own loaded bytes; discard the temporary browser URL.
      window.setTimeout(()=>URL.revokeObjectURL(url),60000);
    } catch(caught) {
      popup.close();if(!controller.signal.aborted)alertActionFailure(new Error(resourceMessage(caught)));
    } finally {if(fileRequest.current===controller){fileRequest.current=null;setOpening("");}}
  }
  if(!allowed)return null;
  if(!loading&&!error&&data&&!data.items.length)return null;
  return <section className="resource-folder-list" aria-label={label("已分配资源","Assigned resources")}>
    <div className="resource-folder-heading"><h3>{label("已分配资源","Assigned resources")}</h3>{data&&<span className="learning-record-count">{data.total}</span>}</div>
    {loading?<p role="status">{label("正在加载本层资源…","Loading assigned resources…")}</p>:error?<div className="notice teaching-notice-actions" role="alert"><span>{error}</span><Button type="button" variant="outline" onClick={()=>{denied.current=false;setRefresh(value=>value+1);}}>{label("重试","Retry")}</Button></div>:data?.items.length?<>
      <div className="resource-folder-cards">{data.items.map(item=><article className="resource-folder-card" key={item.assignmentId||item.id}>
        <div className="learning-record-head"><strong>{item.title}</strong>{item.description&&<p>{item.description}</p>}</div>
        <div className="learning-record-meta">{[item.syllabusName,item.subjectName,item.year,item.paperCode,item.chapter].filter(Boolean).map((value,index)=><span key={index}>{value}</span>)}</div>
        <div className="resource-folder-source"><span>{label("来源","Source")}: {item.sourceName}</span>{item.sourceUrl&&<a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">{label("来源说明","Source information")}<ExternalLink size={14}/></a>}</div>
        {item.linkStatus==="invalid"?<p className="notice">{label("此资源已标记为失效，请联系老师。","This resource is marked unavailable. Please contact your teacher.")}</p>:<div className="learning-action-row">{item.kind==="file"?<Button type="button" variant="outline" disabled={Boolean(opening)||!item.assignmentId} onClick={()=>void openPdf(item)}><FileText size={16}/>{opening===item.id?label("正在打开…","Opening…"):label("查看 PDF","View PDF")}</Button>:item.url?<a className="resource-folder-open" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{label("前往原站","Open original website")}</a>:null}</div>}
        {item.linkStatus==="reported"&&<p className="muted">{label("此链接已有问题回报，老师正在核实。","A problem with this link has been reported and is being checked.")}</p>}
      </article>)}</div>
      <nav className="resource-folder-pagination" aria-label={label("已分配资源分页","Assigned resource pages")}><Button type="button" variant="outline" disabled={data.page<=1} onClick={()=>setPage(data.page-1)}>{label("上一页","Previous")}</Button><span>{data.page} / {data.pages} · {data.total} {label("条","items")}</span><Button type="button" variant="outline" disabled={data.page>=data.pages} onClick={()=>setPage(data.page+1)}>{label("下一页","Next")}</Button></nav>
    </>:<p className="muted">{label("本层暂无已分配资源。","No resources have been assigned to this folder.")}</p>}
  </section>;
}
