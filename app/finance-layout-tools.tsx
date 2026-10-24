"use client";
import type {ReactNode} from 'react';
import {getLanguage} from '@/lib/i18n';
export const financeLabel=(zh:string,en:string)=>getLanguage()==='zh'?zh:en;
export function FinanceHelp({children,title}:{children:ReactNode;title?:string}){return <details className="finance-layout-help"><summary>{title||financeLabel('说明','How it works')}</summary><div>{children}</div></details>;}
