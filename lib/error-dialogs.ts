"use client";
import {ACTION_TOAST_EVENT,actionFailureMessage,clearActionToastDedup,type ActionToast} from './action-feedback';
import {t} from './i18n';
const selector='[role="alert"],.error,.quiz-error,.billing-error,.invoice-notice-error';
export function installErrorDialogs(){
 const delivered=new Set<string>(),pending=new Set<string>(),seen=new WeakMap<Element,string>();
 let timer:number|undefined,focusAfter:HTMLElement|null=null,disposed=false;
 const flush=()=>{
  timer=undefined;if(disposed||document.hidden||!pending.size)return;
  const messages=[...pending];pending.clear();for(const message of messages)delivered.add(message);
  // Native dialogs stay above Safari's file picker return, native invoice
  // previews and nested form dialogs without competing focus traps.
  window.alert(messages.join('\n\n'));
  const field=focusAfter;focusAfter=null;if(field?.isConnected)requestAnimationFrame(()=>{field.focus({preventScroll:true});field.scrollIntoView({block:'center',behavior:'smooth'});});
 };
 const queue=(value:string)=>{const message=actionFailureMessage(new Error(value)).trim().slice(0,6000);if(!message||delivered.has(message))return;pending.add(message);if(timer===undefined)timer=window.setTimeout(flush,30);};
 const receive=(event:Event)=>{const detail=(event as CustomEvent<ActionToast>).detail;if(detail?.kind==='error')queue(detail.message);};
 const activation=()=>{delivered.clear();clearActionToastDedup();};
 const examine=(element:Element)=>{
  const root=element.closest(selector)||element;
  if(!root.matches(selector)||root.parentElement?.closest(selector)||!root.isConnected||!root.getClientRects().length||root.closest('[hidden],[aria-hidden="true"],[data-error-popup-ignore]'))return;
  const copy=root.cloneNode(true) as Element;copy.querySelectorAll('button,input,select,textarea,svg,[role="status"]').forEach(node=>node.remove());
  const message=(copy.textContent||'').replace(/\s+/g,' ').trim();
  if(message&&seen.get(root)!==message){seen.set(root,message);queue(message);}
 };
 const scan=(node:Node)=>{const element=node instanceof Element?node:node.parentElement;if(!element)return;examine(element);element.querySelectorAll(selector).forEach(examine);};
 const observer=new MutationObserver(records=>{for(const record of records){if(record.type==='childList'){for(const node of record.addedNodes)scan(node);examine(record.target instanceof Element?record.target:record.target.parentElement!);}else scan(record.target);}});
 observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['role','class','hidden','aria-hidden']});
 const invalid=(event:Event)=>{
  const input=event.target;if(!(input instanceof HTMLInputElement||input instanceof HTMLSelectElement||input instanceof HTMLTextAreaElement))return;
  event.preventDefault();if(focusAfter)return;focusAfter=input;
  const label=input.labels?.[0]?.cloneNode(true) as Element|undefined;label?.querySelectorAll('input,select,textarea,small,button').forEach(n=>n.remove());
  const name=input.getAttribute('aria-label')||label?.textContent?.trim()||'';
  queue((name?name+'：':'')+(input.validationMessage||t('请检查必填内容')));
 };
 const visible=()=>{if(!document.hidden)flush();};
 const crashed=(event:ErrorEvent)=>{if(event.target===window)queue(t('页面出现问题，请刷新后重试'));};
 const rejected=(event:PromiseRejectionEvent)=>queue(actionFailureMessage(event.reason));
 window.addEventListener(ACTION_TOAST_EVENT,receive);document.addEventListener('pointerdown',activation,true);document.addEventListener('keydown',activation,true);
 document.addEventListener('invalid',invalid,true);document.addEventListener('visibilitychange',visible);window.addEventListener('error',crashed);window.addEventListener('unhandledrejection',rejected);
 scan(document.body);
 return()=>{disposed=true;observer.disconnect();if(timer!==undefined)window.clearTimeout(timer);window.removeEventListener(ACTION_TOAST_EVENT,receive);document.removeEventListener('pointerdown',activation,true);document.removeEventListener('keydown',activation,true);document.removeEventListener('invalid',invalid,true);document.removeEventListener('visibilitychange',visible);window.removeEventListener('error',crashed);window.removeEventListener('unhandledrejection',rejected);};
}

