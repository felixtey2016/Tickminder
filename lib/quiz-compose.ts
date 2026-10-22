import type {Account} from './auth';
import {requireAdminPermission} from './admin-permission-access';
import {QuizError,type QuizContent,type QuizKey,type QuizQuestion} from './quiz';
import {readQuiz,quizKeys,saveQuiz,quizCopyReplay} from './quiz-server';
import type {QuizComposeIntent,QuizComposeQuestions,QuizQuestionSource} from './quiz-compose-types';

function invalid(code='quiz.composeInvalid'):never{throw new QuizError(code);}
function identity(value:unknown){return typeof value==='string'&&/^[a-zA-Z0-9_-]{16,100}$/.test(value)?value:invalid();}
function author(actor:Account){if(!['teacher','admin'].includes(actor.role))throw new QuizError('quiz.forbidden',403);}
export function checkComposeIntent(data:Record<string,unknown>):QuizComposeIntent{
 if(typeof data.title!=='string'||!data.title.trim()||data.title.length>160||!Array.isArray(data.selections)||data.selections.length<1||data.selections.length>10)invalid();
 const seen=new Set<string>();let count=0;
 const selections=data.selections.map(raw=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))invalid();const v=raw as Record<string,unknown>,quizId=identity(v.quizId),versionId=identity(v.versionId);
  if(typeof v.bank!=='boolean'||!Array.isArray(v.questionIds)||!v.questionIds.length||v.questionIds.length>150||seen.has(quizId))invalid();seen.add(quizId);
  const questionIds=v.questionIds.map(value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)?value:invalid());if(new Set(questionIds).size!==questionIds.length)invalid();count+=questionIds.length;
  return {quizId,versionId,bank:v.bank,questionIds};
 });
 if(count>150)invalid('quiz.composeLimit');return {title:data.title.trim(),selections};
}
export async function composeQuestions(actor:Account,url:URL):Promise<QuizComposeQuestions>{
 author(actor);await requireAdminPermission(actor,'quizzes.view');await requireAdminPermission(actor,'quizzes.duplicate');
 const quizId=identity(url.searchParams.get('quizId')),bank=url.searchParams.get('bank')==='1',offsetRaw=url.searchParams.get('offset')||'0';
 if(!/^\d{1,4}$/.test(offsetRaw))invalid();const offset=Number(offsetRaw);if(offset>150)invalid();
 const source=await readQuiz(actor,quizId,bank),questions=source.content.questions;
 // Keys, rubrics, explanations, account IDs and source credentials never appear
 // in the picker response. Image grants follow the usual saved-version access.
 return {quizId,versionId:source.v.id,title:source.content.title,exam:source.content.exam,subject:source.content.subject,total:questions.length,hasMore:offset+20<questions.length,questions:questions.slice(offset,offset+20).map(q=>({id:q.id,type:q.type,prompt:q.prompt,imageId:q.imageId,extraImageIds:q.extraImageIds,options:q.options,points:q.points,difficulty:q.difficulty,sourceId:q.sourceId,chapter:q.chapter,level:q.level,...q.answerUnit?{answerUnit:q.answerUnit}:{}}))};
}
function sameClassification(a:QuizContent,b:QuizContent){
 const same=(idA:string|undefined,idB:string|undefined,labelA:string,labelB:string)=>Boolean(idA&&idB&&idA===idB)||labelA.trim().toLowerCase()===labelB.trim().toLowerCase();
 return same(a.syllabusId,b.syllabusId,a.exam,b.exam)&&same(a.subjectId,b.subjectId,a.subject,b.subject);
}
export async function composeQuiz(actor:Account,data:Record<string,unknown>){
 author(actor);await requireAdminPermission(actor,'quizzes.view');await requireAdminPermission(actor,'quizzes.duplicate');
 const intent=checkComposeIntent(data),replay=await quizCopyReplay(actor,data,intent);if(replay)return replay;
 let template:QuizContent|null=null;const questions:QuizQuestion[]=[],keys:QuizKey[]=[],sources:QuizQuestionSource[]=[],versionIds:string[]=[];
 for(const selection of intent.selections){
  const source=await readQuiz(actor,selection.quizId,selection.bank);
  if(source.v.id!==selection.versionId)throw new QuizError('quiz.composeChanged',409);
  if(template&&!sameClassification(template,source.content))invalid('quiz.composeSubjects');if(!template)template=source.content;
  const sourceKeys=await quizKeys(source.v.id),byQuestion=new Map(source.content.questions.map(q=>[q.id,q])),byKey=new Map(sourceKeys.map(k=>[k.questionId,k]));versionIds.push(source.v.id);
  for(const sourceQuestionId of selection.questionIds){
   const original=byQuestion.get(sourceQuestionId),key=byKey.get(sourceQuestionId);if(!original||!key)invalid();
   const question=structuredClone(original),copyKey=structuredClone(key),optionIds=new Map(question.options.map(o=>[o.id,crypto.randomUUID()]));question.id=crypto.randomUUID();question.options=question.options.map(o=>({...o,id:optionIds.get(o.id)!}));copyKey.questionId=question.id;
   if(copyKey.correctOptionId)copyKey.correctOptionId=optionIds.get(copyKey.correctOptionId)||invalid();
   questions.push(question);keys.push(copyKey);sources.push({questionId:question.id,sourceVersionId:source.v.id,sourceQuestionId});
  }
 }
 if(!template)invalid();
 const content:QuizContent={...template,title:intent.title,bankKind:'creator',catalog:null,year:null,region:'',paper:'',questions,difficulty:questions.every(q=>q.difficulty===questions[0].difficulty)?questions[0].difficulty:'mixed',shuffleQuestions:false,shuffleOptions:false};
 delete content.sampling;
 return saveQuiz(actor,{id:data.id,operationId:data.operationId,revision:0,content,keys},{versionId:versionIds[0],versionIds,questionSources:sources,request:intent,legacyMetadata:template});
}
