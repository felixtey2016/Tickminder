"use client";

import {useEffect,useRef,useState,type CSSProperties,type ReactNode,type RefObject} from 'react';

type Viewport={height:number;top:number;keyboardInset:number;focusVersion:number};
const EMPTY_VIEWPORT:Viewport={height:0,top:0,keyboardInset:0,focusVersion:0};
const EDITABLE='input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]),textarea,select,[contenteditable="true"]';

// Only the visual viewport is measured. No device model or keyboard size is guessed.
export function useFormViewport(){
 const [viewport,setViewport]=useState<Viewport>(EMPTY_VIEWPORT);
 useEffect(()=>{
  let frame=0;
  const measure=(event?:Event)=>{
   cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{
    const visual=window.visualViewport,zoomed=Boolean(visual&&Math.abs(visual.scale-1)>.01);
    const height=zoomed?window.innerHeight:visual?.height||window.innerHeight,top=zoomed?0:Math.max(0,visual?.offsetTop||0);
    const focused=document.activeElement?.matches(EDITABLE);
    const keyboardInset=focused&&!zoomed?Math.max(0,window.innerHeight-height-top):0;
    const focusChanged=event?.type==='focusin'||event?.type==='focusout';
    setViewport(previous=>!focusChanged&&previous.height===height&&previous.top===top&&previous.keyboardInset===keyboardInset?previous:{height,top,keyboardInset,focusVersion:previous.focusVersion+(focusChanged?1:0)});
   });
  };
  measure();window.addEventListener('resize',measure);document.addEventListener('focusin',measure);document.addEventListener('focusout',measure);
  const visual=window.visualViewport;visual?.addEventListener('resize',measure);visual?.addEventListener('scroll',measure);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',measure);document.removeEventListener('focusin',measure);document.removeEventListener('focusout',measure);visual?.removeEventListener('resize',measure);visual?.removeEventListener('scroll',measure);};
 },[]);
 return viewport;
}

// Reserve the actual wrapped footer height, including large text and safe-area padding.
export function useFormFooterReserve(ref:RefObject<HTMLElement|null>,footerSelector?:string){
 useEffect(()=>{
  const root=ref.current;
  const surface=footerSelector?root:root?.parentElement;
  if(!root||!surface)return;
  const previous=surface.style.getPropertyValue('--form-action-reserve');
  let footer:HTMLElement|null=null;
  const measure=()=>{if(footer)surface.style.setProperty('--form-action-reserve',Math.ceil(footer.getBoundingClientRect().height+12)+'px');};
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);
  const discover=()=>{
   const next=footerSelector?root.querySelector<HTMLElement>(footerSelector):root;
   if(next===footer)return;
   observer?.disconnect();footer=next;if(footer){observer?.observe(footer);measure();}
   else if(previous)surface.style.setProperty('--form-action-reserve',previous);else surface.style.removeProperty('--form-action-reserve');
  };
  discover();const mutations=footerSelector?new MutationObserver(discover):null;mutations?.observe(root,{childList:true,subtree:true});window.addEventListener('resize',measure);
  return()=>{mutations?.disconnect();observer?.disconnect();window.removeEventListener('resize',measure);if(previous)surface.style.setProperty('--form-action-reserve',previous);else surface.style.removeProperty('--form-action-reserve');};
 },[ref,footerSelector]);
}

// A viewport-only keyboard resize can happen after the browser's first focus scroll.
export function useFormFocusVisibility(ref:RefObject<HTMLElement|null>,viewport:Viewport,footerSelector?:string){
 useEffect(()=>{
  if(window.innerWidth>760||!viewport.height)return;
  const root=ref.current,footer=footerSelector?root?.querySelector<HTMLElement>(footerSelector):root;
  const surface=footerSelector?root:root?.parentElement;
  if(!surface||!footer)return;
  const previousInset=surface.style.getPropertyValue('--form-keyboard-inset'),previousOpen=surface.getAttribute('data-form-keyboard-open');
  const ownsFocus=surface.contains(document.activeElement)&&Boolean(document.activeElement?.matches(EDITABLE)),keyboardInset=ownsFocus?viewport.keyboardInset:0;
  if(!footerSelector){surface.style.setProperty('--form-keyboard-inset',keyboardInset+'px');surface.setAttribute('data-form-keyboard-open',keyboardInset>0?'true':'false');}
  let frame=0;
  const correct=(remaining:number)=>{
   const focused=document.activeElement;
   if(!(focused instanceof HTMLElement)||!surface.contains(focused)||!focused.matches(EDITABLE))return;
   let bounds=focused.getBoundingClientRect();const footerBounds=footer.getBoundingClientRect();let top=viewport.top+12;
   if(!footerSelector)for(const header of document.querySelectorAll<HTMLElement>('.topbar,.workspace-backbar')){
    const style=getComputedStyle(header),rect=header.getBoundingClientRect(),pinnedTop=Number.parseFloat(style.top)||0;
    if(header.getClientRects().length&&['sticky','fixed'].includes(style.position)&&rect.bottom>viewport.top&&rect.top<=viewport.top+pinnedTop+1)top=Math.max(top,rect.bottom+12);
   }
   const bottom=Math.min(viewport.top+viewport.height-12,footerBounds.top-12);
   const labelBounds=focused.closest('label')?.getBoundingClientRect();if(labelBounds&&labelBounds.height<=bottom-top)bounds=labelBounds;
   const delta=bounds.height>bottom-top?bounds.top-top:bounds.bottom>bottom?bounds.bottom-bottom:bounds.top<top?bounds.top-top:0;
   if(Math.abs(delta)<1)return;
   let scroller=focused.parentElement;
   while(scroller&&scroller!==document.body&&scroller!==document.documentElement){if(/auto|scroll/.test(getComputedStyle(scroller).overflowY)&&scroller.scrollHeight>scroller.clientHeight)break;scroller=scroller.parentElement;}
   if(scroller&&scroller!==document.body&&scroller!==document.documentElement)scroller.scrollBy({top:delta,behavior:'instant'});else window.scrollBy({top:delta,behavior:'instant'});
   // Scrolling can move a sticky footer away from its containing block edge.
   if(remaining>0)frame=requestAnimationFrame(()=>correct(remaining-1));
  };
  frame=requestAnimationFrame(()=>correct(2));
  return()=>{cancelAnimationFrame(frame);if(!footerSelector){if(previousInset)surface.style.setProperty('--form-keyboard-inset',previousInset);else surface.style.removeProperty('--form-keyboard-inset');if(previousOpen===null)surface.removeAttribute('data-form-keyboard-open');else surface.setAttribute('data-form-keyboard-open',previousOpen);}};
 },[ref,viewport.height,viewport.top,viewport.keyboardInset,viewport.focusVersion,footerSelector]);
}

export function FormActionBar({children,summary,className=''}:{children:ReactNode;summary?:ReactNode;className?:string}){
 const viewport=useFormViewport(),ref=useRef<HTMLDivElement>(null);useFormFooterReserve(ref);useFormFocusVisibility(ref,viewport);
 const ownsFocus=typeof document!=='undefined'&&ref.current?.parentElement?.contains(document.activeElement);
 return <div ref={ref} className={'form-action-bar '+className} style={{'--form-keyboard-inset':(ownsFocus?viewport.keyboardInset:0)+'px'} as CSSProperties} data-testid="form-action-bar">
  {summary&&<p className="form-action-summary">{summary}</p>}
  <div className="form-action-buttons">{children}</div>
 </div>;
}
