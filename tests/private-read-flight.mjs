import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';

// Exercise the real transport/lifecycle modules with controlled asynchronous
// loaders. No HTTP server, credentials, database or remote request is involved.
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-private-flight-'));
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error('Network is forbidden in private-read-flight tests');};
let checks=0,flights=[];
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const observed=promise=>promise.then(value=>({ok:true,value}),error=>({ok:false,error}));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function loader(){const calls=[];return{calls,load:signal=>{const item={...deferred(),signal};calls.push(item);return item.promise;}};}
try{
 await build({absWorkingDir:root,stdin:{contents:"export * from './lib/private-read-flight'; export * from './lib/private-read-lifecycle';",resolveDir:root,sourcefile:'private-flight-fixture.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',target:'es2022',outfile:path.join(temp,'fixture.mjs'),alias:{'@':root},logLevel:'silent'});
 const api=await import(pathToFileURL(path.join(temp,'fixture.mjs')).href);
 const {setPrivateReadIdentity,invalidatePrivateReads,getPrivateReadSnapshot,beginPrivateMutation,beginPrivateAuthCheck,completePrivateAuthCheck,PrivateReadInvalidatedError}=api;
 const identity='fictional-complete-identity-a',group='fictional-group-a';
 setPrivateReadIdentity(identity,group);
 const factory=options=>{const value=api.createPrivateReadFlight(options);flights.push(value);return value;};
 const broker=factory(),validate=value=>{assert.ok(value&&Array.isArray(value.items),'Fixture JSON contract');return value;};
 const descriptor=(source,extras={})=>({kind:'workspace',identity,url:'/api/workspace-data?view=students',load:source.load,validate,...extras});
 const failure=async(promise,predicate,label)=>{const result=await promise;check(!result.ok&&predicate(result.error),label);return result.error;};
 const invalid=error=>error instanceof PrivateReadInvalidatedError;

 {
  const source=loader(),a=observed(broker.read(descriptor(source))),b=observed(broker.read(descriptor(source)));
  await tick();check(source.calls.length===1,'Concurrent identical subscribers share one pending loader');
  source.calls[0].resolve({items:[{id:'one',nested:{value:1}}]});
  const [left,right]=await Promise.all([a,b]);check(left.ok&&right.ok,'Both pending subscribers receive success');
  check(left.value!==right.value&&left.value.items!==right.value.items&&left.value.items[0].nested!==right.value.items[0].nested,'Every subscriber owns an isolated deep result');
  left.value.items[0].nested.value=9;check(right.value.items[0].nested.value===1,'One consumer cannot alter another consumer result');
  const again=observed(broker.read(descriptor(source)));await tick();check(source.calls.length===2,'A settled success is not cached for the next read');source.calls[1].resolve({items:[]});check((await again).ok,'Fresh post-settle read succeeds');
 }
 {
  const source=loader(),first=new AbortController(),second=new AbortController();
  const a=observed(broker.read(descriptor(source,{signal:first.signal}))),b=observed(broker.read(descriptor(source,{signal:second.signal})));await tick();
  first.abort();await failure(a,error=>error.name==='AbortError','One subscriber receives its own AbortError');
  check(!source.calls[0].signal.aborted,'One cancellation does not abort the remaining subscriber transport');
  source.calls[0].resolve({items:[{id:'survivor'}]});check((await b).value?.items[0].id==='survivor','The remaining subscriber still succeeds');
  const last=new AbortController(),c=observed(broker.read(descriptor(source,{signal:last.signal})));await tick();last.abort();
  await failure(c,error=>error.name==='AbortError','Last subscriber abort settles its promise');check(source.calls[1].signal.aborted,'Last subscriber abort cancels the shared transport');
  const d=observed(broker.read(descriptor(source)));await tick();check(source.calls.length===3,'A cancelled flight is removed immediately');source.calls[2].resolve({items:[]});await d;
  const already=new AbortController();already.abort();const e=observed(broker.read(descriptor(source,{signal:already.signal})));await failure(e,error=>error.name==='AbortError','Already-aborted subscriber rejects without admission');check(source.calls.length===3,'Already-aborted subscriber does not start a network loader');
 }
 {
  const source=loader(),a=observed(broker.read(descriptor(source,{url:'/api/workspace-data?view=calendar&from=2026-11-01&to=2026-12-01'}))),b=observed(broker.read(descriptor(source,{url:'/api/workspace-data?view=calendar&from=2026-12-01&to=2027-01-01'})));
  await tick();check(source.calls.length===2,'Different calendar ranges never join');source.calls.forEach(item=>item.resolve({items:[]}));await Promise.all([a,b]);
  const dup=loader(),one=observed(broker.read(descriptor(dup,{url:'/api/workspace-data?view=students'}))),two=observed(broker.read(descriptor(dup,{url:'/api/workspace-data?view=students&view=teachers'})));await tick();check(dup.calls.length===2,'Duplicate parameters are not normalized into a valid request');dup.calls.forEach(item=>item.resolve({items:[]}));await Promise.all([one,two]);
  const courses=loader(),normal=observed(broker.read(descriptor(courses,{kind:'courses',url:'/api/courses?view=lessons'}))),options=observed(broker.read(descriptor(courses,{kind:'courses',url:'/api/courses?view=lessons&optionsOnly=1'})));await tick();check(courses.calls.length===2,'Record page and options-only representation never join');courses.calls.forEach(item=>item.resolve({items:[]}));await Promise.all([normal,options]);
 }
 {
  const source=loader(),stale=observed(broker.read(descriptor(source,{identity:'another-complete-identity'})));
  await failure(stale,error=>invalid(error)&&error.clear,'A mismatched complete identity is rejected');check(source.calls.length===0,'Mismatched identity never invokes loader');
  const a=observed(broker.read(descriptor(source)));await tick();setPrivateReadIdentity(identity,'fictional-group-b');await failure(a,invalid,'Group transition rejects old pending subscribers');check(source.calls[0].signal.aborted,'Group transition aborts old transport');
  const b=observed(broker.read(descriptor(source)));await tick();check(source.calls.length===2,'Same actor in another group starts a different flight');source.calls[1].resolve({items:[]});await b;setPrivateReadIdentity(identity,group);
  for(const next of ['fictional-rebound-teacher','fictional-changed-grants','fictional-rebound-student']){
   const before=getPrivateReadSnapshot(),pending=observed(broker.read(descriptor(source)));await tick();setPrivateReadIdentity(next,group);await failure(pending,invalid,'Complete role/binding/grant identity change rejects old read: '+next);check(getPrivateReadSnapshot().clearEpoch!==before.clearEpoch,'Identity transition clears previously displayed private state');setPrivateReadIdentity(identity,group);
  }
 }
 {
  const source=loader(),pending=observed(broker.read(descriptor(source)));await tick();const before=getPrivateReadSnapshot(),finish=beginPrivateMutation();
  await failure(pending,invalid,'Mutation start invalidates earlier pending data');check(getPrivateReadSnapshot().epoch!==before.epoch,'Mutation start advances the read generation');
  const during=observed(broker.read(descriptor(source)));await failure(during,invalid,'Reads during an unfinished mutation are explicitly blocked');check(source.calls.length===1,'Blocked read does not invoke loader');
  const blocked=getPrivateReadSnapshot();finish();const ended=getPrivateReadSnapshot();check(!ended.blocked&&ended.epoch!==blocked.epoch,'Mutation completion unblocks a new generation');finish();check(getPrivateReadSnapshot()===ended,'Mutation finish is idempotent');
  const fresh=observed(broker.read(descriptor(source)));await tick();check(source.calls.length===2,'Post-mutation read starts fresh transport');source.calls[1].resolve({items:[]});await fresh;
  const one=beginPrivateMutation(),two=beginPrivateMutation();one();check(getPrivateReadSnapshot().blocked,'One finished mutation cannot unblock a concurrent write');two();check(!getPrivateReadSnapshot().blocked,'Last mutation finish releases the barrier');
  const unknown=beginPrivateMutation();try{throw new TypeError('Fictional network outcome unknown');}catch{}finally{unknown();}check(!getPrivateReadSnapshot().blocked,'Unknown write outcome still ends the barrier without retrying a write');
 }
 {
  const source=loader(),business=observed(broker.read(descriptor(source)));await tick();const before=getPrivateReadSnapshot();beginPrivateAuthCheck();
  await failure(business,invalid,'Foreground auth boundary rejects the preceding cookie generation');check(getPrivateReadSnapshot().authEpoch!==before.authEpoch,'A new auth check changes the session generation even before identity changes');
  const denied=observed(broker.read(descriptor(source)));await failure(denied,invalid,'Business reads wait for current live auth');
  const auth=loader(),first=observed(broker.read(descriptor(auth,{kind:'auth',url:'/api/auth'}))),second=observed(broker.read(descriptor(auth,{kind:'auth',url:'/api/auth'})));await tick();check(auth.calls.length===1,'Identical live auth reads may share while business is blocked');
  const finish=beginPrivateMutation();check(auth.calls[0].signal.aborted,'Even an ordinary write fences an older auth response that may contain changed profile/binding');await failure(first,invalid,'First auth subscriber rejects pre-write identity');await failure(second,invalid,'Second auth subscriber rejects pre-write identity');finish();
  const confirmed=observed(broker.read(descriptor(auth,{kind:'auth',url:'/api/auth'})));await tick();auth.calls[1].resolve({items:[]});await confirmed;completePrivateAuthCheck(identity,group);check(!getPrivateReadSnapshot().blocked,'Same-account fresh post-write auth completion permits business reads');
  const renewed=observed(broker.read(descriptor(source)));await tick();check(source.calls.length===2,'Same account after auth/session boundary cannot join the old read');source.calls[1].resolve({items:[]});await renewed;
  const old=observed(broker.read(descriptor(source)));await tick();invalidatePrivateReads('fictional-relogin',{auth:true,clear:true});await failure(old,error=>invalid(error)&&error.clear,'Same-account explicit relogin clears prior private generation');completePrivateAuthCheck(identity,group);
  const fakeAuth=observed(broker.read(descriptor(source,{kind:'auth',url:'/api/courses?view=lessons'})));await failure(fakeAuth,()=>true,'Auth bypass cannot be used for a business URL');
 }
 {
  const source=loader(),oldEpoch=beginPrivateAuthCheck(),pending=observed(broker.read(descriptor(source,{kind:'auth',url:'/api/auth'})));await tick();setPrivateReadIdentity('fictional-new-grants','fictional-group-b');
  await failure(pending,invalid,'External identity/group change invalidates an older pending auth request');
  check(completePrivateAuthCheck(identity,group,oldEpoch)===false&&getPrivateReadSnapshot().identity==='fictional-new-grants','A late auth completion cannot roll back a newer explicit identity');setPrivateReadIdentity(identity,group);
  const finish=beginPrivateMutation({auth:true,deferAuth:true});const before=getPrivateReadSnapshot();finish();check(getPrivateReadSnapshot().blocked&&getPrivateReadSnapshot().authEpoch!==before.authEpoch,'Deferred recovery reset keeps business reads fenced until explicit live auth');completePrivateAuthCheck(identity,group);
 }
 {
  const source=loader(),a=observed(broker.read(descriptor(source))),b=observed(broker.read(descriptor(source)));await tick();source.calls[0].reject(new Error('Fictional unavailable response'));
  await failure(a,error=>error.message.includes('Fictional'),'Loader failure reaches the first subscriber');await failure(b,error=>error.message.includes('Fictional'),'Loader failure reaches the second subscriber');
  const retry=observed(broker.read(descriptor(source)));await tick();check(source.calls.length===2,'Failure is not cached; explicit retry starts a fresh read');source.calls[1].resolve({items:[]});await retry;
  const malformed=observed(broker.read(descriptor(source)));await tick();source.calls[2].resolve({invalid:true});await failure(malformed,()=>true,'Malformed JSON contract is not treated as successful empty data');
 }
 {
  const source=loader(),a=observed(broker.read(descriptor(source))),b=observed(broker.read(descriptor(source,{url:'/api/workspace-data?view=teachers'})));await tick();invalidatePrivateReads('fictional-http-403',{auth:true,clear:true});
  await failure(a,error=>invalid(error)&&error.clear,'Authorization denial clears the active request');await failure(b,error=>invalid(error)&&error.clear,'Authorization denial also clears sibling pending requests');check(source.calls.every(item=>item.signal.aborted),'Denial aborts every old private transport');completePrivateAuthCheck(identity,group);
 }
 {
  const limited=factory({timeoutMs:1000,maxPending:2}),source=loader();
  const a=observed(limited.read(descriptor(source))),b=observed(limited.read(descriptor(source,{url:'/api/workspace-data?view=teachers'}))),extra=observed(limited.read(descriptor(source,{url:'/api/workspace-data?view=subjects'})));await tick();await failure(extra,()=>true,'Registry bound explicitly rejects a new distinct read');check(source.calls.length===2&&!source.calls.some(item=>item.signal.aborted),'Capacity rejection does not evict or abort admitted subscribers');source.calls.forEach(item=>item.resolve({items:[]}));await Promise.all([a,b]);
  const timeout=factory({timeoutMs:35}),hung=loader(),pending=observed(timeout.read(descriptor(hung)));await tick();await failure(pending,error=>/timeout|timed|超时|稍后/i.test(error.message),'A loader ignoring abort still has a finite subscriber lifetime');check(hung.calls[0].signal.aborted,'Deadline also aborts transport');
  const next=observed(timeout.read(descriptor(hung)));await tick();check(hung.calls.length===2,'Timed-out entry is removed and can be retried');hung.calls[1].resolve({items:[]});await next;
 }
 check(getPrivateReadSnapshot().identity===identity&&getPrivateReadSnapshot().groupId===group&&!getPrivateReadSnapshot().blocked,'Suite leaves no stuck mutation/auth barrier');
 console.log(JSON.stringify({passed:true,checks,realModules:true,networkRequests:0,productionQueries:0,settledResponseReuse:0}));
} finally {
 for(const flight of flights)flight.dispose();globalThis.fetch=originalFetch;
 const resolved=path.resolve(temp);assert(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('tickminder-private-flight-'));fs.rmSync(resolved,{recursive:true,force:true});
}
