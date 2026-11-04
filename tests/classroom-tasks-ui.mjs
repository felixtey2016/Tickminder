import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

// Render the real Tasks component and classroom tabs with entirely fictional,
// same-origin APIs. No production account, data, storage or Google API is used.
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {build}=require('esbuild'),postcss=require('postcss'),tailwindModule=require('@tailwindcss/postcss'),tailwind=tailwindModule.default||tailwindModule;
const playwrightModule=process.env.PLAYWRIGHT_MODULE_PATH;
const {chromium}=await import(playwrightModule?(playwrightModule.startsWith('file:')?playwrightModule:pathToFileURL(path.resolve(playwrightModule)).href):'playwright');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-classroom-tasks-'));
const createdAt='2026-10-30T03:00:00.000Z',completedAt='2026-10-31T04:20:00.000Z';
const poses=['hello','reading','thinking','encourage','celebrate','ready','search','waiting','rest','surprise','retry','sleepy'];
let checks=0,screenshots=0,browser,server,origin;
const activeFixtures=new Set(),check=(condition,message)=>{assert(condition,message);checks++;console.log('PASS '+message);};
const text=(language,zh,en)=>language==='zh'?zh:en;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function eventually(predicate,message){const until=Date.now()+10000;while(Date.now()<until){if(await predicate())return;await delay(10);}assert.fail(message);}
function deferred(){let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};}

const entry=`import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ClassroomTasks} from './app/classroom-tasks';
import {ClassroomsPage} from './app/classrooms-page';
import {AdminPermissionContext} from './app/admin-permission-context';
import {setLanguage} from './lib/i18n';
import './app/ui-refresh.css';
import './app/teaching-layout.css';
import './app/mascot-experience.css';
import './app/appearance.css';
const params=new URLSearchParams(location.search),language=params.get('lang')==='zh'?'zh':'en',initialRole=params.get('role')||'student',view=params.get('view')||'tasks';
document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
setLanguage(language);
const learning={materials:[],homework:[],submissions:[],studyBlocks:[],eligible:[],limits:{pdfMaxBytes:10485760}};
const classes=['a','b'].map((suffix,index)=>({id:'class-'+suffix,title:'Fictional class '+suffix.toUpperCase(),description:null,subject:'Mathematics',syllabusId:'fixture',subjectId:'math',grade:'Year 1',teacherName:'Fictional Teacher',termId:null,archived:params.get('archived')==='1',createdAt:'2026-10-30T03:00:00.000Z',updatedAt:'2026-10-30T03:00:00.000Z',announcements:[],members:index===0?['Fictional Student A','Fictional Student B']:['Fictional Student C']}));
function App(){
 const [classId,setClassId]=useState('class-a'),[role,setRole]=useState(initialRole);
 const classroom=classes.find(item=>item.id===classId);
 const denied=params.get('grants')==='denied',account=role==='admin'?{role,adminPermissions:{enforced:true,privileged:false,grants:denied?['classrooms.view','announcements.view','tasks.view']:['classrooms.view','announcements.view','tasks.view','tasks.create','tasks.review','tasks.archive','tasks.delete']}}:{role};
 const content=view==='classrooms'?<ClassroomsPage role={role} account={{...account,id:'fictional-task-ui-'+role,groupId:'fictional-task-ui-group',teacherName:role==='teacher'?'Fictional Teacher':null,studentName:role==='student'?'Fictional Student A':null}} classes={classes} terms={[]} teacherName='Fictional Teacher' mutate={async()=>({ok:true})} learningMutate={async()=>true} busy={false} onCalendar={()=>{}}/>:<ClassroomTasks classroom={classroom} role={role}/>;
 return <AdminPermissionContext.Provider value={account}><div className='app-shell'><div className='app-body'><main className='workspace workspace-compact'><div className='fixture-controls'><button data-testid='fixture-switch-class' onClick={()=>setClassId(value=>value==='class-a'?'class-b':'class-a')}>Switch fictional class</button><button data-testid='fixture-switch-role' onClick={()=>setRole(value=>value==='student'?'teacher':'student')}>Switch fictional role</button></div>{content}</main></div></div></AdminPermissionContext.Provider>;
}
createRoot(document.getElementById('root')).render(<App/>);`;

