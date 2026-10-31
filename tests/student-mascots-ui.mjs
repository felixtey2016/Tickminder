import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

// Exercise the actual student components against fictional, intercepted APIs.
// No production account, backend or Google service is used by this fixture.
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {build}=require('esbuild'),postcss=require('postcss'),tailwindModule=require('@tailwindcss/postcss'),tailwind=tailwindModule.default||tailwindModule;
const playwrightModule=process.env.PLAYWRIGHT_MODULE_PATH;
const {chromium}=await import(playwrightModule?(playwrightModule.startsWith('file:')?playwrightModule:pathToFileURL(path.resolve(playwrightModule)).href):'playwright');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-student-mascots-'));
const poses=['hello','reading','thinking','encourage','celebrate','ready','search','waiting','rest','surprise','retry','sleepy'];
let checks=0,screenshots=0,browser,server,origin;
const observed=new Set(),check=(condition,label)=>{assert(condition,label);checks++;console.log('PASS '+label);};

const entry=`import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {HomeDashboard} from './app/home-dashboard';
import {StudentCalendar} from './app/student-calendar';
import {StudentLearning} from './app/learning-portal';
import {QuizPracticeStart} from './app/quiz-practice-panel';
import QuizPracticePanel from './app/quiz-practice-panel';
import QuizPracticePlayer from './components/quiz-practice-player';
import {NotificationsProvider,NotificationCentre} from './app/notifications';
import {PageState} from './components/page-state';
import {AdminPermissionContext} from './app/admin-permission-context';
import {setLanguage,t} from './lib/i18n';
import './app/ui-refresh.css';
import './app/quiz.css';
import './app/quiz-layout.css';
import './app/workspace-startup.css';
import './app/mascot-experience.css';
const params=new URLSearchParams(location.search),language=params.get('lang')==='zh'?'zh':'en',view=params.get('view')||'home',scenario=params.get('scenario')||'',role=params.get('role')||'student';
setLanguage(language);
window.fixtureEvents={navigations:[],study:[],started:[],retries:0,closed:0};
const learning={materials:[],homework:[],submissions:[],studyBlocks:[],eligible:[],limits:{pdfMaxBytes:10485760}};
if(scenario==='content')learning.materials=[{id:'material-a',title:'Fictional reading worksheet',description:'A fictional class PDF',fileId:'file-a',filename:'worksheet.pdf',subject:'Mathematics',canEdit:false}];
const lesson={id:'lesson-a',subject:'Fictional Mathematics',student:'Fictional Student',teacherName:'Fictional Teacher',plannedStart:'2026-10-31T02:00:00.000Z',plannedEnd:'2026-10-31T03:00:00.000Z',actualStart:null,actualEnd:null,status:'scheduled',sessionType:'individual'};
const navigate=destination=>window.fixtureEvents.navigations.push(destination);
function App(){
 const [closed,setClosed]=useState(false);
 let content;
 if(view==='home')content=<HomeDashboard role={role} name='Fictional Student' taskCounts={{todayLessons:0,todayPendingAttendance:0,attention:0}} learning={learning} onNavigate={navigate}/>;
 else if(view==='calendar')content=<StudentCalendar lessons={scenario==='content'?[lesson]:[]} proposals={[]} studyBlocks={[]} role={role} selectedDate='2026-10-31' loading={scenario==='loading'} onAddStudy={day=>window.fixtureEvents.study.push(day)} onEditStudy={()=>{}}/>;
 else if(view==='materials')content=<StudentLearning learning={learning} mutate={async()=>true} busy={false} onPlan={()=>{}} view='materials' inClassroom={scenario==='classroom'} onCalendar={()=>navigate('calendar')}/>;
 else if(view==='quiz-start')content=closed?<p data-testid='opened-attempt'>Attempt opened</p>:<QuizPracticeStart source={{id:'quiz-a',title:'Fictional practice',bank:true}} onClose={()=>{window.fixtureEvents.closed++;setClosed(true);}} onOpen={id=>{window.fixtureEvents.started.push(id);setClosed(true);}}/>;
 else if(view==='quiz-panel')content=<QuizPracticePanel mode='assigned' role={role} language={language} reload={0} onOpen={()=>{}} onStart={()=>{}}/>;
 else if(view==='quiz-player')content=closed?<p>Results closed</p>:<QuizPracticePlayer attemptId='attempt-a' language={language} onClose={()=>{window.fixtureEvents.closed++;setClosed(true);}} onChanged={()=>{}}/>;
 else if(view==='notifications')content=<NotificationsProvider accountId='fictional-student' groupId='fictional-group' language={language} inboxOpen><NotificationCentre language={language} onOpen={target=>window.fixtureEvents.navigations.push(target)}/></NotificationsProvider>;
 else {const kind=['loading','error','empty','success'].includes(scenario)?scenario:'empty';content=<PageState kind={kind} title={kind==='loading'?'正在加载…':kind==='error'?'页面加载失败':kind==='success'?'提交成功':'没有符合筛选条件的记录'} action={kind==='error'?'重试':undefined} onAction={()=>window.fixtureEvents.retries++}/>;}
 return <AdminPermissionContext.Provider value={{role}}><div className='app-shell'><div className='app-body'><main className='workspace workspace-compact'>{content}</main></div></div></AdminPermissionContext.Provider>;
}
createRoot(document.getElementById('root')).render(<App/>);`;

