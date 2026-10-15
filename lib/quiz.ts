// Content and grading keys are separate types and separate persisted records.
export type QuizType='mcq'|'true_false'|'blank'|'math'|'written';
export type Difficulty='easy'|'medium'|'hard'|'mixed';
export type QuizVisibility='private'|'organisation'|'public';
export type QuizBankKind='platform'|'creator';
export type QuizCatalogKind='subtopic'|'chapter_overall'|'level_overall';
export type QuizLevel='Form 1'|'Form 2'|'Form 3'|'Form 4'|'Form 5';
export type QuizCatalog={kind:QuizCatalogKind;level:QuizLevel;chapterCode:string;chapterTitle:string;subtopicCode:string;subtopicTitle:string;setNumber:number};
export type QuizText={primary:string;en:string};
export type QuizOption={id:string;text:QuizText;imageId:string|null};
export type QuizQuestion={id:string;type:QuizType;prompt:QuizText;imageId:string|null;extraImageIds:string[];options:QuizOption[];points:number;difficulty:Exclude<Difficulty,'mixed'>;sourceId:string;chapter:string;level:string;answerUnit?:string};
export type QuizKey={questionId:string;mode:'choice'|'text'|'numeric'|'manual';correctOptionId:string|null;accepted:string[];caseSensitive:boolean;tolerance:number;unit:string;rubric:string;explanation:string};
export type QuizContent={schemaVersion:1;title:string;instructions:string;subject:string;exam:string;year:number|null;region:string;paper:string;difficulty:Difficulty;primaryLanguage:'zh'|'en'|'ms';timeLimitSeconds:number|null;shuffleQuestions:boolean;shuffleOptions:boolean;questions:QuizQuestion[];bankKind?:QuizBankKind;catalog?:QuizCatalog|null};
export type QuizDraft={id:string;revision:number;visibility:QuizVisibility;content:QuizContent;keys:QuizKey[];canEdit:boolean;sharedRevision:number|null};
export class QuizError extends Error{constructor(public code:string,public status=400){super(code);}}
export function quizImageMime(bytes:Uint8Array):'image/png'|'image/jpeg'|'image/webp'|null{
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length>=33&&[137,80,78,71,13,10,26,10].every((x,i)=>bytes[i]===x)&&bytes[12]===73&&bytes[13]===72&&bytes[14]===68&&bytes[15]===82){const width=view.getUint32(16),height=view.getUint32(20);return width>0&&height>0&&width*height<=32000000?'image/png':null;}
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes[bytes.length-2]===255&&bytes[bytes.length-1]===217)return 'image/jpeg';
 if(bytes.length>=20&&bytes[0]===82&&bytes[1]===73&&bytes[2]===70&&bytes[3]===70&&bytes[8]===87&&bytes[9]===69&&bytes[10]===66&&bytes[11]===80&&view.getUint32(4,true)===bytes.length-8)return 'image/webp';
 return null;
}
const fail=(code:string):never=>{throw new QuizError(code);};
function string(value:unknown,max:number,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))return fail('quiz.invalidFields');return value.trim();}
function text(value:unknown):QuizText{const v=value as QuizText;return {primary:string(v?.primary,6000),en:string(v?.en,6000)};}
function id(value:unknown){return typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)?value:fail('quiz.invalidFields');}
function image(value:unknown){return value==null||value===''?null:id(value);}
function finite(value:unknown,min:number,max:number){return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max?value:fail('quiz.invalidFields');}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return fail('quiz.invalidFields');return value as Record<string,unknown>;}
export function checkQuizCatalog(value:unknown):QuizCatalog|null{
 if(value==null)return null;const v=record(value);
 if(!['subtopic','chapter_overall','level_overall'].includes(String(v.kind))||!['Form 1','Form 2','Form 3','Form 4','Form 5'].includes(String(v.level)))return fail('quiz.invalidCatalog');
 const c:QuizCatalog={kind:v.kind as QuizCatalogKind,level:v.level as QuizLevel,chapterCode:string(v.chapterCode,16),chapterTitle:string(v.chapterTitle,160),subtopicCode:string(v.subtopicCode,32),subtopicTitle:string(v.subtopicTitle,160),setNumber:finite(v.setNumber,1,10000)};
 if(!Number.isInteger(c.setNumber))return fail('quiz.invalidCatalog');
 if(c.kind==='level_overall'){if(c.chapterCode||c.chapterTitle||c.subtopicCode||c.subtopicTitle)return fail('quiz.invalidCatalog');}
 else{
  if(!/^[1-9]\d{0,2}$/.test(c.chapterCode)||!c.chapterTitle)return fail('quiz.invalidCatalog');
  if(c.kind==='chapter_overall'){if(c.subtopicCode||c.subtopicTitle)return fail('quiz.invalidCatalog');}
  else if(!/^[1-9]\d{0,2}(?:\.[1-9]\d{0,2}){1,3}$/.test(c.subtopicCode)||!c.subtopicCode.startsWith(c.chapterCode+'.')||!c.subtopicTitle)return fail('quiz.invalidCatalog');
 }return c;
}
export function numericAnswer(raw:string):number|null{
 const s=raw.trim();if(s.length>100)return null;
 const number='[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d{1,3})?';
 if(new RegExp('^'+number+'$').test(s)){const n=Number(s);return Number.isFinite(n)?n:null;}
 const m=s.match(new RegExp('^('+number+')\\s*/\\s*('+number+')$'));if(!m||Number(m[2])===0)return null;
 const result=Number(m[1])/Number(m[2]);return Number.isFinite(result)?result:null;
}
export function checkQuiz(input:unknown,rawKeys:unknown):{content:QuizContent;keys:QuizKey[];images:string[];total:number}{
 const v=record(input) as unknown as QuizContent;if(v.schemaVersion!==1||!Array.isArray(v.questions)||v.questions.length<1||v.questions.length>150)return fail('quiz.questionCount');
 const content:QuizContent={schemaVersion:1,title:string(v.title,160,true),instructions:string(v.instructions,4000),subject:string(v.subject,100,true),exam:string(v.exam,80),year:v.year==null?null:finite(v.year,1900,2200),region:string(v.region,100),paper:string(v.paper,80),difficulty:['easy','medium','hard','mixed'].includes(v.difficulty)?v.difficulty:fail('quiz.invalidFields'),primaryLanguage:['zh','en','ms'].includes(v.primaryLanguage)?v.primaryLanguage:fail('quiz.invalidFields'),timeLimitSeconds:v.timeLimitSeconds==null?null:finite(v.timeLimitSeconds,60,21600),shuffleQuestions:v.shuffleQuestions===true,shuffleOptions:v.shuffleOptions===true,questions:[]};
 if(v.bankKind!==undefined&&!['platform','creator'].includes(v.bankKind))return fail('quiz.invalidCatalog');
 content.bankKind=v.bankKind||'creator';content.catalog=checkQuizCatalog(v.catalog);
 if(content.year!==null&&!Number.isInteger(content.year)||content.timeLimitSeconds!==null&&!Number.isInteger(content.timeLimitSeconds))return fail('quiz.invalidFields');
 const ids=new Set<string>(),images=new Set<string>();
 for(const raw of v.questions){
  record(raw);if(!Array.isArray(raw.extraImageIds)||raw.extraImageIds.length>4)return fail('quiz.invalidQuestion');
  const q:QuizQuestion={id:id(raw.id),type:['mcq','true_false','blank','math','written'].includes(raw.type)?raw.type:fail('quiz.invalidFields'),prompt:text(raw.prompt),imageId:image(raw.imageId),extraImageIds:Array.isArray(raw.extraImageIds)&&raw.extraImageIds.length<=4?raw.extraImageIds.map(x=>id(x)):[],options:[],points:finite(raw.points,0.01,1000),difficulty:['easy','medium','hard'].includes(raw.difficulty)?raw.difficulty:fail('quiz.invalidFields'),sourceId:string(raw.sourceId,120),chapter:string(raw.chapter,200),level:string(raw.level,100)};
  if(ids.has(q.id)||!q.prompt.primary&&!q.prompt.en||Math.abs(Math.round(q.points*100)-q.points*100)>1e-8)return fail('quiz.invalidQuestion');ids.add(q.id);if(q.imageId)images.add(q.imageId);q.extraImageIds.forEach(x=>images.add(x));
  if(q.type==='mcq'||q.type==='true_false'){
   if(!Array.isArray(raw.options)||raw.options.length<(q.type==='mcq'?2:2)||raw.options.length>(q.type==='true_false'?2:6))return fail('quiz.invalidOptions');
   const optionIds=new Set<string>();q.options=raw.options.map(o=>{record(o);const option={id:id(o.id),text:text(o.text),imageId:image(o.imageId)};if(optionIds.has(option.id)||!option.text.primary&&!option.text.en&&!option.imageId)return fail('quiz.invalidOptions');optionIds.add(option.id);if(option.imageId)images.add(option.imageId);return option;});
  }content.questions.push(q);
 }
 if(!Array.isArray(rawKeys)||rawKeys.length!==content.questions.length)return fail('quiz.invalidAnswers');
 const keys:QuizKey[]=content.questions.map(q=>{
  const matching=rawKeys.filter(k=>k&&typeof k==='object'&&k.questionId===q.id);if(matching.length!==1)return fail('quiz.invalidAnswers');const raw=matching[0];
  const key:QuizKey={questionId:q.id,mode:['choice','text','numeric','manual'].includes(raw.mode)?raw.mode:fail('quiz.invalidAnswers'),correctOptionId:raw.correctOptionId==null?null:id(raw.correctOptionId),accepted:Array.isArray(raw.accepted)&&raw.accepted.length<=20?raw.accepted.map((a:unknown)=>string(a,300,true)):fail('quiz.invalidAnswers'),caseSensitive:raw.caseSensitive===true,tolerance:finite(raw.tolerance,0,1000000),unit:string(raw.unit,40),rubric:string(raw.rubric,4000),explanation:string(raw.explanation,4000)};
  if(q.type==='mcq'||q.type==='true_false'){if(key.mode!=='choice'||!q.options.some(o=>o.id===key.correctOptionId))return fail('quiz.invalidAnswers');key.accepted=[];}
  else if(q.type==='blank'){if(key.mode!=='text'||!key.accepted.length)return fail('quiz.invalidAnswers');key.correctOptionId=null;}
  else if(q.type==='math'){if(!['numeric','manual'].includes(key.mode)||key.mode==='numeric'&&(!key.accepted.length||key.accepted.some(a=>numericAnswer(a)===null)))return fail('quiz.invalidAnswers');key.correctOptionId=null;}
  else if(key.mode!=='manual')return fail('quiz.invalidAnswers');
  if(key.mode==='manual'){key.correctOptionId=null;key.accepted=[];}
  if(q.type==='math'&&key.mode==='numeric'&&key.unit)q.answerUnit=key.unit;
  return key;
 });
 const total=Math.round(content.questions.reduce((n,q)=>n+q.points,0)*100)/100;if(total>100000)return fail('quiz.invalidFields');
 if(content.bankKind==='platform'&&(!content.catalog||content.questions.length!==40||content.difficulty==='mixed'||content.questions.some(q=>q.difficulty!==content.difficulty)))return fail('quiz.invalidPlatformSet');
 if(JSON.stringify({content,keys}).length>450000)return fail('quiz.tooLarge');return {content,keys,images:[...images],total};
}
export function emptyQuiz():QuizContent{return {schemaVersion:1,title:'',instructions:'',subject:'',exam:'',year:null,region:'',paper:'',difficulty:'mixed',primaryLanguage:'zh',timeLimitSeconds:null,shuffleQuestions:false,shuffleOptions:false,questions:[]};}
export function newQuestion(type:QuizType='mcq'):{question:QuizQuestion;key:QuizKey}{
 const qid=crypto.randomUUID(),choice=type==='mcq'||type==='true_false';
 const options=choice?Array.from({length:type==='true_false'?2:4},(_,i)=>({id:crypto.randomUUID(),text:{primary:type==='true_false'?(i===0?'正确':'错误'):'',en:type==='true_false'?(i===0?'True':'False'):''},imageId:null})):[];
 return {question:{id:qid,type,prompt:{primary:'',en:''},imageId:null,extraImageIds:[],options,points:1,difficulty:'medium',sourceId:'',chapter:'',level:''},key:{questionId:qid,mode:choice?'choice':type==='blank'?'text':type==='math'?'numeric':'manual',correctOptionId:options[0]?.id||null,accepted:[],caseSensitive:false,tolerance:0,unit:'',rubric:'',explanation:''}};
}
export function quizImageIds(content:QuizContent){return [...new Set(content.questions.flatMap(q=>[q.imageId,...q.extraImageIds,...q.options.map(o=>o.imageId)]).filter((id):id is string=>Boolean(id)))];}
export function normaliseQuizText(value:string,caseSensitive=false){const normal=value.trim().replace(/\s+/gu,' ');return caseSensitive?normal:normal.toLocaleLowerCase('en');}
export type QuizAnswer={optionId?:string;text?:string;unit?:string};
export type QuizAnswerEvaluation={status:'correct'|'incorrect'|'manual';points:number|null};
// Shared grading rule, deliberately limited to literal answers and finite
// numbers/fractions. This never evaluates expressions or claims algebraic equivalence.
export function evaluateQuizAnswer(question:QuizQuestion,key:QuizKey,answer:QuizAnswer):QuizAnswerEvaluation{
 if(question.id!==key.questionId)throw new QuizError('quiz.invalidAnswers');
 if(key.mode==='manual')return {status:'manual',points:null};
 let correct=false;
 if(key.mode==='choice')correct=typeof answer.optionId==='string'&&question.options.some(o=>o.id===answer.optionId)&&answer.optionId===key.correctOptionId;
 else if(key.mode==='text'&&typeof answer.text==='string'&&answer.text.length<=6000){const value=normaliseQuizText(answer.text,key.caseSensitive);correct=Boolean(value)&&key.accepted.some(a=>normaliseQuizText(a,key.caseSensitive)===value);}
 else if(key.mode==='numeric'&&typeof answer.text==='string'){
  const value=numericAnswer(answer.text),unit=normaliseQuizText(answer.unit??question.answerUnit??'',true);
  if(value!==null&&unit===normaliseQuizText(key.unit,true))correct=key.accepted.some(a=>{const expected=numericAnswer(a);if(expected===null)return false;const delta=Math.abs(value-expected);return delta<=key.tolerance||delta<=Number.EPSILON*Math.max(Math.abs(value),Math.abs(expected))*4;});
 }
 return {status:correct?'correct':'incorrect',points:correct?question.points:0};
}
