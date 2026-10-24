"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import {groupFetch} from './group-client';
import {readApiJson,alertActionFailure} from './action-feedback';
import {getLanguage,t} from './i18n';

export const resourceLabel=(zh:string,en:string)=>getLanguage()==='zh'?zh:en;
const messages:Record<string,[string,string]>={
 'resource.error.denied':['权限已变更或无权访问此资源，请刷新后重试。','Your access changed or this resource is unavailable. Refresh and try again.'],
 'resource.error.signIn':['请先登录。','Please sign in.'],
 'resource.error.failed':['资源操作失败，请重试。','The resource action failed. Please try again.'],
 'resource.error.missing':['资源或来源已不可用，请刷新。','The resource or source is no longer available. Please refresh.'],
 'resource.error.changed':['内容已更新，请关闭此窗口并刷新后重试。','The content changed. Close this dialog, refresh and try again.'],
 'resource.error.fields':['请检查必填字段和长度。','Check the required fields and their lengths.'],
 'resource.error.classification':['请选择有效的课程纲要及科目。','Select an active syllabus and subject.'],
 'resource.error.url':['请输入有效的公开 HTTPS 原站链接。','Enter a valid public HTTPS source URL.'],
 'resource.error.reason':['请填写说明。','Please enter a reason.'],
 'resource.error.page':['页码无效。','Invalid page number.'],
 'resource.error.operation':['操作标识已失效，请刷新后重试。','The action expired. Refresh and try again.'],
 'resource.error.fileImmutable':['文件版本不能覆盖；请新建资源。','File versions cannot be replaced. Create a new resource.'],
 'resource.error.fileLicense':['文件须记录原创或明确使用授权。','Files require original ownership or explicit permission.'],
 'resource.error.publicLink':['只有外链可申请公开。','Only external links can be made public.'],
};
export function resourceMessage(value:unknown){const key=value instanceof Error?value.message:String(value||'resource.error.failed'),entry=messages[key];return entry?resourceLabel(...entry):t(key);}
export function resourceAccessChanged(error:unknown){const status=(error as {status?:number})?.status;if(status===401||status===403)window.dispatchEvent(new CustomEvent('timelyo:auth-refresh',{detail:{source:'resources',status,message:resourceMessage(error)}}));}
export async function resourceApi<T>(query:string,signal?:AbortSignal):Promise<T>{
 const response=await groupFetch(query.startsWith('/')?query:'/api/resources?'+query,{cache:'no-store',signal});let result:T&{error?:string};try{result=await readApiJson<T&{error?:string}>(response);}catch(error){throw Object.assign(error instanceof Error?error:new Error(resourceMessage(error)),{status:response.status});}
 if(!response.ok)throw Object.assign(new Error(resourceMessage(result.error||'resource.error.failed')),{status:response.status});return result;
}
export type ResourceOperation={signature:string;id:string}|null;
export async function resourcePost(body:Record<string,unknown>,operation?:{current:ResourceOperation}){
 try{
 const signature=JSON.stringify(body);if(operation&&operation.current?.signature!==signature)operation.current={signature,id:crypto.randomUUID()};
 const response=await groupFetch('/api/resources',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,operationId:operation?.current?.id||crypto.randomUUID()}),cache:'no-store'});let result:{ok?:boolean;error?:string;added?:number;existing?:number};try{result=await readApiJson<typeof result>(response);}catch(error){throw Object.assign(error instanceof Error?error:new Error(resourceMessage(error)),{status:response.status});}
 if(!response.ok)throw Object.assign(new Error(resourceMessage(result.error||'resource.error.failed')),{status:response.status});if(operation)operation.current=null;window.dispatchEvent(new Event('tickminder:data-changed'));return result;
 }catch(error){resourceAccessChanged(error);alertActionFailure(new Error(resourceMessage(error)));throw error;}
}
/** Ignore a superseded range/page response and clear data as access or filters change. */
export function useResourceQuery<T>(query:string|null,version:unknown=0){
 const [data,setData]=useState<T|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[refresh,setRefresh]=useState(0),request=useRef(0),denied=useRef(false),controllerRef=useRef<AbortController|null>(null);
 const reload=useCallback(()=>{denied.current=false;setData(null);setError('');setRefresh(v=>v+1);},[]);
 useEffect(()=>{const id=++request.current,controller=new AbortController();controllerRef.current=controller;setData(null);setError('');setLoading(Boolean(query));if(query)void resourceApi<T>(query,controller.signal).then(value=>{if(id===request.current){denied.current=false;setData(value);setLoading(false);}}).catch(caught=>{if(!controller.signal.aborted&&id===request.current){setData(null);setError(alertActionFailure(new Error(resourceMessage(caught))));setLoading(false);resourceAccessChanged(caught);}});return()=>{controller.abort();};},[query,version,refresh]);
 useEffect(()=>{if(!query)return;const update=()=>{if(document.visibilityState==='visible'&&!denied.current)reload();},changed=()=>reload(),auth=(event:Event)=>{const detail=(event as CustomEvent<{source?:string;message?:string}>).detail;if(detail?.source==='resources'){denied.current=true;++request.current;controllerRef.current?.abort();setData(null);setLoading(false);setError(detail.message||resourceMessage('resource.error.denied'));}else reload();},timer=window.setInterval(update,20000);window.addEventListener('focus',update);window.addEventListener('tickminder:data-changed',changed);window.addEventListener('timelyo:auth-refresh',auth);return()=>{clearInterval(timer);window.removeEventListener('focus',update);window.removeEventListener('tickminder:data-changed',changed);window.removeEventListener('timelyo:auth-refresh',auth);};},[query,reload]);
 return{data,error,loading,reload};
}
