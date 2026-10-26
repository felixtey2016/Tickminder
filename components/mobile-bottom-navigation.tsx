'use client';
import {useEffect,useRef,useState,type CSSProperties,type ReactNode} from 'react';
import {MoreHorizontal,type LucideIcon} from 'lucide-react';
import './mobile-bottom-navigation.css';

export type MobileNavigationItem={value:string;label:string;Icon:LucideIcon;badge?:ReactNode};
type Props={items:MobileNavigationItem[];active:string;onNavigate:(value:string)=>void;onMore:()=>void;moreLabel:string;ariaLabel?:string;hidden?:boolean};
const EDITABLE='input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]),textarea,select,[contenteditable="true"]';
// These are active work surfaces, rather than every form used for list filters.
const EDITING='[data-mobile-nav-hide],.quiz-editor,.quiz-practice-player,.form-action-bar,form.learning-form,.classroom-form-panel,.account-security-section[open]';
const WRITE_FORMS='form.invoice-settings-form,form.invoice-create-form,form.billing-form,form.billing-adjustment,form.payroll-rate-editor,form.group-create';
const DIALOG='dialog[open],[role="dialog"],[role="alertdialog"]';
function rendered(element:Element){
 if(!element.getClientRects().length||element.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
 for(let parent=element.parentElement;parent;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(element))return false;
 const style=getComputedStyle(element);return style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse';
}

export function MobileBottomNavigation({items,active,onNavigate,onMore,moreLabel,ariaLabel,hidden=false}:Props){
 const nav=useRef<HTMLElement>(null),explicitHidden=useRef(hidden);explicitHidden.current=hidden;
 const [blocked,setBlocked]=useState(true);
 useEffect(()=>{
  const element=nav.current,shell=element?.closest<HTMLElement>('.app-shell');if(!element||!shell)return;
  let frame=0;
  const measure=()=>{
   const visual=window.visualViewport,zoomed=Boolean(visual&&Math.abs(visual.scale-1)>.01),focused=document.activeElement;
   const inputFocused=focused instanceof HTMLElement&&shell.contains(focused)&&focused.matches(EDITABLE)&&rendered(focused);
   const keyboard=Boolean(visual&&!zoomed&&window.innerHeight-visual.height-visual.offsetTop>120);
   const obstructed=Array.from(document.querySelectorAll(DIALOG)).some(rendered);
   const editing=Array.from(shell.querySelectorAll(EDITING)).some(rendered)||Array.from(shell.querySelectorAll(WRITE_FORMS)).some(form=>rendered(form)&&Array.from(form.querySelectorAll('input:not(:disabled):not([readonly]):not([type="hidden"]),textarea:not(:disabled):not([readonly]),select:not(:disabled),[contenteditable="true"]')).some(rendered));
   setBlocked(explicitHidden.current||window.innerWidth>900||inputFocused||keyboard||obstructed||editing);
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(measure);};
  measure();const media=window.matchMedia('(min-width: 901px)'),visual=window.visualViewport;
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','open','disabled','readonly','data-state','aria-hidden','aria-modal','inert']});
  document.addEventListener('focusin',schedule);document.addEventListener('focusout',schedule);document.addEventListener('toggle',schedule,true);window.addEventListener('resize',schedule);media.addEventListener('change',schedule);visual?.addEventListener('resize',schedule);visual?.addEventListener('scroll',schedule);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('focusin',schedule);document.removeEventListener('focusout',schedule);document.removeEventListener('toggle',schedule,true);window.removeEventListener('resize',schedule);media.removeEventListener('change',schedule);visual?.removeEventListener('resize',schedule);visual?.removeEventListener('scroll',schedule);};
 },[hidden]);
 const visible=!hidden&&!blocked;
 useEffect(()=>{
  const element=nav.current,shell=element?.closest<HTMLElement>('.app-shell');if(!element||!shell)return;
  const reserve=()=>{shell.setAttribute('data-mobile-bottom-nav-visible',visible?'true':'false');shell.style.setProperty('--mobile-bottom-nav-height',visible?Math.ceil(element.getBoundingClientRect().height)+'px':'0px');};
  reserve();const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(reserve);observer?.observe(element);
  return()=>{observer?.disconnect();shell.removeAttribute('data-mobile-bottom-nav-visible');shell.style.removeProperty('--mobile-bottom-nav-height');};
 },[visible]);
 return <nav ref={nav} className="mobile-bottom-nav" aria-label={ariaLabel||moreLabel} hidden={!visible} data-testid="mobile-bottom-navigation" style={{'--mobile-nav-columns':items.length+1} as CSSProperties}>
  {items.map(({value,label,Icon,badge})=><button key={value} type="button" data-testid={'mobile-nav-'+value} aria-current={active===value?'page':undefined} onClick={()=>onNavigate(value)}><span className="mobile-nav-icon"><Icon size={22} aria-hidden="true"/>{badge&&<span className="mobile-nav-badge">{badge}</span>}</span><span>{label}</span></button>)}
  <button type="button" data-testid="mobile-nav-more" aria-current={active==='more'?'page':undefined} onClick={onMore}><MoreHorizontal size={22} aria-hidden="true"/><span>{moreLabel}</span></button>
 </nav>;
}
