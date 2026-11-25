import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

// Real client modules; fictional deferred transport only, no private data/API.
const root=path.resolve(import.meta.dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'quiz-image-isolation-'));
const calls=[],messages=[];
const saved={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document,BroadcastChannel:globalThis.BroadcastChannel};
globalThis.window=new EventTarget();globalThis.document=new EventTarget();
document.visibilityState='visible';
class Channel extends EventTarget {
 static current;
 constructor(){super();Channel.current=this;}
 postMessage(value){messages.push(structuredClone(value));}
 close(){}
}
globalThis.BroadcastChannel=Channel;
globalThis.fetch=(input,init)=>new Promise((resolve,reject)=>calls.push({input,init,resolve,reject}));
const observed=p=>p.then(value=>({value}),error=>({error}));
let release,flight;
try {
 await build({absWorkingDir:root,stdin:{contents:"export * from './lib/private-read-lifecycle';export * from './lib/private-read-flight';export * from './lib/group-client';export * from './lib/quiz-upload';",resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:path.join(temp,'fixture.mjs'),logLevel:'silent'});
 const api=await import(pathToFileURL(path.join(temp,'fixture.mjs')).href);
 api.setPrivateReadIdentity('fictional-admin','fictional-group');api.setClientGroup('fictional-group');
 release=api.installPrivateReadEvents();flight=api.createPrivateReadFlight();
 const before=api.getPrivateReadSnapshot();
 const course=observed(flight.read({kind:'courses',identity:before.identity,url:'/api/courses?view=lessons',load:()=>new Promise(resolve=>globalThis.courseReply=resolve),validate:x=>x}));
 const pending=api.groupFetch('/api/quiz-images',{method:'POST'});
 assert.strictEqual(api.getPrivateReadSnapshot(),before,'Image POST must not replace the global context or invalidate courses');
 calls.at(-1).resolve(new Response('{"id":"fictional-image"}'));await pending;
 assert.strictEqual(api.getPrivateReadSnapshot(),before,'Image completion must preserve the global context');
 courseReply({items:[]});assert.deepEqual((await course).value,{items:[]},'Unrelated in-flight course read survives image writes');
 // A batch must span gaps between requests, not just overlapping POSTs.
 messages.length=0;
 const entries=Array.from({length:7},(_,i)=>({path:`fictional-${i}.png`,bytes:Uint8Array.of(i)}));
 const upload=api.uploadQuizImages(entries,new Map(),async()=>{
  const response=await api.groupFetch('/api/quiz-images',{method:'POST'});
  return (await response.json()).id;
 });
 let replied=1;
 while(replied<8){
  await new Promise(resolve=>setImmediate(resolve));
  while(replied<calls.length){calls[replied].resolve(new Response(JSON.stringify({id:'fictional-'+replied})));replied++;}
 }
 await upload;
 assert.equal(messages.length,1,'One drained upload batch must emit one image change, not one per image');
 assert.strictEqual(api.getPrivateReadSnapshot(),before,'A whole batch must preserve global context');
 const imageBefore=api.getPrivateReadSnapshot('quiz-images');
 const event=messages[0];
 Channel.current.dispatchEvent(new MessageEvent('message',{data:event}));
 const imageAfter=api.getPrivateReadSnapshot('quiz-images');
 assert.equal(imageAfter.epoch,imageBefore.epoch+1,'Receiver advances image domain exactly once');
 Channel.current.dispatchEvent(new MessageEvent('message',{data:event}));
 assert.strictEqual(api.getPrivateReadSnapshot('quiz-images'),imageAfter,'Duplicate event ID must not advance any domain twice');
 assert.strictEqual(api.getPrivateReadSnapshot(),before,'Domain broadcast must not dispatch legacy global data-changed');
 Channel.current.dispatchEvent(new MessageEvent('message',{data:{...event,id:crypto.randomUUID(),groupId:'other-fictional-group'}}));
 assert.strictEqual(api.getPrivateReadSnapshot('quiz-images'),imageAfter,'Other group image message must be ignored');
 const oldImage=observed(api.groupFetch('/api/quiz-images?id=fictional-old'));
 const oldCall=calls.at(-1);
 const imageWrite=api.groupFetch('/api/quiz-images',{method:'POST'});
 const blockedCount=calls.length;
 const during=await Promise.race([observed(api.groupFetch('/api/quiz-images?id=fictional-during')),new Promise(resolve=>setTimeout(()=>resolve({error:new Error('No read barrier')}),30))]);
 assert.equal(during.error?.name,'PrivateReadInvalidatedError','Same-domain reads are rejected while image writes are open');
 assert.equal(calls.length,blockedCount,'Blocked image read never starts transport');
 oldCall.resolve(new Response('old image'));
 assert.equal((await oldImage).error?.name,'PrivateReadInvalidatedError','Pre-image-write headers cannot deliver stale image data');
 calls.at(-1).resolve(new Response('{"id":"fictional-new"}'));await imageWrite;
 const bodyRead=api.groupFetch('/api/quiz-images?id=fictional-body');
 let body;
 calls.at(-1).resolve(new Response(new ReadableStream({start(controller){body=controller;}})));
 const bodyResponse=await bodyRead,bodyResult=observed(bodyResponse.blob());
 const bodyWrite=api.groupFetch('/api/quiz-images',{method:'POST'});
 body.enqueue(new TextEncoder().encode('old body'));body.close();
 assert.equal((await bodyResult).error?.name,'PrivateReadInvalidatedError','Image body is fenced as well as headers');
 calls.at(-1).resolve(new Response('{"id":"fictional-new"}'));await bodyWrite;
 messages.length=0;
 const rejected=api.groupFetch('/api/quiz-images',{method:'POST'});
 calls.at(-1).resolve(new Response('{"error":"fictional-rejected"}',{status:400}));await rejected;
 assert.equal(messages.length,0,'Known rejected image write must not claim committed data change');
 const unknown=observed(api.groupFetch('/api/quiz-images',{method:'POST'}));calls.at(-1).reject(new TypeError('fictional offline'));await unknown;
 assert.equal(messages.length,1,'Unknown outcome revalidates only the image domain without replaying POST');
 assert.equal(api.getPrivateReadSnapshot('quiz-images').blocked,false,'Failure releases image barrier');
 assert.strictEqual(api.getPrivateReadSnapshot(),before,'Failed/unknown image write must not change global context');
 const staleWrite=observed(api.groupFetch('/api/quiz-images',{method:'POST'}));
 const staleCall=calls.at(-1);
 api.setPrivateReadIdentity('fictional-rebound','fictional-other');api.setClientGroup('fictional-other');
 staleCall.resolve(new Response('{"id":"old-group-image"}'));
 assert.equal((await staleWrite).error?.name,'PrivateReadInvalidatedError','Late upload headers from old identity/group cannot enter draft/cache');
 const delayedBody=api.groupFetch('/api/quiz-images',{method:'POST'});
 let uploadBody;
 calls.at(-1).resolve(new Response(new ReadableStream({start(controller){uploadBody=controller;}})));
 const uploadResponse=await delayedBody,lateJson=observed(uploadResponse.json());
 api.invalidatePrivateReads('fictional-revocation',{auth:true,clear:true});
 uploadBody.enqueue(new TextEncoder().encode('{"id":"old-permission-image"}'));uploadBody.close();
 assert.equal((await lateJson).error?.name,'PrivateReadInvalidatedError','Late upload JSON after revocation cannot be cached');
 api.completePrivateAuthCheck('fictional-rebound','fictional-other');
 const cache=new Map(),waiting=[];
 const switchedBatch=observed(api.uploadQuizImages(entries,cache,()=>new Promise(resolve=>waiting.push(resolve))));
 while(waiting.length<3)await new Promise(resolve=>setImmediate(resolve));
 api.setPrivateReadIdentity('fictional-next','fictional-next-group');
 waiting.forEach(resolve=>resolve('fictional-old-scope-id'));
 const switched=await Promise.race([switchedBatch,new Promise(resolve=>setTimeout(()=>resolve({error:new Error('Old batch still running')}),30))]);
 assert.equal(switched.error?.name,'PrivateReadInvalidatedError','Identity switch stops new queued uploads and rejects batch');
 assert.equal(waiting.length,3,'No queued image may start under the next group using an old draft');
 assert.equal(cache.size,0,'Old-identity successes are not retained for retry');
 messages.length=0;
 const oldBatch=api.beginPrivateImageMutation(),oldMember=api.beginPrivateImageMutation();oldMember();
 api.setPrivateReadIdentity('fictional-final','fictional-final-group');oldBatch({changed:false});
 assert.equal(messages.length,0,'Dirty data from an old group must not be announced as a change in the new group');
 const securityBatch=api.beginPrivateImageMutation();
 const globalBefore=api.getPrivateReadSnapshot();
 const pendingCourse=observed(flight.read({kind:'courses',identity:globalBefore.identity,url:'/api/courses?view=lessons',load:()=>new Promise(()=>{}),validate:x=>x}));
 Channel.current.dispatchEvent(new MessageEvent('message',{data:{type:'auth'}}));
 assert.equal(api.getPrivateReadSnapshot().blocked,true,'Cross-tab security invalidation is synchronous even inside an image batch');
 assert.ok(api.getPrivateReadSnapshot().clearEpoch>globalBefore.clearEpoch,'Security invalidation immediately clears every domain');
 assert.equal((await pendingCourse).error?.clear,true,'Security rejects unrelated in-flight course data even during image batch');
 securityBatch({changed:false});
 api.completePrivateAuthCheck(globalBefore.identity,globalBefore.groupId);
 assert.equal(api.getPrivateReadSnapshot('quiz-images').blocked,false,'Every image/security barrier has an exit');
 // 401/403 on image POST must immediately propagate cross-tab auth invalidation even inside a dirty batch.
 for(const status of [401,403]){
  messages.length=0;
  let authRefreshes=0;const onAuth=()=>authRefreshes++;window.addEventListener('timelyo:auth-refresh',onAuth);
  const beforeDenied=api.getPrivateReadSnapshot();
  const deniedBatch=api.beginPrivateImageMutation(),prior=api.beginPrivateImageMutation();prior({changed:true});
  const pendingRead=observed(flight.read({kind:'courses',identity:beforeDenied.identity,url:'/api/courses?view=lessons',load:()=>new Promise(()=>{}),validate:x=>x}));
  const deniedUpload=observed(api.groupFetch('/api/quiz-images',{method:'POST'}));
  calls.at(-1).resolve(new Response('{"error":"fictional-denied"}',{status}));
  assert.equal((await deniedUpload).error?.name,'PrivateReadInvalidatedError','HTTP '+status+' image POST rejects late body/headers');
  await new Promise(resolve=>queueMicrotask(resolve));
  assert.deepEqual(messages.map(m=>m.type),['auth'],'HTTP '+status+' image POST immediately broadcasts auth without waiting for batch drain');
  assert.equal(api.getPrivateReadSnapshot().blocked,true,'HTTP '+status+' immediately blocks local private reads');
  assert.ok(api.getPrivateReadSnapshot().clearEpoch>beforeDenied.clearEpoch,'HTTP '+status+' immediately clears local domain');
  assert.equal((await pendingRead).error?.clear,true,'HTTP '+status+' clears unrelated in-flight course read');
  assert.equal(authRefreshes,1,'HTTP '+status+' requests local authoritative auth check');
  deniedBatch({changed:false});
  assert.deepEqual(messages.map(m=>m.type),['auth'],'Discarded dirty batch emits no domain-write after HTTP '+status);
  api.completePrivateAuthCheck(beforeDenied.identity,beforeDenied.groupId);
  // Receiving tab must clear/block/auth-refresh without echoing broadcast.
  messages.length=0;authRefreshes=0;
  const rxBefore=api.getPrivateReadSnapshot();
  const rxRead=observed(flight.read({kind:'courses',identity:rxBefore.identity,url:'/api/courses?view=lessons',load:()=>new Promise(()=>{}),validate:x=>x}));
  Channel.current.dispatchEvent(new MessageEvent('message',{data:{type:'auth'}}));
  assert.equal(api.getPrivateReadSnapshot().blocked,true,'Receiver blocks immediately on auth broadcast');
  assert.ok(api.getPrivateReadSnapshot().clearEpoch>rxBefore.clearEpoch,'Receiver clears immediately on auth broadcast');
  assert.equal((await rxRead).error?.clear,true,'Receiver rejects in-flight course read on auth broadcast');
  assert.equal(authRefreshes,1,'Receiver requests authoritative auth on auth broadcast');
  assert.equal(messages.length,0,'Receiver does not echo auth broadcast');
  window.removeEventListener('timelyo:auth-refresh',onAuth);
  api.completePrivateAuthCheck(rxBefore.identity,rxBefore.groupId);
  assert.equal(api.getPrivateReadSnapshot().blocked,false,'Auth recovery unblocks receiver');
 }
 console.log(JSON.stringify({passed:true,realModules:true,networkRequests:0}));
} finally {
 flight?.dispose();release?.();Object.assign(globalThis,saved);
 fs.rmSync(temp,{recursive:true,force:true});
}
