import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

async function load(name){const source=fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}
const {checkQuiz,emptyQuiz,newQuestion,QuizError}=await load('quiz');
const {groupQuizCatalog,quizCatalogGroupKey,quizWriteForbidden}=await load('quiz-catalog');
const catalog={kind:'subtopic',level:'Form 4',chapterCode:'1',chapterTitle:'二次函数',subtopicCode:'1.1',subtopicTitle:'二次函数基础',setNumber:1};
function paper(count=40){const content={...emptyQuiz(),title:'二次函数练习',subject:'Mathematics',difficulty:'easy',bankKind:'platform',catalog:{...catalog}},keys=[];for(let i=0;i<count;i++){const {question,key}=newQuestion();question.prompt.primary='请选择正确答案 '+(i+1);question.difficulty='easy';question.options.forEach((o,n)=>{o.text.primary=String(n+1);});content.questions.push(question);keys.push(key);}return {content,keys};}
const rejects=(fn,code)=>assert.throws(fn,e=>e instanceof QuizError&&e.code===code);
let p=paper();assert.equal(checkQuiz(p.content,p.keys).content.catalog.setNumber,1);
p=paper(39);rejects(()=>checkQuiz(p.content,p.keys),'quiz.invalidPlatformSet');
p=paper();p.content.questions[0].difficulty='hard';rejects(()=>checkQuiz(p.content,p.keys),'quiz.invalidPlatformSet');
p=paper();p.content.difficulty='mixed';rejects(()=>checkQuiz(p.content,p.keys),'quiz.invalidPlatformSet');
p=paper();p.content.catalog=null;rejects(()=>checkQuiz(p.content,p.keys),'quiz.invalidPlatformSet');
for(const bad of [{subtopicCode:'2.1'},{subtopicCode:'1.01'},{chapterCode:'01'},{kind:'chapter_overall'},{kind:'level_overall'},{setNumber:1.5},{level:'Form 6'}]){p=paper();p.content.catalog={...catalog,...bad};rejects(()=>checkQuiz(p.content,p.keys),'quiz.invalidCatalog');}
for(const c of [{...catalog,kind:'chapter_overall',subtopicCode:'',subtopicTitle:''},{...catalog,kind:'level_overall',chapterCode:'',chapterTitle:'',subtopicCode:'',subtopicTitle:''}]){p=paper();p.content.catalog=c;assert.deepEqual(checkQuiz(p.content,p.keys).content.catalog,c);}
p=paper(2);delete p.content.bankKind;delete p.content.catalog;p.content.difficulty='mixed';p.content.questions[0].difficulty='hard';assert.equal(checkQuiz(p.content,p.keys).content.bankKind,'creator');
const item=(id,c=catalog,difficulty='easy')=>({id,subject:'Mathematics',bankKind:'platform',catalog:{...c},difficulty});
const grouped=groupQuizCatalog([item('set2',{...catalog,setNumber:2}),item('set1'),item('medium',catalog,'medium'),item('other',{...catalog,subtopicCode:'1.10',subtopicTitle:'另一个知识点'}),{...item('creator1'),bankKind:'creator'},{...item('creator2'),bankKind:'creator'}]);
assert.equal(grouped.length,4);assert.equal(grouped[0].setCount,3);assert.deepEqual(grouped[0].difficulties,{easy:2,medium:1,hard:0});assert.equal(grouped[0].items.at(-1).id,'set2');
assert.notEqual(quizCatalogGroupKey(item('a')),quizCatalogGroupKey(item('b',{...catalog,subtopicCode:'1.10'})));
const base={administrator:false,maintenance:false,sourceKey:null,bankKind:'creator',copied:false},source='a'.repeat(64);
assert.equal(quizWriteForbidden(base),false);
assert.equal(quizWriteForbidden({...base,sourceKey:source}),true);
assert.equal(quizWriteForbidden({...base,administrator:true,sourceKey:source}),true);
assert.equal(quizWriteForbidden({...base,maintenance:true,sourceKey:source}),true);
assert.equal(quizWriteForbidden({...base,administrator:true,maintenance:true,sourceKey:source}),false);
assert.equal(quizWriteForbidden({...base,administrator:true,maintenance:true,bankKind:'platform',sourceKey:source}),false);
assert.equal(quizWriteForbidden({...base,administrator:true,bankKind:'platform'}),true);
assert.equal(quizWriteForbidden({...base,sourceKey:source,previous:{sourceKey:source,bankKind:'creator'}}),false);
assert.equal(quizWriteForbidden({...base,sourceKey:'b'.repeat(64),previous:{sourceKey:source,bankKind:'creator'}}),true);
assert.equal(quizWriteForbidden({...base,previous:{sourceKey:null,bankKind:'platform'}}),true);
assert.equal(quizWriteForbidden({...base,administrator:true,maintenance:true,sourceKey:source,copied:true}),true);
const teacher={...base,teacher:true};
assert.equal(quizWriteForbidden({...teacher,maintenance:true,sourceKey:source}),false,'teacher can import a creator quiz');
assert.equal(quizWriteForbidden({...teacher,maintenance:true,sourceKey:source,bankKind:'platform'}),true,'teacher cannot forge a platform import');
assert.equal(quizWriteForbidden({...teacher,maintenance:true,sourceKey:source,previous:{sourceKey:source,bankKind:'platform'}}),true,'teacher cannot downgrade an existing platform set');
assert.equal(quizWriteForbidden({...teacher,maintenance:true,sourceKey:null}),true,'import requires a source identity');
assert.equal(quizWriteForbidden({...teacher,sourceKey:source,previous:{sourceKey:source,bankKind:'creator'}}),false,'teacher can edit their imported creator quiz');
assert.equal(quizWriteForbidden({...teacher,maintenance:true,sourceKey:source,copied:true}),true,'copy cannot forge import identity');
assert.equal(quizWriteForbidden({...teacher,maintenance:true,sourceKey:'b'.repeat(64),previous:{sourceKey:source,bankKind:'creator'}}),true,'teacher cannot change source identity');
console.log('Quiz catalog classification, 40-question Sets, grouping and import permission rules passed');
