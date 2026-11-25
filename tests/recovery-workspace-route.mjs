import assert from 'node:assert/strict';
import {createFixtureLoader} from './fixture-loader.mjs';
const load=createFixtureLoader({runtimeUrl:'data:text/javascript,export {}',environmentUrl:'data:text/javascript,export const env={};'});
const {recoveryReturnPath,readRecoveryState,saveRecoveryState,RECOVERY_STORAGE_KEY}=(await load('lib/password-recovery-ui-state.ts')).module;
const storage=new Map(),origin='https://fixture.example.invalid',now=Date.now();
globalThis.window={location:{origin},sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
let checks=0;
function equal(actual,expected,label){assert.deepEqual(actual,expected,label);checks++;}
for(const path of ['/settings','/','/courses/calendar','/notifications','/manage/parents','/classrooms','/finance']){
 const target=recoveryReturnPath(path,'?untrusted=1&group=private','en');equal(target,path+'?lang=en','allowed workspace path');
 const snapshot={version:1,context:'login',owner:'',returnTo:target,step:'code',identifier:'fictional.account',challenge:'fixture-only-challenge',resetToken:'',expiresAt:now+500000,retryAt:now+30000,pending:null};
 saveRecoveryState(snapshot);
 equal(readRecoveryState('login','',path+'?lang=zh',now),snapshot,'language switch preserves same-page progress');
 equal(readRecoveryState('login','',path==='/settings'?'/':'/settings',now),null,'another page cannot inherit a recovery flow');
}
for(const path of ['//evil.example','https://evil.example/','/api/auth','/settings/extra','/settings\\evil','/unknown'])equal(recoveryReturnPath(path,'?next=https://evil.example','en'),'/?lang=en','invalid path falls back safely');
equal(recoveryReturnPath('/quiz/quiz-fixture-00000001','?assignment=one&assignment=two','zh'),'/quiz/quiz-fixture-00000001?assignment=one&assignment=two&lang=zh','duplicate assignments remain invalid, never self practice');
equal(recoveryReturnPath('/quiz/quiz-fixture-00000001','?assignment=','en'),'/quiz/quiz-fixture-00000001?assignment=&lang=en','empty assignment remains present');
const bad={version:1,context:'login',owner:'',returnTo:'//evil.example/settings?lang=en',step:'code',identifier:'fictional',challenge:'fixture',resetToken:'',expiresAt:now+500000,retryAt:now,pending:null};
for(const returnTo of ['//evil.example/settings?lang=en','/settings?next=https://evil.example&lang=en','/api/auth?lang=en']){
 storage.set(RECOVERY_STORAGE_KEY,JSON.stringify({...bad,returnTo}));equal(readRecoveryState('login','',returnTo,now),null,'stored destination must be canonical and same origin');
}
console.log('PASS recovery workspace return context: '+checks+' checks');
