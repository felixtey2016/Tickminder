'use client';
import {useMemo} from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {parseQuizNotation} from '@/lib/quiz-notation';
export function QuizMath({text}:{text:string}){
 const parts=useMemo(()=>{
  return parseQuizNotation(text).parts.map((part):{plain?:string;html?:string;block?:boolean}=>{
   if(part.kind==='text')return {plain:part.text};
   try{return {html:katex.renderToString(part.text,{displayMode:part.display,throwOnError:false,trust:false,strict:'warn',maxSize:12,maxExpand:300,macros:{},output:'htmlAndMathml'}),block:part.display};}catch{return {plain:part.automatic?part.text:(part.display?'$$':'$')+part.text+(part.display?'$$':'$')};}
  });
 },[text]);
 return <span className="quiz-math-text">{parts.map((p,i)=>p.html?<span key={i} className={p.block?'quiz-formula-block':'quiz-formula-inline'} dangerouslySetInnerHTML={{__html:p.html}}/>:<span key={i}>{p.plain}</span>)}</span>;
}