function task(id,title){return {id,title,description:'Practise this fictional activity without uploading a file.',revision:1,requiresReview:true,canDelete:true,archived:false,createdAt,studentState:{studentName:'Fictional Student A',status:'pending',stateVersion:null,completedAt:null,submittedAt:null,reviewedAt:null,reason:'',history:[]}};}
async function openFixture({width=390,language='en',role='student',view='tasks',scenario='',archived=false,grants='allowed',wait=true,theme='light'}={}){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();
 const api=[],external=[],errors=[],unexpected=[],routeErrors=[],operations=new Map(),gates=[];
 const tasks={
  'class-a':[task('task-a','Recite the 2–9 times tables')],
  'class-b':[task('task-b','Read a fictional poem')]
 };
 if(scenario==='pagination')tasks['class-a'].push(task('task-next','Read two pages'));
 if(scenario==='self-complete')tasks['class-a'][0].requiresReview=false;
 const controls={failReads:scenario==='initial-read-failure'?1:0,readFailureStatus:503,failWriteOnce:scenario==='complete-failure',loseCreateOnce:scenario==='lost-create-response',holdComplete:scenario==='held-complete',holdRead:scenario==='held-read',heldReadFinished:false,postRefreshFailure:scenario==='refresh-failure',holdWrite:scenario==='held-write',heldWriteFinished:false};
 let currentRole=role,closed=false,holdReadUsed=false,createSequence=0;
 const completeGate=deferred(),readGate=deferred(),writeGate=deferred();gates.push(completeGate,readGate,writeGate);
 const fixture={context,page,api,external,errors,unexpected,routeErrors,tasks,operations,controls,width,language,role,scenario,
  releaseComplete:()=>completeGate.resolve(),releaseRead:()=>readGate.resolve(),releaseWrite:()=>writeGate.resolve(),
  close:async()=>{closed=true;for(const gate of gates)gate.resolve();check(errors.length===0,`no browser exception (${role}/${scenario||'normal'}/${width}/${language}): ${errors.join('; ')}`);check(routeErrors.length===0,`fixture requests remain valid: ${routeErrors.join('; ')}`);check(external.length===0&&unexpected.length===0,'Tasks never call production, Google, PDF, upload or unrelated APIs');await context.close();activeFixtures.delete(fixture);}
 };
 activeFixtures.add(fixture);page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 const state=(classroomId,cursor)=>{
  const readOnly=archived||scenario==='read-only';
  let rows=tasks[classroomId]||[];
  const nextCursor=scenario==='pagination'&&classroomId==='class-a'&&!cursor?'page-2':null;
  if(scenario==='pagination'&&classroomId==='class-a')rows=cursor?[rows[0],rows[1]]:[rows[0]];
  return {classroomId,readOnly,canCreate:scenario==='overgrant'||currentRole!=='student',canArchive:scenario==='overgrant'||currentRole!=='student',canReview:currentRole!=='student',canComplete:currentRole==='student',tasks:rows.map(item=>{
   const {studentState:own,...rest}=item;
   const legacy={studentName:'Fictional Student B',status:'legacy_completed',stateVersion:'legacy-b',completedAt,submittedAt:null,reviewedAt:null,reason:'',history:[{eventId:'legacy-b',action:'complete',at:completedAt,actorName:'Fictional Student B',reason:''}]};
   return currentRole==='student'?{...rest,completedAt:own.completedAt,studentState:own}:{...rest,progress:{completed:own.status==='completed'?1:0,selfCompleted:own.status==='self_completed'?1:0,awaitingReview:own.status==='awaiting_review'?1:0,needsRedo:own.status==='needs_redo'?1:0,legacyCompleted:1,total:2,students:[own,legacy]}};
  }),nextCursor};
 };
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin!==origin){external.push(url.origin);await route.abort('blockedbyclient');return;}
  if(!url.pathname.startsWith('/api/')){await route.continue();return;}
  const method=request.method();let body;
  try{body=method==='GET'?null:request.postDataJSON();}catch{body=null;}
  api.push({path:url.pathname,query:url.search,method,body});
  const fulfill=async(data,status=200)=>{
   try{await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});}catch(error){if(!closed&&!request.failure())throw error;}
  };
  try{
   if(url.pathname==='/api/academic-catalogues'&&method==='GET')return fulfill({scope:'student',revision:1,syllabuses:[{id:'fixture',name:'Fictional Syllabus',active:true,grades:['Year 1'],subjects:[{id:'math',name:'Mathematics',active:true,aliases:[]}]}]});
   if(url.pathname!=='/api/classroom-tasks'){unexpected.push(method+' '+url.pathname);return fulfill({error:'Unexpected fictional API'},404);}
   if(method==='GET'){
    const classroomId=url.searchParams.get('classroomId'),cursor=url.searchParams.get('cursor');
    if(controls.failReads>0){controls.failReads--;return fulfill({error:'Fictional read failure'},controls.readFailureStatus);}
    const snapshot=state(classroomId,cursor);
    if(controls.holdRead&&classroomId==='class-a'&&!holdReadUsed){holdReadUsed=true;await readGate.promise;try{return await fulfill(snapshot);}finally{controls.heldReadFinished=true;}}
    return fulfill(snapshot);
   }
   if(method!=='POST')return fulfill({error:'Unsupported fictional operation'},405);
   if(body?.action==='previewDelete'){
    if(controls.previewDenied){controls.previewDenied=false;return fulfill({error:'Fictional permission revoked'},403);}
    const item=tasks[body.classroomId]?.find(row=>row.id===body.id);
    if(!item)return fulfill({error:'Fictional task not found'},404);
    return fulfill({ok:true,id:item.id,title:item.title,previewAt:new Date().toISOString(),fingerprint:'a'.repeat(64),lastEventId:'fictional-last-event',history:{events:12,students:4,submissions:4,approvals:2,selfCompletions:1,legacyCompletions:1,returns:2}});
   }
   if(!body||!['create','submit','approve','return','archive','delete'].includes(body.action)||typeof body.operationId!=='string'||!body.operationId){routeErrors.push('Invalid operation payload');return fulfill({error:'Invalid fictional operation'},400);}
   if(body.action==='submit'&&['studentName','accountId','student','groupId'].some(key=>Object.hasOwn(body,key))){routeErrors.push('Client supplied a completion identity');return fulfill({error:'No client-selected student'},400);}
   if(controls.holdComplete&&body.action==='submit')await completeGate.promise;
   if(controls.holdWrite)await writeGate.promise;
   if(controls.failWriteOnce){controls.failWriteOnce=false;return fulfill({error:'Fictional write failure'},503);}
   if(body.action==='delete'&&controls.deleteConflictOnce){controls.deleteConflictOnce=false;return fulfill({error:'Fictional deletion impact changed'},409);}
   const previous=operations.get(body.operationId);
   if(previous){
    if(previous.signature!==JSON.stringify(body)){routeErrors.push('Operation ID reused for different contents');return fulfill({error:'Fictional operation conflict'},409);}
    return fulfill({ok:true,id:previous.id,replayed:true});
   }
   let id=body.id;
   if(body.action==='create'){
    id='created-task-'+(++createSequence);
    tasks[body.classroomId].unshift({...task(id,body.title),description:body.description,requiresReview:body.requiresReview!==false});
   }else{
    const item=tasks[body.classroomId]?.find(row=>row.id===id);
    if(!item)return fulfill({error:'Fictional task not found'},404);
    if(body.action==='delete'){
     if(body.confirm!==true||body.fingerprint!=='a'.repeat(64)){routeErrors.push('Missing deletion confirmation proof');return fulfill({error:'Missing deletion confirmation proof'},409);}
     tasks[body.classroomId]=tasks[body.classroomId].filter(row=>row.id!==id);
    }else if(body.action==='archive')item.archived=true;else{
     const previous=item.studentState;if(body.expectedEventId!==previous.stateVersion)return fulfill({error:'Task state changed'},409);
     const self=body.action==='submit'&&item.requiresReview===false;
     const event={eventId:body.operationId,action:self?'selfComplete':body.action,at:completedAt,actorName:currentRole==='student'?'Fictional Student A':'Fictional Teacher',reason:body.reason||''};
     item.studentState={...previous,stateVersion:event.eventId,status:self?'self_completed':body.action==='submit'?'awaiting_review':body.action==='return'?'needs_redo':'completed',completedAt:self||body.action==='approve'?completedAt:null,submittedAt:body.action==='submit'&&!self?completedAt:previous.submittedAt,reviewedAt:body.action==='submit'?null:completedAt,reason:body.action==='return'?body.reason:'',history:[event,...previous.history]};
    }
   }
   operations.set(body.operationId,{signature:JSON.stringify(body),id});
   if(controls.postRefreshFailure){controls.postRefreshFailure=false;controls.failReads++;}
   if(body.action==='create'&&controls.loseCreateOnce){controls.loseCreateOnce=false;await route.abort('failed');return;}
   if(body.action==='delete'&&controls.loseDeleteOnce){controls.loseDeleteOnce=false;await route.abort('failed');return;}
   return await fulfill({ok:true,id,replayed:false,...(body.action==='submit'?{status:tasks[body.classroomId].find(row=>row.id===id).studentState.status}:{})});
  }catch(error){
   if(!closed&&!request.failure()){routeErrors.push(error.message);try{await route.abort('failed');}catch{}}
  }finally{
   if(method==='POST'&&controls.holdWrite)controls.heldWriteFinished=true;
  }
 });
 await page.goto(origin+'/?'+new URLSearchParams({view,lang:language,role,scenario,archived:archived?'1':'0',grants,theme}));
 await page.locator('.workspace').waitFor();
 if(view==='tasks'){
  await page.getByTestId('classroom-tasks').waitFor();
  if(wait)await page.locator('.classroom-task-list[aria-busy=false]').waitFor();
 }
 fixture.switchRole=async()=>{currentRole=currentRole==='student'?'teacher':'student';await page.getByTestId('fixture-switch-role').click();};
 return fixture;
}

