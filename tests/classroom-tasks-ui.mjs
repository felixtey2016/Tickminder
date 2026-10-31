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
const params=new URLSearchParams(location.search),language=params.get('lang')==='zh'?'zh':'en',initialRole=params.get('role')||'student',view=params.get('view')||'tasks';
setLanguage(language);
const learning={materials:[],homework:[],submissions:[],studyBlocks:[],eligible:[],limits:{pdfMaxBytes:10485760}};
const classes=['a','b'].map((suffix,index)=>({id:'class-'+suffix,title:'Fictional class '+suffix.toUpperCase(),description:null,subject:'Mathematics',syllabusId:'fixture',subjectId:'math',grade:'Year 1',teacherName:'Fictional Teacher',termId:null,archived:params.get('archived')==='1',createdAt:'2026-10-30T03:00:00.000Z',updatedAt:'2026-10-30T03:00:00.000Z',announcements:[],members:index===0?['Fictional Student A','Fictional Student B']:['Fictional Student C']}));
function App(){
 const [classId,setClassId]=useState('class-a'),[role,setRole]=useState(initialRole);
 const classroom=classes.find(item=>item.id===classId);
 const denied=params.get('grants')==='denied',account=role==='admin'?{role,adminPermissions:{enforced:true,privileged:false,grants:denied?['classrooms.view','announcements.view','tasks.view']:['classrooms.view','announcements.view','tasks.view','tasks.create','tasks.archive']}}:{role};
 const content=view==='classrooms'?<ClassroomsPage role={role} classes={classes} terms={[]} learning={learning} learningReady teacherName='Fictional Teacher' teachers={['Fictional Teacher']} plans={[{student:'Fictional Student A',subject:'Mathematics',teacherName:'Fictional Teacher',active:true}]} mutate={async()=>({ok:true})} learningMutate={async()=>true} busy={false} onCalendar={()=>{}}/>:<ClassroomTasks classroom={classroom} role={role}/>;
 return <AdminPermissionContext.Provider value={account}><div className='app-shell'><div className='app-body'><main className='workspace workspace-compact'><div className='fixture-controls'><button data-testid='fixture-switch-class' onClick={()=>setClassId(value=>value==='class-a'?'class-b':'class-a')}>Switch fictional class</button><button data-testid='fixture-switch-role' onClick={()=>setRole(value=>value==='student'?'teacher':'student')}>Switch fictional role</button></div>{content}</main></div></div></AdminPermissionContext.Provider>;
}
createRoot(document.getElementById('root')).render(<App/>);`;

function task(id,title){return {id,title,description:'Practise this fictional activity without uploading a file.',revision:1,archived:false,createdAt,completedAt:null};}
async function openFixture({width=390,language='en',role='student',view='tasks',scenario='',archived=false,grants='allowed',wait=true}={}){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();
 const api=[],external=[],errors=[],unexpected=[],routeErrors=[],operations=new Map(),gates=[];
 const tasks={
  'class-a':[task('task-a','Recite the 2–9 times tables')],
  'class-b':[task('task-b','Read a fictional poem')]
 };
 if(scenario==='pagination')tasks['class-a'].push(task('task-next','Read two pages'));
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
  return {classroomId,readOnly,canCreate:scenario==='overgrant'||currentRole!=='student',canArchive:scenario==='overgrant'||currentRole!=='student',canComplete:currentRole==='student',tasks:rows.map(item=>{
   const {completedAt:ownTime,...rest}=item;
   return currentRole==='student'?{...rest,completedAt:ownTime}:{...rest,progress:{completed:ownTime?2:1,total:2,students:[{studentName:'Fictional Student A',completedAt:ownTime},{studentName:'Fictional Student B',completedAt}]}};
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
   if(!body||!['create','complete','archive'].includes(body.action)||typeof body.operationId!=='string'||!body.operationId){routeErrors.push('Invalid operation payload');return fulfill({error:'Invalid fictional operation'},400);}
   if(['studentName','accountId','student','groupId'].some(key=>Object.hasOwn(body,key))){routeErrors.push('Client supplied a completion identity');return fulfill({error:'No client-selected student'},400);}
   if(controls.holdComplete&&body.action==='complete')await completeGate.promise;
   if(controls.holdWrite)await writeGate.promise;
   if(controls.failWriteOnce){controls.failWriteOnce=false;return fulfill({error:'Fictional write failure'},503);}
   const previous=operations.get(body.operationId);
   if(previous){
    if(previous.signature!==JSON.stringify(body)){routeErrors.push('Operation ID reused for different contents');return fulfill({error:'Fictional operation conflict'},409);}
    return fulfill({ok:true,id:previous.id,replayed:true});
   }
   let id=body.id;
   if(body.action==='create'){
    id='created-task-'+(++createSequence);
    tasks[body.classroomId].unshift({...task(id,body.title),description:body.description});
   }else{
    const item=tasks[body.classroomId]?.find(row=>row.id===id);
    if(!item)return fulfill({error:'Fictional task not found'},404);
    if(body.action==='complete')item.completedAt=completedAt;else item.archived=true;
   }
   operations.set(body.operationId,{signature:JSON.stringify(body),id});
   if(controls.postRefreshFailure){controls.postRefreshFailure=false;controls.failReads++;}
   if(body.action==='create'&&controls.loseCreateOnce){controls.loseCreateOnce=false;await route.abort('failed');return;}
   return await fulfill({ok:true,id,replayed:false});
  }catch(error){
   if(!closed&&!request.failure()){routeErrors.push(error.message);try{await route.abort('failed');}catch{}}
  }finally{
   if(method==='POST'&&controls.holdWrite)controls.heldWriteFinished=true;
  }
 });
 await page.goto(origin+'/?'+new URLSearchParams({view,lang:language,role,scenario,archived:archived?'1':'0',grants}));
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
 await f.page.getByLabel(text(f.language,'任务说明（可选）','Instructions (optional)'),{exact:true}).fill('Practise aloud. No attachment is required.');
}
async function publish(f){await f.page.getByRole('button',{name:text(f.language,'发布任务','Publish task'),exact:true}).click();}
async function complete(f,id='task-a'){await card(f,id).getByRole('button',{name:text(f.language,'完成任务','Complete'),exact:true}).click();}
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
  const label=width+'/'+language;
  const student=await openFixture({width,language,scenario:'held-complete'});
  check((await card(student).locator('.classroom-task-badge').innerText())===text(language,'未完成','Not completed'),'student starts with server-reported incomplete status ('+label+')');
  check(await student.page.locator('.classroom-task-progress').count()===0&&!await student.page.getByText('Fictional Student B',{exact:true}).count(),'student UI has no classmate completion roster ('+label+')');
  await complete(student);await eventually(()=>posts(student).length===1,'completion POST did not start');
  check((await card(student).locator('.classroom-task-badge').innerText())===text(language,'未完成','Not completed')&&await card(student).locator('time').count()===0,'pending POST never claims successful completion ('+label+')');
  check(await card(student).getByRole('button').isDisabled(),'pending Complete disables repeated interaction ('+label+')');
  await card(student).getByRole('button').evaluate(node=>{node.click();node.click();});
  check(posts(student).length===1,'double clicks issue one completion operation ('+label+')');
  student.releaseComplete();await card(student).locator('time').waitFor();
  check(await card(student).locator('time').getAttribute('datetime')===completedAt&&await card(student).getByRole('button').isDisabled(),'completed task uses the server timestamp and cannot be submitted again ('+label+')');
  check(Object.keys(posts(student)[0].body).sort().join(',')==='action,classroomId,id,operationId','Complete supplies no student, account or group identity ('+label+')');
  await student.page.reload();await card(student).locator('time').waitFor();
  check(posts(student).length===1&&await card(student).locator('time').getAttribute('datetime')===completedAt,'reloading retains server completion without another write ('+label+')');
  await assertFit(student,'student Task card');if(language==='en')await screenshot(student,'student-'+width);await student.close();

  const teacher=await openFixture({width,language,role:'teacher'});
  const progress=card(teacher).locator('details.classroom-task-progress');await progress.locator('summary').click();
  check(await progress.locator('li').count()===2&&await progress.locator('li').nth(0).innerText().then(value=>value.includes(text(language,'未完成','Not completed')))&&await progress.locator('li').nth(1).locator('time').getAttribute('datetime')===completedAt,'teacher sees each fictional student and actual completion ('+label+')');
  await openForm(teacher);await assertFit(teacher,'teacher create form');await publish(teacher);
  await card(teacher,'created-task-1').waitFor();await teacher.page.locator('.classroom-task-form').waitFor({state:'hidden'});
  check(await card(teacher,'created-task-1').locator('h3').innerText()==='Memorise a fictional poem'&&posts(teacher).filter(request=>request.body.action==='create').length===1,'teacher publishes a standalone activity without a PDF ('+label+')');
  await card(teacher).getByRole('button',{name:text(language,'关闭任务','Close task'),exact:true}).click();
  await teacher.page.waitForFunction(({id,label})=>document.querySelector('article[data-task-id="'+id+'"] .classroom-task-badge')?.textContent===label,{id:'task-a',label:text(language,'已关闭','Closed')});
  check(await card(teacher).locator('.classroom-task-progress li').count()===2&&await card(teacher).getByRole('button').count()===0,'closing a task retains its student completion history ('+label+')');
  await assertFit(teacher,'teacher Task card');if(language==='en')await screenshot(teacher,'teacher-'+width);await teacher.close();
 }

 const lost=await openFixture({role:'teacher',scenario:'lost-create-response'});await openForm(lost,'A once-only fictional activity');await publish(lost);await lost.page.locator('.classroom-task-action-error').waitFor();
 check(await lost.page.getByLabel('Task title',{exact:true}).inputValue()==='A once-only fictional activity'&&lost.tasks['class-a'].filter(item=>item.title==='A once-only fictional activity').length===1,'lost create response keeps the draft after the server saved it');
 await publish(lost);await card(lost,'created-task-1').waitFor();
 check(posts(lost).length===2&&posts(lost)[0].body.operationId===posts(lost)[1].body.operationId&&lost.tasks['class-a'].filter(item=>item.title==='A once-only fictional activity').length===1,'retry after a lost response reuses the operation ID and creates one task');await lost.close();

 const edited=await openFixture({role:'teacher',scenario:'complete-failure'});await openForm(edited,'Original fictional draft');await publish(edited);await edited.page.locator('.classroom-task-action-error').waitFor();
 await edited.page.getByLabel('Task title',{exact:true}).fill('Changed fictional draft');await publish(edited);await card(edited,'created-task-1').waitFor();
 check(posts(edited)[0].body.operationId!==posts(edited)[1].body.operationId&&edited.tasks['class-a'][0].title==='Changed fictional draft','editing a failed draft creates a new operation identity');await edited.close();

 const failed=await openFixture({scenario:'complete-failure'});await complete(failed);await failed.page.locator('.classroom-task-action-error').waitFor();
 check(await card(failed).locator('.classroom-task-badge').innerText()==='Not completed'&&await card(failed).locator('time').count()===0&&await card(failed).getByRole('button',{name:'Complete',exact:true}).isEnabled(),'failed Complete keeps the task incomplete and retryable');
 await complete(failed);await card(failed).locator('time').waitFor();
 check(posts(failed).length===2&&posts(failed)[0].body.operationId===posts(failed)[1].body.operationId,'failed Complete retries reuse the same operation identity');await failed.close();

 const createdRefresh=await openFixture({role:'teacher',scenario:'refresh-failure'});await openForm(createdRefresh);await publish(createdRefresh);await createdRefresh.page.locator('.classroom-task-load-error').waitFor();
 check(await createdRefresh.page.locator('.classroom-task-form').count()===0&&await createdRefresh.page.locator('.classroom-task-success').innerText().then(value=>value.includes('Task published.')),'create success followed by refresh failure closes the form and confirms the saved task');
 await reloadTasks(createdRefresh);await card(createdRefresh,'created-task-1').waitFor();
 check(posts(createdRefresh).length===1&&createdRefresh.tasks['class-a'].filter(item=>item.id.startsWith('created-task')).length===1,'reload after confirmed create performs no duplicate create');await createdRefresh.close();

 const completeRefresh=await openFixture({scenario:'refresh-failure'});await complete(completeRefresh);await completeRefresh.page.locator('.classroom-task-load-error').waitFor();
 check(await card(completeRefresh).locator('.classroom-task-badge').innerText()==='Completed'&&await card(completeRefresh).locator('time').count()===0&&await card(completeRefresh).getByRole('button').isDisabled(),'confirmed completion survives refresh failure without inventing a completion time');
 await reloadTasks(completeRefresh);await card(completeRefresh).locator('time').waitFor();
 check(posts(completeRefresh).length===1&&await card(completeRefresh).locator('time').getAttribute('datetime')===completedAt,'completion reload fetches actual server time without another POST');await completeRefresh.close();

 for(const options of [{role:'student',scenario:'read-only'},{role:'teacher',scenario:'read-only'},{role:'student',archived:true},{role:'teacher',archived:true},{role:'admin',grants:'denied'},{role:'student',scenario:'overgrant'}]){
  const f=await openFixture(options);
  if(options.scenario!=='overgrant')check(await f.page.getByRole('button',{name:'New task',exact:true}).count()===0&&await card(f).getByRole('button').count()===0,'read-only classroom/server or denied admin grant has no Task write controls ('+JSON.stringify(options)+')');
  else check(await f.page.getByRole('button',{name:'New task',exact:true}).count()===0&&await f.page.getByRole('button',{name:'Close task',exact:true}).count()===0,'student role cannot acquire staff controls from overbroad API capabilities');
  check(posts(f).length===0,'viewing restricted task records performs no write');await assertFit(f,'restricted Task view');await f.close();
 }

 const pagination=await openFixture({scenario:'pagination'});await pagination.page.getByRole('button',{name:'Load more',exact:true}).click();await card(pagination,'task-next').waitFor();
 check(await pagination.page.locator('article[data-task-id]').count()===2&&await card(pagination).count()===1&&pagination.api.some(request=>request.method==='GET'&&new URLSearchParams(request.query).get('cursor')==='page-2'),'pagination appends tasks, uses the server cursor and deduplicates overlapping pages');await pagination.close();

 const initialFailure=await openFixture({scenario:'initial-read-failure',wait:false});await initialFailure.page.locator('.classroom-task-load-error').waitFor();
 check(await initialFailure.page.locator('article[data-task-id]').count()===0&&await initialFailure.page.getByText('No class tasks yet',{exact:true}).count()===0,'an initial read error never claims that the classroom has no tasks');
 await initialFailure.page.getByRole('button',{name:'Retry',exact:true}).click();await card(initialFailure).waitFor();check(posts(initialFailure).length===0,'initial read retry fetches tasks without writing');await initialFailure.close();

 const revoked=await openFixture({role:'teacher'});revoked.controls.failReads=1;revoked.controls.readFailureStatus=403;await revoked.page.getByRole('button',{name:'Refresh',exact:true}).click();await revoked.page.locator('.classroom-task-load-error').waitFor();
 check(await revoked.page.locator('article[data-task-id]').count()===0&&await revoked.page.getByRole('button',{name:'New task',exact:true}).count()===0,'a permission-revoked refresh hides the old task records and write controls');await revoked.close();

 const stale=await openFixture({scenario:'held-read',wait:false});await eventually(()=>stale.api.some(request=>request.method==='GET'&&request.query.includes('class-a')),'initial held request did not begin');
 await stale.page.getByTestId('fixture-switch-class').click();await card(stale,'task-b').waitFor();stale.releaseRead();
 await eventually(()=>stale.controls.heldReadFinished,'old-class read was not released');await settleUi(stale);
 check(await card(stale).count()===0&&await card(stale,'task-b').count()===1,'late old-class reads cannot replace the selected classroom tasks');await stale.close();

 const staleWrite=await openFixture({scenario:'held-write'});await complete(staleWrite);await eventually(()=>posts(staleWrite).length===1,'held write did not start');
 await staleWrite.page.getByTestId('fixture-switch-class').click();await card(staleWrite,'task-b').waitFor();staleWrite.releaseWrite();
 await eventually(()=>staleWrite.controls.heldWriteFinished,'old-class write was not released');await settleUi(staleWrite);
 check(await card(staleWrite).count()===0&&await card(staleWrite,'task-b').locator('.classroom-task-badge').innerText()==='Not completed'&&await staleWrite.page.locator('.classroom-task-success').count()===0,'a late old-class write cannot confirm completion in a different classroom');await staleWrite.close();

 const changedRole=await openFixture({scenario:'held-write'});await complete(changedRole);await eventually(()=>posts(changedRole).length===1,'role-change write did not start');await changedRole.switchRole();
 await changedRole.page.getByRole('button',{name:'New task',exact:true}).waitFor();changedRole.releaseWrite();await eventually(()=>changedRole.controls.heldWriteFinished,'previous-role write was not released');await settleUi(changedRole);
 check(await card(changedRole).getByRole('button',{name:'Complete',exact:true}).count()===0&&await changedRole.page.locator('.classroom-task-success').count()===0,'role changes discard the previous role completion confirmation');await changedRole.close();

 for(const width of [320,390,1280])for(const language of ['en','zh']){
  const integration=await openFixture({width,language,view:'classrooms'}),tabs=integration.page.getByRole('tablist');
  await tabs.waitFor();const taskTab=tabs.getByRole('tab',{name:text(language,'任务','Tasks'),exact:true});
  check(await tabs.getByRole('tab',{name:text(language,'功课','Homework'),exact:true}).count()===1,'existing PDF homework remains a separate classroom tab ('+width+'/'+language+')');
  await taskTab.click();await integration.page.getByRole('tabpanel').getByTestId('classroom-tasks').waitFor();await integration.page.locator('.classroom-task-list[aria-busy=false]').waitFor();
  check(await taskTab.getAttribute('aria-selected')==='true'&&await taskTab.getAttribute('tabindex')==='0','Tasks opens through the real classroom tab with accessible selected state ('+width+'/'+language+')');
  await assertFit(integration,'integrated classroom Tasks');
  await taskTab.press('Home');check(await tabs.getByRole('tab').first().getAttribute('aria-selected')==='true','classroom tabs retain Home-key navigation');
  await tabs.getByRole('tab').first().press('End');check(await tabs.getByRole('tab').last().getAttribute('aria-selected')==='true','classroom tabs retain End-key navigation');
  check(posts(integration).length===0,'opening and switching Task tabs never changes homework or records');await integration.close();
 }
 console.log(JSON.stringify({suite:'classroom-tasks-ui',checks,screenshots,widths:[320,390,1280],languages:['en','zh'],fictionalApis:true,productionWrites:0}));
}finally{
 for(const fixture of activeFixtures){fixture.releaseComplete();fixture.releaseRead();fixture.releaseWrite();await fixture.context.close().catch(()=>{});}
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(temporary,{recursive:true,force:true});
}
