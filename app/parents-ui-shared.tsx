"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {alertActionFailure,readApiJson} from '@/lib/action-feedback';
import {groupFetch} from '@/lib/group-client';
import {getLanguage} from '@/lib/i18n';
import {PR} from '@/lib/parents-i18n';
export class ParentApiError extends Error{constructor(public status:number,message:string){super(message);}}
export async function parentApi<T>(params:Record<string,string>,body?:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
 const query=new URLSearchParams(params).toString();const response=await groupFetch('/api/parents'+(query?'?'+query:''),{cache:'no-store',signal,...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{})});
 let result:T&{error?:string};try{result=await readApiJson<T&{error?:string}>(response);}catch(error){if([401,403,404].includes(response.status))throw new ParentApiError(response.status,PR('authorityLost'));throw error;}if(!response.ok)throw new ParentApiError(response.status,result.error||PR('failed'));return result;
}
export function useParentResource<T>(params:Record<string,string>|null,version=0,onDenied?:()=>void){
 const key=params?JSON.stringify(params):'',callback=useRef(onDenied);callback.current=onDenied;
 const [state,setState]=useState<{key:string;data:T|null;loading:boolean;failed:boolean}>({key:'',data:null,loading:false,failed:false});
 useEffect(()=>{if(!key){setState({key:'',data:null,loading:false,failed:false});return;}const controller=new AbortController();setState({key,data:null,loading:true,failed:false});void parentApi<T>(JSON.parse(key),undefined,controller.signal).then(data=>{if(!controller.signal.aborted)setState({key,data,loading:false,failed:false});}).catch(error=>{if(controller.signal.aborted)return;setState({key,data:null,loading:false,failed:true});alertActionFailure(error,'parents.failed');if(error instanceof ParentApiError&&[401,403,404].includes(error.status))callback.current?.();});return()=>controller.abort();},[key,version]);
 return state.key===key?state:{key,data:null,loading:!!key,failed:false};
}
export function ParentLoadState({loading,failed,onRetry,children}:{loading:boolean;failed:boolean;onRetry:()=>void;children:ReactNode}){return loading?<p className="parents-empty" role="status">{PR('loading')}</p>:failed?<div className="parents-actions"><Button type="button" variant="outline" onClick={onRetry}>{PR('retry')}</Button></div>:<>{children}</>;}
export function ParentPagination({page,pages,disabled,onChange}:{page:number;pages:number;disabled?:boolean;onChange:(value:number)=>void}){return pages>1?<nav className="parents-pagination" aria-label={PR('page').replace('{page}',String(page)).replace('{pages}',String(pages))}><Button type="button" variant="outline" disabled={disabled||page<=1} onClick={()=>onChange(page-1)}>{PR('back')}</Button><span>{PR('page').replace('{page}',String(page)).replace('{pages}',String(pages))}</span><Button type="button" variant="outline" disabled={disabled||page>=pages} onClick={()=>onChange(page+1)}>{PR('next')}</Button></nav>:null;}
export function parentDate(value:string|null|undefined,time=false){if(!value||!Number.isFinite(Date.parse(value)))return '—';return new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'short',day:'numeric',...(time?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(new Date(value));}
export function parentTime(value:string|null|undefined){if(!value||!Number.isFinite(Date.parse(value)))return '—';return new Intl.DateTimeFormat(getLanguage()==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value));}
export function parentSafeUrl(value:string|null|undefined){if(!value)return null;if(value.startsWith('/api/')&&!value.includes('\\'))return value;try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}}
export function parentMonth(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit'}).format(new Date()).replace(/^(\d{2})\/(\d{4})$/,'$2-$1');}
export function useParentFocusReload(onReload:()=>void,intervalMs=0){const callback=useRef(onReload);callback.current=onReload;useEffect(()=>{let last=0;const refresh=()=>{if(document.visibilityState==='visible'&&Date.now()-last>750){last=Date.now();callback.current();}};window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);document.addEventListener('visibilitychange',refresh);const timer=intervalMs>0?window.setInterval(refresh,intervalMs):undefined;return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',refresh);document.removeEventListener('visibilitychange',refresh);if(timer!==undefined)window.clearInterval(timer);};},[intervalMs]);}
