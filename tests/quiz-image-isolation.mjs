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
 console.log(JSON.stringify({passed:true,realModules:true,networkRequests:0}));
} finally {
 flight?.dispose();release?.();Object.assign(globalThis,saved);
 fs.rmSync(temp,{recursive:true,force:true});
}
