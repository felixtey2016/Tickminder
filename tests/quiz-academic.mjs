import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const cache=new Map();
async function load(file){
 if(cache.has(file))return cache.get(file);
 let code=ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const match of [...code.matchAll(/from ['"]([^'"]+)['"]/g)]){const spec=match[1],child=path.posix.normalize(path.posix.join(path.posix.dirname(file),spec+'.ts')),url=(await load(child)).url;code=code.replaceAll(`'${spec}'`,`'${url}'`).replaceAll(`"${spec}"`,`"${url}"`);}
 const url='data:text/javascript;base64,'+Buffer.from(code).toString('base64'),value={url,module:await import(url)};cache.set(file,value);return value;
}
const {emptyQuiz,QuizError}=(await load('lib/quiz.ts')).module;
const {checkQuizAcademic}=(await load('lib/quiz-academic.ts')).module;
const catalogue={scope:'quiz',revision:1,syllabuses:[{id:'spm',name:'SPM',active:true,grades:['Form 3','Form 4','Form 5'],subjects:[{id:'mathematics',name:'Mathematics',aliases:['Math','Maths'],active:true}]},{id:'igcse',name:'IGCSE',active:true,grades:['Year 7','Year 9'],subjects:[{id:'mathematics',name:'Mathematics',aliases:['Math'],active:true}]}]};
const paper={...emptyQuiz(),title:'Fictional metadata fixture',exam:'spm',subject:'mAtH',catalog:null};
let checks=0;const check=fn=>{fn();checks++;},reject=(value,previous)=>check(()=>assert.throws(()=>checkQuizAcademic(catalogue,value,previous),error=>error instanceof QuizError));
const checked=checkQuizAcademic(catalogue,paper);check(()=>assert.equal(checked.exam,'SPM'));check(()=>assert.equal(checked.subject,'Mathematics'));check(()=>assert.equal(checked.syllabusId,'spm'));check(()=>assert.equal(checked.subjectId,'mathematics'));check(()=>assert.equal(paper.subject,'mAtH','original object is never mutated'));
reject({...paper,subject:'Unlisted'});reject({...paper,exam:''});reject({...paper,exam:'IGCSE',catalog:{level:'Form 4'}});
const igcse=checkQuizAcademic(catalogue,{...paper,exam:'IGCSE',catalog:{level:'year 9'}});check(()=>assert.equal(igcse.catalog.level,'Year 9'));
const historic={...paper,exam:'',subject:'Archived custom subject'},changedTitle={...historic,title:'Edited question text'};
check(()=>assert.equal(checkQuizAcademic(catalogue,changedTitle,historic),changedTitle));reject({...historic,subject:'Another arbitrary subject'},historic);
catalogue.syllabuses[0].subjects[0].active=false;
check(()=>assert.equal(checkQuizAcademic(catalogue,{...checked,title:'Question edit'},checked).subject,'Mathematics','unchanged existing classification survives retirement'));
reject(paper);check(()=>assert.equal(checkQuizAcademic(catalogue,paper,null,false).subjectId,'mathematics','idempotency normalization can reproduce a previously accepted request after retirement'));
check(()=>assert.equal(checkQuizAcademic(catalogue,checked,checked).syllabusId,'spm'));
console.log(JSON.stringify({suite:'quiz-academic',passed:checks,scope:'Pure classification validation; no files, network, real accounts or history writes.'}));
