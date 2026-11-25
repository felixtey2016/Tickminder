"use client";
import {createContext,useContext,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
export type ClassroomFileSort='recent'|'name';
export const ClassroomFilesContext=createContext<{
 query:string;setQuery:(query:string)=>void;sort:ClassroomFileSort;setSort:(sort:ClassroomFileSort)=>void;moveFile?:(id:string,title:string)=>void;actionsHost?:HTMLElement|null;uploadHost?:HTMLElement|null;panelsHost?:HTMLElement|null;
}|null>(null);

// Keep the action with its existing state/permissions while placing its trigger
// in the class file toolbar. Forms and import progress remain in the content area.
export function ClassroomFileAction({children,placement='action'}:{children:ReactNode;placement?:'action'|'upload'|'panel'}) {
 const files=useContext(ClassroomFilesContext);
 const host=placement==='panel'?files?.panelsHost:placement==='upload'?files?.uploadHost:files?.actionsHost;
 return host?createPortal(children,host):children;
}
