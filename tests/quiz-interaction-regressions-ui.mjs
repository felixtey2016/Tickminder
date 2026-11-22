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
const fixtureRoot=createRoot(document.getElementById('root'));window.fixtureUnmount=()=>fixtureRoot.unmount();fixtureRoot.render(<AdminPermissionContext.Provider value={account}><div className='app-shell shell-wave1'><main className='workspace workspace-compact'>{practice?<QuizPracticePlayer attemptId='fixture-attempt' presentation={p.get('layout')==='page'?'page':'dialog'} language={lang} onClose={()=>window.fixtureClosed++} onChanged={()=>window.fixtureChanged++}/>:<QuizWorkspace view='quizBank' role='teacher' language={lang}/>}</main></div></AdminPermissionContext.Provider>);`;
async function open(params={},options={}){
 const context=await browser.newContext({viewport:{width:options.width||390,height:844},reducedMotion:options.animate?'no-preference':'reduce',...(options.touch?{hasTouch:true,isMobile:true}:{})}),page=await context.newPage();page.setDefaultTimeout(10000);
 if(options.soundProbe)await page.addInitScript(setting=>{
  window.fixtureSounds=[];
  const outputs=new WeakMap();
  const {connect,start}=AudioBufferSourceNode.prototype;
  AudioBufferSourceNode.prototype.connect=function(output,...args){outputs.set(this,output);return connect.call(this,output,...args);};
  AudioBufferSourceNode.prototype.start=function(...args){
   window.fixtureSounds.push({duration:this.buffer.duration,gain:outputs.get(this)?.gain?.value??1});
   return start.apply(this,args);
  };
  if(setting==='muted')localStorage.setItem('tickminder.quiz.sound.fixture-user',JSON.stringify({music:true,effects:false}));
  if(setting==='zero')localStorage.setItem('tickminder.quiz.sound.fixture-user',JSON.stringify({music:true,effects:true,effectsVolume:0}));
 },options.soundProbe);
 const errors=[],writes=[],shareTargetQueries=[],saveStarted=deferred(),releaseSave=deferred(),draftStarted=deferred(),releaseDraft=deferred(),checkStarted=deferred();
 let attempt=structuredClone(initialAttempt),draft=structuredClone(quiz),saveFailed=false,shareFailed=false;
 if(options.streakQuestions){
  const questions=Array.from({length:options.streakQuestions},(_,index)=>({
   ...structuredClone(content.questions[0]),id:'streak-question-'+index,
   prompt:{primary:(index===2?'Read this longer question and inspect all four answer choices. '.repeat(28):'Question '+(index+1)),en:''},
   options:content.questions[0].options.map((option,position)=>({...option,id:'streak-option-'+index+'-'+position})),
  }));
  attempt.content.questions=questions;
  if(options.weighted)questions[0].points=2;
  attempt.questionCount=questions.length;
  attempt.totalScore=attempt.rawTotalScore=questions.reduce((sum,question)=>sum+question.points,0);
  const checked=questions.slice(0,options.resumeStreak||0);
  attempt.checkedQuestionIds=checked.map(question=>question.id);
  attempt.answers=Object.fromEntries(checked.map(question=>[question.id,{optionId:question.options[0].id}]));
  attempt.results=checked.map(question=>({questionId:question.id,status:'correct',points:1,correctOptionId:question.options[0].id}));
  attempt.currentQuestionId=questions[checked.length].id;
 }
 if(options.multilingual){
  const question=attempt.content.questions[0];
  question.prompt={en:'English test question?',ms:'Soalan dalam Bahasa Melayu?',zh:'这是一道华文题？'};
  question.options.forEach((option,index)=>{option.text={en:'English option '+index,ms:'Pilihan '+index,zh:'选项 '+index};});
 }
 if(options.self)attempt.assignmentId=null;if(options.single){attempt.content.questions=attempt.content.questions.slice(0,1);attempt.questionCount=1;attempt.totalScore=1;attempt.rawTotalScore=1;}
 if(options.text){attempt.content.questions[0]={...attempt.content.questions[0],type:'blank',options:[]};}
 if(options.baseNumbers)attempt.content.questions[0].options.forEach((option,index)=>{option.text.primary='$'+['2561_6','1045_6','5320_6','4152_6'][index]+'$';});
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
  const u=new URL(route.request().url());if(u.origin!==origin){errors.push('external request '+u.origin);return route.abort();}if(options.blockStreakAsset&&u.pathname==='/tickquiz-streak/10.webp')return route.abort();if(!u.pathname.startsWith('/api/'))return route.continue();
  const reply=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(u.pathname==='/api/academic-catalogues'){
   if(!options.importZip)return reply(catalogue);
   const expanded=structuredClone(catalogue);
   expanded.syllabuses[0].grades.push('Form 2');
   expanded.syllabuses[0].subjects.push({id:'science',name:'Science',aliases:[],active:true});
   return reply(expanded);
  }
  if(u.pathname==='/api/quiz-share-targets'){
   shareTargetQueries.push(u.searchParams.get('quizId'));
   return reply({items:[{id:'linked-student',name:'Linked Student',role:'student'}],hasMore:false,scope:'students'});
  }
  if(u.pathname.startsWith('/api/quiz-music/'))return route.fulfill({status:404});
  if(u.pathname==='/api/quizzes'){
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();writes.push(body);if(body.action==='save'||body.action==='maintenanceImport'){draftStarted.resolve(body);if(options.holdDraft)await releaseDraft.promise;if(options.failDraft)return reply({error:'quiz.unavailable'},503);draft={...draft,id:body.id,content:body.content,keys:body.keys,revision:body.revision+1};return reply({id:draft.id,revision:draft.revision});}if(body.action==='share'){if(options.failShareOnce&&!shareFailed){shareFailed=true;return reply({error:'quiz.unavailable'},503);}draft={...draft,visibility:body.visibility,sharingMode:body.visibility,sharingRevision:draft.sharingRevision+1,sharedRevision:draft.revision,recipientIds:body.recipientIds};return reply({ok:true});}errors.push('unexpected quiz action '+body.action);return reply({error:'quiz.unavailable'},503);}
   if(u.searchParams.has('id'))return reply(draft);
   return reply({items:[{id:quizId,title:draft.content.title,subject:'Mathematics',exam:'SPM',difficulty:'mixed',questionCount:2,totalScore:2,visibility:draft.visibility,bank:false,creator:'Fixture Teacher',organisation:'Fixture Group',canEdit:true,canShare:true,revision:draft.revision,sharedRevision:draft.sharedRevision}],hasMore:false,facets:{subjects:['Mathematics'],levels:[],chapters:[],maintenanceImport:Boolean(options.importZip),manageQuizzes:false,canModerate:false}});
  }
  if(u.pathname==='/api/quiz-practice'){
   if(u.searchParams.has('targets'))return reply({classrooms:[],students:[{studentName:'Linked Student',subjects:['Mathematics']}]});
   if(route.request().method()==='GET')return reply(u.searchParams.has('attemptId')?{attempt,serverNow:new Date().toISOString()}:{assignments:[],attempts:[],hasMore:false,serverNow:new Date().toISOString()});
   const body=route.request().postDataJSON();writes.push(body);
   if(body.action==='assign')return reply({id:body.id});
   if(body.action==='start')return reply({attempt,serverNow:new Date().toISOString()});
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
 return{page,writes,shareTargetQueries,saveStarted:saveStarted.promise,releaseSave:()=>releaseSave.resolve(),draftStarted:draftStarted.promise,releaseDraft:()=>releaseDraft.resolve(),checkStarted:checkStarted.promise,attempt:()=>attempt,expire:()=>{attempt.deadlineAt=new Date(Date.now()-1000).toISOString();},close:async()=>{releaseSave.resolve();releaseDraft.resolve();check(!errors.length,errors.join('; '));await context.close();}};
}
async function tap(page,locator){await locator.scrollIntoViewIfNeeded();const b=await locator.boundingBox();assert(b);await page.mouse.click(b.x+b.width/2,b.y+b.height/2);}
async function startBackgroundSave(f){await f.page.locator('.quiz-flag-question').click();await f.saveStarted;}
async function editDraft(f,lang){const p=f.page;await p.getByTestId('quiz-tab-mine').click();await p.locator('.quiz-item-more-trigger').first().click();await p.getByRole('button',{name:lang==='zh'?'编辑':'Edit',exact:true}).click();await p.getByLabel(lang==='zh'?'测验标题':'Quiz title',{exact:true}).fill('Updated fixture quiz');return p.getByRole('button',{name:lang==='zh'?'保存草稿':'Save draft',exact:true});}
try{
 await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'quiz-interactions-fixture.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'esm',jsx:'automatic',outfile:path.join(temporary,'ui.js'),assetNames:'fixture-assets/[name]-[hash]',loader:{'.woff':'file','.woff2':'file','.ttf':'file'},alias:{'@':root},logLevel:'silent'});
 const globals=await postcss([(tw.default||tw)({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')}),css=globals.css+'\n'+fs.readFileSync(path.join(temporary,'ui.css'),'utf8');
 server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/ui.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(temporary,'ui.js')));return;}if(pathname==='/ui.css'){res.setHeader('content-type','text/css');res.end(css);return;}if(pathname.startsWith('/fixture-assets/')){const file=path.resolve(temporary,'.'+pathname);if(file.startsWith(temporary+path.sep)&&fs.existsSync(file)){res.end(fs.readFileSync(file));return;}}if(/^\/quiz-audio\/(correct|incorrect)\.wav$/.test(pathname)){res.setHeader('content-type','audio/wav');res.end(fs.readFileSync(path.join(root,'public',pathname)));return;}if(/^\/tickquiz-streak\/(3|5|10|perfect|correct)\.webp$/.test(pathname)){res.setHeader('content-type','image/webp');res.end(fs.readFileSync(path.join(root,'public',pathname)));return;}if(pathname.includes('.')){res.writeHead(404);res.end();return;}res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script type="module" src="/ui.js"></script></body></html>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
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
  {
   const f=await open({mode:'practice',lang:'en',layout:'page'},{touch:true,animate:true,streakQuestions:12,resumeStreak:2}),p=f.page;
   const overlay=p.locator('.quiz-streak-overlay'),next=p.getByRole('button',{name:'Next question',exact:true});
   const choose=async position=>{
    await p.locator('.quiz-option-button').nth(position).tap();
    await p.locator(position?'.quiz-answer-cell.is-incorrect':'.quiz-answer-cell.is-correct').waitFor();
   };
   await p.locator('.quiz-option-button').first().waitFor();
   check(await overlay.count()===0,'resuming does not replay old milestones');
   await choose(0);
   await overlay.getByText('Congratulations! 3 in a row!').waitFor();
   await p.locator('.quiz-correct-mascot[src$="/correct.webp"]').waitFor();
   const layer=await overlay.evaluate(el=>{const box=el.getBoundingClientRect();return {viewport:box.y===0&&box.height===innerHeight&&box.width===innerWidth,scrolled:scrollY>0,pointers:getComputedStyle(el).pointerEvents};});
   check(layer.viewport&&layer.scrolled&&layer.pointers==='none','the celebration covers the current viewport without intercepting input after scrolling');
   await overlay.locator('img:not([hidden])').waitFor();
   await next.tap();
   await p.getByText('Question 4',{exact:true}).waitFor();
   await choose(1);
   check(await overlay.count()===0,'a confirmed wrong answer clears the streak celebration');
   for(let question=5;question<=9;question++){
    await next.tap();
    await p.getByText('Question '+question,{exact:true}).waitFor();
    await choose(0);
    if(question===6)check(await overlay.count()===0,'answers before the mistake do not count towards the new streak');
    if(question===7)await overlay.getByText('Congratulations! 3 in a row!').waitFor();
   }
   await overlay.getByText('Congratulations! 5 in a row!').waitFor();
   check(await overlay.locator('.quiz-streak-stars span').count()===6,'the five-answer milestone has animated stars');
   await overlay.waitFor({state:'detached'});
   await f.close();
  }
  {
   const f=await open({mode:'practice',lang:'en',layout:'page'},{width:1280,animate:true,streakQuestions:11,resumeStreak:9,blockStreakAsset:true}),p=f.page;
   await p.locator('.quiz-option-button').first().click();
   const overlay=p.locator('.quiz-streak-overlay');
   await overlay.getByText('Congratulations! 10 in a row!').waitFor();
   check(await overlay.locator('img').isHidden(),'the celebration is legible without the mascot image');
   check(await overlay.locator('.quiz-streak-confetti span').count()===14,'ten correct answers show falling confetti on desktop');
   await f.close();
  }
  {
   const f=await open({mode:'practice',lang:'en',layout:'page'},{self:true,streakQuestions:12,resumeStreak:10}),p=f.page;
   const overlay=p.locator('.quiz-streak-card-compact');
   await p.locator('.quiz-option-button').first().click();
   await overlay.getByText('Congratulations! 11 in a row!').waitFor();
   check(await overlay.locator('img').getAttribute('src')==='/tickquiz-streak/correct.webp','above ten streaks reuse the answer mascot');
   await p.getByRole('button',{name:'Next question',exact:true}).click();
   await p.locator('.quiz-option-button').first().click();
   await overlay.getByText('Congratulations! 12 in a row!').waitFor();
   check(await overlay.locator('img').getAttribute('src')==='/tickquiz-streak/correct.webp','the exact new streak appears with the same mascot');
   check(await p.locator('.quiz-completion-overlay .quiz-streak-confetti span').count()===38,'a final milestone shares the larger completion confetti');
   await f.close();
  }
  for(const [releaseAnswers,weighted,wrongFirst] of [[true,false,false],[false,false,false],[true,true,true]]){
   const f=await open({mode:'practice',lang:'en',layout:'page'},{self:true,deferred:true,streakQuestions:3,releaseAnswers,weighted,solutions:{'streak-question-0':'Worked example for the original question.'}}),p=f.page;
   for(let n=0;n<3;n++){
    await p.locator('.quiz-option-button').nth(wrongFirst&&n===0?1:0).click();
    if(n<2)await p.getByRole('button',{name:'Next question',exact:true}).click();
   }
   const results=p.locator('.quiz-result-summary');await results.waitFor();
   check(await p.locator('.quiz-streak-card').count()===0,'deferred feedback does not show a mid-answer celebration');
   check(await p.locator('.quiz-completion-overlay .quiz-streak-confetti span').count()===38,'new submissions receive completion confetti regardless of result release');
   const ring=results.getByRole('img',{name:/3/});
   check(await ring.isVisible()===releaseAnswers,'correctness ring follows result release');
   if(releaseAnswers){
    check(await results.getByText(/^Score/).isVisible()===weighted,'a separate score is only displayed when it adds information');
    const solution=p.locator('.quiz-question-results details').first();
    check(await solution.locator('.quiz-review-original').count()===0,'the original question is only rendered when the review expands');
    await solution.locator('summary').click();
    const original=solution.locator('.quiz-review-original');
    await original.getByText('Question 1',{exact:true}).waitFor();
    const submitted=original.locator('.quiz-review-submitted-answer');
    check((await submitted.innerText()).startsWith(wrongFirst?'B.':'A.'),'the review shows the learner\'s original choice');
    check(await submitted.evaluate((el,wrong)=>{const sample=document.createElement('span');sample.style.color=wrong?'var(--ui-danger-text)':'var(--ui-success-text)';el.append(sample);const matches=getComputedStyle(el).color===getComputedStyle(sample).color;sample.remove();return matches;},wrongFirst),'the original answer uses the correct feedback color');
    check(await original.locator('.quiz-review-correct-answer').innerText()==='A','the review only identifies the correct option by its letter');
    check(await original.locator('.quiz-review-answer-row').count()===2&&(await original.getByText('Answer D',{exact:true}).count())===0,'unused options are omitted from the expanded review');
    await solution.locator('.quiz-solution-steps').getByText('Worked example for the original question.').waitFor();
   }
   const streak=results.getByText(/Longest streak/);
   check(await streak.isVisible()===releaseAnswers,'results show a streak only after individual answers are released');
   check(await results.getByText('All answers correct!').isVisible()===(releaseAnswers&&!wrongFirst),'the perfect-score art only appears on a released perfect score');
   if(releaseAnswers)check((await streak.innerText()).includes((wrongFirst?'2':'3')+' correct in a row'),'the results summarize the complete streak');
   await p.reload();
   await p.locator('.quiz-result-summary').waitFor();
   check(await p.locator('.quiz-completion-overlay').count()===0,'reload does not replay completion confetti');
   await f.close();
  }
  for(const limit of [null,7]){
   const f=await open({lang:'en'},{touch:true,width:320}),p=f.page;
   await p.getByTestId('quiz-card-practice').first().tap();
   const dialog=p.getByRole('dialog',{name:'Practice settings'});
   const timer=dialog.getByRole('combobox',{name:'Attempt time limit'});
   await dialog.waitFor();
   check(!await timer.isVisible(),'the practice timer is collapsed by default');
   const feedback=dialog.getByRole('radio');
   check(await feedback.first().isChecked()&&(await feedback.first().getAttribute('name'))==='practice-feedback','the first practice feedback option is selected by default');
   if(limit){
    await dialog.getByText('Advanced options',{exact:true}).tap();
    check(await timer.inputValue()==='untimed','the default practice has no countdown');
    await timer.selectOption('timed');
    const minutes=dialog.getByRole('spinbutton',{name:'Minutes'});
    await minutes.fill('0');
    await dialog.getByRole('button',{name:'Start answering'}).tap();
    await dialog.getByRole('alert').waitFor();
    check(!f.writes.length,'invalid minutes are reported before starting a quiz');
    await minutes.fill(String(limit));
   }
   await dialog.getByRole('button',{name:'Start answering'}).tap();
   await dialog.waitFor({state:'hidden'});
   check(f.writes[0].action==='start'&&f.writes[0].immediate===true&&f.writes[0].timeLimitSeconds===(limit?limit*60:null),'starting sends the chosen self-practice time limit');
   await f.close();
  }
  {
   const f=await open({lang:'en'},{touch:true,width:320}),p=f.page;
   await p.getByTestId('quiz-assign-to-students').first().tap();
   const dialog=p.getByRole('dialog',{name:'Assign to students'});
   await dialog.getByRole('checkbox',{name:/Linked Student/}).check();
   const timer=dialog.getByRole('combobox',{name:'Attempt time limit'});
   check(!await timer.isVisible(),'teacher options start collapsed');
   await dialog.getByText('Advanced options',{exact:true}).tap();
   const shuffle=dialog.getByRole('checkbox',{name:'Shuffle questions',exact:true});
   const steps=dialog.getByRole('checkbox',{name:'Allow students to view solution steps'});
   check(await timer.inputValue()==='untimed'&&!await shuffle.isChecked()&&!await steps.isChecked(),'timer, shuffling and solutions opt in for a new assignment');
   await timer.selectOption('timed');
   await dialog.getByRole('spinbutton',{name:'Minutes'}).fill('12');
   await shuffle.check();
   await steps.check();
   await dialog.getByRole('button',{name:'Assign practice'}).tap();
   await p.getByRole('heading',{name:'Assigned to students'}).waitFor();
   const body=f.writes.find(body=>body.action==='assign');
   check(body.settings.timeLimitSeconds===720&&body.settings.shuffleQuestions===true&&body.settings.shuffleOptions===false&&body.settings.showSolutions===true,'assignment saves independent teacher-selected policies');
   await f.close();
  }
  {
   const f=await open({mode:'practice',lang:'en',theme:'dark'},{touch:true,soundProbe:'record'}),p=f.page;
   const speaker=p.getByRole('button',{name:'Sound settings',exact:true});
   const music=p.getByRole('switch',{name:'Background music',exact:true});
   const effects=p.getByRole('switch',{name:'Answer sounds',exact:true});
   await speaker.tap();
   await music.waitFor();
   check(await music.getAttribute('aria-checked')==='true'&&await effects.getAttribute('aria-checked')==='true','sound menu opens with both preferences enabled');
   await music.tap();
   check(await music.getAttribute('aria-checked')==='false'&&await effects.getAttribute('aria-checked')==='true','music and answer sounds have independent switches');
   await speaker.tap();
   await p.locator('.quiz-option-button').first().tap();
   await p.waitForFunction(()=>window.fixtureSounds.length===1);
   const correct=await p.evaluate(()=>window.fixtureSounds[0]);
   check(Math.abs(correct.duration-.5)<.001,'server-confirmed correct choice plays the supplied correct WAV');
   check(Math.abs(correct.gain-.07)<.001,'correct feedback uses the balanced default volume');
   await speaker.tap();
   const musicVolume=p.getByRole('slider',{name:'Background music volume'});
   const effectsVolume=p.getByRole('slider',{name:'Answer sounds volume'});
   check(await musicVolume.inputValue()==='24'&&await effectsVolume.inputValue()==='25','volume controls start at the previous balanced settings');
   await musicVolume.fill('31');
   await effectsVolume.fill('50');
   check(await music.getAttribute('aria-checked')==='false','adjusting volume does not turn music back on');
   await speaker.tap();
   await p.getByRole('button',{name:'Next question',exact:true}).tap();
   await p.locator('.quiz-option-button').nth(1).tap();
   await p.waitForFunction(()=>window.fixtureSounds.length===2);
   const incorrect=await p.evaluate(()=>window.fixtureSounds[1]);
   check(Math.abs(incorrect.duration-.46)<.001,'server-confirmed incorrect choice plays the supplied wrong WAV');
   check(Math.abs(incorrect.gain-.11)<.001,'changing the answer sounds volume changes the gain applied to the next cue');
   await speaker.tap();
   await effects.tap();
   await p.reload();
   await speaker.tap();
   check(await music.getAttribute('aria-checked')==='false'&&await effects.getAttribute('aria-checked')==='false','both preferences survive reopening the quiz');
   check(await musicVolume.inputValue()==='31'&&await effectsVolume.inputValue()==='50','both volume levels survive reopening the quiz');
   check((await p.evaluate(()=>window.fixtureSounds.length))===0,'resuming a graded question does not replay effects');
   await f.close();
  }
  for(const options of [{soundProbe:'muted'},{soundProbe:'zero'},{soundProbe:'record',deferred:true}]){
   const f=await open({mode:'practice',lang:'en'},options),p=f.page;
   await p.locator('.quiz-option-button').first().click();
   await (options.deferred?f.saveStarted:f.checkStarted);
   await p.waitForFunction(()=>document.querySelector('.quiz-autosave')?.textContent?.includes('Saved'));
   check((await p.evaluate(()=>window.fixtureSounds.length))===0,'muted, zero-volume, or deferred answering does not play a correctness cue');
   await f.close();
  }
  {
   const f=await open({lang:'en'},{touch:true}),p=f.page;
   await p.getByTestId('quiz-tab-mine').tap();
   await p.getByTestId('quiz-create').first().tap();
   await p.getByLabel('Quiz title',{exact:true}).fill('Manual multilingual exercise');
   await p.getByTestId('quiz-editor-syllabus').selectOption('spm');
   await p.getByTestId('quiz-editor-subject').selectOption('math');
   await p.getByTestId('quiz-editor-grade').selectOption('Form 4');
   await p.getByTestId('quiz-editor-topic').fill('Numbers');
   await p.getByRole('tab',{name:/^Questions/}).tap();
   const picker=p.getByTestId('quiz-editor-question-language'),stem=p.getByTestId('quiz-editor-prompt');
   const questionPicker=p.locator('.quiz-mobile-question-select select');
   check(await questionPicker.evaluate(select=>{
    const style=getComputedStyle(select);
    return style.borderTopStyle==='solid'&&parseFloat(style.borderTopWidth)>0&&style.borderTopColor!=='rgba(0, 0, 0, 0)'&&select.getBoundingClientRect().height>=44;
   }),'mobile question dropdown has an outline without focus and a full tap target');
   for(const [code,promptText,choice] of [['en','Which number is even?','Number'],['ms','Nombor yang manakah genap?','Nombor'],['zh','哪一个数是偶数？','数字']]){
    await picker.selectOption(code);
    check(await stem.inputValue()==='','an unentered language has its own blank prompt');
    await stem.fill(promptText);
    const options=p.locator('.quiz-option-editor textarea');
    for(let index=0;index<4;index++)await options.nth(index).fill(choice+' '+index);
   }
   await picker.selectOption('en');
   check(await stem.inputValue()==='Which number is even?','returning to English restores the earlier text');
   check(await p.locator('.quiz-option-editor textarea').first().inputValue()==='Number 0','returning to English restores the earlier options');
   await picker.selectOption('ms');
   check(await stem.inputValue()==='Nombor yang manakah genap?','returning to Malay restores the earlier text');
   await p.getByRole('button',{name:'Save draft',exact:true}).tap();
   const saved=await f.draftStarted,q=saved.content.questions[0];
   check(q.prompt.en==='Which number is even?'&&q.prompt.ms==='Nombor yang manakah genap?'&&q.prompt.zh==='哪一个数是偶数？'&&!('primary' in q.prompt),'manual draft saves three independent languages');
   check(q.options[0].text.en==='Number 0'&&q.options[0].text.ms==='Nombor 0'&&q.options[0].text.zh==='数字 0','saved answer options share stable IDs and independent languages');
   await p.getByTestId('quiz-hub').waitFor();
   await f.close();
  }
  {
   const f=await open({lang:'zh'},{importZip:true,width:390}),p=f.page;
   await p.getByTestId('quiz-tab-mine').click();
   await p.getByTestId('quiz-tools-more').click();
   await p.getByTestId('quiz-import').click();
   await p.getByTestId('quiz-import-tutorial').locator('summary').click();
   check((await p.getByTestId('quiz-import-tutorial').innerText()).includes('资料缺漏时，AI 应先提问'),'the Chinese tutorial explains required inputs and bilingual declaration');
   await p.getByTestId('quiz-import-file').setInputFiles(path.join(root,'public/downloads/tickminder-quiz-example.zip'));
   await p.locator('.quiz-editor').waitFor();
   check(await p.getByTestId('quiz-editor-syllabus').inputValue()==='spm'&&await p.getByTestId('quiz-editor-subject').inputValue()==='science','real ZIP preselects curriculum and subject in review');
   check(await p.getByTestId('quiz-editor-grade').inputValue()==='Form 2'&&await p.getByTestId('quiz-editor-topic').inputValue()==='Heat and Temperature','real ZIP preselects grade and topic in review');
   await p.getByRole('tab',{name:/^题目编辑/}).click();
   await p.getByTestId('quiz-editor-question-language').selectOption('zh');
   check(await p.getByTestId('quiz-editor-prompt').inputValue()==='哪一种仪器用来测量温度？','Chinese stem from the example remains editable');
   await p.getByRole('button',{name:'保存草稿',exact:true}).click();
   const imported=await f.draftStarted;
   check(imported.action==='maintenanceImport'&&imported.content.questions[0].prompt.ms.includes('mengukur suhu'),'ZIP draft uses the existing import save path and retains translations');
   await p.getByTestId('quiz-hub').waitFor();
   await f.close();
  }
  {
   const f=await open({mode:'practice',lang:'en'},{multilingual:true,touch:true}),p=f.page;
   const language=p.locator('#quiz-practice-language'),stem=p.locator('.quiz-player-question h3');
   await language.waitFor();
   check(await language.inputValue()==='en'&&(await stem.innerText()).includes('English test question'),'student sees the declared default language');
   await language.selectOption('ms');
   check((await stem.innerText()).includes('Soalan dalam Bahasa Melayu')&&(await p.locator('.quiz-option-button').first().innerText()).includes('Pilihan 0'),'student switches both stem and options to Malay');
   await language.selectOption('zh');
   check((await stem.innerText()).includes('这是一道华文题')&&(await p.locator('.quiz-option-button').first().innerText()).includes('选项 0'),'student switches both stem and options to Chinese');
   await p.locator('.quiz-option-button').first().tap();
   const checked=await f.checkStarted;
   check(checked.answers['question-0'].optionId==='option-0-A','switching language does not change the graded option ID');
   await f.close();
  }
  {const f=await open({lang:'en'},{failDraft:true}),p=f.page,save=await editDraft(f,'en');await save.click();await p.locator('.quiz-editor [role=alert]').waitFor();check(await p.getByLabel('Quiz title',{exact:true}).inputValue()==='Updated fixture quiz','failed draft save keeps edited content');check(await p.locator('.quiz-editor').isVisible(),'failed draft never navigates');await f.close();}
  {
   const f=await open({lang:'en'},{touch:true,failShareOnce:true}),p=f.page;
   await p.getByTestId('quiz-tab-mine').tap();
   await p.getByTestId('quiz-create').first().tap();
   const sharingTab=p.getByRole('tab',{name:'Sharing',exact:true});
   await sharingTab.tap();
   const panel=p.getByTestId('quiz-sharing-panel');
   await panel.getByRole('radio',{name:/Selected people/}).check();
   const recipient=panel.getByRole('checkbox',{name:/Linked Student/});
   await recipient.check();
   check(f.shareTargetQueries.length===1&&f.shareTargetQueries[0]===null,'new quiz can choose linked students before a draft exists');
   const publish=panel.getByRole('button',{name:'Save sharing settings',exact:true});
   await publish.tap();
   await panel.getByRole('alert').waitFor();
   check(f.writes.length===0,'an invalid new quiz cannot be saved or published');
   await p.getByRole('tab',{name:'Settings',exact:true}).tap();
   await p.getByLabel('Quiz title',{exact:true}).fill('Share an unsaved quiz');
   await p.getByTestId('quiz-editor-syllabus').selectOption('spm');
   await p.getByTestId('quiz-editor-subject').selectOption('math');
   await p.getByTestId('quiz-editor-grade').selectOption('Form 4');
   await p.getByTestId('quiz-editor-topic').fill('Numbers');
   await p.getByRole('tab',{name:/^Questions/}).tap();
   await p.getByTestId('quiz-editor-prompt').fill('What is two plus two?');
   const options=p.locator('.quiz-option-editor textarea');
   for(let index=0;index<4;index++)await options.nth(index).fill(String(index+4));
   await sharingTab.tap();
   check(await recipient.isChecked(),'recipient selection survives switching editor tabs');
   const rejected=p.waitForResponse(response=>response.status()===503&&response.request().postDataJSON()?.action==='share');
   await publish.tap();
   await rejected;
   await panel.getByRole('alert').waitFor();
   const [saved,failed]=f.writes;
   check(f.writes.length===2&&saved.action==='save'&&saved.revision===0&&failed.action==='share'&&failed.revision===1&&failed.id===saved.id,'publishing a new quiz first saves the draft and shares its stored revision');
   check(failed.visibility==='selected'&&failed.recipientIds.join(',')==='linked-student'&&await recipient.isChecked(),'a failed share retains the selected audience');
   const confirmed=p.waitForResponse(response=>response.ok()&&response.request().method()==='GET'&&new URL(response.url()).searchParams.get('id')===saved.id);
   await publish.tap();
   await confirmed;
   await panel.getByRole('alert').waitFor({state:'hidden'});
   check(f.writes.length===3&&f.writes[2].action==='share'&&f.writes[2].operationId===failed.operationId,'retry shares the saved draft with the same operation ID');
   await f.close();
  }
  {
   const f=await open({mode:'practice',lang:'en'},{baseNumbers:true,touch:true,width:320}),p=f.page;
   const numerals=p.locator('.quiz-option-button .quiz-formula-inline');
   await numerals.nth(3).waitFor();
   check(await numerals.evaluateAll(items=>items.length===4&&items.every(item=>getComputedStyle(item).scrollbarWidth==='none'&&item.querySelector('msub'))),'base-number options retain subscripts without visible scrollbars');
   await f.close();
  }
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
    check(await p.locator('.quiz-correct-ring').getAttribute('aria-label')==='1 / 2 questions correct','completed practice shows an accessible count of correct questions');
    check(await p.locator('.quiz-correct-ring-fill').evaluate(circle=>circle.style.getPropertyValue('--quiz-ring-offset'))==='50','the ring fills halfway for one correct answer out of two');
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
    check(await overview.count()===0&&await p.locator('.quiz-correct-ring,.quiz-solution').count()===0,'score release by itself keeps question results and steps private');
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
    return {left:formula.scrollLeft,width:formula.clientWidth,scrollWidth:formula.scrollWidth,vertical:getComputedStyle(formula).overflowY,scrollbar:getComputedStyle(formula).scrollbarWidth};
   });
   check(wide.left>0&&wide.scrollWidth>wide.width&&wide.vertical==='hidden'&&wide.scrollbar==='none','a long fraction stays horizontally scrollable without a visible scrollbar: '+JSON.stringify(wide));
   await f.close();
  }
 }
 fs.writeFileSync(path.join(evidence,baseline?'baseline.json':'results.json'),JSON.stringify({suite:'quiz-interaction-regressions-ui',baseline,checks,results,scope:'Real React components and generated CSS; deterministic fictional APIs only.'},null,2));console.log(JSON.stringify({suite:'quiz-interaction-regressions-ui',baseline,passed:checks,results,evidence}));
}catch(error){if(browser){const page=browser.contexts().flatMap(c=>c.pages()).at(-1);if(page){await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.txt'),String(error)+'\n'+await page.locator('body').innerText().catch(()=>''));}}throw error;}finally{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());const resolved=path.resolve(temporary);if(path.dirname(resolved)===path.resolve(os.tmpdir())&&path.basename(resolved).startsWith('tickminder-quiz-interactions-'))fs.rmSync(resolved,{recursive:true,force:true});}
