import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import katex from 'katex';
const cache=new Map();
async function load(name){if(cache.has(name))return cache.get(name);let source=fs.readFileSync(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');for(const [,spec] of [...source.matchAll(/from ['"]([^'"]+)['"]/g)]){const url=spec.startsWith('./')?(await load(spec.slice(2))).url:import.meta.resolve(spec);source=source.replaceAll("'"+spec+"'",JSON.stringify(url)).replaceAll('"'+spec+'"',JSON.stringify(url));}const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,url='data:text/javascript;base64,'+Buffer.from(js).toString('base64'),result={url,module:await import(url)};cache.set(name,result);return result;}
const {parseQuizNotation}= (await load('quiz-notation')).module;
const formulas=value=>parseQuizNotation(value).parts.filter(p=>p.kind==='math').map(p=>p.text);
let rendered=0;
for(const [input,expected] of [
 ['2^2+2',['2^{2}']],['2^{2+2}',['2^{2+2}']],['(2+2)^2',['(2+2)^{2}']],['-2^2 与 (-2)^2',['2^{2}','(-2)^{2}']],
 ['2^12, x^-2, a^n',['2^{12}','x^{-2}','a^{n}']],['2^{n + 1}',['2^{n + 1}']],['2^{\\frac{1}{2}}',['2^{\\frac{1}{2}}']],
 ['101_2 与 A3_16 与 2_2',['101_{2}','A3_{16}','2_{2}']],['a_2 + x_1^2',['a_{2}','x_{1}^{2}']],
 ['H_2O 和 F_1 以及 SO_4^{2-}',['H_{2}\\mathrm{O}','F_{1}','\\mathrm{SO}_{4}^{2-}']],['Fe^{3+}',['\\mathrm{Fe}^{3+}']],['25 cm^2',['\\mathrm{cm}^{2}']],
 ['求2^2的值。 Calculate 101_2.',['2^{2}','101_{2}']],['2² + 101₂',[]],['2026-10-15 / 14 Oktober 2026',[]]
]){const parsed=parseQuizNotation(input);assert.deepEqual(formulas(input),expected,input);assert.deepEqual(parsed.warnings,[],input);for(const formula of expected){assert.doesNotThrow(()=>katex.renderToString(formula,{throwOnError:true,trust:false,maxExpand:300,maxSize:12,macros:{}}),input);rendered++;}}
for(const input of ['2^1/2','a^b/c','a^bc','x_ij','2^2^3','Fe^3+','2^{x^2']){const parsed=parseQuizNotation(input);assert.equal(parsed.parts.map(p=>p.text).join(''),input);assert.equal(formulas(input).length,0,input);assert.ok(parsed.warnings.length,input);}
for(const input of ['Fill in _____ and ______.','A_____ dog and 1_____','chapter_2 and Form_4','MATH-QB0001-Q01','images/qb0001_q03_rajah2.png','C:\\math\\x^2.txt','https://example.com/x^2?q=a_2','qb0001_q2','file_2.png','(2_2.png)','\\$2^2','`2^2 and a_2`','```txt\n2^2\n```']){const parsed=parseQuizNotation(input);assert.deepEqual(parsed.parts,[{kind:'text',text:input}],input);assert.deepEqual(parsed.warnings,[],input);}
const explicit='$2^{2}+2$，$$\\frac{a_{2}}{b^{n+1}}$$';
assert.deepEqual(parseQuizNotation(explicit).parts,[{kind:'math',text:'2^{2}+2',display:false,automatic:false},{kind:'text',text:'，'},{kind:'math',text:'\\frac{a_{2}}{b^{n+1}}',display:true,automatic:false}]);
assert.deepEqual(parseQuizNotation('$2^1/2$').warnings,[],'explicit source is not reinterpreted');
const {parseQuestionText}= (await load('quiz-import')).module;
const raw=['[Q01]','题目编码：MATH-QB0099-Q01','难度等级：easy','题干 (BM)：Cari 2^2+2 dan 101_2.','题干 (EN)：Check 2^1/2.','图片入口：NONE','选项 A (BM)：H_2O','选项 B (BM)：a^bc','选项 C (BM)：_____','选项 D (BM)：4','标准答案：D'].join('\n');
const parsed=parseQuestionText(raw,new Map());
assert.equal(parsed.content.questions[0].prompt.primary,'Cari 2^2+2 dan 101_2.','original question remains unchanged');
assert.equal(parsed.content.questions[0].options[0].text.primary,'H_2O');
assert.equal(parsed.warnings.length,2);assert.match(parsed.warnings[0],/Q01 题干 \(EN\).*2\^1\/2/);assert.match(parsed.warnings[1],/Q01 选项 B \(BM\).*a\^bc/);
assert.equal(parsed.keys[0].correctOptionId,parsed.content.questions[0].options[3].id,'formatting does not alter answer keys');
console.log(JSON.stringify({passed:true,rendered,ambiguousCases:7,importWarnings:parsed.warnings.length,rawSourcePreserved:true}));