function attemptFixture(scenario){
 const now=new Date().toISOString(),done=scenario!=='active';
 const question=(id,prompt)=>({id,type:'mcq',prompt:{primary:prompt,en:prompt},imageId:null,extraImageIds:[],options:[{id:id+'-a',text:{primary:'2',en:'2'},imageId:null},{id:id+'-b',text:{primary:'4',en:'4'},imageId:null}],points:1,difficulty:'easy',sourceId:'',chapter:'',level:''});
 const questions=[question('q-one','One plus one?'),question('q-two','Two plus two?')];
 return {id:'attempt-a',quizId:'quiz-a',assignmentId:'assignment-a',versionId:'version-a',title:'Fictional practice',subject:'Mathematics',creator:'Fictional Teacher',studentName:'Fictional Student',accountId:'fictional-student',kind:'practice',immediate:false,revision:1,status:done?'submitted':'in_progress',startedAt:now,deadlineAt:done?null:new Date(Date.now()+3600000).toISOString(),submittedAt:done?now:null,updatedAt:now,submissionReason:done?'student':null,late:false,attemptNumber:1,score:scenario==='hidden'?null:done?1:null,totalScore:2,rawScore:scenario==='hidden'?null:done?1:null,rawTotalScore:2,scoreVisible:done&&scenario!=='hidden',answersVisible:done&&scenario!=='hidden',pendingManual:scenario==='hidden'?1:0,canGrade:false,canAnswer:!done,manualQuestionIds:[],content:{schemaVersion:1,title:'Fictional practice',instructions:'Read each question carefully.',subject:'Mathematics',exam:'',year:null,region:'',paper:'',difficulty:'easy',primaryLanguage:'en',timeLimitSeconds:null,shuffleQuestions:false,shuffleOptions:false,questions},answers:done?{'q-one':{optionId:'q-one-a'},'q-two':{optionId:'q-two-a'}}:{},flaggedQuestionIds:[],checkedQuestionIds:[],results:done&&scenario!=='hidden'?[{questionId:'q-one',status:'correct',points:1,key:{correctOptionId:'q-one-a',accepted:[],unit:'',explanation:'One and one make two.',rubric:''}},{questionId:'q-two',status:'incorrect',points:0,key:{correctOptionId:'q-two-b',accepted:[],unit:'',explanation:'Two and two make four.',rubric:''}}]:[]};
}

