import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {build} from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

// Real recovery/settings components in a browser; only remote APIs are replaced.
// Fictional codes and accounts never leave this local test server.
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-recovery-ui-'));
const evidence=process.env.RECOVERY_UI_EVIDENCE_DIR;if(evidence)fs.mkdirSync(evidence,{recursive:true});const screenshots=[],labels=[];
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'file:///opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{PasswordRecoveryButton,recoveryReturnPath}from'./app/password-recovery';import{AccountSettings}from'./app/account-settings';import{MobileBottomNavigation}from'./components/mobile-bottom-navigation';import{ShellPreferences}from'./components/shell-preferences';import{House,BookOpen,WalletCards,UserRound}from'lucide-react';import{setLanguage}from'./lib/i18n';import'./app/shell-wave1.css';const q=new URLSearchParams(location.search),language=q.get('lang')==='en'?'en':'zh';setLanguage(language);window.__recoveryReturnPath=recoveryReturnPath;document.documentElement.classList.toggle('dark',q.get('dark')==='1');createRoot(document.getElementById('root')).render(q.get('settings')==='1'?<div className="app-shell shell-wave1 four-entry-shell"><header className="topbar"><strong>Tickminder</strong><ShellPreferences language={language} onLanguageChange={()=>{}}/></header><main className="workspace"><AccountSettings/></main><MobileBottomNavigation primary items={[{value:'home',label:'Home',Icon:House},{value:'teaching',label:'Teaching',Icon:BookOpen},{value:'finance',label:'Finance',Icon:WalletCards},{value:'account',label:'Account',Icon:UserRound}]} active="account" onNavigate={()=>{}}/></div>:<main className="auth-shell auth-login-shell"><div className="auth-layout"><section className="auth-story"><strong>Tickminder</strong><h2>Learning & collaboration</h2></section><div className="auth-card"><h1>{language==='zh'?'登录':'Sign in'}</h1><label>{language==='zh'?'账号':'Account'}<input autoComplete="username"/></label><PasswordRecoveryButton language={language} initialIdentifier="fictional.student" previewOnly={q.get('preview')==='1'}/></div></div></main>);`;
await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'password-recovery-ui-entry.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'esm',jsx:'automatic',outfile:path.join(temp,'ui.js'),alias:{'@':root},logLevel:'silent'});
const globals=await postcss([tailwind({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')});
// Use every global stylesheet in the real RootLayout, in its production order.
const layoutCss=[...fs.readFileSync(path.join(root,'app/layout.tsx'),'utf8').matchAll(/import\s+"(\.\/[^"\n]+\.css)"/g)].map(match=>'app/'+match[1].slice(2)).filter(file=>file!=='app/globals.css');
const css=globals.css+'\n'+layoutCss.map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n')+'\n'+fs.readFileSync(path.join(temp,'ui.css'),'utf8');
const server=http.createServer((req,res)=>{if(req.url.startsWith('/ui.js')){res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(path.join(temp,'ui.js')));}else if(req.url.startsWith('/ui.css')){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script type="module" src="/ui.js"></script></body></html>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser,checks=0,active;const check=(value,label)=>{assert(value,label);checks++;labels.push(label);};
async function capture(f,name){if(!evidence)return;await f.page.screenshot({path:path.join(evidence,name+'.png'),fullPage:false,animations:'disabled'});screenshots.push(name);}
async function fixture({width=390,language='en',dark=false,settings=false,preview=false,routePath='/',keyboard=false}={}){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[];active=page;
 const controls={available:true,getFailure:false,requestDelay:0,resetCode:null,challenge:0,ordinaryPasswordPosts:0,recoveryCalls:0,holdRequest:false,holdReset:false,releaseRequest:null,releaseReset:null,resetNetworkFailure:false};
 if(keyboard)await context.addInitScript(()=>{const visual=new EventTarget();Object.assign(visual,{height:900,width:innerWidth,offsetTop:0,scale:1});Object.defineProperty(window,'visualViewport',{value:visual});window.__setQaViewport=(height,offsetTop=0)=>{Object.assign(visual,{height,offsetTop});visual.dispatchEvent(new Event('resize'));};});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>{errors.push(dialog.message());void dialog.dismiss();});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());let result={};
  if(url.pathname==='/api/password-recovery'){
   controls.recoveryCalls++;
   if(request.method()==='GET'){await route.fulfill({status:controls.getFailure?503:200,contentType:'application/json',body:JSON.stringify({available:controls.available})});return;}
   const body=request.postDataJSON();requests.push(body);
   if(body.action==='request'){
    if(controls.holdRequest)await new Promise(resolve=>{controls.releaseRequest=resolve;});
    if(controls.requestDelay)await new Promise(resolve=>setTimeout(resolve,controls.requestDelay));
    result={ok:true,challenge:'fictional-encrypted-challenge-'+(++controls.challenge),retryAfter:60,expiresIn:600};
   }else{if(controls.holdReset)await new Promise(resolve=>{controls.releaseReset=resolve;});if(controls.resetNetworkFailure){await route.abort('failed');return;}if(controls.resetCode){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:controls.resetCode,error:'验证码无效或已过期'})});return;}result={ok:true};}
  }else if(url.pathname==='/api/auth')result={account:{name:'Fictional Student',role:'teacher',groupId:'fixture-group',username:'fictional.student',email:'fixture@example.invalid',googleLinked:true,emailLoginAvailable:true},clientId:null};
  else if(url.pathname==='/api/notification-preferences')result={availableCategories:['courses'],preferences:{courses:true,homework:true,fees:true},pushConfigured:false};
  else if(url.pathname==='/api/account-devices')result={devices:[]};
  else if(url.pathname==='/api/password'){controls.ordinaryPasswordPosts++;result={ok:true};}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 const destination=new URL(routePath,origin);destination.searchParams.set('lang',language);destination.searchParams.set('dark',dark?1:0);destination.searchParams.set('settings',settings?1:0);destination.searchParams.set('preview',preview?1:0);await page.goto(destination.href);
 if(settings)await page.locator('.account-security-section').filter({has:page.getByText(language==='zh'?'修改密码':'Change password',{exact:true})}).locator('summary').click();
 const trigger=page.getByTestId('forgot-password-'+(settings?'settings':'login'));await trigger.click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 return{context,page,dialog,requests,errors,controls,trigger,language,width,dark};
}
async function send(f){const send=f.dialog.getByRole('button',{name:f.language==='zh'?'发送验证码':'Send code',exact:true});await send.click();await f.dialog.locator('input[name=code]').waitFor();}
async function fillReset(f,{code='012345',password='Fictional-New-Password!',confirm=password}={}){await f.dialog.locator('input[name=code]').fill(code);await f.dialog.locator('input[name=new-password]').fill(password);await f.dialog.locator('input[name=confirm-password]').fill(confirm);}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
 for(const width of[320,390,1280])for(const language of['zh','en'])for(const dark of[false,true]){
  const f=await fixture({width,language,dark,settings:width===390}),{page,dialog,controls,requests}=f;
  await dialog.locator('input[name=username]').waitFor();
  check(await dialog.locator('input[name=username]').inputValue()==='fictional.student','prefilled username '+width+language+dark);
  check(await dialog.locator('input[name=username]').getAttribute('placeholder').then(value=>value.includes('@')),'identifier placeholder includes email choice');
  await capture(f,`${width}-${language}-${dark?'dark':'light'}-identifier`);
  controls.requestDelay=150;
  await dialog.getByRole('button',{name:language==='zh'?'发送验证码':'Send code',exact:true}).evaluate(button=>{button.click();button.click();});
  await dialog.locator('input[name=code]').waitFor();
  check(requests.filter(r=>r.action==='request').length===1,'duplicate send prevented');
  check(controls.ordinaryPasswordPosts===0,'recovery submit never submits surrounding password form');
  check(await dialog.locator('input[name=code]').getAttribute('inputmode')==='numeric'&&await dialog.locator('input[name=code]').getAttribute('autocomplete')==='one-time-code','OTP keyboard and autofill');
  check(await dialog.getByRole('button',{name:/重新发送|Resend code/}).isDisabled(),'resend cooldown');
  check(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'dialog no horizontal overflow');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page no horizontal overflow');
  const color=await dialog.evaluate(el=>getComputedStyle(el).backgroundColor);check(color===(dark?'rgb(32, 35, 43)':'rgb(255, 255, 255)'),'matching theme surface');
  const geometry=await dialog.evaluate(el=>{const box=el.getBoundingClientRect(),footer=el.querySelector('.password-recovery-actions').getBoundingClientRect(),close=el.querySelector('[data-slot=dialog-close]').getBoundingClientRect(),heading=el.querySelector('[data-slot=dialog-title]').getBoundingClientRect();return{onScreen:box.left>=-1&&box.right<=innerWidth+1&&box.top>=-1&&box.bottom<=innerHeight+1,footerVisible:footer.bottom<=box.bottom&&footer.top>=box.top,titleClear:heading.right<=close.left||heading.top>=close.bottom,closeSize:close.width>=44&&close.height>=44};});
  check(geometry.onScreen&&geometry.footerVisible,'dialog and actions fit visible viewport');check(geometry.titleClear&&geometry.closeSize,'title clears touch-sized close control');
  if(width===390){check(await page.getByTestId('mobile-bottom-navigation').isHidden(),'real primary navigation yields to modal');check(await page.evaluate(()=>{const z=selector=>Number(getComputedStyle(document.querySelector(selector)).zIndex);return z('.password-recovery-overlay')>z('.topbar')&&z('.password-recovery-dialog')>z('.password-recovery-overlay');}),'recovery overlay and content layer above real sticky header');}
  await capture(f,`${width}-${language}-${dark?'dark':'light'}-code`);
  await fillReset(f,{confirm:'Different-Password!'});const reset=dialog.getByRole('button',{name:language==='zh'?'设置新密码':'Set new password',exact:true});await reset.click();
  await dialog.getByRole('alert').waitFor();check(requests.filter(r=>r.action==='reset').length===0,'mismatched passwords stay local');
  check(await dialog.getByRole('alert').evaluate(el=>el===document.activeElement),'validation error receives focus');
  if(width===320)await capture(f,`${width}-${language}-${dark?'dark':'light'}-error`);
  await fillReset(f);controls.resetCode='INVALID_CODE';await reset.click();await dialog.getByRole('alert').waitFor();
  check((await dialog.getByRole('alert').innerText()).includes(language==='zh'?'验证码':'code'),'invalid code localized');
  check(requests.at(-1).code==='012345','leading zero preserved');
  controls.resetCode=null;await reset.click();await dialog.getByRole('button',{name:language==='zh'?'返回登录':'Back to sign in',exact:true}).waitFor();
  check(await dialog.locator('input').count()===0,'success removes all sensitive inputs');
  await page.waitForFunction(()=>document.activeElement?.matches('[data-slot=dialog-title]'));check(true,'completion heading receives focus');
  await capture(f,`${width}-${language}-${dark?'dark':'light'}-success`);
  check(controls.ordinaryPasswordPosts===0,'reset did not submit change-password handler');
  check(await page.evaluate(()=>!JSON.stringify({...localStorage,...sessionStorage}).includes('fictional-encrypted-challenge')&&!location.href.includes('fictional-encrypted-challenge')),'no challenge persisted in URL/storage');
  await dialog.getByRole('button',{name:language==='zh'?'返回登录':'Back to sign in',exact:true}).click();await page.waitForURL(origin+'/?lang='+language);
  check(f.errors.length===0,'no browser errors: '+JSON.stringify(f.errors));await f.context.close();
 }
 // No configured provider: useful fallback, no form that pretends mail was sent.
 {
  const f=await fixture();await f.dialog.getByRole('button',{name:'Close',exact:true}).click();f.controls.available=false;await f.trigger.click();await f.dialog.getByText(/Email recovery is temporarily unavailable/).waitFor();check(await f.dialog.locator('input').count()===0,'unavailable fallback hides send form');check(f.requests.length===0,'unavailable does not send');await f.context.close();
 }
 {
  const f=await fixture();await f.dialog.getByRole('button',{name:'Close',exact:true}).click();f.controls.getFailure=true;await f.trigger.click();await f.dialog.getByRole('button',{name:'Try again',exact:true}).waitFor();check(await f.dialog.locator('input').count()===0,'status error has no usable send form');f.controls.getFailure=false;await f.dialog.getByRole('button',{name:'Try again',exact:true}).click();await f.dialog.locator('input[name=username]').waitFor();check(f.requests.length===0,'status retry does not send mail');await f.page.goBack();await f.dialog.waitFor({state:'hidden'});check(await f.trigger.isVisible(),'mobile back closes modal');await f.context.close();
 }
 // Closing an idle dialog clears sensitive form state.
 {
  const f=await fixture();await send(f);await fillReset(f);await f.dialog.getByRole('button',{name:'Close',exact:true}).click();await f.dialog.waitFor({state:'hidden'});await f.trigger.click();await f.dialog.locator('input[name=username]').waitFor();check(await f.dialog.locator('input[name=code]').count()===0,'closing clears challenge and code');check(await f.dialog.locator('input[type=password]').count()===0,'closing clears passwords');
  await f.context.close();
 }
 // Expiration and resend use wall-clock time, and resend discards entered secrets.
 {
  const f=await fixture();await f.page.clock.install();await send(f);await fillReset(f);await f.page.clock.runFor(61_000);await f.dialog.getByRole('button',{name:'Resend code',exact:true}).click();await f.page.waitForFunction(()=>document.querySelector('input[name=code]')?.value==='');check(await f.dialog.locator('input[name=code]').inputValue()==='','resend clears old code');check(await f.dialog.locator('input[name=new-password]').inputValue()==='','resend clears old password');await f.page.clock.runFor(601_000);await f.dialog.getByText('This code has expired. Please request a new one.').waitFor();check(await f.dialog.getByRole('button',{name:'Set new password',exact:true}).isDisabled(),'expired code cannot submit');check(await f.dialog.getByRole('button',{name:'Resend code',exact:true}).isEnabled(),'expired code can resend');await f.context.close();
 }
 // A browser Back, Esc, close button, or backdrop must not turn a pending
 // send/reset into a misleading cancellation. The same form survives Back.
 for(const action of ['request','reset']){
  const f=await fixture({width:320,settings:true});if(action==='reset'){await send(f);await fillReset(f);f.controls.holdReset=true;}else f.controls.holdRequest=true;
  const button=f.dialog.getByRole('button',{name:action==='reset'?'Set new password':'Send code',exact:true});await button.click();
  const releaseKey=action==='reset'?'releaseReset':'releaseRequest';for(let i=0;!f.controls[releaseKey]&&i<50;i++)await new Promise(resolve=>setTimeout(resolve,20));check(Boolean(f.controls[releaseKey]),action+' request held by test');
  check(await f.dialog.locator('[data-slot=dialog-close]').isDisabled(),action+' close is disabled while pending');await f.page.keyboard.press('Escape');await f.page.mouse.click(2,2);await f.page.goBack();await f.page.waitForFunction(()=>document.querySelector('[role=dialog]')&&history.state?.timelyoOverlay?.key==='password-recovery-settings');
  check(await f.dialog.isVisible(),action+' pending form survives Escape backdrop and Back');check(f.requests.filter(r=>r.action===action).length===1,action+' Back did not duplicate request');
  if(action==='reset')check(await f.dialog.locator('input[name=new-password]').inputValue()==='Fictional-New-Password!',action+' pending values retained');await capture(f,'pending-'+action);
  f.controls[releaseKey]();if(action==='reset')await f.dialog.getByRole('button',{name:'Back to sign in',exact:true}).waitFor();else await f.dialog.locator('input[name=code]').waitFor();check(f.errors.length===0,action+' pending navigation has no browser errors');await f.context.close();
 }
 // A hung connection releases the UI after 30 seconds. Reset is never retried
 // automatically, because aborting the browser does not undo a server commit.
 for(const action of ['request','reset']){
  const f=await fixture({width:390});if(action==='reset'){await send(f);await fillReset(f);f.controls.holdReset=true;}else f.controls.holdRequest=true;await f.page.clock.install();
  await f.dialog.getByRole('button',{name:action==='reset'?'Set new password':'Send code',exact:true}).click();const releaseKey=action==='reset'?'releaseReset':'releaseRequest';for(let i=0;!f.controls[releaseKey]&&i<50;i++)await new Promise(resolve=>setTimeout(resolve,20));check(Boolean(f.controls[releaseKey]),action+' timeout request held');await f.page.clock.runFor(30_001);await f.page.waitForFunction(()=>!document.querySelector('.password-recovery-close')?.disabled);check(f.requests.filter(r=>r.action===action).length===1,action+' timeout never auto-retries');
  if(action==='reset'){await f.dialog.getByText('We could not confirm the result',{exact:true}).waitFor();check(await f.dialog.getByRole('button',{name:'Back to sign in',exact:true}).isEnabled(),'timed-out reset offers sign-in exit');check(await f.dialog.locator('input').count()===0,'timed-out reset clears sensitive fields');}
  else{await f.dialog.getByRole('alert').waitFor();check((await f.dialog.getByRole('alert').innerText()).includes('Check your inbox first'),'timed-out send does not claim no email was sent');check(await f.dialog.getByRole('button',{name:'Send code',exact:true}).isEnabled(),'timed-out send releases action lock');}
  await capture(f,'timeout-'+action);f.controls[releaseKey]();await f.context.close();
 }
 // Both promised identifiers are accepted and normalised before the request.
 {
  const f=await fixture();await f.dialog.locator('input[name=username]').fill('  FICTIONAL.USER@EXAMPLE.INVALID  ');await send(f);check(f.requests[0].identifier==='fictional.user@example.invalid','linked-email input accepted and normalised');check((await f.dialog.locator('.password-recovery-identity').innerText()).includes('fictional.user@example.invalid'),'normalised email displayed as account identifier');await f.context.close();
 }
 // Lost reset response is not claimed as failure or cancellation.
 {
  const f=await fixture();await send(f);await fillReset(f);f.controls.resetNetworkFailure=true;await f.dialog.getByRole('button',{name:'Set new password',exact:true}).click();await f.dialog.getByText('We could not confirm the result',{exact:true}).waitFor();check((await f.dialog.innerText()).includes('Your password may have changed'),'unknown reset outcome is explained');check(await f.dialog.locator('input').count()===0,'unknown outcome clears secrets');await capture(f,'reset-result-unknown');await f.context.close();
 }
 // Preserve only same-origin recognised Quiz paths, including strict invalid
 // assignment semantics; do not accept external returnTo URLs or extra query data.
 {
  const quiz='quiz_link_1234567890',assignment='assignment_1234567890',f=await fixture({routePath:'/quiz/'+quiz+'?assignment='+assignment});const targets=await f.page.evaluate(({quiz,assignment})=>[window.__recoveryReturnPath('/quiz/'+quiz,'?assignment='+assignment+'&returnTo=https://evil.example&code=123456','en'),window.__recoveryReturnPath('/quiz/'+quiz,'?assignment=bad&assignment=second','zh'),window.__recoveryReturnPath('//evil.example/path','?returnTo=https://evil.example','en'),window.__recoveryReturnPath('/quiz/notvalid','?assignment='+assignment,'en')],{quiz,assignment});check(targets[0]===`/quiz/${quiz}?assignment=${assignment}&lang=en`,'valid Quiz assignment preserved without unrelated query data');check(targets[1]===`/quiz/${quiz}?assignment=bad&assignment=second&lang=zh`,'invalid duplicate assignment presence preserved');check(targets[2]==='/?lang=en'&&targets[3]==='/?lang=en','unrecognised and external return paths rejected');await send(f);await fillReset(f);await f.dialog.getByRole('button',{name:'Set new password',exact:true}).click();await f.dialog.getByRole('button',{name:'Back to sign in',exact:true}).click();await f.page.waitForURL(origin+targets[0]);check(true,'completed reset reloads original Quiz assignment');await f.context.close();
 }
 // The test-site preview must never even check recovery availability.
 for(const language of ['zh','en']){
  const f=await fixture({width:320,language,dark:language==='en',preview:true}),before=f.page.url();await f.dialog.getByText(/界面预览|UI preview/).waitFor();await f.dialog.getByRole('button',{name:language==='zh'?'预览下一步':'Preview next step',exact:true}).click();await fillReset(f);await capture(f,'preview-'+language+'-code');await f.dialog.getByRole('button',{name:language==='zh'?'预览完成状态':'Preview completion',exact:true}).click();await f.dialog.getByRole('button',{name:language==='zh'?'结束预览':'Finish preview',exact:true}).click();await f.dialog.waitFor({state:'hidden'});check(f.controls.recoveryCalls===0&&f.requests.length===0,'preview '+language+' has zero recovery API calls');check(f.page.url()===before,'preview '+language+' does not redirect or log out');await f.context.close();
 }
 // VisualViewport keyboard simulation exercises the same production focus helper.
 for(const width of [320,390])for(const language of ['zh','en']){
  const f=await fixture({width,language,dark:language==='en',settings:true,keyboard:true});await send(f);await f.dialog.locator('input[name=confirm-password]').focus();await f.page.evaluate(()=>window.__setQaViewport(430,24));await f.dialog.locator(':scope[data-keyboard-open=true]').waitFor();await f.page.waitForFunction(()=>{const input=document.querySelector('input[name=confirm-password]'),body=document.querySelector('.password-recovery-body'),footer=document.querySelector('.password-recovery-actions');if(!input||!body||!footer)return false;const a=input.getBoundingClientRect(),b=body.getBoundingClientRect(),c=footer.getBoundingClientRect();return a.top>=b.top-1&&a.bottom<=Math.min(b.bottom,c.top)+1&&c.bottom<=454;});check(true,`${width}${language} keyboard keeps focused input and actions visible`);await capture(f,`${width}-${language}-keyboard`);await f.page.evaluate(()=>window.__setQaViewport(900));await f.context.close();
 }
 const result={suite:'password-recovery-ui',checks,labels,screenshots,viewports:[320,390,1280],languages:['zh','en'],themes:['light','dark'],allRootLayoutCss:layoutCss,apiMocked:true,productionDataWrites:0};if(evidence)fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,labels:undefined,screenshots:screenshots.length,allRootLayoutCss:layoutCss.length}));
}catch(error){if(evidence){await active?.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({error:String(error),stack:error.stack,checks,labels},null,2));}throw error;}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
