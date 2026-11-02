'use client';

import {CalendarDays} from 'lucide-react';
import {useEffect,useImperativeHandle,useRef,useState,type ComponentProps} from 'react';
import {getLanguage} from '@/lib/i18n';

type Props=Omit<ComponentProps<'input'>,'type'> & {type?:'month'};

function displayMonth(value:unknown,language:string){
 const text=typeof value==='string'?value:'';
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(text))return language==='zh'?'选择月份':'Choose month';
 const date=new Date(text+'-01T00:00:00Z');
 return new Intl.DateTimeFormat(language==='zh'?'zh-CN':'en-GB',{year:'numeric',month:'long',timeZone:'UTC'}).format(date);
}

/** Keep native month selection and form semantics while allowing its value to wrap. */
export function MonthInput({value,defaultValue,onChange,onClick,onKeyDown,className='',disabled,readOnly,ref,...props}:Props){
 const [localValue,setLocalValue]=useState(defaultValue);
 const [nativeFallback,setNativeFallback]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 useImperativeHandle(ref,()=>input.current!,[]);
 useEffect(()=>{const element=input.current;if(element)setNativeFallback(element.type!=='month'||typeof element.showPicker!=='function');},[]);
 useEffect(()=>{
  if(value!==undefined)return;
  const form=input.current?.form;
  let frame=0;
  const reset=(event:Event)=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!event.defaultPrevented)setLocalValue(input.current?.value||'');});};
  form?.addEventListener('reset',reset);
  return()=>{form?.removeEventListener('reset',reset);cancelAnimationFrame(frame);};
 },[value]);
 const language=getLanguage(),selected=value===undefined?localValue:value;
 const showPicker=(input:HTMLInputElement)=>{
  if(disabled||readOnly)return false;
  if(input.type!=='month'||typeof input.showPicker!=='function'){setNativeFallback(true);return false;}
  try{input.showPicker();return true;}catch{setNativeFallback(true);return false;}
 };
 return <span className="native-month-input" data-disabled={disabled||undefined} data-native-fallback={nativeFallback||undefined}>
  <span className="native-month-value" aria-hidden="true">{displayMonth(selected,language)}</span>
  <CalendarDays size={20} aria-hidden="true"/>
  <input {...props} ref={input} type="month" className={'native-month-control '+className} value={value} defaultValue={defaultValue} disabled={disabled} readOnly={readOnly}
   onChange={event=>{if(value===undefined)setLocalValue(event.target.value);onChange?.(event);}}
   onClick={event=>{onClick?.(event);if(!event.defaultPrevented)showPicker(event.currentTarget);}}
   onKeyDown={event=>{onKeyDown?.(event);if(!event.defaultPrevented&&(event.key==='Enter'||event.key===' ')&&showPicker(event.currentTarget))event.preventDefault();}}/>
 </span>;
}
