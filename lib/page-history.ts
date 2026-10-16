"use client";
import {useCallback,useEffect,useRef,useState,type Dispatch,type SetStateAction} from 'react';

export const NAVIGATION_EVENT='tickminder:history-change';
const NAV_KEY='tickminderNavigation',PAGE_KEY='tickminderPages';
const pages=new Map<string,unknown>();
let installed=false,context='',session='',contextIndex=0;
let pagePushPending=false;
const acceptedPops=new WeakMap<Event,boolean>();
const scope=()=>{const s=window.history.state||{};return JSON.stringify([s.timelyoRole,s.timelyoGroup,s.timelyoView]);};
function notify(kind:'push'|'replace'|'pop'){window.dispatchEvent(new CustomEvent(NAVIGATION_EVENT,{detail:kind}));}
export function installNavigationHistory(){
 if(installed||typeof window==='undefined')return;installed=true;
 const h=window.history,push=h.pushState.bind(h),replace=h.replaceState.bind(h);
 const previous=h.state?.[NAV_KEY];session=previous?.session||crypto.randomUUID();context=previous?.context||'';
 const index=()=>h.state?.[NAV_KEY]?.session===session&&Number.isSafeInteger(h.state[NAV_KEY].index)?h.state[NAV_KEY].index:0;
 contextIndex=Number.isSafeInteger(previous?.base)?previous.base:0;
 h.pushState=(state,title,url)=>{const next={...(state||{}),[NAV_KEY]:{session,index:index()+1,context,base:contextIndex}};push(next,title,url);notify('push');};
 h.replaceState=(state,title,url)=>{const next={...(state||{}),[NAV_KEY]:{session,index:index(),context,base:contextIndex}};replace(next,title,url);notify('replace');};
 h.replaceState(h.state||{},'');
 window.addEventListener('popstate',()=>notify('pop'));
}
export function setNavigationContext(next:string){
 installNavigationHistory();
 if(context&&context!==next){pages.clear();contextIndex=window.history.state?.[NAV_KEY]?.index||0;context=next;window.history.replaceState({...window.history.state,[PAGE_KEY]:{}},'');}
 else{context=next;window.history.replaceState(window.history.state||{},'');}
}
export function canNavigateBack(){const s=window.history.state?.[NAV_KEY];return Boolean(s?.session===session&&s.index>contextIndex);}
export function navigationAllowed(event?:Event){
 if(event&&acceptedPops.has(event))return acceptedPops.get(event)!;
 const allowed=window.dispatchEvent(new Event('tickminder-navigate',{cancelable:true}));
 if(event)acceptedPops.set(event,allowed);return allowed;
}
// History stores navigation scalars and opaque tokens; larger payloads stay
// in this tab's memory, isolated by role, organisation and workspace.
export function usePageHistoryState<T>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>,Dispatch<SetStateAction<T>>]{
 const initialRef=useRef(initial),current=useRef(initial),entry=useRef<unknown>(null),scopeRef=useRef('');
 const [value,setValue]=useState<T>(initial);
 const replacing=useRef(false);
 useEffect(()=>{
  installNavigationHistory();scopeRef.current=scope();const field=scopeRef.current+':'+key;
  const restoreValue=()=>{const saved=window.history.state?.[PAGE_KEY]?.[field];return saved&&pages.has(saved.token)?pages.get(saved.token) as T:saved&&'scalar'in saved?saved.scalar as T:initialRef.current;};
  const first=restoreValue();current.current=first;setValue(first);entry.current=window.history.state;
  const changed=(event:Event)=>{if((event as CustomEvent<string>).detail!=='pop')entry.current=window.history.state;};
  const restore=(event:PopStateEvent)=>{
   if(scope()!==scopeRef.current)return;
   const next=restoreValue();if(JSON.stringify(next)===JSON.stringify(current.current)){entry.current=window.history.state;return;}
   if(!navigationAllowed(event)){window.history.pushState(entry.current,'');event.stopImmediatePropagation();return;}
   current.current=next;setValue(next);entry.current=window.history.state;
  };
  window.addEventListener(NAVIGATION_EVENT,changed);window.addEventListener('popstate',restore);
  return()=>{window.removeEventListener(NAVIGATION_EVENT,changed);window.removeEventListener('popstate',restore);};
 },[key]);
 const update=useCallback<Dispatch<SetStateAction<T>>>(input=>{
  const next=typeof input==='function'?(input as (old:T)=>T)(current.current):input;
  if(JSON.stringify(next)===JSON.stringify(current.current))return;
  installNavigationHistory();const field=(scopeRef.current||scope())+':'+key,token=crypto.randomUUID();pages.set(token,next);
  const saved={token,...(next===null||typeof next==='string'||typeof next==='boolean'||typeof next==='number'?{scalar:next}:{})};
  const nextEntry={...window.history.state,[PAGE_KEY]:{...window.history.state?.[PAGE_KEY],[field]:saved}};
  if(replacing.current||pagePushPending)window.history.replaceState(nextEntry,'');else{window.history.pushState(nextEntry,'');pagePushPending=true;queueMicrotask(()=>{pagePushPending=false;});}
  current.current=next;entry.current=window.history.state;setValue(next);
 },[key]);
 const replace=useCallback<Dispatch<SetStateAction<T>>>(input=>{replacing.current=true;try{update(input);}finally{replacing.current=false;}},[update]);
 return[value,update,replace];
}

