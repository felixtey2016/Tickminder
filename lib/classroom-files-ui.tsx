"use client";
import {createContext} from 'react';
export type ClassroomFileSort='recent'|'name';
export const ClassroomFilesContext=createContext<{
 query:string;setQuery:(query:string)=>void;sort:ClassroomFileSort;setSort:(sort:ClassroomFileSort)=>void;moveFile?:(id:string,title:string)=>void;
}|null>(null);
