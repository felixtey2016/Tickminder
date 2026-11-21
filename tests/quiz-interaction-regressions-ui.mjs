import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const {build}=require('esbuild'),postcss=require('postcss'),tw=require('@tailwindcss/postcss');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH||'playwright');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-quiz-interactions-'));
const evidence=path.resolve(process.env.QUIZ_INTERACTION_EVIDENCE||path.join(root,'..','evidence','quiz-interactions'));
fs.mkdirSync(evidence,{recursive:true});
const baseline=process.env.QUIZ_EXPECT_BASELINE==='1',results=[];
let checks=0,browser,server,origin;const check=(value,message)=>{assert(value,message);checks++;};
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const content={schemaVersion:1,title:'Fixture quiz',instructions:'',subject:'Mathematics',subjectId:'math',exam:'SPM',syllabusId:'spm',year:null,region:'',paper:'',difficulty:'mixed',primaryLanguage:'en',timeLimitSeconds:null,shuffleQuestions:false,shuffleOptions:false,questions:[0,1].map(n=>({id:'question-'+n,type:'mcq',prompt:{primary:'Fixture question '+(n+1),en:''},imageId:null,extraImageIds:[],options:['A','B','C','D'].map(letter=>({id:'option-'+n+'-'+letter,text:{primary:'Answer '+letter,en:''},imageId:null})),points:1,difficulty:'medium',sourceId:'',chapter:'',level:''}))};
const quizId='17b4df37-913b-4b8a-9038-168bd3b73450';
const quiz={id:quizId,revision:1,visibility:'private',sharingMode:'private',sharingRevision:0,recipientIds:[],sharedRevision:null,canEdit:true,canShare:true,canDelete:true,creator:'Fixture Teacher',content,keys:content.questions.map(q=>({questionId:q.id,mode:'choice',correctOptionId:q.options[0].id,accepted:[],caseSensitive:false,tolerance:0,unit:'',rubric:'',explanation:''}))};
const initialAttempt={id:'fixture-attempt',currentQuestionId:'question-0',answeredCount:0,questionCount:2,quizId,assignmentId:'fixture-assignment',versionId:'fixture-version',title:'Fixture practice',subject:'Mathematics',creator:'Fixture Teacher',studentName:'Fixture Student',accountId:'fixture-user',kind:'practice',immediate:true,revision:1,status:'in_progress',startedAt:'2026-01-01T00:00:00.000Z',deadlineAt:null,submittedAt:null,updatedAt:'2026-01-01T00:00:00.000Z',submissionReason:null,late:false,attemptNumber:1,score:null,totalScore:2,rawScore:null,rawTotalScore:2,scoreVisible:false,answersVisible:false,pendingManual:0,canGrade:false,canAnswer:true,manualQuestionIds:[],content,answers:{},flaggedQuestionIds:[],checkedQuestionIds:[],results:[]};
const catalogue={scope:'quiz',revision:1,syllabuses:[{id:'spm',name:'SPM',active:true,grades:['Form 4'],subjects:[{id:'math',name:'Mathematics',active:true,aliases:[]}]}]};
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';
import QuizWorkspace from './app/quiz-workspace';import QuizPracticePlayer from './components/quiz-practice-player';import {AdminPermissionContext} from './app/admin-permission-context';
import {setLanguage} from './lib/i18n';import './lib/quiz-i18n';import './lib/quiz-practice-i18n';import './lib/quiz-upgrade-i18n';import {setClientGroup} from './lib/group-client';import {setPrivateReadIdentity} from './lib/private-read-lifecycle';import {workspaceIdentityKey} from './lib/workspace-page-data';
import './app/ui-refresh.css';import './app/appearance.css';import './app/shell-wave1.css';
const p=new URLSearchParams(location.search),lang=p.get('lang')||'en',practice=p.get('mode')==='practice';setLanguage(lang);document.documentElement.classList.toggle('dark',p.get('theme')==='dark');
const account={id:'fixture-user',role:practice?'student':'teacher',groupId:'fixture-group',teacherName:practice?null:'Fixture Teacher',studentName:practice?'Fixture Student':null};setClientGroup(account.groupId);setPrivateReadIdentity(workspaceIdentityKey(account),account.groupId);history.replaceState({timelyoRole:account.role,timelyoGroup:account.groupId,timelyoView:'quizzes'},'');window.fixtureClosed=0;window.fixtureChanged=0;
const fixtureRoot=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>fixtureRoot.unmount();fixtureRoot.render(<AdminPermissionContext.Provider value={account}><div className='app-shell shell-wave1'><main className='workspace workspace-compact'>{practice?<QuizPracticePlayer attemptId='fixture-attempt' language={lang} onClose={()=>window.fixtureClosed++} onChanged={()=>window.fixtureChanged++}/>:<QuizWorkspace view='quizBank' role='teacher' language={lang}/>}</main></div></AdminPermissionContext.Provider>);`;
async function open(params={},options={}){
 const context=await browser.newContext({viewport:{width:options.width||390,height:844},reducedMotion:'reduce',...(options.touch?{hasTouch:true,isMobile:true}:{})}),page=await context.newPage();page.setDefaultTimeout(10000);
 const errors=[],writes=[],saveStarted=deferred(),releaseSave=deferred(),draftStarted=deferred(),releaseDraft=deferred(),checkStarted=deferred();
 let attempt=structuredClone(initialAttempt),draft=structuredClone(quiz),saveFailed=false;
 if(options.self)attempt.assignmentId=null;if(options.single){attempt.content.questions=attempt.content.questions.slice(0,1);attempt.questionCount=1;attempt.totalScore=1;attempt.rawTotalScore=1;}
 if(options.text){attempt.content.questions[0]={...attempt.content.questions[0],type:'blank',options:[]};}
 if(options.fractions){
  const question=attempt.content.questions[0];
  question.prompt.primary='Write $\\frac{63}{99}$ in its simplest form.';
  for(const [position,value] of ['\\frac{21}{33}','\\frac{11}{7}','\\frac{7}{9}','\\frac{7}{11}'].entries())question.options[position].text.primary='$'+value+'$';
  if(attempt.content.questions[1])attempt.content.questions[1].prompt.primary='$\\frac{\\frac{'+'1234567890'.repeat(8)+'}{2}}{\\frac{3}{4}}$';
 }
 if(options.deferred)attempt.immediate=false;if(options.deadline)attempt.deadlineAt='2035-01-01T00:00:00.000Z';
 function gradeQuestion(question){
  const answer=attempt.answers[question.id];
  const correctOptionId=question.options[options.fractions&&question.id==='question-0'?3:0]?.id;
  const correct=correctOptionId?answer?.optionId===correctOptionId:answer?.text==='42';
  return {questionId:question.id,status:correct?'correct':'incorrect',points:correct?question.points:0,correctOptionId};
 }
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!==origin){errors.push('external request '+u.origin);return route.abort();}if(!u.pathname.startsWith('/api/'))return route.continue();
  const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/api/academic-catalogues')return reply(catalogue);
  if(u.pathname==='/api/quizzes'){
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();writes.push(body);if(body.action==='save'){draftStarted.resolve(body);if(options.holdDraft)await releaseDraft.promise;if(options.failDraft)return reply({error:'quiz.unavailable'},503);draft={...draft,content:body.content,keys:body.keys,revision:draft.revision+1};return reply({id:quizId,revision:draft.revision});}if(body.action==='share'){draft={...draft,visibility:body.visibility,sharingMode:body.visibility,sharingRevision:draft.sharingRevision+1,sharedRevision:draft.revision};return reply({ok:true});}errors.push('unexpected quiz action '+body.action);return reply({error:'quiz.unavailable'},503);}
   if(u.searchParams.has('id'))return reply(draft);
   return reply({items:[{id:quizId,title:draft.content.title,subject:'Mathematics',exam:'SPM',difficulty:'mixed',questionCount:2,totalScore:2,visibility:draft.visibility,bank:false,creator:'Fixture Teacher',organisation:'Fixture Group',canEdit:true,canShare:true,revision:draft.revision,sharedRevision:draft.sharedRevision}],hasMore:false,facets:{subjects:['Mathematics'],levels:[],chapters:[],maintenanceImport:false,manageQuizzes:false,canModerate:false}});
  }
  if(u.pathname==='/api/quiz-practice'){
   if(route.request().method()==='GET')return reply(u.searchParams.has('attemptId')?{attempt,serverNow:new Date().toISOString()}:{assignments:[],attempts:[],hasMore:false,serverNow:new Date().toISOString()});
   const body=route.request().postDataJSON();writes.push(body);
   if(body.action==='save'){saveStarted.resolve(body);if(options.holdSave)await releaseSave.promise;if(options.failSave&&(!options.failSaveOnce||!saveFailed)){saveFailed=true;return reply({error:options.failSave},options.failSave==='quiz.network'?503:409);}}
   check(body.revision===attempt.revision,'request uses latest saved revision');
   attempt={...attempt,answers:{...attempt.answers,...body.answers},flaggedQuestionIds:body.flaggedQuestionIds||[],currentQuestionId:body.currentQuestionId||attempt.currentQuestionId,revision:attempt.revision+1};
   if(body.action==='check'){
    checkStarted.resolve(body);
    if(!attempt.checkedQuestionIds.includes(body.questionId)){
     attempt.checkedQuestionIds.push(body.questionId);
     const result=gradeQuestion(attempt.content.questions.find(question=>question.id===body.questionId));
     const solution=options.solutions?.[body.questionId]?.trim();
     attempt.results.push({...result,...(solution?{solution}:{})});
    }
   }
   const complete=attempt.content.questions.every(q=>Boolean(attempt.answers[q.id]?.optionId||attempt.answers[q.id]?.text?.trim())&&(!attempt.immediate||attempt.manualQuestionIds.includes(q.id)||attempt.checkedQuestionIds.includes(q.id)));
   if(body.action==='submit'||!attempt.assignmentId&&complete&&!body.deferCompletion){
    const grades=attempt.content.questions.map(gradeQuestion);
    const answersVisible=options.releaseAnswers!==false;
    const results=answersVisible?grades.map(result=>({...result,key:{
     correctOptionId:result.correctOptionId,accepted:[],unit:'',explanation:options.solutions?.[result.questionId]||'',rubric:'',
    }})):attempt.results;
    attempt={...attempt,status:'submitted',canAnswer:false,scoreVisible:true,answersVisible,results,score:grades.reduce((sum,result)=>sum+result.points,0),submittedAt:new Date().toISOString(),submissionReason:'student'};
   }
   return reply({attempt,serverNow:new Date().toISOString()});
  }
  errors.push('unexpected API '+u.pathname);return reply({error:'fixture.unexpected'},500);
 });
 page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+'/?'+new URLSearchParams(params));
 return{page,writes,saveStarted:saveStarted.promise,releaseSave:()=>releaseSave.resolve(),draftStarted:draftStarted.promise,releaseDraft:()=>releaseDraft.resolve(),checkStarted:checkStarted.promise,attempt:()=>attempt,expire:()=>{attempt.deadlineAt=new Date(Date.now()-1000).toISOString();},close:async()=>{releaseSave.resolve();releaseDraft.resolve();check(!errors.length,errors.join('; '));await context.close();}};
}
async function tap(page,locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();assert(b);await page.mouse.click(b.x+b.width/2,b.y+b.height/2);}
async function startBackgroundSave(f){await f.page.locator('.quiz-flag-question').click();await f.saveStarted;}
async function editDraft(f,lang){const p=f.page;await p.getByTestId('quiz-tab-mine').click();await p.locator('.quiz-item-more-trigger').first().click();await p.getByRole('button',{name:lang==='zh'?'编辑':'Edit',exact:true}).click();await p.getByLabel(lang==='zh'?'测验标题':'Quiz title',{exact:true}).fill('Updated fixture quiz');return p.getByRole('button',{name:lang==='zh'?'保存草稿':'Save draft',exact:true});}
try{
 await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'quiz-interactions-fixture.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'esm',jsx:'automatic',outfile:path.join(temporary,'ui.js'),assetNames:'fixture-assets/[name]-[hash]',loader:{'.woff':'file','.woff2':'file','.ttf':'file'},alias:{'@':root},logLevel:'silent'});
 const globals=await postcss([(tw.default||tw)({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')}),css=globals.css+'\n'+fs.readFileSync(path.join(temporary,'ui.css'),'utf8');
 server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/ui.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(temporary,'ui.js')));return;}if(pathname==='/ui.css'){res.setHeader('content-type','text/css');res.end(css);return;}if(pathname.startsWith('/fixture-assets/')){const file=path.resolve(temporary,'.'+pathname);if(file.startsWith(temporary+path.sep)&&fs.existsSync(file)){res.end(fs.readFileSync(file));return;}}if(pathname.includes('.')){res.writeHead(404);res.end();return;}res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script type="module" src="/ui.js"></script></body></html>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,...process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{},args:['--no-sandbox']});
 // Slow autosave is held by a deterministic gate. A physical tap does not wait
 // for disabled controls, unlike locator.click(), reproducing the user's tap.
 for(const lang of baseline?['en']:['zh','en'])for(const type of baseline?['choice']:['choice','text']){
  const f=await open({mode:'practice',lang,theme:type==='text'?'dark':'light'},{holdSave:true,text:type==='text',width:lang==='en'?1280:390}),p=f.page;
  const confirm=p.locator('.quiz-check-answer button'),options=p.locator('.quiz-option-button');
  if(baseline){
   await options.first().click();await f.saveStarted;
   const disabledBefore=await confirm.isDisabled();await tap(p,confirm);
   f.releaseSave();await p.waitForFunction(()=>!document.querySelector('.quiz-check-answer button').disabled);
   check(disabledBefore&&f.writes.every(body=>body.action!=='check'),'baseline first tap was lost while autosaving');
   results.push({baseline:'first-confirm-tap-lost',reproduced:true});
  }else{
   if(type==='text'){
    await p.locator('.quiz-field textarea').fill('41');await f.saveStarted;
    await p.locator('.quiz-field textarea').fill('42');await tap(p,confirm);
    await p.locator('.quiz-check-answer button[aria-busy=true]').waitFor();
    check(await confirm.isDisabled(),'queued text confirmation blocks duplicate taps');
    await tap(p,confirm);
   }else{
    await startBackgroundSave(f);
    await options.nth(1).click();
    await p.locator('.quiz-answer-grid[aria-busy=true]').waitFor();
    check(await confirm.count()===0,'immediate choice has no confirmation button');
    check(await options.first().isDisabled(),'selection is fixed while waiting for the save');
    await tap(p,options.first());
   }
   f.releaseSave();
   await p.locator('.quiz-answer-feedback').waitFor();
   const requests=f.writes.filter(body=>body.action==='check');
   check(requests.length===1&&requests[0].revision===2,'one tap waits for the current autosave and uses its revision');
   check(type==='text'?requests[0].answers['question-0'].text==='42':requests[0].answers['question-0'].optionId==='option-0-B','latest answer survives background autosave');
   check(f.attempt().checkedQuestionIds.includes('question-0'),'graded question is locked');
   if(type==='choice'){
    check(await p.locator('.quiz-answer-cell.is-incorrect [aria-pressed=true]').count()===1,'wrong selection is marked');
    check(await p.locator('.quiz-answer-cell.is-correct [aria-pressed=false]').count()===1,'the correct unselected option is marked');
    check(await p.locator('.quiz-answer-cell.is-selected').count()===0,'graded choices drop the purple selection state');
   }
   await p.screenshot({path:path.join(evidence,'confirm-'+lang+'-'+type+'.png')});
  }
  await f.close();
 }
 for(const lang of baseline?['en']:['zh','en']){
  const f=await open({lang,theme:lang==='zh'?'dark':'light'},{holdDraft:true,width:lang==='en'?1280:390}),p=f.page,save=await editDraft(f,lang);await save.click();await f.draftStarted;check(await p.locator('.quiz-editor').isVisible(),'editor stays open while save is pending');f.releaseDraft();
  if(baseline){await p.waitForFunction(()=>document.querySelector('.quiz-editor-footer button:last-child')?.disabled===true);check(await p.locator('.quiz-editor').isVisible(),'baseline saved editor requires manual navigation');results.push({baseline:'saved-draft-stays-in-editor',reproduced:true});}
  else{await p.getByTestId('quiz-hub').waitFor();check(await p.getByTestId('quiz-tab-bank').getAttribute('aria-selected')==='true','saved draft returns directly to question library');await p.getByRole('heading',{name:'Updated fixture quiz',exact:true}).waitFor();check(f.writes.filter(body=>body.action==='save').length===1,'one explicit draft save');await p.screenshot({path:path.join(evidence,'draft-return-'+lang+'.png')});}
  await f.close();
 }
 if(!baseline){
  {const f=await open({lang:'en'},{failDraft:true}),p=f.page,save=await editDraft(f,'en');await save.click();await p.locator('.quiz-editor [role=alert]').waitFor();check(await p.getByLabel('Quiz title',{exact:true}).inputValue()==='Updated fixture quiz','failed draft save keeps edited content');check(await p.locator('.quiz-editor').isVisible(),'failed draft never navigates');await f.close();}
  {const f=await open({lang:'en'}),p=f.page;await p.getByTestId('quiz-tab-mine').click();await p.locator('.quiz-item-more-trigger').first().click();await p.getByRole('button',{name:'Edit',exact:true}).click();await p.getByRole('tab',{name:'Sharing',exact:true}).click();const panel=p.getByTestId('quiz-sharing-panel');await panel.getByRole('radio',{name:/Public/}).check();const refreshed=p.waitForResponse(r=>r.url().includes('/api/quizzes?id=')&&r.request().method()==='GET');await panel.getByRole('button',{name:'Save sharing settings',exact:true}).click();await refreshed;await panel.locator('.quiz-sharing-options:not([disabled])').waitFor();check(await p.locator('.quiz-editor').isVisible(),'updating sharing does not close the editor');check(f.writes.some(body=>body.action==='share'),'sharing flow was actually saved');await f.close();}
  {
   const f=await open({lang:'zh'},{touch:true}),p=f.page;
   await p.getByTestId('quiz-tab-mine').tap();
   const trigger=p.locator('.quiz-item-more-trigger').first(),menu=p.locator('.quiz-item-secondary-actions');
   await trigger.waitFor();
   await trigger.evaluate(button=>{
    const card=button.closest('article'),spacer=document.createElement('div'),tail=document.createElement('div'),nav=document.createElement('nav');
    spacer.style.height='650px';tail.style.height='1200px';
    card.before(spacer);card.after(tail);
    nav.className='mobile-bottom-nav';
    nav.style.cssText='display:block;position:fixed;inset:auto 0 0;height:68px;z-index:55';
    document.body.append(nav);
    window.scrollBy(0,button.getBoundingClientRect().bottom-nav.getBoundingClientRect().top+12);
   });
   await trigger.tap();
   await menu.waitFor();
   await p.waitForFunction(()=>{
    const menu=document.querySelector('.quiz-item-secondary-actions'),nav=document.querySelector('nav.mobile-bottom-nav');
    return menu.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top-6&&menu.getAttribute('data-side')==='top';
   });
   check(await menu.locator('button').count()>=4,'menu exposes the available actions above the mobile navigation');
   const initialScroll=await p.evaluate(()=>window.scrollY);
   const input=await p.context().newCDPSession(p);
   await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:6,y:610}]});
   for(const y of [580,550,520,490,460,430])await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:6,y}]});
   await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await p.waitForFunction(start=>window.scrollY>start+20,initialScroll);
   check(await menu.isVisible(),'a page swipe outside the menu scrolls without closing it');
   await p.keyboard.press('Escape');
   await menu.waitFor({state:'hidden'});
   await trigger.tap();
   await menu.waitFor();
   await p.touchscreen.tap(6,540);
   await menu.waitFor({state:'hidden'});
   await f.close();
  }
  {const f=await open({mode:'practice',lang:'en'},{holdSave:true,failSave:'quiz.conflict'}),p=f.page;await startBackgroundSave(f);await p.locator('.quiz-option-button').first().click();f.releaseSave();await p.getByRole('alert').waitFor();check(f.writes.every(body=>body.action!=='check'),'a failed save never checks using a stale revision');check(await p.locator('.quiz-option-button[aria-pressed=true]').count()===1,'local answer survives save conflict');await f.close();}
  {const f=await open({mode:'practice',lang:'en'},{holdSave:true,failSave:'quiz.network',failSaveOnce:true}),p=f.page;await startBackgroundSave(f);await p.locator('.quiz-option-button').first().click();f.releaseSave();await p.getByRole('alert').getByRole('button').first().click();await p.locator('.quiz-answer-cell.is-correct [aria-pressed=true]').waitFor();check(f.writes.filter(body=>body.action==='check').length===1,'retrying a failed save continues the original selection intent');await f.close();}
  {const f=await open({mode:'practice',lang:'en'},{self:true,single:true}),p=f.page;await p.locator('.quiz-option-button').first().click();await p.locator('.quiz-result-summary').waitFor();check(f.writes.length===1&&f.writes[0].action==='check','one request grades and completes the final self-practice question');check(await p.locator('.quiz-answer-cell.is-correct [aria-pressed=true]').count()===1,'the correct selected option remains green after auto-completion');await f.close();}
  {const f=await open({mode:'practice',lang:'en'},{holdSave:true}),p=f.page;await startBackgroundSave(f);await p.locator('.quiz-option-button').first().click();await p.evaluate(()=>window.fixtureUnmount());f.releaseSave();await p.waitForTimeout(150);check(f.writes.every(body=>body.action!=='check'),'unmount never runs queued grading in another page');await f.close();}
  {const f=await open({mode:'practice',lang:'en'},{holdSave:true,deadline:true}),p=f.page;await startBackgroundSave(f);await p.locator('.quiz-option-button').first().click();f.expire();f.releaseSave();await p.locator('.quiz-result-summary').waitFor();check(f.writes.every(body=>body.action!=='check')&&f.writes.some(body=>body.action==='submit'&&body.automatic),'expiry takes priority over queued grading');await f.close();}
  {const f=await open({mode:'practice',lang:'en'},{deferred:true}),p=f.page;await p.locator('.quiz-option-button').first().click();await f.saveStarted;check(await p.locator('.quiz-check-answer').count()===0,'deferred feedback never gains a correctness button');check(f.writes.every(body=>body.action!=='check'),'autosave never reveals deferred answers');check(await p.locator('.quiz-answer-cell.is-correct,.quiz-answer-cell.is-incorrect').count()===0,'deferred practice does not mark option correctness');await f.close();}
  const sampleSolution='1. Find the common factor.\n2. Simplify to $\\frac{7}{11}$.';
  for(const selection of [0,1]){
   const f=await open({mode:'practice',lang:'zh',theme:selection?'dark':'light'},{solutions:{'question-0':sampleSolution}}),p=f.page;
   const options=p.locator('.quiz-option-button'),solution=p.locator('.quiz-answer-feedback .quiz-solution');
   await options.first().waitFor();
   check(await p.locator('.quiz-solution').count()===0,'steps are unavailable before the answer is checked');
   await options.nth(selection).click();
   await solution.waitFor();
   check(await solution.getAttribute('open')===null,'the worked solution starts collapsed for either result');
   await solution.locator('summary').click();
   await solution.locator('.quiz-solution-steps .mfrac').waitFor();
   check((await solution.locator('.quiz-solution-steps').innerText()).includes('2. Simplify'),'solution keeps its numbered steps and renders the fraction');
   await p.getByRole('button',{name:'下一题',exact:true}).click();
   await options.nth(1).click();
   await p.locator('.quiz-answer-feedback.incorrect').waitFor();
   check(await p.locator('.quiz-solution').count()===0,'an older question without a solution has no entry');
   await f.close();
  }
  for(const releaseAnswers of [true,false]){
   const f=await open({mode:'practice',lang:'en',theme:'dark'},{deferred:true,self:true,releaseAnswers,solutions:{'question-0':sampleSolution,'question-1':'  '}}),p=f.page;
   await p.locator('.quiz-option-button').first().click();
   await p.getByRole('button',{name:'Next question',exact:true}).click();
   await p.locator('.quiz-option-button').nth(1).click();
   await p.locator('.quiz-result-summary').waitFor();
   const overview=p.locator('.quiz-question-results');
   if(releaseAnswers){
    check((await p.locator('.quiz-correct-count').innerText())==='1 / 2 questions correct','completed practice shows count of correct questions');
    check(await overview.locator('li').count()===2,'every question appears in the completed results');
    check(await overview.locator('li').first().locator('.quiz-result-mark.correct').count()===1,'the first question shows correct');
    check(await overview.locator('li').last().locator('.quiz-result-mark.incorrect').count()===1,'the second question shows incorrect');
    check(await overview.locator('.quiz-solution').count()===1,'only the question with steps gets a solution link');
    check(await overview.locator('summary').evaluate(summary=>{
     const question=summary.querySelector('.quiz-result-question').getBoundingClientRect();
     const action=summary.querySelector('.quiz-solution-action').getBoundingClientRect();
     return action.left>=question.right&&Math.abs(action.top+action.height/2-question.top-question.height/2)<1;
    }),'solution action stays beside its result at mobile width');
    await overview.locator('summary').click();
    await overview.locator('.quiz-solution-steps .mfrac').waitFor();
    await p.screenshot({path:path.join(evidence,'optional-solutions-results.png')});
   }else{
    check(await overview.count()===0&&await p.locator('.quiz-correct-count,.quiz-solution').count()===0,'score release by itself keeps question results and steps private');
   }
   await f.close();
  }
  for(const theme of ['light','dark']){
   const f=await open({mode:'practice',lang:'zh',theme},{fractions:true,width:390}),p=f.page;
   await p.locator('.quiz-player-question .mfrac').waitFor();
   const layout=await p.locator('.quiz-formula-inline').evaluateAll(formulas=>formulas.map(formula=>({
    vertical:getComputedStyle(formula).overflowY,
    width:formula.clientWidth,
    scrollWidth:formula.scrollWidth,
   })));
   check(layout.length===5&&layout.every(formula=>formula.vertical==='hidden'&&formula.width>0&&formula.scrollWidth<=formula.width+1),'short fractions fit without a vertical scrollbar: '+JSON.stringify(layout));
   await p.locator('.quiz-option-button').nth(1).click();
   await p.locator('.quiz-answer-cell.is-incorrect').waitFor();
   const frames=await p.waitForFunction(()=>{
    const cells=[...document.querySelectorAll('.quiz-answer-cell:is(.is-correct,.is-incorrect)')];
    const canvas=document.createElement('canvas').getContext('2d');
    const color=value=>{canvas.fillStyle=value.trim();return canvas.fillStyle;};
    return cells.length===2&&cells.every(cell=>{
     const style=getComputedStyle(cell);
     const tone=cell.classList.contains('is-correct')?'success':'danger';
     const button=cell.querySelector('button');
     return !cell.classList.contains('is-selected')&&style.boxShadow==='none'&&
      color(style.backgroundColor)===color(style.getPropertyValue('--ui-'+tone+'-bg'))&&
      color(style.borderTopColor)===color(style.getPropertyValue('--ui-'+tone+'-text'))&&
      getComputedStyle(button).backgroundColor==='rgba(0, 0, 0, 0)';
    });
   });
   check(await frames.jsonValue(),'both full frames finish using only the expected feedback colors');
   await p.screenshot({path:path.join(evidence,'fractions-one-tap-'+theme+'.png')});
   await p.getByRole('button',{name:'下一题',exact:true}).click();
   await p.locator('.quiz-player-question .mfrac').nth(1).waitFor();
   const wide=await p.locator('.quiz-player-question .quiz-formula-inline').evaluate(formula=>{
    formula.scrollLeft=50;
    return {left:formula.scrollLeft,width:formula.clientWidth,scrollWidth:formula.scrollWidth,vertical:getComputedStyle(formula).overflowY};
   });
   check(wide.left>0&&wide.scrollWidth>wide.width&&wide.vertical==='hidden','a long fraction stays horizontally scrollable: '+JSON.stringify(wide));
   await f.close();
  }
 }
 fs.writeFileSync(path.join(evidence,baseline?'baseline.json':'results.json'),JSON.stringify({suite:'quiz-interaction-regressions-ui',baseline,checks,results,scope:'Real React components and generated CSS; deterministic fictional APIs only.'},null,2));console.log(JSON.stringify({suite:'quiz-interaction-regressions-ui',baseline,passed:checks,results,evidence}));
}catch(error){if(browser){const page=browser.contexts().flatMap(c=>c.pages()).at(-1);if(page){await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.txt'),String(error)+'\n'+await page.locator('body').innerText().catch(()=>''));}}throw error;}finally{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-quiz-interactions-'))fs.rmSync(resolved,{recursive:true,force:true});}
