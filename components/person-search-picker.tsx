'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {Check,ChevronDown,Search,X} from 'lucide-react';
import {getLanguage} from '@/lib/i18n';
import {alertActionFailure} from '@/lib/action-feedback';
import './person-search-picker.css';

export type PersonSearchOption={value:string;label:string;hint?:string;disabled?:boolean};
export type PersonSearchPage={items:PersonSearchOption[];page:number;pages:number;total:number;selected?:PersonSearchOption|null};
type Props={label:string;value:string;selected?:PersonSearchOption|null;placeholder:string;disabled?:boolean;allowClear?:boolean;onChange:(value:string,person:PersonSearchOption|null)=>void;load:(search:string,page:number,signal:AbortSignal)=>Promise<PersonSearchPage>;contextKey:string;onResolved?:(person:PersonSearchOption|null)=>void;testId?:string};
const words=(zh:string,en:string)=>getLanguage()==='en'?en:zh;

export function PersonSearchPicker({label,value,selected,placeholder,disabled=false,allowClear=true,onChange,load,contextKey,onResolved,testId}:Props){
 const id=useId(),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null),loader=useRef(load),resolved=useRef(onResolved);
 loader.current=load;resolved.current=onResolved;
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[state,setState]=useState<PersonSearchPage|null>(null),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[active,setActive]=useState(-1);
 const cache=useRef(new Map<string,PersonSearchOption>()),sequence=useRef(0);
 if(selected&&selected.value===value)cache.current.set(value,selected);
 const chosen=selected?.value===value?selected:cache.current.get(value);
 useEffect(()=>{const timer=setTimeout(()=>setSearch(query.trim()),220);return()=>clearTimeout(timer);},[query]);
 useEffect(()=>{setPage(1);setState(null);setActive(-1);},[search,contextKey]);
 useEffect(()=>{
  if(!open||disabled)return;const controller=new AbortController(),token=++sequence.current;setLoading(true);setFailed(false);
  void loader.current(search,page,controller.signal).then(result=>{if(controller.signal.aborted||token!==sequence.current)return;for(const person of result.items)cache.current.set(person.value,person);if(result.selected)cache.current.set(result.selected.value,result.selected);if('selected'in result)resolved.current?.(result.selected||null);setState(old=>({...result,items:page===1?result.items:[...(old?.items||[]),...result.items.filter(item=>!old?.items.some(row=>row.value===item.value))]}));setActive(-1);}).catch(()=>{if(!controller.signal.aborted&&token===sequence.current){setFailed(true);alertActionFailure(new Error(words('暂时无法载入名单，请重试','Unable to load names. Please retry.')));}}).finally(()=>{if(!controller.signal.aborted&&token===sequence.current)setLoading(false);});
  return()=>{controller.abort();sequence.current++;};
 },[open,disabled,search,page,contextKey,retry]);
 useEffect(()=>{if(!open)return;const frame=requestAnimationFrame(()=>input.current?.focus());const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);};document.addEventListener('pointerdown',outside);return()=>{cancelAnimationFrame(frame);document.removeEventListener('pointerdown',outside);};},[open]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 function close(focus=true){setOpen(false);if(focus)trigger.current?.focus();}
 function choose(person:PersonSearchOption|null){if(person?.disabled)return;if(person)cache.current.set(person.value,person);onChange(person?.value||'',person);close();}
 const searching=query.trim()!==search,items=searching?[]:state?.items||[],selectable=items.map((item,index)=>!item.disabled?index:-1).filter(index=>index>=0);
 function move(direction:number){if(!selectable.length)return;const position=selectable.indexOf(active),next=position<0?(direction>0?0:selectable.length-1):(position+direction+selectable.length)%selectable.length;setActive(selectable[next]);requestAnimationFrame(()=>document.getElementById(id+'-option-'+selectable[next])?.scrollIntoView({block:'nearest'}));}
 return <div className="person-search-picker" ref={root} data-testid={testId} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))close(false);}}>
  <span className="person-search-label" id={id+'-label'}>{label}</span>
  <button ref={trigger} type="button" className="person-search-trigger" disabled={disabled} aria-labelledby={id+'-label '+id+'-value'} aria-expanded={open} aria-haspopup="listbox" aria-controls={open?id+'-list':undefined} onClick={()=>{setQuery('');setSearch('');setPage(1);setState(null);setOpen(value=>!value);}} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();setOpen(true);}}}><span id={id+'-value'}>{chosen?.label||placeholder}</span><ChevronDown size={17} aria-hidden="true"/></button>
  {chosen?.hint&&<small className="person-search-selected-hint">{chosen.hint}</small>}
  {open&&<div className="person-search-panel"><div className="person-search-input"><Search size={17} aria-hidden="true"/><input ref={input} type="search" maxLength={100} autoComplete="off" role="combobox" aria-label={words('搜索姓名','Search names')} aria-autocomplete="list" aria-expanded="true" aria-controls={id+'-list'} aria-activedescendant={active>=0&&items[active]?id+'-option-'+active:undefined} value={query} onChange={event=>{setQuery(event.target.value);setPage(1);}} onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();move(event.key==='ArrowDown'?1:-1);}else if(event.key==='Enter'){event.preventDefault();const next=items[active>=0?active:selectable[0]];if(!searching&&!loading&&!failed&&next)choose(next);}}}/></div>
   {allowClear&&<button type="button" className="person-search-clear" onClick={()=>choose(null)}><X size={15} aria-hidden="true"/>{placeholder}</button>}
   <div role="listbox" id={id+'-list'} aria-labelledby={id+'-label'} aria-busy={loading} className="person-search-results">{items.map((person,index)=><button type="button" role="option" id={id+'-option-'+index} key={person.value} aria-selected={person.value===value} aria-disabled={person.disabled||undefined} disabled={person.disabled} tabIndex={-1} className={index===active?'is-active':undefined} onPointerMove={()=>setActive(index)} onClick={()=>choose(person)}><span><strong>{person.label}</strong>{person.hint&&<small>{person.hint}</small>}</span>{person.value===value&&<Check size={17} aria-hidden="true"/>}</button>)}</div>
   {(loading||searching)&&<p role="status">{words('正在查找…','Searching…')}</p>}
   {!loading&&!searching&&!failed&&!items.length&&<p role="status">{words('没有符合的姓名','No matching names')}</p>}
   {failed&&<div className="person-search-error" role="alert" data-error-popup-ignore><span>{words('暂时无法载入名单','Unable to load names')}</span><button type="button" onClick={()=>setRetry(value=>value+1)}>{words('重试','Retry')}</button></div>}
   {!loading&&!failed&&state&&state.page<state.pages&&<button type="button" className="person-search-more" onClick={()=>setPage(value=>value+1)}>{words('加载更多','Load more')}</button>}
  </div>}
 </div>;
}