async function openFixture(view,{width=390,language='en',scenario='',role='student'}={}){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],api=[],external=[];
 let attempt=attemptFixture(scenario);
 let notification={summary:false,accountId:'fictional-student',groupId:'fictional-group',unreadCount:scenario==='empty'?0:1,configured:false,publicKey:null,schedulerReady:false,lastDispatchAt:null,items:scenario==='empty'?[]:[{id:'notice-a',contentKind:'material',recordId:'material-a',title:'Fictional worksheet',kind:'material_updated',dueAt:'2026-10-31T10:00:00.000Z',readAt:null,subject:'Mathematics',teacherName:'Fictional Teacher',plannedStart:'2026-10-31T10:00:00.000Z',plannedEnd:'2026-10-31T11:00:00.000Z'}]};
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin){external.push(url.origin);await route.abort('blockedbyclient');return;}
  if(!url.pathname.startsWith('/api/')){await route.continue();return;}
  const method=route.request().method(),body=method==='GET'?null:route.request().postDataJSON();api.push({path:url.pathname,method,body});
  const fulfill=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname==='/api/courses')return fulfill({items:[],page:1,pages:1,total:0,pageSize:20,revision:1});
  if(url.pathname==='/api/notifications'){
   if(method==='POST'&&['read','readAll'].includes(body.action)){notification={...notification,unreadCount:0,items:notification.items.map(item=>({...item,readAt:new Date().toISOString()}))};return fulfill({ok:true});}
   if(method!=='GET')return fulfill({error:'Fixture does not enable device notifications'},403);
   return fulfill(notification);
  }
  if(url.pathname==='/api/quiz-practice'){
   if(method==='GET')return url.searchParams.has('attemptId')?fulfill({attempt,serverNow:new Date().toISOString()}):fulfill({assignments:[],attempts:[],hasMore:false,serverNow:new Date().toISOString()});
   if(body.action==='start')return fulfill({attempt:{...attempt,id:'started-attempt',status:'in_progress'}});
   if(body.action==='save'){attempt={...attempt,answers:body.answers,flaggedQuestionIds:body.flaggedQuestionIds||[],revision:attempt.revision+1};return fulfill({attempt,serverNow:new Date().toISOString()});}
   return fulfill({error:'Unexpected practice action in read-only fixture'},400);
  }
  if(method==='GET'&&url.pathname.startsWith('/api/learning/'))return fulfill({versions:[],items:[],history:[],submissions:[]});
  return fulfill({error:'Unexpected fixture API request'},404);
 });
 await page.goto(origin+'/?'+new URLSearchParams({view,lang:language,scenario,role}));
 await page.locator('.workspace').waitFor();
 return {context,page,errors,api,external,close:async()=>{check(errors.length===0,`${view}/${scenario||'default'} has no browser exception (${width}/${language})`);check(external.length===0,`${view} never contacts production or Google`);await context.close();}};
}

async function inspectImages(f,label){
 const images=f.page.locator('img[data-mascot]:visible');
 for(let i=0;i<await images.count();i++){
  const image=images.nth(i);await image.scrollIntoViewIfNeeded();
  await image.evaluate(async node=>{if(!node.complete)await new Promise((resolve,reject)=>{node.addEventListener('load',resolve,{once:true});node.addEventListener('error',reject,{once:true});});});
  const data=await image.evaluate(node=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=512;canvas.getContext('2d').drawImage(node,0,0,512,512);const pixels=canvas.getContext('2d').getImageData(0,0,512,512).data;return {pose:node.dataset.mascot,src:new URL(node.currentSrc).pathname,alt:node.getAttribute('alt'),width:node.naturalWidth,height:node.naturalHeight,corners:[pixels[3],pixels[(511*4)+3],pixels[(511*512*4)+3],pixels[pixels.length-1]],hasSubject:pixels.some((value,index)=>index%4===3&&value>0),displayWidth:node.getBoundingClientRect().width};});
  check(poses.includes(data.pose)&&data.src==='/mascots/'+data.pose+'.png',`${label} uses the intended uploaded expression ${data.pose}`);
  check(data.width===512&&data.height===512&&data.corners.every(alpha=>alpha===0)&&data.hasSubject,`${data.pose} loads as a complete transparent image`);
  check(data.alt===''&&data.displayWidth>0&&data.displayWidth<=136,`${data.pose} remains decorative and bounded`);
  observed.add(data.pose);
 }
 const layout=await f.page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,dialogs:[...document.querySelectorAll('[role=dialog]')].map(node=>{const r=node.getBoundingClientRect();return{x:r.x,right:r.right,width:r.width};})}));
 check(layout.documentWidth<=layout.width+1&&layout.dialogs.every(r=>r.x>=-1&&r.right<=layout.width+1),`${label} fits its viewport`);
}

async function screenshot(f,name){if(!process.env.MASCOT_SCREENSHOTS)return;fs.mkdirSync(process.env.MASCOT_SCREENSHOTS,{recursive:true});await f.page.screenshot({path:path.join(process.env.MASCOT_SCREENSHOTS,name+'.png'),fullPage:true});screenshots++;}

