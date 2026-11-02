"use client";

import {useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {Dialog} from 'radix-ui';
import {Check, Search, X} from 'lucide-react';
import {getLanguage} from '@/lib/i18n';
import './app-select-host.css';

type Choice = {node: HTMLOptionElement; index: number; text: string; group: string; disabled: boolean; selected: boolean; value: string};
type Session = {select: HTMLSelectElement; initialKey: string; keyboard: boolean};

function eligible(target: EventTarget | null): target is HTMLSelectElement {
  return target instanceof HTMLSelectElement && !target.multiple && target.size <= 1 &&
    !target.matches(':disabled') && !target.closest('[data-native-select="true"], [inert]') && target.getClientRects().length > 0;
}

function choicesFor(select: HTMLSelectElement): Choice[] {
  return Array.from(select.options).flatMap((node,index) => {
    const group = node.parentElement instanceof HTMLOptGroupElement ? node.parentElement : null;
    if (node.hidden || group?.hidden) return [];
    return [{node,index,text:node.label,group:group?.label || '',disabled:node.disabled || Boolean(group?.disabled),selected:node.selected,value:node.value}];
  });
}

function fieldName(select: HTMLSelectElement) {
  const explicit = select.getAttribute('aria-label') || select.getAttribute('aria-labelledby')?.split(/\s+/).map(id=>document.getElementById(id)?.textContent || '').join(' ');
  if (explicit?.trim()) return explicit.trim();
  const label = select.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
  label?.querySelectorAll('select,input,textarea,button,svg,[aria-hidden="true"]').forEach(node=>node.remove());
  return (label?.textContent || select.title || '').replace(/\s+/g,' ').replace(/[：:*＊]\s*$/,'').trim();
}

function captions(select: HTMLSelectElement) {
  const zh = getLanguage() === 'zh';
  const name = fieldName(select);
  const kind = /^(老师|教师)(姓名)?$|^选择老师$|^teacher( name)?$/i.test(name) ? 'teacher'
    : /^学生(姓名)?$|^选择学生$|^student( name)?$/i.test(name) ? 'student'
    : /^(班级|所属班级|选择班级)$|^(class|classroom)$/i.test(name) ? 'class' : '';
  const specific = kind === 'teacher' ? (zh ? ['选择老师','搜索老师姓名'] : ['Select teacher','Search teachers'])
    : kind === 'student' ? (zh ? ['选择学生','搜索学生姓名'] : ['Select student','Search students'])
    : kind === 'class' ? (zh ? ['选择班级','搜索班级'] : ['Select class','Search classes']) : null;
  return {title:select.dataset.pickerTitle || specific?.[0] || name || (zh?'请选择':'Select an option'),search:specific?.[1] || (zh?'搜索选项':'Search options'),close:zh?'关闭':'Close',empty:zh?'没有符合的选项':'No matching options',none:zh?'暂无可选项目':'No options available'};
}

/** Enhance existing single-select fields without changing their values, form names or React handlers. */
export function AppSelectHost() {
  const [session,setSession] = useState<Session|null>(null);
  const active = useRef<Session|null>(null);
  useEffect(()=>{
    const open = (select:HTMLSelectElement,initialKey='',keyboard=false) => {
      if(active.current)return;
      select.focus({preventScroll:true});
      const next={select,initialKey,keyboard};active.current=next;setSession(next);
    };
    // Cancel the browser picker, but leave the original field visible, focusable and form-associated.
    const down = (event:PointerEvent|MouseEvent) => {if(event.button===0 && eligible(event.target) && !active.current)event.preventDefault();};
    const click = (event:MouseEvent) => {if(event.button===0 && eligible(event.target)){event.preventDefault();open(event.target);}};
    const key = (event:KeyboardEvent) => {
      if(event.isComposing || event.keyCode===229)return;
      if(active.current && event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();active.current=null;setSession(null);return;}
      if(active.current || !eligible(event.target) || event.ctrlKey || event.metaKey || (event.altKey && event.key!=='ArrowDown'))return;
      const printable=event.key.length===1 && event.key!==' ';
      if(['Enter',' ','ArrowDown','ArrowUp','Home','End','F4'].includes(event.key)||printable){event.preventDefault();open(event.target,printable?event.key:'',true);}
    };
    // Run after React capture handlers so an enclosing dialog can mark this as an inside click.
    document.addEventListener('pointerdown',down);document.addEventListener('mousedown',down);
    document.addEventListener('click',click,true);window.addEventListener('keydown',key,true);
    return()=>{document.removeEventListener('pointerdown',down);document.removeEventListener('mousedown',down);document.removeEventListener('click',click,true);window.removeEventListener('keydown',key,true);};
  },[]);
  const close=()=>{active.current=null;setSession(null);};
  return session ? <SelectPanel session={session} onClose={close}/> : null;
}

function SelectPanel({session,onClose}:{session:Session;onClose:()=>void}) {
  const {select,initialKey}=session;
  const id=useId(),panel=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null);
  const [choices,setChoices]=useState(()=>choicesFor(select));
  const [query,setQuery]=useState(initialKey),[activeIndex,setActiveIndex]=useState(select.selectedIndex);
  const [keyboardMode,setKeyboardMode]=useState(session.keyboard);
  const [placement,setPlacement]=useState<{mobile:boolean;style:CSSProperties}>({mobile:window.innerWidth<=700,style:{}});
  const copy=captions(select),searchable=choices.length>=6;
  const normalized=query.trim().toLocaleLowerCase();
  const visible=choices.filter(choice=>!searchable || !normalized || `${choice.text} ${choice.group}`.toLocaleLowerCase().includes(normalized));
  const enabled=visible.filter(choice=>!choice.disabled);
  const currentIndex=enabled.some(choice=>choice.index===activeIndex)?activeIndex:enabled[0]?.index;

  useLayoutEffect(()=>{
    const original=new Map(['aria-expanded','aria-controls','aria-haspopup'].map(name=>[name,select.getAttribute(name)]));
    select.setAttribute('aria-expanded','true');select.setAttribute('aria-controls',id);select.setAttribute('aria-haspopup','dialog');
    return()=>original.forEach((value,name)=>value===null?select.removeAttribute(name):select.setAttribute(name,value));
  },[select,id]);

  useLayoutEffect(()=>{
    const place=()=>{
      const viewport=window.visualViewport,top=viewport?.offsetTop || 0,height=viewport?.height || window.innerHeight,width=viewport?.width || window.innerWidth;
      const mobile=width<=700;
      if(mobile){setPlacement({mobile,style:{left:viewport?.offsetLeft || 0,width,top:undefined,bottom:Math.max(0,window.innerHeight-top-height),maxHeight:Math.max(150,Math.min(height-12,height*.8))}});return;}
      const rect=select.getBoundingClientRect(),menuWidth=Math.min(Math.max(rect.width,300),420,width-24);
      const below=height+top-rect.bottom-12,above=rect.top-top-12,up=below<300&&above>below;
      setPlacement({mobile,style:{left:Math.min(Math.max(12,rect.left),width-menuWidth-12),width:menuWidth,top:up?undefined:rect.bottom+6,bottom:up?window.innerHeight-rect.top+6:undefined,maxHeight:Math.max(150,Math.min(520,up?above:below))}});
    };
    place();window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);window.visualViewport?.addEventListener('scroll',place);
    const resize=new ResizeObserver(place);resize.observe(select as unknown as Element);
    return()=>{resize.disconnect();window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place);window.visualViewport?.removeEventListener('scroll',place);};
  },[select]);

  useEffect(()=>{
    const refresh=()=>{
      if(!select.isConnected || !eligible(select)){onClose();return;}
      const next=choicesFor(select);
      setChoices(previous=>previous.length===next.length && previous.every((item,i)=>{const other=next[i];return item.node===other.node&&item.index===other.index&&item.text===other.text&&item.value===other.value&&item.group===other.group&&item.disabled===other.disabled&&item.selected===other.selected;})?previous:next);
    };
    const observer=new MutationObserver(refresh);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','hidden','label','value']});
    select.addEventListener('change',refresh);select.form?.addEventListener('reset',onClose);
    refresh();
    return()=>{observer.disconnect();select.removeEventListener('change',refresh);select.form?.removeEventListener('reset',onClose);};
  },[select,onClose]);

  const focusChoice=(index:number|undefined)=>{
    if(index===undefined)return;
    setActiveIndex(index);const node=panel.current?.querySelector<HTMLElement>(`[data-option-index="${index}"]`);node?.focus({preventScroll:true});node?.scrollIntoView({block:'nearest'});
  };
  const choose=(choice:Choice)=>{
    // Re-check the live option: related-field changes must never select stale or disabled data.
    if(!eligible(select)||select.options[choice.index]!==choice.node||choice.node.value!==choice.value||choice.node.disabled||(choice.node.parentElement instanceof HTMLOptGroupElement&&choice.node.parentElement.disabled)){onClose();return;}
    const changed=select.selectedIndex!==choice.index;
    if(changed)select.selectedIndex=choice.index;
    onClose();
    if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
  };
  const keyboard=(event:ReactKeyboardEvent)=>{
    if(event.nativeEvent.isComposing || event.nativeEvent.keyCode===229)return;
    setKeyboardMode(true);
    const inSearch=event.target===search.current;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'||(!inSearch&&(event.key==='Home'||event.key==='End'))){
      event.preventDefault();const current=enabled.findIndex(choice=>choice.index===activeIndex),delta=event.key==='ArrowUp'?-1:1;
      const next=event.key==='Home'?enabled[0]:event.key==='End'?enabled.at(-1):current<0?(delta<0?enabled.at(-1):enabled[0]):enabled[(current+delta+enabled.length)%enabled.length];focusChoice(next?.index);
    }else if(inSearch&&event.key==='Enter'){event.preventDefault();const match=enabled.find(choice=>choice.index===currentIndex);if(match)choose(match);}
    else if(!inSearch&&event.key.length===1&&event.key!==' '&&!event.ctrlKey&&!event.metaKey){event.preventDefault();if(searchable){setQuery(event.key);search.current?.focus();}else{focusChoice(enabled.find(choice=>choice.text.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()))?.index);}}
  };

  return <Dialog.Root open onOpenChange={open=>{if(!open)onClose();}}><Dialog.Portal container={select.closest<HTMLDialogElement>('dialog[open]') || undefined}>
    <Dialog.Overlay className={`app-select-overlay${placement.mobile?' is-mobile':''}`}/>
    <Dialog.Content id={id} ref={panel} data-testid="app-select-panel" className={`app-select-panel${placement.mobile?' is-mobile':''}${keyboardMode?' is-keyboard':''}`} style={placement.style} aria-describedby={undefined} onKeyDown={keyboard} onPointerDown={()=>setKeyboardMode(false)}
      onOpenAutoFocus={event=>{event.preventDefault();if(initialKey&&searchable)search.current?.focus();else{const initial=initialKey?enabled.find(choice=>choice.text.toLocaleLowerCase().startsWith(initialKey.toLocaleLowerCase())):choices.find(choice=>choice.selected&&!choice.disabled);const index=initial?.index ?? enabled[0]?.index;if(index!==undefined)focusChoice(index);else panel.current?.querySelector<HTMLButtonElement>('.app-select-close')?.focus();}}}
      onCloseAutoFocus={event=>{event.preventDefault();if(select.isConnected&&!select.matches(':disabled'))select.focus({preventScroll:true});}}
      onEscapeKeyDown={event=>{event.stopPropagation();if(event.isComposing||event.keyCode===229)event.preventDefault();}}>
      <div className="app-select-handle" aria-hidden="true"/>
      <div className="app-select-heading"><Dialog.Title>{copy.title}</Dialog.Title><Dialog.Close type="button" className="app-select-close" aria-label={copy.close}><X size={20}/></Dialog.Close></div>
      {searchable&&<div className="app-select-search"><Search size={19} aria-hidden="true"/><input ref={search} type="search" role="searchbox" aria-label={copy.search} placeholder={copy.search} value={query} onChange={event=>{setQuery(event.target.value);setActiveIndex(-1);}} autoComplete="off" autoCapitalize="none" spellCheck={false}/></div>}
      <div className="app-select-options" role="listbox" aria-label={copy.title}>
        {visible.map((choice,i)=><div className="app-select-item" key={choice.index}>
          {choice.group&&choice.group!==visible[i-1]?.group&&<div className="app-select-group">{choice.group}</div>}
          <button type="button" role="option" aria-selected={choice.selected} aria-disabled={choice.disabled||undefined} disabled={choice.disabled} tabIndex={choice.index===currentIndex?0:-1} data-option-index={choice.index} className={`app-select-option${choice.selected?' is-selected':''}${i===0&&choice.value===''?' is-all':''}`} onClick={()=>choose(choice)} onFocus={()=>setActiveIndex(choice.index)}><span>{choice.text || '\u00a0'}</span>{choice.selected&&<Check size={21} aria-hidden="true"/>}</button>
        </div>)}
        {!visible.length&&<p className="app-select-empty" role="status">{choices.length?copy.empty:copy.none}</p>}
      </div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
