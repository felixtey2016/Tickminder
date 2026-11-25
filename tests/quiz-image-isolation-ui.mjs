import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {build} from 'esbuild';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'playwright');
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'quiz-isolation-ui-'));
// Real hooks and native BroadcastChannel across two pages; only fictional APIs.
const entry=`import React,{useLayoutEffect} from 'react';import{createRoot}from'react-dom/client';
import{useCoursePage}from'./app/course-query-ui';import{useWorkspaceData}from'./lib/use-workspace-data';
import{workspaceIdentityKey}from'./lib/workspace-page-data';import{groupFetch,setClientGroup}from'./lib/group-client';
import{uploadQuizImages}from'./lib/quiz-upload';import*as life from'./lib/private-read-lifecycle';
window.life=life;window.calls=[];window.messages=[];window.held=[];window.autoAuth=true;window.cache=new Map();
const actor={id:'fictional-admin',groupId:'fictional-group',role:'admin',name:'Fictional',teacherName:null,studentName:null,isOwner:false,isGroupChief:false,adminPermissions:{enforced:false}};
window.actor=actor;window.identity=workspaceIdentityKey(actor);setClientGroup(actor.groupId);
window.fetch=(input,init={})=>{
 const url=new URL(String(input),location.origin),method=init.method||'GET';const call={url:url.pathname,method,signal:init.signal};window.calls.push(call);
 if(url.pathname==='/api/diagnostics/ingest')return Promise.resolve(new Response('{}'));
 if(method!=='GET')return new Promise((resolve,reject)=>setTimeout(()=>{const status=url.pathname==='/api/quiz-images'?(window.nextStatus||200):200;window.nextStatus=0;if(status===-1){reject(new TypeError('Fictional offline'));return;}resolve(new Response(JSON.stringify({id:'fictional-image-'+window.calls.length}),{status,headers:{'content-type':'application/json'}}));},8));
 const data=url.pathname==='/api/courses'?{items:[{id:'fictional-course'}],page:1,pages:1,total:1,pageSize:20,revision:1,teacherStudentPairs:[]}:{view:'calendar',account:actor,data:{items:[]},revision:1};
 const result=()=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
 return window.holdReads?new Promise(resolve=>window.held.push({resolve:()=>resolve(result()),signal:init.signal})):Promise.resolve(result());
};
window.addEventListener('timelyo:auth-refresh',()=>{window.authRefreshes=(window.authRefreshes||0)+1;if(window.autoAuth)queueMicrotask(()=>life.completePrivateAuthCheck(window.identity,actor.groupId));});
window.observer=new BroadcastChannel('tickminder-private-read-lifecycle');window.observer.onmessage=e=>window.messages.push(e.data);
window.write=(url='/api/courses')=>groupFetch(url,{method:'POST'});
window.batch=async(count=12)=>{const entries=Array.from({length:count},(_,i)=>({path:'fictional-'+i+'.png',bytes:Uint8Array.of(137,i)}));try{await uploadQuizImages(entries,window.cache,async()=>{const response=await groupFetch('/api/quiz-images',{method:'POST'});if(!response.ok)throw Error('Fictional rejected');return(await response.json()).id;});return true;}catch(error){return error.name;}};
function App(){useLayoutEffect(()=>{life.setPrivateReadIdentity(window.identity,actor.groupId);return life.installPrivateReadEvents();},[]);const course=useCoursePage({view:'lessons',mode:'month',month:'2026-11'}),workspace=useWorkspaceData('calendar',actor);window.course=course;window.workspace=workspace;return <div>{course.data&&<input aria-label='draft' defaultValue='fictional draft'/>}<p>{JSON.stringify({course:!!course.data,workspace:!!workspace.data})}</p></div>;}
createRoot(document.getElementById('root')).render(<App/>);`;
await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,platform:'browser',format:'esm',jsx:'automatic',alias:{'@':root},outfile:path.join(temp,'fixture.js'),loader:{'.css':'empty'},logLevel:'silent'});
const server=http.createServer((req,res)=>{res.setHeader('content-type',req.url==='/fixture.js'?'text/javascript':'text/html');res.end(req.url==='/fixture.js'?fs.readFileSync(path.join(temp,'fixture.js')):'<!doctype html><div id="root"></div><script type="module" src="/fixture.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;let checks=0;
const check=(condition,message)=>{assert.ok(condition,message);checks++;};
const counts=page=>page.evaluate(()=>({courses:window.calls.filter(c=>c.url==='/api/courses'&&c.method==='GET').length,calendar:window.calls.filter(c=>c.url==='/api/workspace-data').length}));
const settled=page=>page.waitForFunction(()=>window.course?.data&&window.workspace?.data&&!window.course.loading&&!window.workspace.loading);
try {
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const context=await browser.newContext();
 const errors=[];context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
 // Block any accidental external HTTP requests, not only API mocks.
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const a=await context.newPage(),b=await context.newPage();const url='http://127.0.0.1:'+server.address().port;
 await a.goto(url);await settled(a);await b.goto(url);await settled(b);await a.waitForTimeout(50);
 const baselineA=await counts(a),baselineB=await counts(b);
 await a.locator('input').fill('unsaved fictional draft');
 check(await a.evaluate(()=>window.batch())===true,'Normal image batch succeeds');await b.waitForTimeout(80);
 const afterA=await counts(a),afterB=await counts(b);
 console.log(JSON.stringify({measurement:'12-image-batch',before:{local:baselineA,other:baselineB},after:{local:afterA,other:afterB}}));
 assert.deepEqual(afterA,baselineA,'Image batch adds zero local course/calendar reads');checks++;
 assert.deepEqual(afterB,baselineB,'Image batch adds zero other-tab course/calendar reads');checks++;
 await b.waitForFunction(()=>window.messages.some(m=>m.type==='domain-write'));
 check(await b.evaluate(()=>window.messages.filter(m=>m.type==='domain-write').length)===1,'One native cross-tab notification per batch');
 check(await a.locator('input').inputValue()==='unsaved fictional draft','Image batch preserves mounted draft');
 // Same-domain replay is deduplicated without global React context replacement.
 const duplicate=await b.evaluate(()=>window.messages.find(m=>m.type==='domain-write'));
 const epoch=await b.evaluate(()=>window.life.getPrivateReadSnapshot('quiz-images').epoch);
 await a.evaluate(message=>{const channel=new BroadcastChannel('tickminder-private-read-lifecycle');channel.postMessage(message);channel.close();},duplicate);await b.waitForTimeout(40);
 check(await b.evaluate(()=>window.life.getPrivateReadSnapshot('quiz-images').epoch)===epoch,'Duplicate native event does not advance image generation');
 // Real in-flight hooks remain admitted and are not restarted by image writes.
 await b.evaluate(()=>{window.holdReads=true;window.course.reload();});await b.waitForFunction(()=>window.held.length>=2);
 const inFlight=await counts(b);await a.evaluate(()=>{window.cache.clear();return window.batch(5);});await b.waitForTimeout(40);
 check(await b.evaluate(()=>window.held.every(read=>!read.signal.aborted)),'Course/calendar transports survive unrelated image batch');
 assert.deepEqual(await counts(b),inFlight,'Image batch does not restart in-flight hooks');checks++;
 await b.evaluate(()=>{window.holdReads=false;window.held.splice(0).forEach(read=>read.resolve());});await settled(b);
 const preCourse=await counts(b);await a.evaluate(()=>window.write());await b.waitForFunction(previous=>window.calls.filter(c=>c.url==='/api/courses'&&c.method==='GET').length>previous,preCourse.courses);await settled(b);
 check((await counts(b)).calendar>preCourse.calendar,'Real course mutation still refreshes calendar in other tab');
 const preUnknown=await counts(b);await a.evaluate(()=>window.write('/api/fictional-unknown'));await b.waitForFunction(previous=>window.calls.filter(c=>c.url==='/api/courses'&&c.method==='GET').length>previous,preUnknown.courses);checks++;
 // A partial success drains, retains successes, and retries only missing images.
 await a.evaluate(()=>{window.cache.clear();window.nextStatus=400;});
 const fail=await a.evaluate(()=>window.batch(7));check(fail==='Error','Rejected member fails the batch');
 const retained=await a.evaluate(()=>window.cache.size);check(retained>0&&retained<7,'Partial successes retained after drain');
 const retryBefore=await a.evaluate(()=>window.calls.filter(c=>c.url==='/api/quiz-images').length);
 check(await a.evaluate(()=>window.batch(7))===true,'Explicit retry completes');
 check(await a.evaluate(()=>window.calls.filter(c=>c.url==='/api/quiz-images').length)-retryBefore===7-retained,'Retry does not replay successful image writes');
 // Explicit 400 and unknown network failure on image POST never refresh unrelated course/calendar views or emit auth broadcasts.
 const errBeforeA=await counts(a),errBeforeB=await counts(b),errAuthBefore=await b.evaluate(()=>window.messages.filter(m=>m.type==='auth'||m.type==='write').length);
 const errDomainBefore=await b.evaluate(()=>window.messages.filter(m=>m.type==='domain-write').length);
 await a.evaluate(()=>{window.nextStatus=400;return window.write('/api/quiz-images');});await b.waitForTimeout(60);
 assert.deepEqual(await counts(a),errBeforeA,'Explicit 400 image POST adds zero local course/calendar reads');checks++;
 assert.deepEqual(await counts(b),errBeforeB,'Explicit 400 image POST adds zero other-tab course/calendar reads');checks++;
 check(await b.evaluate(()=>window.messages.filter(m=>m.type==='domain-write').length)===errDomainBefore,'Explicit 400 emits no domain-write');
 await a.evaluate(()=>{window.nextStatus=-1;return window.write('/api/quiz-images').catch(()=>{});});await b.waitForTimeout(60);
 assert.deepEqual(await counts(a),errBeforeA,'Unknown network image POST adds zero local course/calendar reads');checks++;
 assert.deepEqual(await counts(b),errBeforeB,'Unknown network image POST adds zero other-tab course/calendar reads');checks++;
 check(await b.evaluate(()=>window.messages.filter(m=>m.type==='domain-write').length)===errDomainBefore+1,'Unknown network image POST revalidates only image domain');
 check(await b.evaluate(()=>window.messages.filter(m=>m.type==='auth'||m.type==='write').length)===errAuthBefore,'Explicit 400 and unknown network image outcomes emit no global auth/write broadcasts');
 for(const status of [401,403]){
  for(const page of [a,b]){
   await page.evaluate(()=>{window.autoAuth=true;if(window.life.getPrivateReadSnapshot().blocked)window.life.completePrivateAuthCheck(window.identity,window.actor.groupId);});
   await settled(page);
  }
  // Keep auth suspended on BOTH pages to observe the security fence before recovery.
  for(const page of [a,b])await page.evaluate(()=>{
   window.autoAuth=false;window.holdReads=true;window.authRefreshes=0;
   window.course.reload();
  });
  for(const page of [a,b])await page.waitForFunction(()=>window.held.length>=2);
  const before=await Promise.all([a,b].map(page=>page.evaluate(()=>({clear:window.life.getPrivateReadSnapshot().clearEpoch,authMessages:window.messages.filter(m=>m.type==='auth').length,domainMessages:window.messages.filter(m=>m.type==='domain-write').length}))));
  if(status===403){
   // Verify 403 inside a multi-image batch propagates immediately without emitting domain-write.
   await a.evaluate(()=>{window.cache.clear();window.nextStatus=403;return window.batch(5);});
  }else{
   await a.evaluate(status=>{window.nextStatus=status;return window.write('/api/quiz-images').catch(()=>{});},status);
  }
  await b.waitForTimeout(100);
  for(const [i,page] of [a,b].entries()){
   const state=await page.evaluate(()=>({clear:window.life.getPrivateReadSnapshot().clearEpoch,blocked:window.life.getPrivateReadSnapshot().blocked,course:window.course.data,calendar:window.workspace.data,aborted:window.held.every(read=>read.signal.aborted),authRefreshes:window.authRefreshes}));
   check(state.clear>before[i].clear&&state.blocked&&state.course===null&&state.calendar===null,'HTTP '+status+' clears and blocks BOTH private views on tab '+i);
   check(state.aborted,'HTTP '+status+' aborts in-flight course/calendar reads on tab '+i);
   check(state.authRefreshes===1,'HTTP '+status+' requests authoritative auth once on tab '+i);
   // The fictional transport deliberately ignores abort and delivers stale data.
   await page.evaluate(()=>{window.holdReads=false;window.held.splice(0).forEach(read=>read.resolve());});
  }
  await b.waitForTimeout(50);
  for(const page of [a,b])check(await page.evaluate(()=>window.course.data===null&&window.workspace.data===null),'Late denied-generation results cannot repopulate private views');
  check(await b.evaluate(()=>window.messages.filter(m=>m.type==='auth').length)===before[1].authMessages+1,'One immediate auth broadcast, independent of image success/batch');
  check(await a.evaluate(()=>window.messages.filter(m=>m.type==='auth').length)===before[0].authMessages+1,'Receiving tab does not echo auth broadcasts');
  check(await b.evaluate(()=>window.messages.filter(m=>m.type==='domain-write').length)===before[1].domainMessages,'Denied HTTP '+status+' emits no image domain-write');
  for(const page of [a,b]){
   await page.evaluate(()=>{window.autoAuth=true;window.life.completePrivateAuthCheck(window.identity,window.actor.groupId);});await settled(page);
   check(await page.evaluate(()=>!window.life.getPrivateReadSnapshot().blocked&&!!window.course.data&&!!window.workspace.data),'Verified auth recovery rereads both views');
  }
 }
 check(errors.length===0,'No unhandled browser/React errors');
 console.log(JSON.stringify({passed:true,checks,realReact:true,nativeBroadcastChannel:true,tabs:2,extraCourseReadsFromImages:0,extraCalendarReadsFromImages:0,remoteApiRequests:0,productionQueries:0}));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
