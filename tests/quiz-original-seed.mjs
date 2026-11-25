import assert from 'node:assert/strict';
import {createFixtureLoader} from './fixture-loader.mjs';

const load=createFixtureLoader({runtimeUrl:'data:text/javascript,export {};',environmentUrl:'data:text/javascript,export const env={};'});
const {originalQuizSeed}=(await load('lib/quiz-original-seed.ts')).module;
const {content,keys,total}=originalQuizSeed();
const fraction=(a,b)=>{function gcd(x,y){return y?gcd(y,x%y):x;}const divisor=gcd(a,b);return a/divisor+'/'+b/divisor;};
// Values independently calculated from the displayed question statements.
const expected=[
 String(-9+14),fraction(3*8+1*4,4*8),(.35*100)+'%',String(250*.18),String(75*2/(2+3)),String(parseInt('1011',2)),(64).toString(2)+'₂',String(2**3*2**2),String(Math.sqrt(144)),String((-3)**2),
 'x = '+(26-5)/3,'x = '+(10/2+4),String((11-3)/(5-1)),String(3*4-2),'x² + x − 6','(x − 5)(x + 5)',String(2*4-3*(-2)),String(11+(7-3)),String((9+3)/2),'x < '+(9-1)/2,
 (180-55-65)+'°',(9*4)+' cm²',(12*7/2)+' cm²',(2*(22/7)*7)+' cm',(2*3*5)+' cm³',((5-2)*180)+'°',Math.hypot(6,8)+' cm',(4*50/100)+' m',String(2.5*60),(60*1.5)+' km',
 String((4+6+8)/3),String([2,5,7,9,12].sort((a,b)=>a-b)[2]),String([...new Set([3,4,4,6,8])].sort((a,b)=>[3,4,4,6,8].filter(x=>x===b).length-[3,4,4,6,8].filter(x=>x===a).length)[0]),String(Math.max(5,11,14,20)-Math.min(5,11,14,20)),fraction([1,2,3,4,5,6].filter(x=>x%2===0).length,6),fraction(3,3+7),'RM'+(80*(1-.15)),'RM'+(1000*.05*2),'4.5 × 10⁻⁴','{'+[1,2,3].filter(x=>new Set([3,4]).has(x)).join(',')+'}',
];
assert.equal(content.questions.length,40);assert.equal(keys.length,40);assert.equal(total,40);assert.equal(content.bankKind,'platform');assert.equal(content.shuffleOptions,true);assert.equal(content.timeLimitSeconds,null);
const positions=[0,0,0,0];for(let index=0;index<40;index++){const q=content.questions[index],key=keys.find(k=>k.questionId===q.id),answer=q.options.find(o=>o.id===key.correctOptionId);assert.equal(answer.text.primary,expected[index],'Independent answer check '+(index+1));assert.equal(q.options.filter(o=>o.text.primary===expected[index]).length,1,'Unique correct answer '+(index+1));assert.equal(q.points,1);assert.equal(q.type,'mcq');positions[q.options.findIndex(o=>o.id===key.correctOptionId)]++;}
// Algebra identities are also checked by evaluation at independent inputs.
for(const x of [-7,-2,0,3,8]){assert.equal((x+3)*(x-2),x*x+x-6);assert.equal((x-5)*(x+5),x*x-25);}
assert(Math.abs(4.5*10**-4-.00045)<1e-15);assert.deepEqual(positions,[10,10,10,10]);
console.log(JSON.stringify({suite:'quiz-original-seed',questionsChecked:40,mathAnswersCorrect:true,uniqueCorrectOptions:true,balancedAnswerPositions:true}));
