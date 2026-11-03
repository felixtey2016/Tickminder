'use client';
import {useId,type ReactNode} from 'react';
import {ChevronRight,type LucideIcon} from 'lucide-react';
import './navigation-hub.css';

export type NavigationHubItem={id:string;label:string;description?:string;Icon:LucideIcon;badge?:ReactNode};
export type NavigationHubSection={id:string;title:string;items:NavigationHubItem[];layout?:'grid'|'list'};
type Props={title?:string;description?:string;sections:NavigationHubSection[];onChoose:(id:string)=>void;children?:ReactNode};

export function NavigationHub({title,description,sections,onChoose,children}:Props){
 const id=useId();
 return <div className="navigation-hub" data-testid="navigation-hub">
  {(title||description)&&<div className="navigation-hub-heading">{title&&<h1>{title}</h1>}{description&&<p>{description}</p>}</div>}
  {sections.filter(section=>section.items.length>0).map(section=><section key={section.id} className="navigation-hub-section" aria-labelledby={`${id}-${section.id}`}>
   <h2 id={`${id}-${section.id}`}>{section.title}</h2>
   <div className={'navigation-hub-items navigation-hub-'+(section.layout||'grid')}>
    {section.items.map(({id:itemId,label,description:detail,Icon,badge})=><button key={itemId} type="button" className="navigation-hub-item" data-testid={'hub-'+itemId} onClick={()=>onChoose(itemId)}>
     <span className="navigation-hub-icon"><Icon size={22} aria-hidden="true"/></span>
     <span className="navigation-hub-copy"><strong>{label}</strong>{detail&&<small>{detail}</small>}</span>
     {badge&&<span className="navigation-hub-badge">{badge}</span>}
     <ChevronRight className="navigation-hub-chevron" size={18} aria-hidden="true"/>
    </button>)}
   </div>
  </section>)}
  {children&&<div className="navigation-hub-utilities">{children}</div>}
 </div>;
}
