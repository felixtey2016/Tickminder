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
 console.log(JSON.stringify({passed:true,realModules:true,networkRequests:0}));
} finally {
 flight?.dispose();release?.();Object.assign(globalThis,saved);
 fs.rmSync(temp,{recursive:true,force:true});
}
