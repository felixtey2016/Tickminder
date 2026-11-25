import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {build} from 'esbuild';

// Real components and FINAL compiled production styles. API responses alone are
// fictional here; the companion real Worker regression validates the full server.
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-recovery-ui-'));
const evidence=process.env.RECOVERY_UI_EVIDENCE_DIR,client=path.resolve(process.env.RECOVERY_COMPILED_CLIENT||path.join(root,'dist/client'));
if(evidence)fs.mkdirSync(evidence,{recursive:true});
const cssDirectory=path.join(client,'_next/static/css');
assert(fs.existsSync(cssDirectory),'Build the actual Worker/client before this test; raw source CSS is deliberately unsupported.');
// Resolve the final build's actual dependency order, not chunk filename prefixes:
// recovery/roster CSS can be merged into a differently named shared chunk.
const serverAssets=path.join(path.dirname(client),'server');
function readAssetManifest(file){
 const source=fs.readFileSync(file,'utf8'),match=/^\s*export default\s+([\s\S]*?);?\s*$/.exec(source);
 assert(match,'Unsupported generated asset manifest: '+file);return JSON.parse(match[1]);
}
const manifest=JSON.parse(fs.readFileSync(path.join(client,'.vite/manifest.json'),'utf8'));
const assets=readAssetManifest(path.join(serverAssets,'vinext-client-assets.js'));
const resources=readAssetManifest(path.join(serverAssets,'__vite_rsc_assets_manifest.js')).serverResources;
const registered=new Set([...Object.values(manifest).flatMap(entry=>[...(entry.css||[]),...(entry.file?.endsWith('.css')?[entry.file]:[])]),...Object.values(resources).flatMap(entry=>entry.css||[])].map(file=>file.replace(/^\//,'')));
const realClient=fs.realpathSync(client),realCss=fs.realpathSync(cssDirectory);
assert(realCss.startsWith(realClient+path.sep),'Compiled CSS directory must remain inside the selected client build');
function compiledPath(file){
 const relative=file.replace(/^\//,'');assert(/^_next\/static\/css\/[A-Za-z0-9_.-]+\.css$/.test(relative)&&registered.has(relative),'Unregistered or unsafe compiled CSS path: '+file);
 const resolved=fs.realpathSync(path.join(client,relative));assert(resolved.startsWith(realCss+path.sep)&&fs.statSync(resolved).isFile(),'Compiled CSS escapes the selected client build: '+file);return resolved;
}
const selected=new Set(),styles=[];
function addCss(file){const resolved=compiledPath(file);if(selected.has(resolved))return;selected.add(resolved);styles.push(path.basename(resolved));}
function moduleCss(key){
 assert(manifest[key],'Missing compiled module: '+key);
 if(assets.dynamicPreloads[key]){for(const file of assets.dynamicPreloads[key])if(file.endsWith('.css'))addCss(file);return;}
 // Static shared modules need the same own-then-import order used by the
 // generated dynamicPreloads closure, without traversing unrelated lazy pages.
 const visited=new Set();function visit(current){if(visited.has(current))return;visited.add(current);const entry=manifest[current];assert(entry,'Missing compiled dependency: '+current);for(const file of entry.css||[])addCss(file);for(const dependency of entry.imports||[])visit(dependency);}visit(key);
}
assert(resources['app/layout.tsx']?.css?.length,'Missing compiled global layout CSS');
for(const file of resources['app/layout.tsx'].css)addCss(file);
for(const key of ['components/app-select-host.tsx','app/scheduler-entry.tsx','app/scheduler.tsx'])moduleCss(key);
// Keep the previous collision modules: a user can visit these before settings,
// so their styles remain loaded even though settings itself does not import them.
for(const name of ['directory-tools','learning-list-detail','learning-portal','homework-tasks-workspace','person-identity-fields','course-query-ui']){
 const keys=Object.keys(manifest).filter(key=>manifest[key].name===name);
 assert(keys.length<=1,'Ambiguous compiled collision module: '+name);if(keys.length)moduleCss(keys[0]);
}
moduleCss('app/account-settings.tsx');
const signatures={
 index:['.auth-shell'],appSelect:['.app-select-overlay','.app-select-panel'],recovery:['.password-recovery-trigger-login','.password-recovery-dialog'],
 serviceBrand:['.service-brand-icon','.service-brand-heading'],notifications:['.notification-page','.notification-inbox'],directory:['.directory-section-head','.directory-filters'],people:['.people-name-line','.people-row-details'],
 learningList:['.learning-homework-workspace','.learning-browser'],learningPortal:['.resource-folder-list','.resource-folder-cards'],homework:['.homework-tasks-workspace','.homework-tasks-tabs'],
 quiz:['.quiz-workspace','.quiz-editor'],person:['.account-person-fields','.account-provisioning-form'],courseQuery:['.course-query-stack','.course-query-pagination'],courseWave:['.course-wave2','.course-query-filterbar'],
 tasks:['.task-inbox','.task-inbox-filters'],horizontalMenu:['.horizontal-menu'],shell:['.shell-wave1','.mobile-bottom-nav'],accountSettings:['.account-preference-panel','.preference-content'],scheduler:['.account-settings-compact','.management-navigation']
};
const compiled=new Map([...registered].map(file=>[file,fs.readFileSync(compiledPath(file),'utf8')]));
for(const [role,selectors] of Object.entries(signatures)){
 const loaded=styles.map(name=>fs.readFileSync(path.join(cssDirectory,name),'utf8')).join('\n');
 if(selectors.every(selector=>loaded.includes(selector)))continue;
 // A future merge may remove a shared module entry entirely. Accept only one
 // manifest-registered compiled owner containing all required semantic rules.
 const matches=[...compiled].filter(([,text])=>selectors.every(selector=>text.includes(selector))).map(([file])=>file);
 assert.equal(matches.length,1,'Missing or ambiguous compiled '+role+' collision rules');addCss(matches[0]);
}
const css=styles.map(name=>fs.readFileSync(path.join(cssDirectory,name),'utf8')).join('\n');
for(const [role,selectors] of Object.entries(signatures))assert(selectors.every(selector=>css.includes(selector)),'Missing compiled '+role+' coverage');
assert(css.includes('.password-recovery-dialog'),'Recovery styles must come from the real compiled assets. Module CSS is included to check collision regressions.');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'file:///opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{PasswordRecoveryButton,recoveryReturnPath}from'./app/password-recovery';import{readRecoveryState}from'./lib/password-recovery-ui-state';import{AccountSettings}from'./app/account-settings';import{MobileBottomNavigation}from'./components/mobile-bottom-navigation';import{ShellPreferences}from'./components/shell-preferences';import{House,BookOpen,WalletCards,UserRound}from'lucide-react';import{setLanguage}from'./lib/i18n';const q=new URLSearchParams(location.search),language=q.get('lang')==='en'?'en':'zh';setLanguage(language);window.__recoveryReturnPath=recoveryReturnPath;window.__readRecoveryState=readRecoveryState;document.documentElement.classList.toggle('dark',q.get('dark')==='1');createRoot(document.getElementById('root')).render(q.get('settings')==='1'?<div className="app-shell shell-wave1 four-entry-shell"><header className="topbar"><strong>Tickminder</strong><ShellPreferences language={language} onLanguageChange={()=>{}}/></header><main className="workspace"><AccountSettings/></main><MobileBottomNavigation primary items={[{value:'home',label:'Home',Icon:House},{value:'teaching',label:'Teaching',Icon:BookOpen},{value:'finance',label:'Finance',Icon:WalletCards},{value:'account',label:'Account',Icon:UserRound}]} active="account" onNavigate={()=>{}}/></div>:<main className="auth-shell auth-login-shell"><div className="auth-layout"><section className="auth-story"><strong>Tickminder</strong><h2>Learning & collaboration</h2></section><div className="auth-card"><h1>{language==='zh'?'登录':'Sign in'}</h1><label>{language==='zh'?'账号':'Account'}<input autoComplete="username"/></label><PasswordRecoveryButton language={language} initialIdentifier="must-not-prefill-login" previewOnly={q.get('preview')==='1'}/></div></div></main>);`;
await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'password-recovery-ui-entry.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'esm',jsx:'automatic',outfile:path.join(temp,'ui.js'),alias:{'@':root},logLevel:'silent'});
const server=http.createServer((req,res)=>{if(req.url.startsWith('/ui.js')){res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(path.join(temp,'ui.js')));}else if(req.url.startsWith('/compiled.css')){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="'+(req.url.includes('scaled=1')?'width=980':'width=device-width,initial-scale=1')+'"><link rel="stylesheet" href="/compiled.css"></head><body><div id="root"></div><script type="module" src="/ui.js"></script></body></html>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const key='tickminder:password-recovery:v1',screenshots=[],labels=[],measurements=[];let browser,active;
const check=(value,label)=>{assert(value,label);labels.push(label);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){for(let i=0;i<80;i++){if(await fn())return;await sleep(25);}assert(false,'Condition timed out');}
async function capture(f,name){if(evidence){await f.page.screenshot({path:path.join(evidence,name+'.png'),fullPage:false,animations:'disabled'});screenshots.push(name);}}
async function fixture({width=390,language='en',dark=false,settings=false,preview=false,routePath='/',keyboard=false,scaled=false,available=true}={}){
 const context=await browser.newContext({viewport:{width:scaled?390:width,height:844},isMobile:scaled||width<761,hasTouch:scaled||width<761,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[];active=page;
 const controls={available,getFailure:false,hold:null,release:null,failure:null,challenge:0,ordinaryPasswordPosts:0,recoveryCalls:0,username:'fictional.student'};
 if(keyboard)await context.addInitScript(({width})=>{const visual=new EventTarget();Object.assign(visual,{height:844,width,offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{value:visual});window.__setQaViewport=(height,offsetTop=0,width=visual.width,scale=visual.scale,offsetLeft=0)=>{Object.assign(visual,{height,offsetTop,width,scale,offsetLeft});visual.dispatchEvent(new Event('resize'));};},{width});
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>{errors.push(dialog.message());void dialog.dismiss();});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());let result={};
  if(url.pathname==='/api/password-recovery'){
   controls.recoveryCalls++;
   if(request.method()==='GET'){await route.fulfill({status:controls.getFailure?503:200,contentType:'application/json',body:JSON.stringify({available:controls.available})});return;}
   const body=request.postDataJSON();requests.push(body);
   if(controls.hold===body.action)await new Promise(resolve=>{controls.release=resolve;});
   if(controls.failure?.action===body.action){if(controls.failure.abort){await route.abort('failed').catch(()=>{});return;}await route.fulfill({status:controls.failure.status||400,contentType:'application/json',body:JSON.stringify({code:controls.failure.code,error:'验证码无效或已过期'})}).catch(()=>{});return;}
   if(body.action==='request')result={ok:true,challenge:'fictional-encrypted-challenge-'+(++controls.challenge),retryAfter:60,expiresIn:600};
   else if(body.action==='verify')result={ok:true,resetToken:'fictional-purpose-bound-reset-token',expiresIn:540};
   else result={ok:true};
  }else if(url.pathname==='/api/auth')result={account:{name:'Fictional Student',role:'teacher',groupId:'fixture-group',username:controls.username,email:'fixture@example.invalid',googleLinked:true,emailLoginAvailable:true},clientId:null};
  else if(url.pathname==='/api/notification-preferences')result={availableCategories:['courses'],preferences:{courses:true,homework:true,fees:true},pushConfigured:false};
  else if(url.pathname==='/api/account-devices')result={devices:[]};
  else if(url.pathname==='/api/password'){controls.ordinaryPasswordPosts++;result={ok:true};}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 const destination=new URL(routePath,origin);destination.searchParams.set('lang',language);destination.searchParams.set('dark',dark?1:0);destination.searchParams.set('settings',settings?1:0);destination.searchParams.set('preview',preview?1:0);destination.searchParams.set('scaled',scaled?1:0);await page.goto(destination.href);
 if(settings)await page.locator('.account-security-section').filter({has:page.getByText(language==='zh'?'修改密码':'Change password',{exact:true})}).locator('summary').click();
 const trigger=page.getByTestId('forgot-password-'+(settings?'settings':'login'));await trigger.click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 const f={context,page,dialog,requests,errors,controls,trigger,language,width,dark,preview};
 return f;
}
const primary=f=>f.dialog.locator('.password-recovery-primary');
async function send(f){await f.dialog.locator('input[name=username]').fill('fictional.student');await primary(f).click();await f.dialog.locator('input[name=code]').waitFor();}
async function verify(f){await f.dialog.locator('input[name=code]').fill('012345');await primary(f).click();await f.dialog.locator('input[name=new-password]').waitFor();}
async function passwords(f,confirm='Fictional-New-Password!'){await f.dialog.locator('input[name=new-password]').fill('Fictional-New-Password!');await f.dialog.locator('input[name=confirm-password]').fill(confirm);}
async function saved(f){return f.page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'null'),key);}
async function geometry(f,label){
 await f.page.waitForTimeout(80);
 const m=await f.dialog.evaluate(el=>{const rect=x=>{const r=x.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};},s=getComputedStyle(el),v=visualViewport;return{dialog:rect(el),body:rect(el.querySelector('.password-recovery-body')),footer:rect(el.querySelector('.password-recovery-actions')),close:rect(el.querySelector('[data-slot=dialog-close]')),title:rect(el.querySelector('[data-slot=dialog-title]')),viewport:{top:v.offsetTop,left:v.offsetLeft||0,width:v.width,height:v.height,scale:v.scale},layout:{width:innerWidth,height:innerHeight},translate:s.translate,transform:s.transform,overflow:el.scrollWidth>el.clientWidth+1,focused:el.contains(document.activeElement)?rect(document.activeElement):null};});
 measurements.push({label,...m});
 check(m.dialog.top>=m.viewport.top-1&&m.dialog.bottom<=m.viewport.top+m.viewport.height+1&&m.dialog.left>=m.viewport.left-1&&m.dialog.right<=m.viewport.left+m.viewport.width+1,'visible dialog '+label);
 check(m.dialog.left>=-1&&m.dialog.right<=m.layout.width+1&&m.dialog.top>=-1&&m.dialog.bottom<=m.layout.height+1,'independent actual layout bounds '+label);
 check(m.footer.bottom<=m.dialog.bottom&&m.footer.top>=m.dialog.top,'visible actions '+label);
 check(m.title.right<=m.close.left+1||m.title.top>=m.close.bottom,'heading clear of close '+label);
 check(m.close.width>=44&&m.close.height>=44&&!m.overflow,'touch size and no overflow '+label);
 check(m.translate==='none'&&m.transform==='none','compiled Tailwind translate defeated '+label);
 return m;
}
async function done(f){check(f.errors.length===0,'no browser errors');f.controls.release?.();await f.context.close();}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
 for(const width of[320,390,1280])for(const language of['zh','en'])for(const dark of[false,true]){
  const f=await fixture({width,language,dark,settings:width===390}),tag=width+'-'+language+'-'+(dark?'dark':'light'),input=f.dialog.locator('input[name=username]');
  await input.waitFor();check(await input.inputValue()===(width===390?'fictional.student':''),'login empty/settings prefilled '+tag);check(await input.getAttribute('placeholder')===null,'no example placeholder '+tag);
  await geometry(f,tag+'-identifier');await capture(f,tag+'-identifier');
  await send(f);check(await f.dialog.locator('input[type=password]').count()===0,'code screen has no password');
  check(await f.dialog.locator('input[name=code]').getAttribute('autocomplete')==='one-time-code','OTP autofill');
  check(await f.dialog.getByRole('button',{name:/重新发送|Resend code/}).isDisabled(),'resend cooldown');
  check(f.controls.ordinaryPasswordPosts===0,'recovery never submits parent settings form');
  await geometry(f,tag+'-code');await capture(f,tag+'-code');
  await f.dialog.locator('input[name=code]').fill('012345');await f.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));check(await f.dialog.locator('input[name=code]').inputValue()==='012345','Gmail visibility alone retains live form');
  check(!(JSON.stringify(await saved(f))).includes('012345'),'OTP never persisted');
  await f.page.reload();await f.dialog.locator('input[name=code]').waitFor();
  check(await f.dialog.locator('input[name=code]').inputValue()===''&&f.requests.length===1,'reload restores code step without resend/OTP');
  await verify(f);check(await f.dialog.locator('input[name=code]').count()===0,'password only after verify response');
  check(f.requests[1].action==='verify'&&!('newPassword'in f.requests[1]),'verify cannot submit password');
  await passwords(f);const snapshot=await saved(f);
  check(snapshot.step==='password'&&snapshot.resetToken&&!snapshot.challenge&&!JSON.stringify(snapshot).includes('Fictional-New-Password!'),'only short-lived grant persisted after verify');
  await f.page.reload();await f.dialog.locator('input[name=new-password]').waitFor();
  check(await f.dialog.locator('input[name=new-password]').inputValue()===''&&f.requests.length===2,'reload restores verified stage without password or API replay');
  await geometry(f,tag+'-password');await capture(f,tag+'-password');
  await passwords(f,'mismatch');await primary(f).click();check(f.requests.length===2,'password mismatch stays local');
  await passwords(f);await primary(f).click();await f.dialog.locator('[data-slot=dialog-title]').filter({hasText:language==='zh'?'密码已更新':'Password updated'}).waitFor();
  check(f.requests[2].action==='reset'&&f.requests[2].resetToken&&!('code'in f.requests[2])&&!('challenge'in f.requests[2]),'reset uses grant only');
  check(await saved(f)===null&&await f.dialog.locator('input').count()===0,'success clears stored and live credentials');
  await capture(f,tag+'-success');await done(f);
 }
 // Pending operations survive a discarded tab as explicit uncertainty, never auto-replay.
 for(const action of['request','verify','reset']){
  const f=await fixture();await f.dialog.locator('input[name=username]').waitFor();
  if(action!=='request')await send(f);if(action==='reset'){await verify(f);await passwords(f);}else if(action==='verify')await f.dialog.locator('input[name=code]').fill('012345');else await f.dialog.locator('input[name=username]').fill('fictional.student');
  f.controls.hold=action;const before=f.requests.length;await primary(f).click();await until(()=>f.requests.length===before+1);await until(async()=>Boolean((await saved(f))?.pending===action));
  check(await f.dialog.locator('[data-slot=dialog-close]').isDisabled(),'pending close locked '+action);await f.page.keyboard.press('Escape');check(await f.dialog.isVisible(),'pending escape locked '+action);
  await f.page.goBack();await f.dialog.waitFor();check(f.requests.length===before+1,'pending mobile Back does not duplicate '+action);
  f.controls.hold=null;await f.page.reload();
  await f.dialog.waitFor();await until(async()=>await f.dialog.getAttribute('data-recovery-step')===(action==='reset'?'unknown':action==='verify'?'code':'identifier'));
  check(f.requests.length===before+1,'reload never retries '+action);
  check(await f.dialog.locator('input[type=password]').count()===0,'uncertain request does not restore secrets '+action);
  if(action==='verify')check((await f.dialog.innerText()).includes('could not confirm verification'),'pending verify gives explicit retry guidance');
  if(action==='request')check((await f.dialog.innerText()).includes('new email'),'pending request requires new email');
  if(action==='reset')check((await f.dialog.innerText()).includes('may have changed')&&await primary(f).innerText()==='Back to sign in','pending reset unknown login exit');
  await capture(f,'reload-pending-'+action);await done(f);
 }
 // Bounded hung requests release locks; reset is not automatically retried.
 for(const action of['request','verify','reset']){
  const f=await fixture();await f.dialog.locator('input[name=username]').waitFor();await f.page.clock.install();
  if(action!=='request')await send(f);if(action==='reset'){await verify(f);await passwords(f);}else if(action==='verify')await f.dialog.locator('input[name=code]').fill('012345');else await f.dialog.locator('input[name=username]').fill('fictional.student');
  f.controls.hold=action;await primary(f).click();await until(()=>Boolean(f.controls.release));await f.page.clock.runFor(30_100);
  check(await f.dialog.locator('[data-slot=dialog-close]').isEnabled(),'30s timeout unlock '+action);
  check(action==='reset'?await f.dialog.getAttribute('data-recovery-step')==='unknown':await f.dialog.getByRole('alert').count()===1,'timeout uncertainty '+action);await done(f);
 }
 // Keyboard visual viewport and scaled desktop-site mode: body scrolls, footer stays reachable.
 for(const width of[320,390,980])for(const language of['zh','en']){
  const scaled=width===980,f=await fixture({width,language,keyboard:!scaled,scaled});await send(f);await verify(f);
  if(scaled)await f.page.setViewportSize({width:390,height:430});else await f.page.evaluate(()=>window.__setQaViewport(430,24));
  await f.dialog.locator('input[name=confirm-password]').focus();const tag='keyboard-'+width+'-'+language,m=await geometry(f,tag);
  check(m.focused.top>=m.body.top-1&&m.focused.bottom<=m.body.bottom+1,'focused input scrolls above keyboard '+tag);
  await capture(f,tag);await done(f);
 }
 // Rejected verify cannot reveal the password screen.
 {
  const f=await fixture();await send(f);f.controls.failure={action:'verify',code:'INVALID_CODE'};await f.dialog.locator('input[name=code]').fill('000000');await primary(f).click();await f.dialog.getByRole('alert').waitFor();
  check(await f.dialog.locator('input[name=new-password]').count()===0,'wrong code never reveals password');check((await saved(f)).step==='code','wrong code preserves challenge');await done(f);
 }
 // Expiry, close, idle Back, cross-account and untrusted storage bounds.
 {
  const f=await fixture();await send(f);await f.page.clock.install();await f.page.clock.runFor(600_100);await f.page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await until(async()=>await saved(f)===null);check(await saved(f)===null,'expiry clears stored challenge');check(await f.dialog.getAttribute('data-recovery-step')==='identifier','expiry returns to request');
  await f.dialog.locator('[data-slot=dialog-close]').click();await f.dialog.waitFor({state:'hidden'});check(await saved(f)===null,'close clears progress');await f.page.reload();check(await f.dialog.count()===0,'closed flow never reopens');await done(f);
 }
 {
  const f=await fixture();await send(f);await f.page.goBack();await f.dialog.waitFor({state:'hidden'});check(await saved(f)===null,'idle mobile Back clears progress');await done(f);
 }
 {
  const f=await fixture({settings:true});await send(f);f.controls.username='another.fictional';await f.page.reload();await f.page.getByTestId('forgot-password-settings').waitFor({state:'attached'});check(await saved(f)===null&&await f.dialog.count()===0,'settings account change invalidates stored progress');await done(f);
 }
 {
  const f=await fixture();await send(f);const valid=await saved(f);const cases=[{...valid,returnTo:'https://example.invalid/'},{...valid,returnTo:'//example.invalid/'},{...valid,returnTo:'/?lang=en&returnTo=https://example.invalid/'},{...valid,expiresAt:Date.now()+900_000},{...valid,expiresAt:Date.now()-1},{...valid,challenge:'x'.repeat(25_000)},{...valid,owner:'another'},{...valid,context:'settings'},{...valid,step:'password',resetToken:''},{...valid,pending:'reset'},{...valid,version:99}];
  for(const bad of cases){const accepted=await f.page.evaluate(({key,bad})=>{sessionStorage.setItem(key,JSON.stringify(bad));return window.__readRecoveryState('login','',window.__recoveryReturnPath(location.pathname,location.search,'en'));},{key,bad});check(accepted===null,'reject untrusted recovery snapshot');}
  await done(f);
 }
 for(const language of['zh','en']){
  const f=await fixture({language,preview:true});await f.dialog.locator('input[name=username]').waitFor();await primary(f).click();await f.dialog.locator('input[name=code]').waitFor();await primary(f).click();await f.dialog.locator('input[name=new-password]').waitFor();await primary(f).click();await primary(f).click();await f.dialog.waitFor({state:'hidden'});check(f.controls.recoveryCalls===0&&f.requests.length===0&&await saved(f)===null,'preview has zero recovery API/storage '+language);await done(f);
 }
 {
  const f=await fixture({available:false});await f.dialog.getByRole('status').filter({hasText:'temporarily unavailable'}).waitFor();check(await f.dialog.locator('input').count()===0,'unavailable service gives no submission');await done(f);
 }
 {
  const quiz='abcdefghijklmnop',assignment='qrstuvwxyz123456',f=await fixture({routePath:'/quiz/'+quiz+'?assignment='+assignment});await send(f);await f.page.reload();await verify(f);await passwords(f);await primary(f).click();await until(async()=>await f.dialog.getAttribute('data-recovery-step')==='success');await primary(f).click();await f.page.waitForURL(url=>url.pathname==='/quiz/'+quiz&&url.searchParams.get('assignment')===assignment);check(await saved(f)===null,'success preserves valid assigned Quiz and clears storage');await done(f);
 }
 const sourceSha256=Object.fromEntries(['app/password-recovery.tsx','app/password-recovery.css','lib/password-recovery-ui-state.ts'].map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]));
 const result={passed:true,checks:labels.length,screenshots,labels,measurements,compiledClient:client,compiledStyles:styles.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(cssDirectory,file))).digest('hex')})),sourceSha256,physicalKeyboardTested:false};
 if(evidence)fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,checks:labels.length,screenshots:screenshots.length,compiledStyles:styles.length}));
}catch(error){if(evidence&&active)await active.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
