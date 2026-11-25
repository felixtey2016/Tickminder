import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strToU8} from 'fflate';
import {createFixtureLoader} from './fixture-loader.mjs';

globalThis.fetch=async()=>{throw Error('Network forbidden in Quiz import guide tests');};
const load=createFixtureLoader({runtimeUrl:'data:text/javascript,export {}',environmentUrl:'data:text/javascript,export const env={};'});
const {importQuizZip,parseQuestionText,QuizImportError}=(await load('lib/quiz-import.ts')).module;
const {checkQuiz,quizQuestionLanguages,quizReadText}=(await load('lib/quiz.ts')).module;
const asset=new URL('../public/downloads/',import.meta.url);
const promptBytes=fs.readFileSync(new URL('tickminder-quiz-ai-prompt.txt',asset));
const sampleBytes=fs.readFileSync(new URL('tickminder-quiz-example.zip',asset));
const decode=bytes=>new TextDecoder('utf-8',{fatal:true}).decode(bytes).replaceAll('\r\n','\n');
const prompt=decode(promptBytes),entries=unzipSync(sampleBytes),text=decode(entries['questions.txt']);
const example=prompt.match(/--- BEGIN EXACT questions\.txt EXAMPLE ---\n([\s\S]*?)\n--- END EXACT questions\.txt EXAMPLE ---/)?.[1];
assert(example,'Downloadable prompt must contain one exact machine-readable example');
const [header,firstQuestion]=example.split('\n\n'),sampleBlocks=text.trim().split(/\n\n(?=\[Q\d+\])/);
const canonicalLabels=['题目编码','所属年级','所属章节','所属子章节','难度等级','题干 (BM)','题干 (EN)','题干 (ZH)','图片入口',
 ...['A','B','C','D'].flatMap(letter=>['选项 '+letter+' (BM)','选项 '+letter+' (EN)','选项 '+letter+' (ZH)','选项 '+letter+' 图片入口']),'选项合图入口','标准答案'];
const onlyLang=(code,question=firstQuestion)=>question.replace(/^(.+ \((BM|EN|ZH)\)：)(.*)$/gm,(line,field,language)=>code.includes(language)?line:field);
const declare=code=>header.replace('题目语言：EN, BM, ZH','题目语言：'+code);
let checks=0;
function check(label,fn){fn();checks++;console.log('PASS '+label);}
async function verify(label,fn){await fn();checks++;console.log('PASS '+label);}
function rejects(label,changed){check(label,()=>assert.throws(()=>parseQuestionText(changed,new Map()),QuizImportError));}