try{
 await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'student-mascots-fixture.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'esm',jsx:'automatic',outfile:path.join(temporary,'ui.js'),assetNames:'fixture-assets/[name]-[hash]',loader:{'.woff':'file','.woff2':'file','.ttf':'file'},alias:{'@':root},logLevel:'silent'});
 const globals=await postcss([tailwind({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')});
 const css=globals.css+'\n'+fs.readFileSync(path.join(temporary,'ui.css'),'utf8');
 server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://fixture.test').pathname;
  if(pathname==='/ui.css'){res.setHeader('content-type','text/css');res.end(css);return;}
  if(pathname==='/notifications-sw.js'){res.setHeader('content-type','application/javascript');res.end('self.addEventListener("install",()=>self.skipWaiting());');return;}
  if(pathname.startsWith('/mascots/')){const name=path.basename(pathname);if(!poses.some(p=>name===p+'.png')){res.writeHead(404);res.end();return;}res.setHeader('content-type','image/png');res.end(fs.readFileSync(path.join(root,'public/mascots',name)));return;}
  if(pathname==='/ui.js'||pathname.startsWith('/fixture-assets/')){const file=path.join(temporary,pathname.slice(1));if(!file.startsWith(temporary+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('content-type',pathname.endsWith('.js')?'application/javascript':pathname.endsWith('.woff2')?'font/woff2':pathname.endsWith('.woff')?'font/woff':'font/ttf');res.end(fs.readFileSync(file));return;}
  if(pathname!=='/'){res.writeHead(404);res.end();return;}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script type="module" src="/ui.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
 for(const width of [320,390,1280])for(const language of ['en','zh']){
  const label=width+'/'+language;
  const home=await openFixture('home',{width,language});await home.page.locator('[data-mascot=hello]').waitFor();await home.page.waitForFunction(()=>document.querySelector('.home-compact-agenda')?.getAttribute('aria-busy')==='false');
  check(await home.page.locator('.home-compact-intro').innerText().then(text=>text.includes('Fictional Student')),`home retains the student greeting (${label})`);
  await inspectImages(home,'student home '+label);
  check(await home.page.locator('.home-compact-agenda').evaluate(node=>node.getBoundingClientRect().top<innerHeight),`today's agenda remains in the first screen (${label})`);
  await home.page.locator('.home-compact-task').first().click();check((await home.page.evaluate(()=>window.fixtureEvents.navigations)).includes('homework'),`homework shortcut still works (${label})`);
  if(language==='en')await screenshot(home,'home-'+width);await home.close();

  const materials=await openFixture('materials',{width,language,scenario:'content'});await materials.page.locator('[data-mascot=reading]').waitFor();await inspectImages(materials,'student materials '+label);
  await materials.page.locator('[data-record-id=material-a]').click();check(await materials.page.locator('.learning-browser-detail').innerText().then(text=>text.includes('Fictional reading worksheet')),`material selection still opens its detail (${label})`);
  if(language==='en')await screenshot(materials,'materials-'+width);await materials.close();

  const calendar=await openFixture('calendar',{width,language});await calendar.page.locator('[data-mascot=rest]').waitFor();await inspectImages(calendar,'empty student day '+label);
  await calendar.page.locator('.student-day-heading button').click();check((await calendar.page.evaluate(()=>window.fixtureEvents.study))[0]==='2026-10-31',`empty-day learning plan action retains its selected date (${label})`);
  if(language==='en')await screenshot(calendar,'calendar-'+width);await calendar.close();

  const start=await openFixture('quiz-start',{width,language});await start.page.locator('[data-mascot=ready]').waitFor();await inspectImages(start,'practice start '+label);
  const startButton=start.page.getByRole('button',{name:language==='en'?'Start answering':'开始作答',exact:true});check(await startButton.isEnabled(),`practice start action remains enabled (${label})`);
  if(width===390&&language==='en'){await startButton.click();await start.page.getByTestId('opened-attempt').waitFor();check(start.api.filter(r=>r.method==='POST').length===1&&start.api.find(r=>r.method==='POST').body.action==='start',`starting a practice keeps its one explicit operation`);}
  await start.close();

  const panel=await openFixture('quiz-panel',{width,language});await panel.page.locator('[data-mascot=sleepy]').waitFor();await inspectImages(panel,'no assigned practice '+label);
  check(await panel.page.locator('.quiz-empty').innerText().then(text=>text.includes(language==='en'?'No assigned practice yet':'暂无已安排练习')),`empty practice retains truthful absence wording (${label})`);await panel.close();

  const results=await openFixture('quiz-player',{width,language});await results.page.locator('[data-mascot=celebrate]').waitFor();await results.page.locator('[data-mascot=thinking]').waitFor();await inspectImages(results,'completed practice '+label);
  check(await results.page.locator('.quiz-result-summary').innerText().then(text=>text.includes('1 / 2')),`completion keeps the actual partial score (${label})`);
  if(language==='en')await screenshot(results,'completed-practice-'+width);
  await results.page.locator('label.quiz-check input[type=checkbox]').check();await results.page.locator('[data-mascot=encourage]').waitFor();await inspectImages(results,'wrong-answer review '+label);
  check(await results.page.locator('.quiz-player-question').innerText().then(text=>text.includes('Two plus two?')),`wrong-only review still filters to the incorrect question (${label})`);
  check(results.api.every(r=>r.method==='GET'),`review decoration does not save or submit attempts (${label})`);await results.close();
 }

 for(const width of [320,390,1280]){
  const loading=await openFixture('calendar',{width,scenario:'loading'});await loading.page.locator('.student-calendar').waitFor();check(await loading.page.locator('[data-mascot=rest]').count()===0&&await loading.page.locator('.student-day-empty').count()===0,`loading calendar never claims an empty day (${width})`);await inspectImages(loading,'loading calendar '+width);await loading.close();
 }
 const teacher=await openFixture('home',{role:'teacher'});await teacher.page.locator('.home-compact-intro').waitFor();check(await teacher.page.locator('[data-mascot=hello]').count()===0,'student greeting is not added to the teacher dashboard');await teacher.close();
 const emptyMaterials=await openFixture('materials');await emptyMaterials.page.locator('[data-mascot=search]:visible').waitFor();check(await emptyMaterials.page.locator('[data-mascot=search]:visible').count()===1&&await emptyMaterials.page.locator('[data-mascot=reading]:visible').count()===0,'an empty material list has one visible truthful empty-state illustration');await inspectImages(emptyMaterials,'empty materials');await emptyMaterials.close();
 const active=await openFixture('quiz-player',{scenario:'active'});await active.page.locator('.quiz-option-button').first().waitFor();check(await active.page.locator('[data-mascot=celebrate],[data-mascot=thinking],[data-mascot=encourage]').count()===0,'an unfinished quiz never displays completion or result-review mascots');
 const saved=active.page.waitForResponse(response=>response.url().includes('/api/quiz-practice')&&response.request().method()==='POST');await active.page.locator('.quiz-option-button').first().click();await saved;
 check(active.api.some(r=>r.method==='POST'&&r.body.action==='save'&&r.body.answers['q-one']?.optionId==='q-one-a'),'answer selection retains the original autosave payload');check(await active.page.locator('[data-mascot=celebrate]').count()===0,'autosaving one answer does not imply quiz completion');await inspectImages(active,'active quiz');await active.close();
 const hidden=await openFixture('quiz-player',{scenario:'hidden'});await hidden.page.locator('[data-mascot=celebrate]').waitFor();check(await hidden.page.locator('[data-mascot=thinking],[data-mascot=encourage]').count()===0,'unreleased scores and answers do not reveal a result review');check(await hidden.page.locator('.quiz-result-summary').innerText().then(text=>text.includes('Scores have not been released')),'completion decoration retains the unreleased-score notice');await inspectImages(hidden,'unreleased results');await hidden.close();
 const notice=await openFixture('notifications');await notice.page.locator('[data-mascot=surprise]').waitFor();await inspectImages(notice,'unread notification');await notice.page.locator('.notification-list-heading>button').click();await notice.page.locator('[data-mascot=surprise]').waitFor({state:'detached'});check(notice.api.filter(r=>r.method==='POST').every(r=>r.body.action==='readAll'),'the inbox keeps its explicit mark-read action without enabling push');await notice.close();
 const noNotice=await openFixture('notifications',{scenario:'empty'});await noNotice.page.locator('.notification-inbox .empty').waitFor();check(await noNotice.page.locator('[data-mascot=surprise]').count()===0,'an empty inbox does not suggest a new notification');await noNotice.close();
 for(const kind of ['loading','error','empty','success']){
  const state=await openFixture('states',{scenario:kind});await state.page.locator('.page-state').waitFor();await inspectImages(state,'page '+kind);
  if(kind==='loading')check(await state.page.locator('.page-state').getAttribute('aria-busy')==='true','loading retains its accessible busy state');
  if(kind==='error'){check(await state.page.locator('.page-state').getAttribute('role')==='alert','error retains its accessible alert state');await state.page.getByRole('button',{name:'Retry',exact:true}).click();check(await state.page.evaluate(()=>window.fixtureEvents.retries)===1,'retry illustration preserves the real retry callback');}
  await state.close();
 }
 check(poses.every(pose=>observed.has(pose)),'all twelve expressions are visible in real student or shared-state scenarios');
 console.log(JSON.stringify({suite:'student-mascots-ui',checks,poses:[...observed].sort(),viewports:[320,390,1280],languages:['en','zh'],screenshots,fictionalApis:true,productionWrites:0}));
}finally{
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
 const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-student-mascots-'))fs.rmSync(resolved,{recursive:true,force:true});
}
