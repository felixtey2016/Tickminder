import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strToU8} from 'fflate';
import {createFixtureLoader} from './fixture-loader.mjs';

globalThis.fetch=async()=>{throw Error('Network forbidden in Quiz import guide tests');};
const load=createFixtureLoader({runtimeUrl:'data:text/javascript,export {}',environmentUrl:'data:text/javascript,export const env={};'});
const {importQuizZip,parseQuestionText,QuizImportError}=(await load('lib/quiz-import.ts')).module;
const asset=new URL('../public/downloads/',import.meta.url),promptBytes=fs.readFileSync(new URL('tickminder-quiz-ai-prompt.txt',asset)),sampleBytes=fs.readFileSync(new URL('tickminder-quiz-example.zip',asset));
const prompt=new TextDecoder('utf-8',{fatal:true}).decode(promptBytes),entries=unzipSync(sampleBytes),text=new TextDecoder('utf-8',{fatal:true}).decode(entries['questions.txt']);
let checks=0;function check(label,fn){fn();checks++;console.log('PASS '+label);}async function verify(label,fn){await fn();checks++;console.log('PASS '+label);}
const canonicalLabels=['题目编码','所属年级','所属章节','所属子章节','难度等级','题干 (BM)','题干 (EN)','图片入口',...['A','B','C','D'].flatMap(letter=>['选项 '+letter+' (BM)','选项 '+letter+' (EN)','选项 '+letter+' 图片入口']),'选项合图入口','标准答案'];
const example=prompt.match(/--- BEGIN EXACT questions\.txt EXAMPLE ---\r?\n([\s\S]*?)\r?\n--- END EXACT questions\.txt EXAMPLE ---/)?.[1];assert(example,'Downloadable prompt must contain one exact machine-readable example');
check('download archive contains only root questions.txt',()=>assert.deepEqual(Object.keys(entries),['questions.txt']));
check('prompt and sample use complete exact Chinese protocol keys and fullwidth colons',()=>{for(const block of [example,...text.trim().split(/\n\n(?=\[Q\d+\])/)]){
 const lines=block.trim().split('\n');assert.match(lines.shift(),/^\[Q\d+\]$/);assert.deepEqual(lines.map(line=>line.slice(0,line.indexOf('：'))),canonicalLabels);assert.equal(lines.some(line=>line.indexOf('：')<0),false);
}});
check('English-only example keeps BM and unknown metadata empty',()=>{for(const line of text.split('\n').filter(line=>/\(BM\)|^所属/.test(line)))assert.equal(line.split('：').slice(1).join('：'),'');});
check('prompt canonical example is the archive first question verbatim',()=>assert.equal(text.split(/\n\n(?=\[Q\d+\])/)[0],example));
const imported=await importQuizZip(sampleBytes,'tickminder-quiz-example.zip');
check('actual importer accepts both original English science questions',()=>{assert.equal(imported.content.questions.length,2);assert.equal(imported.images.size,0);assert.deepEqual(imported.warnings,[]);assert.equal(imported.content.questions.every(question=>question.type==='mcq'&&question.options.length===4&&question.prompt.primary===''&&Boolean(question.prompt.en)&&question.options.every(option=>option.text.primary===''&&Boolean(option.text.en))),true);});
check('sample correct answers map to the intended B and A options',()=>assert.deepEqual(imported.keys.map((key,index)=>imported.content.questions[index].options.findIndex(option=>option.id===key.correctOptionId)),[1,0]));
check('sample imports as a draft payload with catalogue fields left for editor review',()=>{assert.equal(imported.content.title,'tickminder-quiz-example');assert.equal(imported.content.subject,'');assert.equal(imported.content.exam,'');assert(imported.content.questions.every(question=>question.level===''&&question.chapter===''));});
check('sample source identity is the actual downloadable ZIP SHA256',()=>assert.equal(imported.sourceKey,createHash('sha256').update(sampleBytes).digest('hex')));
const parsedExample=parseQuestionText(example,new Map());
check('actual parser accepts the downloadable prompt example without warnings',()=>{assert.equal(parsedExample.content.questions.length,1);assert.equal(parsedExample.keys.length,1);assert.deepEqual(parsedExample.warnings,[]);assert.equal(parsedExample.content.questions[0].prompt.en,imported.content.questions[0].prompt.en);});
await verify('prompt example also passes through actual ZIP import',async()=>{const packed=zipSync({'questions.txt':strToU8(example)});const result=await importQuizZip(packed,'prompt-example.zip');assert.equal(result.content.questions.length,1);assert.deepEqual(result.warnings,[]);});
check('English instructions name actual limits, supported types and manual editor completion',()=>{for(const essential of ['any subject','1-150','exactly 4 options','fullwidth colon','U+FF1A','<=20 MiB','<=1 MiB','<=5 MiB','<=60 MiB','<=300 entries','manual Quiz builder','save the draft','does not publish or assign','Do not invent a download URL','Create original questions only if I explicitly request'])assert(prompt.includes(essential),essential);});
function rejects(label,changed){check(label,()=>assert.throws(()=>parseQuestionText(changed,new Map()),QuizImportError));}
rejects('ASCII colon substitutions are not valid machine format',example.replaceAll('：',':'));
rejects('translating required field labels is rejected',example.replace('题目编码：','Question code：'));
rejects('missing verified answer is rejected',example.replace('标准答案：B','标准答案：'));
rejects('multiple-answer letters are rejected',example.replace('标准答案：B','标准答案：A,B'));
rejects('empty fourth option cannot masquerade as a supported question',example.replace('选项 D (EN)：Stopwatch','选项 D (EN)：'));
rejects('missing source image cannot be replaced by an absent filename',example.replace('图片入口：NONE','图片入口：images/q01.png'));
rejects('lowercase none is not an accepted image sentinel',example.replace('图片入口：NONE','图片入口：none'));
rejects('duplicate question numbers and codes are rejected',example+'\n\n'+example);
check('150 canonical questions remain supported',()=>{const many=Array.from({length:150},(_,index)=>example.replace('[Q01]','[Q'+String(index+1).padStart(2,'0')+']').replace('TM-EXAMPLE-001','BOUNDARY-'+String(index+1))).join('\n\n');assert.equal(parseQuestionText(many,new Map()).content.questions.length,150);assert.throws(()=>parseQuestionText(many+'\n\n'+example.replace('[Q01]','[Q151]').replace('TM-EXAMPLE-001','BOUNDARY-151'),new Map()),QuizImportError);});
await verify('an enclosing project folder is not accepted as root questions.txt',()=>assert.rejects(()=>importQuizZip(zipSync({'project/questions.txt':strToU8(example)}),'nested.zip'),QuizImportError));
await verify('unsafe path archives are rejected',()=>assert.rejects(()=>importQuizZip(zipSync({'questions.txt':strToU8(example),'../extra.txt':strToU8('not a question')}),'unsafe.zip'),QuizImportError));
await verify('JSON-only archives are rejected rather than advertised as importable',()=>assert.rejects(()=>importQuizZip(zipSync({'questions.json':strToU8('[]')}),'wrong-format.zip'),QuizImportError));
await verify('non UTF-8 question bytes are rejected',()=>assert.rejects(()=>importQuizZip(zipSync({'questions.txt':new Uint8Array([0xff,0xfe,0xff])}),'encoding.zip'),QuizImportError));
const guide=fs.readFileSync(new URL('../docs/QUIZ_BUILDER.md',import.meta.url),'utf8').replaceAll('\r\n','\n'),guideSection=guide.split('## ZIP import contract\n')[1]?.split('## Future bank preparation:')[0],guideExample=guideSection?.match(/```text\n(\[Q01\][\s\S]*?)\n```/)?.[1];
check('repository tutorial and download links use the same validated canonical example',()=>{assert.equal(guideExample,example);assert.equal(parseQuestionText(guideExample,new Map()).content.questions.length,1);for(const filename of ['tickminder-quiz-ai-prompt.txt','tickminder-quiz-example.zip'])assert(guideSection.includes('/downloads/'+filename));assert(guideSection.includes('closed by default'));});
console.log(JSON.stringify({suite:'quiz-import-guide',checks,questions:imported.content.questions.length,promptBytes:promptBytes.length,sampleZipBytes:sampleBytes.length,networkRequests:0,productionWrites:false}));