const card=(f,id='task-a')=>f.page.locator('article[data-task-id="'+id+'"]');
const posts=f=>f.api.filter(request=>request.path==='/api/classroom-tasks'&&request.method==='POST');
async function assertFit(f,label){
 const bounds=await f.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('.classroom-tasks input,.classroom-tasks textarea,.classroom-task-card,.classroom-task-form,.classroom-task-heading-actions button')].filter(node=>node.getClientRects().length).map(node=>{const rect=node.getBoundingClientRect();return {left:rect.left,right:rect.right,width:rect.width};})}));
 check(bounds.scroll<=bounds.width+1&&bounds.items.every(item=>item.width>0&&item.left>=-1&&item.right<=bounds.width+1),`${label} fits ${f.width}px`);
}
async function screenshot(f,name){if(!process.env.TASK_SCREENSHOTS)return;fs.mkdirSync(process.env.TASK_SCREENSHOTS,{recursive:true});await f.page.screenshot({path:path.join(process.env.TASK_SCREENSHOTS,name+'.png'),fullPage:true});screenshots++;}
async function openForm(f,title='Memorise a fictional poem'){
 await f.page.getByRole('button',{name:text(f.language,'新增任务','New task'),exact:true}).click();
 await f.page.getByLabel(text(f.language,'任务标题','Task title'),{exact:true}).fill(title);
 await f.page.locator('form.classroom-task-form textarea').fill('Practise aloud. No attachment is required.');
}
async function publish(f){await f.page.getByRole('button',{name:text(f.language,'发布任务','Publish task'),exact:true}).click();}
async function complete(f,id='task-a'){await card(f,id).getByRole('button',{name:text(f.language,'申请老师确认','Request teacher confirmation'),exact:true}).click();}
async function reloadTasks(f){await f.page.getByRole('button',{name:text(f.language,'重新载入','Reload tasks'),exact:true}).click();await f.page.locator('.classroom-task-list[aria-busy=false]').waitFor();}
async function settleUi(f){await f.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

try{
 await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'classroom-tasks-fixture.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'esm',jsx:'automatic',outfile:path.join(temporary,'ui.js'),assetNames:'fixture-assets/[name]-[hash]',loader:{'.woff':'file','.woff2':'file','.ttf':'file'},alias:{'@':root},logLevel:'silent'});
 const globals=await postcss([tailwind({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')});
 const css=globals.css+'\n'+fs.readFileSync(path.join(temporary,'ui.css'),'utf8');
 server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://fixture.test').pathname;
  if(pathname==='/ui.css'){res.setHeader('content-type','text/css');res.end(css);return;}
  if(pathname.startsWith('/mascots/')){const name=path.basename(pathname);if(!poses.some(pose=>name===pose+'.png')){res.writeHead(404);res.end();return;}res.setHeader('content-type','image/png');res.end(fs.readFileSync(path.join(root,'public/mascots',name)));return;}
  if(pathname==='/ui.js'||pathname.startsWith('/fixture-assets/')){const file=path.join(temporary,pathname.slice(1));if(!file.startsWith(temporary+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('content-type',pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.woff2')?'font/woff2':pathname.endsWith('.woff')?'font/woff':'font/ttf');res.end(fs.readFileSync(file));return;}
  if(pathname!=='/'){res.writeHead(404);res.end();return;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script type="module" src="/ui.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});


 for(const width of [320,390,1280])for(const language of ['en','zh']){
  const label=width+'/'+language,f=await openFixture({width,language,scenario:'held-complete'});
  check(await card(f).locator('.classroom-task-badge').innerText()===text(language,'待完成','To do'),'student starts To do '+label);
  check(await f.page.locator('.classroom-task-progress').count()===0,'student sees no classmate roster '+label);
  await complete(f);await eventually(()=>posts(f).length===1,'request not sent');check(await card(f).getByRole('button').isDisabled(),'pending request disables duplicates '+label);
  check(await card(f).locator('.classroom-task-badge').innerText()===text(language,'待完成','To do'),'pending network does not claim completion '+label);
  f.releaseComplete();await card(f).getByText(text(language,'待老师确认','Awaiting teacher'),{exact:true}).waitFor();
  check(await card(f).getByRole('button').count()===0,'requested Task cannot be submitted again '+label);
  check(Object.keys(posts(f)[0].body).sort().join(',')==='action,classroomId,expectedEventId,id,operationId','request sends version but no client identity '+label);
  await f.switchRole();await card(f).getByRole('button',{name:text(language,'要求重做','Request another attempt'),exact:true}).click();
  const dialog=f.page.getByRole('dialog');await dialog.waitFor();check(await dialog.getByRole('button',{name:text(language,'发送给学生','Send to student'),exact:true}).isDisabled(),'return requires reason '+label);
  await dialog.getByLabel(text(language,'重做原因','Reason'),{exact:true}).fill('Practise seven times eight again.');await dialog.getByRole('button',{name:text(language,'发送给学生','Send to student'),exact:true}).click();await dialog.waitFor({state:'hidden'});
  await card(f).getByText(text(language,'需重做','Needs another attempt'),{exact:true}).waitFor();check(true,'review stays expanded after return '+label);
  await f.switchRole();await card(f).getByText(/Practise seven times eight again/).first().waitFor();await card(f).getByRole('button',{name:text(language,'重新申请确认','Request confirmation again'),exact:true}).click();await card(f).getByText(text(language,'待老师确认','Awaiting teacher'),{exact:true}).waitFor();
  await f.switchRole();await card(f).getByRole('button',{name:text(language,'确认完成','Confirm completion'),exact:true}).click();await card(f).getByText(text(language,'老师已确认','Confirmed by teacher'),{exact:true}).waitFor();
  check(f.tasks['class-a'][0].studentState.history.length===4,'request return resubmit approve retain history '+label);
  check(await card(f).getByText(text(language,'此前自行完成','Previously self-completed'),{exact:true}).count()>=1,'legacy completion labelled explicitly '+label);
  await assertFit(f,'teacher review');if(language==='en')await screenshot(f,'teacher-review-'+width);
  await f.switchRole();await card(f).getByText(text(language,'老师已确认','Confirmed by teacher'),{exact:true}).waitFor();check(await card(f).getByRole('button').count()===0,'confirmed task has no student complete button '+label);await assertFit(f,'confirmed student');await f.close();
  const teacher=await openFixture({width,language,role:'teacher'});await openForm(teacher);await assertFit(teacher,'teacher form');await publish(teacher);await card(teacher,'created-task-1').waitFor();check(posts(teacher).filter(p=>p.body.action==='create').length===1,'teacher creates no-file activity '+label);await card(teacher).getByRole('button',{name:text(language,'关闭任务','Close task'),exact:true}).click();await card(teacher).getByText(text(language,'已关闭','Closed'),{exact:true}).waitFor();await assertFit(teacher,'teacher form');await teacher.close();
 }
 for(const width of [320,390,1280])for(const language of ['en','zh'])for(const role of ['student','teacher','admin']){
  const theme=language==='zh'?'dark':'light',integration=await openFixture({width,language,role,theme,view:'classrooms'}),tabs=integration.page.getByRole('tablist');
  if(role==='admin')await integration.page.locator('.classroom-chips button').first().click();
  const expectedSections=role==='student'?6:role==='teacher'?7:3;
  await tabs.waitFor();check(await tabs.getByRole('tab').count()===expectedSections,'horizontal class tabs retain all permitted sections ('+role+'/'+width+'/'+language+')');
  if(role!=='admin')check(await tabs.getByRole('tab',{name:text(language,'功课','Homework'),exact:true}).count()===1,'homework remains independently reachable');
  const taskTab=tabs.getByRole('tab',{name:text(language,'任务','Tasks'),exact:true});await taskTab.click();
  check(await taskTab.getAttribute('aria-selected')==='true'&&await taskTab.getAttribute('tabindex')==='0','Tasks tab retains accessible selected state');
  await integration.page.getByRole('tabpanel').getByTestId('classroom-tasks').waitFor();await integration.page.locator('.classroom-task-list[aria-busy=false]').waitFor();
  await assertFit(integration,'integrated classroom Tasks '+role+'/'+theme);await screenshot(integration,'classroom-'+role+'-'+width+'-'+theme);
  await taskTab.press('Home');check(await tabs.getByRole('tab').first().getAttribute('aria-selected')==='true','classroom tabs retain Home-key navigation');await tabs.getByRole('tab').first().press('End');check(await tabs.getByRole('tab').last().getAttribute('aria-selected')==='true','classroom tabs retain End-key navigation');
  check(posts(integration).length===0,'opening and switching classroom sections never changes homework or records');await integration.close();
 }
 const lost=await openFixture({role:'teacher',scenario:'lost-create-response'});await openForm(lost,'Once-only task');await publish(lost);await lost.page.locator('.classroom-task-action-error').waitFor();await publish(lost);await card(lost,'created-task-1').waitFor();check(posts(lost).length===2&&posts(lost)[0].body.operationId===posts(lost)[1].body.operationId,'lost create retry uses same operation');check(lost.tasks['class-a'].filter(t=>t.title==='Once-only task').length===1,'lost create never duplicates');await lost.close();
 const failed=await openFixture({scenario:'complete-failure'});await complete(failed);await failed.page.locator('.classroom-task-action-error').waitFor();check(await card(failed).getByRole('button',{name:'Request teacher confirmation',exact:true}).isEnabled(),'failed request remains retryable');await complete(failed);await card(failed).getByText('Awaiting teacher',{exact:true}).waitFor();check(posts(failed)[0].body.operationId===posts(failed)[1].body.operationId,'request retry retains operation identity');await failed.close();
 const refresh=await openFixture({scenario:'refresh-failure'});await complete(refresh);await refresh.page.locator('.classroom-task-load-error').waitFor();check(await refresh.page.locator('.classroom-task-success').innerText().then(x=>x.includes('Waiting for teacher')),'confirmed request survives failed refresh');check(await card(refresh).getByRole('button').count()===0,'failed refresh cannot duplicate confirmed request');await reloadTasks(refresh);await card(refresh).getByText('Awaiting teacher',{exact:true}).waitFor();check(posts(refresh).length===1,'reload after confirmed request is readonly');check(await refresh.page.locator('.classroom-task-success').count()===0,'ordinary refresh clears obsolete request confirmation');await refresh.close();
 for(const options of [{role:'student',scenario:'read-only'},{role:'teacher',scenario:'read-only'},{role:'student',archived:true},{role:'teacher',archived:true},{role:'admin',grants:'denied'},{role:'student',scenario:'overgrant'}]){const f=await openFixture(options);check(await f.page.getByRole('button',{name:'New task',exact:true}).count()===0,'restricted role has no create action');if(options.scenario!=='overgrant')check(await card(f).getByRole('button').count()===0,'readonly task has no writes');else check(await f.page.getByRole('button',{name:'Close task',exact:true}).count()===0,'student cannot gain staff action from overbroad API');await f.close();}
 const pagination=await openFixture({scenario:'pagination'});await pagination.page.getByRole('button',{name:'Load more',exact:true}).click();await card(pagination,'task-next').waitFor();check(await pagination.page.locator('article[data-task-id]').count()===2,'pagination deduplicates overlap');await pagination.close();
 const revoked=await openFixture({role:'teacher'});revoked.controls.failReads=1;revoked.controls.readFailureStatus=403;await revoked.page.getByRole('button',{name:'Refresh',exact:true}).click();await revoked.page.locator('.classroom-task-load-error').waitFor();check(await revoked.page.locator('article[data-task-id]').count()===0,'revoked permission clears old records');await revoked.close();
 for(const scenario of ['held-read','held-write']){const f=await openFixture({scenario,wait:scenario!=='held-read'});if(scenario==='held-write'){await complete(f);await eventually(()=>posts(f).length===1,'write not started');}else await eventually(()=>f.api.length>0,'read not started');await f.page.getByTestId('fixture-switch-class').click();await card(f,'task-b').waitFor();f.releaseRead();f.releaseWrite();await settleUi(f);check(await card(f).count()===0&&await card(f,'task-b').count()===1,'late '+scenario+' cannot replace new class');await f.close();}
 for(const width of [320,390,1280])for(const language of ['en','zh']){const f=await openFixture({width,language,view:'classrooms'}),tabs=f.page.getByRole('tablist');await tabs.waitFor();check(await tabs.getByRole('tab',{name:text(language,'功课','Homework'),exact:true}).count()===1,'Homework remains separate');await tabs.getByRole('tab',{name:text(language,'任务','Tasks'),exact:true}).click();await f.page.getByRole('tabpanel').getByTestId('classroom-tasks').waitFor();await f.page.locator('.classroom-task-list[aria-busy=false]').waitFor();await assertFit(f,'classroom Tasks');check(posts(f).length===0,'viewing tasks never writes Homework');await f.close();}
 for(const [width,language] of [[320,'en'],[390,'zh'],[1280,'en']]){
  const f=await openFixture({width,language,role:'teacher'}),label=width+'/'+language;
  await openForm(f,'Self-reported fictional practice');
  check(await f.page.getByRole('radio',{name:text(language,'学生提交后由老师确认','Teacher confirms after the student submits'),exact:true}).isChecked(),'creation defaults to teacher confirmation '+label);
  await f.page.getByRole('radio',{name:text(language,'学生自行标记完成','Students mark complete themselves'),exact:true}).check();
  await publish(f);await card(f,'created-task-1').waitFor();
  check(posts(f).find(p=>p.body.action==='create').body.requiresReview===false,'creation sends the selected completion mode '+label);
  await f.switchRole();await card(f,'created-task-1').getByRole('button',{name:text(language,'标记完成','Mark complete'),exact:true}).click();
  await card(f,'created-task-1').locator('[data-status=self_completed]').waitFor();
  check(await card(f,'created-task-1').getByRole('button').count()===0,'self-completed student task has no repeat action '+label);
  check(!(await f.page.locator('.classroom-task-success').innerText()).includes(language==='zh'?'等待':'Waiting'),'self-completion success does not claim pending review '+label);
  check(posts(f).find(p=>p.body.action==='submit').body.action==='submit','self-completion still uses server-authoritative submit '+label);
  await f.switchRole();const selfCard=card(f,'created-task-1');await selfCard.locator('.classroom-task-progress > summary').click();
  check((await selfCard.locator('.classroom-task-progress > summary').innerText()).includes('1 / 2'),'teacher sees self-completion total '+label);
  check(await selfCard.getByRole('button',{name:text(language,'确认完成','Confirm completion'),exact:true}).count()===0,'self-completion has no teacher approval action '+label);
  await selfCard.getByRole('button',{name:text(language,'删除任务','Delete task'),exact:true}).click();
  let dialog=f.page.getByRole('dialog');await dialog.locator('dl').waitFor();
  check((await dialog.innerText()).includes(text(language,'已离班或停用','former and inactive')),'deletion impact explicitly includes former students '+label);
  check(await dialog.locator('dd').allTextContents().then(values=>values.join(',')==='4,4,2,2,2'),'deletion shows all historical impact counts '+label);
  check(posts(f).filter(p=>p.body.action==='delete').length===0,'preview alone never deletes '+label);
  await dialog.locator('[data-pinned-close]').click();await dialog.waitFor({state:'hidden'});
  check(await selfCard.count()===1,'closing preview preserves task '+label);
  await selfCard.getByRole('button',{name:text(language,'删除任务','Delete task'),exact:true}).click();dialog=f.page.getByRole('dialog');await dialog.locator('dl').waitFor();
  const fit=await dialog.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1;});check(fit,'deletion confirmation fits viewport '+label);
  await screenshot(f,'delete-task-preview-'+width+'-'+language);
  f.controls.holdWrite=true;await dialog.getByRole('button',{name:text(language,'确认删除任务','Confirm task deletion'),exact:true}).click();
  await eventually(()=>posts(f).some(p=>p.body.action==='delete'),'deletion did not start');
  check(await dialog.locator('[data-pinned-close]').isVisible()&&await dialog.locator('[data-pinned-close]').isDisabled(),'close remains visible and disabled while delete is pending '+label);
  await f.page.keyboard.press('Escape');check(await dialog.isVisible(),'pending deletion cannot be dismissed with Escape '+label);
  f.releaseWrite();await dialog.waitFor({state:'hidden'});await selfCard.waitFor({state:'detached'});
  check(posts(f).filter(p=>p.body.action==='delete').length===1,'explicit confirmation issues one deletion '+label);
  check((await f.page.locator('.classroom-task-success').innerText()).includes(text(language,'历史完成记录已保留','Completion history is retained')),'deletion success communicates retained audit history '+label);
  await f.close();
 }
 for(const scenario of ['stale-delete','lost-delete']){
  const f=await openFixture({role:'teacher'});f.controls.deleteConflictOnce=scenario==='stale-delete';f.controls.loseDeleteOnce=scenario==='lost-delete';
  await card(f).getByRole('button',{name:'Delete task',exact:true}).click();const dialog=f.page.getByRole('dialog');await dialog.locator('dl').waitFor();
  await dialog.getByRole('button',{name:'Confirm task deletion',exact:true}).click();await dialog.getByRole('alert').waitFor();
  if(scenario==='stale-delete'){
   check(await dialog.getByRole('button',{name:'Confirm task deletion',exact:true}).isDisabled(),'stale impact disables deletion until a new preview');
   await dialog.getByRole('button',{name:'Preview again',exact:true}).click();await dialog.locator('dl').waitFor();
  }else check(await dialog.getByRole('button',{name:'Confirm task deletion',exact:true}).isEnabled(),'unknown deletion result retains safe retry');
  await dialog.getByRole('button',{name:'Confirm task deletion',exact:true}).click();await dialog.waitFor({state:'hidden'});await card(f).waitFor({state:'detached'});
  const attempts=posts(f).filter(p=>p.body.action==='delete');
  check(attempts.length===2&&(scenario==='lost-delete'?attempts[0].body.operationId===attempts[1].body.operationId:attempts[0].body.operationId!==attempts[1].body.operationId),scenario+' retry has the appropriate operation identity');
  check(f.operations.size===1,scenario+' commits only one actual deletion');await f.close();
 }
 const previewDenied=await openFixture({role:'teacher'});previewDenied.controls.previewDenied=true;
 await card(previewDenied).getByRole('button',{name:'Delete task',exact:true}).click();await previewDenied.page.locator('.classroom-task-load-error').waitFor();await previewDenied.page.getByRole('dialog').waitFor({state:'detached'});
 check(await previewDenied.page.getByRole('dialog').count()===0&&await card(previewDenied).count()===0,'denied deletion preview clears both private dialog and old task list');await previewDenied.close();
 console.log(JSON.stringify({suite:'classroom-tasks-ui',checks,screenshots,widths:[320,390,1280],languages:['en','zh'],fictionalApis:true,productionWrites:0}));
}finally{
 for(const fixture of activeFixtures){fixture.releaseComplete();fixture.releaseRead();fixture.releaseWrite();await fixture.context.close().catch(()=>{});}
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});
}
