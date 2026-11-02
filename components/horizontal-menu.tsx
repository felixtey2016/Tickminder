"use client";

import {cloneElement,useEffect,useId,useLayoutEffect,useRef,useState,type HTMLAttributes,type ReactElement} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {getLanguage} from '@/lib/i18n';
import './horizontal-menu.css';

type MenuProps=HTMLAttributes<HTMLElement>&{'data-horizontal-menu-track'?:string};

/** Keep the existing menu, handlers and refs; arrows move only its bounded row. */
export function HorizontalMenu({children,className=''}:{children:ReactElement<MenuProps>;className?:string}){
 const host=useRef<HTMLDivElement>(null),activeItem=useRef<HTMLElement|null>(null),id=useId(),menuId=children.props.id||`horizontal-menu-${id}`;
 const [edges,setEdges]=useState({overflow:false,left:false,right:false});
 const track=()=>host.current?.querySelector<HTMLElement>(':scope > [data-horizontal-menu-track]');
 const measure=()=>{
  const row=track(),container=host.current;if(!row||!container)return;
  const overflow=row.scrollWidth>container.clientWidth+1&&row.getClientRects().length>0;
  const next={overflow,left:overflow&&row.scrollLeft>2,right:overflow&&row.scrollLeft+row.clientWidth<row.scrollWidth-2};
  setEdges(previous=>previous.overflow===next.overflow&&previous.left===next.left&&previous.right===next.right?previous:next);
 };
 const reveal=(item:HTMLElement|null)=>{
  const row=track();if(!row||!item||!row.contains(item))return;
  const outer=row.getBoundingClientRect(),inner=item.getBoundingClientRect();
  if(inner.width>outer.width)row.scrollLeft+=inner.left-outer.left;
  else if(inner.left<outer.left)row.scrollLeft+=inner.left-outer.left-4;
  else if(inner.right>outer.right)row.scrollLeft+=inner.right-outer.right+4;
 };
 const revealActive=(force=false)=>{
  const current=track()?.querySelector<HTMLElement>('[aria-selected="true"],[aria-current="page"],[aria-current="true"],[data-state="active"],button.active,button.is-active')||null;
  if(force||current!==activeItem.current)reveal(current);
  activeItem.current=current;
 };
 useLayoutEffect(()=>{measure();revealActive();},[children,edges.overflow]);
 useEffect(()=>{
  const row=track(),container=host.current;if(!row||!container)return;
  let width='';
  const resize=new ResizeObserver(()=>{const next=`${container.clientWidth}:${row.clientWidth}`;measure();if(next!==width)revealActive(true);width=next;});
  resize.observe(container);resize.observe(row);Array.from(row.children).forEach(item=>resize.observe(item));
  const mutation=new MutationObserver(()=>{Array.from(row.children).forEach(item=>resize.observe(item));measure();});
  mutation.observe(row,{childList:true,subtree:true,characterData:true});
  row.addEventListener('scroll',measure,{passive:true});measure();
  return()=>{resize.disconnect();mutation.disconnect();row.removeEventListener('scroll',measure);};
 },[]);
 const scroll=(direction:number)=>{const row=track();if(!row)return;row.scrollBy({left:direction*Math.max(120,row.clientWidth*.75),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});};
 const zh=getLanguage()==='zh';
 return <div ref={host} className={`horizontal-menu ${className}`} data-overflow={edges.overflow} onFocusCapture={event=>reveal(event.target as HTMLElement)}>
  {edges.overflow&&<button type="button" className="horizontal-menu-arrow" aria-label={zh?'向左滚动菜单':'Scroll menu left'} aria-controls={menuId} disabled={!edges.left} onClick={()=>scroll(-1)}><ChevronLeft size={20} aria-hidden="true"/></button>}
  {cloneElement(children,{id:menuId,'data-horizontal-menu-track':'true'})}
  {edges.overflow&&<button type="button" className="horizontal-menu-arrow" aria-label={zh?'向右滚动菜单':'Scroll menu right'} aria-controls={menuId} disabled={!edges.right} onClick={()=>scroll(1)}><ChevronRight size={20} aria-hidden="true"/></button>}
 </div>;
}