check('download archive contains only root questions.txt',()=>assert.deepEqual(Object.keys(entries),['questions.txt']));
check('prompt and archive show the same complete header and first question',()=>{
 const lines=header.split('\n');
 assert.equal(lines.shift(),'[QUIZ]');
 assert.deepEqual(lines.map(line=>line.split('：')[0]),['测验标题','课程体系','科目','年级','主题','题目语言']);
 assert.equal(sampleBlocks[0]+'\n\n'+sampleBlocks[1],example);
 for(const block of sampleBlocks.slice(1)){
  const lines=block.split('\n');assert.match(lines.shift(),/^\[Q\d+\]$/);
  const solutionIndex=lines.findIndex(line=>line.startsWith('解题步骤：'));
  const required=solutionIndex<0?lines:lines.slice(0,solutionIndex);
  assert.deepEqual(required.map(line=>line.slice(0,line.indexOf('：'))),canonicalLabels);
  if(solutionIndex>=0)assert(lines[solutionIndex+1]?.startsWith('2. '));
 }
});
const imported=await importQuizZip(sampleBytes,'tickminder-quiz-example.zip');
check('sample carries title, curriculum, subject, grade, topic and all three languages through validation',()=>{
 const {content}=checkQuiz(imported.content,imported.keys);
 assert.deepEqual([content.title,content.exam,content.subject,content.grade,content.topic,content.primaryLanguage],
  ['Heat and Temperature','SPM','Science','Form 2','Heat and Temperature','en']);
 assert.equal(content.questions.length,2);
 assert.equal(imported.images.size,0);
 assert.deepEqual(imported.warnings,[]);
 for(const question of content.questions){
  assert.equal(question.type,'mcq');
  assert.equal(question.level,'Form 2');
  assert.deepEqual(quizQuestionLanguages(question,content.primaryLanguage),['en','zh','ms']);
  assert.equal(question.prompt.primary,undefined);
  assert(question.options.every(choice=>choice.text.en&&choice.text.ms&&choice.text.zh));
 }
 assert.equal(quizReadText(content.questions[0].prompt,'ms'),'Apakah alat yang digunakan untuk mengukur suhu?');
 assert.equal(quizReadText(content.questions[0].prompt,'zh'),'哪一种仪器用来测量温度？');
});
check('sample correct answers map to the intended B and A options',()=>assert.deepEqual(imported.keys.map((key,index)=>imported.content.questions[index].options.findIndex(option=>option.id===key.correctOptionId)),[1,0]));
check('sample demonstrates one multi-line optional solution',()=>{
 assert.match(imported.keys[0].explanation,/^1\. Identify[\s\S]*\n2\. A thermometer/);
 assert.equal(imported.keys[1].explanation,'');
});
check('sample source identity is the actual downloadable ZIP SHA256',()=>assert.equal(imported.sourceKey,createHash('sha256').update(sampleBytes).digest('hex')));
await verify('prompt example passes actual ZIP import with a declared title',async()=>{
 const result=await importQuizZip(zipSync({'questions.txt':strToU8(example)}),'prompt-example.zip');
 assert.equal(result.content.title,'Heat and Temperature');
 assert.equal(result.content.questions.length,1);
 assert.deepEqual(result.warnings,[]);
});
check('single-language and explicitly bilingual ZIPs retain only the requested text',()=>{
 for(const code of ['EN','BM','ZH','EN, BM']){
  const parsed=parseQuestionText(declare(code)+'\n\n'+onlyLang(code),new Map());
  const question=checkQuiz(parsed.content,parsed.keys).content.questions[0];
  assert.equal(Boolean(question.prompt.en),code.includes('EN'));
  assert.equal(Boolean(question.prompt.ms),code.includes('BM'));
  assert.equal(Boolean(question.prompt.zh),code.includes('ZH'));
  assert.equal(question.prompt.primary,undefined);
 }
});
check('prompt asks for missing requirements first and documents actual rules',()=>{
 for(const essential of ['grade, curriculum, subject or question language(s)','wait for my answer','题目语言：EN, BM','1-150','exactly 4 options','fullwidth colon','U+FF1A','<=20 MiB','<=1 MiB','<=5 MiB','<=60 MiB','<=300 entries','manual Quiz builder','save the draft','does not publish or assign','Do not invent a download URL','Create original questions that match the confirmed curriculum'])assert(prompt.includes(essential),essential);
});
check('original questions can use generated images that are checked before packaging',()=>{
 assert(prompt.includes('For original questions, you may generate or draw new diagrams'));
 assert(prompt.includes('Check each image against the stem, options and correct answer'));
 assert(prompt.includes('PNG, JPG/JPEG or WebP with real matching image data'));
 assert(!prompt.includes('crop the actual source image'));
});
rejects('ASCII colon substitutions are not valid machine format',example.replaceAll('：',':'));
rejects('translated machine field names are rejected',example.replace('题目编码：','Question code：'));
rejects('metadata blocks cannot repeat or appear after the questions',example+'\n\n'+header);
rejects('required grade is checked',example.replace('年级：Form 2','年级：'));
rejects('unknown or duplicate language codes are rejected',example.replace('EN, BM, ZH','EN, AR'));
rejects('duplicate language codes are rejected',example.replace('EN, BM, ZH','EN, en'));
rejects('populated languages must be declared',declare('EN')+'\n\n'+firstQuestion);
rejects('every declared language needs a stem',example.replace(/题干 \(BM\)：.+/,'题干 (BM)：'));
rejects('missing verified answer is rejected',example.replace('标准答案：B','标准答案：'));
rejects('multiple-answer letters are rejected',example.replace('标准答案：B','标准答案：A,B'));
rejects('a missing option translation cannot masquerade as a supported question',example.replace('选项 D (EN)：Stopwatch','选项 D (EN)：'));
rejects('missing source image cannot be replaced by an absent filename',example.replace('图片入口：NONE','图片入口：images/q01.png'));
rejects('lowercase none is not an accepted image sentinel',example.replace('图片入口：NONE','图片入口：none'));
rejects('duplicate question numbers and codes are rejected',example+'\n\n'+firstQuestion);
const legacy=firstQuestion.split('\n解题步骤：')[0].replace(/^.* \(ZH\)：.*\n/gm,'');
check('older ZIPs keep primary/en storage and legacy defaults',()=>{
 const parsed=parseQuestionText(legacy,new Map());
 assert.equal(parsed.keys[0].explanation,'');
 assert.equal(parseQuestionText(legacy+'\n解题步骤：  \n',new Map()).keys[0].explanation,'');
 assert.deepEqual(parsed.content.questions[0].prompt,{primary:'Apakah alat yang digunakan untuk mengukur suhu?',en:'Which instrument is used to measure temperature?'});
 assert.equal(parsed.content.primaryLanguage,'ms');
 assert.equal(parsed.content.exam,'');
 assert.equal(parsed.content.grade,undefined);
 assert.equal(parsed.content.topic,undefined);
 assert.deepEqual(quizQuestionLanguages(parsed.content.questions[0],'ms'),['primary','en']);
});
await verify('old English-only ZIP falls back to its filename and needs no backfill',async()=>{
 const english=onlyLang('EN',legacy);
 const result=await importQuizZip(zipSync({'questions.txt':strToU8(english)}),'legacy-questions.zip');
 assert.equal(result.content.title,'legacy-questions');
 assert.equal(result.content.questions[0].prompt.primary,'');
 assert.equal(result.content.questions[0].prompt.en,'Which instrument is used to measure temperature?');
});
check('solution text preserves fullwidth colons, paragraphs and LaTeX',()=>{
 const solution='第 1 步：找出需要测量的量。\n\n第 2 步：比较结果 $\\frac{7}{11}$。';
 const parsed=parseQuestionText(legacy+'\n解题步骤：'+solution,new Map());
 assert.equal(parsed.keys[0].explanation,solution);
 assert.equal(parsed.content.questions[0].options[1].id,parsed.keys[0].correctOptionId);
});
rejects('an overlong solution is reported during import',legacy+'\n解题步骤：'+'x'.repeat(4001));
rejects('duplicate solution fields are rejected',example+'\n解题步骤：Duplicate');
check('150 canonical questions remain supported',()=>{
 const article=index=>firstQuestion.replace('[Q01]','[Q'+String(index).padStart(2,'0')+']').replace('TM-EXAMPLE-001','BOUNDARY-'+String(index));
 const many=header+'\n\n'+Array.from({length:150},(_,index)=>article(index+1)).join('\n\n');
 assert.equal(parseQuestionText(many,new Map()).content.questions.length,150);
 assert.throws(()=>parseQuestionText(many+'\n\n'+article(151),new Map()),QuizImportError);
});
await verify('an enclosing project folder is not accepted as root questions.txt',()=>assert.rejects(()=>importQuizZip(zipSync({'project/questions.txt':strToU8(example)}),'nested.zip'),QuizImportError));
await verify('unsafe path archives are rejected',()=>assert.rejects(()=>importQuizZip(zipSync({'questions.txt':strToU8(example),'../extra.txt':strToU8('not a question')}),'unsafe.zip'),QuizImportError));
await verify('JSON-only archives are rejected rather than advertised as importable',()=>assert.rejects(()=>importQuizZip(zipSync({'questions.json':strToU8('[]')}),'wrong-format.zip'),QuizImportError));
await verify('non UTF-8 question bytes are rejected',()=>assert.rejects(()=>importQuizZip(zipSync({'questions.txt':new Uint8Array([0xff,0xfe,0xff])}),'encoding.zip'),QuizImportError));
const guide=decode(fs.readFileSync(new URL('../docs/QUIZ_BUILDER.md',import.meta.url))),guideSection=guide.split('## ZIP import contract\n')[1]?.split('## Future bank preparation:')[0];
check('repository tutorial and download links use the same validated canonical example',()=>{
 assert(guideSection.includes(example));
 for(const filename of ['tickminder-quiz-ai-prompt.txt','tickminder-quiz-example.zip'])assert(guideSection.includes('/downloads/'+filename));
 assert(guideSection.includes('closed by default'));
});
console.log(JSON.stringify({suite:'quiz-import-guide',checks,questions:imported.content.questions.length,promptBytes:promptBytes.length,sampleZipBytes:sampleBytes.length,networkRequests:0,productionWrites:false}));
