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
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'file:///opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs');
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{PasswordRecoveryButton}from'./app/password-recovery';import{AccountSettings}from'./app/account-settings';import{setLanguage}from'./lib/i18n';const q=new URLSearchParams(location.search),language=q.get('lang')==='en'?'en':'zh';setLanguage(language);document.documentElement.classList.toggle('dark',q.get('dark')==='1');createRoot(document.getElementById('root')).render(q.get('settings')==='1'?<div className="app-shell"><AccountSettings/></div>:<main className="auth-card"><h1>Tickminder</h1><PasswordRecoveryButton language={language} initialIdentifier="fictional.student"/></main>);`;
await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'password-recovery-ui-entry.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'esm',jsx:'automatic',outfile:path.join(temp,'ui.js'),alias:{'@':root},logLevel:'silent'});
const globals=await postcss([tailwind({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')});
const css=globals.css+'\n'+['app/ui-refresh.css','app/appearance.css','app/auth-layout.css'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n')+'\n'+fs.readFileSync(path.join(temp,'ui.css'),'utf8');
const server=http.createServer((req,res)=>{if(req.url.startsWith('/ui.js')){res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(path.join(temp,'ui.js')));}else if(req.url.startsWith('/ui.css')){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script type="module" src="/ui.js"></script></body></html>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
let browser,checks=0;const check=(value,label)=>{assert(value,label);checks++;};
async function fixture({width=390,language='en',dark=false,settings=false}={}){
 const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[],requests=[];
 const controls={available:true,getFailure:false,requestDelay:0,resetCode:null,challenge:0,ordinaryPasswordPosts:0};
 page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>{errors.push(dialog.message());void dialog.dismiss();});
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url());let result={};
  if(url.pathname==='/api/password-recovery'){
   if(request.method()==='GET'){await route.fulfill({status:controls.getFailure?503:200,contentType:'application/json',body:JSON.stringify({available:controls.available})});return;}
   const body=request.postDataJSON();requests.push(body);
   if(body.action==='request'){
    if(controls.requestDelay)await new Promise(resolve=>setTimeout(resolve,controls.requestDelay));
    result={ok:true,challenge:'fictional-encrypted-challenge-'+(++controls.challenge),retryAfter:60,expiresIn:600};
   }else if(controls.resetCode){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:controls.resetCode,error:'验证码无效或已过期'})});return;}
   else result={ok:true};
  }else if(url.pathname==='/api/auth')result={account:{name:'Fictional Student',role:'teacher',groupId:'fixture-group',username:'fictional.student',email:'fixture@example.invalid',googleLinked:true,emailLoginAvailable:true},clientId:null};
  else if(url.pathname==='/api/notification-preferences')result={availableCategories:['courses'],preferences:{courses:true,homework:true,fees:true},pushConfigured:false};
  else if(url.pathname==='/api/account-devices')result={devices:[]};
  else if(url.pathname==='/api/password'){controls.ordinaryPasswordPosts++;result={ok:true};}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 await page.goto(origin+`/?lang=${language}&dark=${dark?1:0}&settings=${settings?1:0}`);
 if(settings)await page.locator('.account-security-section').filter({has:page.getByText(language==='zh'?'修改密码':'Change password',{exact:true})}).locator('summary').click();
 const trigger=page.getByTestId('forgot-password-'+(settings?'settings':'login'));await trigger.click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();
 return{context,page,dialog,requests,errors,controls,trigger,language};
}
async function send(f){const send=f.dialog.getByRole('button',{name:f.language==='zh'?'发送验证码':'Send code',exact:true});await send.click();await f.dialog.locator('input[name=code]').waitFor();}
async function fillReset(f,{code='012345',password='Fictional-New-Password!',confirm=password}={}){await f.dialog.locator('input[name=code]').fill(code);await f.dialog.locator('input[name=new-password]').fill(password);await f.dialog.locator('input[name=confirm-password]').fill(confirm);}
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/chromium'});
 for(const width of[320,390,1280])for(const language of['zh','en'])for(const dark of[false,true]){
  const f=await fixture({width,language,dark,settings:width===390}),{page,dialog,controls,requests}=f;
  await dialog.locator('input[name=username]').waitFor();
  check(await dialog.locator('input[name=username]').inputValue()==='fictional.student','prefilled username '+width+language+dark);
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
  await fillReset(f,{confirm:'Different-Password!'});const reset=dialog.getByRole('button',{name:language==='zh'?'设置新密码':'Set new password',exact:true});await reset.click();
  await dialog.getByRole('alert').waitFor();check(requests.filter(r=>r.action==='reset').length===0,'mismatched passwords stay local');
  await fillReset(f);controls.resetCode='INVALID_CODE';await reset.click();await dialog.getByRole('alert').waitFor();
  check((await dialog.getByRole('alert').innerText()).includes(language==='zh'?'验证码':'code'),'invalid code localized');
  check(requests.at(-1).code==='012345','leading zero preserved');
  controls.resetCode=null;await reset.click();await dialog.getByRole('button',{name:language==='zh'?'返回登录':'Back to sign in',exact:true}).waitFor();
  check(await dialog.locator('input').count()===0,'success removes all sensitive inputs');
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
 // Network status retry and close/reopen do not retain code, password or old replies.
 {
  const f=await fixture();await send(f);await fillReset(f);await f.dialog.getByRole('button',{name:'Close',exact:true}).click();await f.dialog.waitFor({state:'hidden'});await f.trigger.click();await f.dialog.locator('input[name=username]').waitFor();check(await f.dialog.locator('input[name=code]').count()===0,'closing clears challenge and code');check(await f.dialog.locator('input[type=password]').count()===0,'closing clears passwords');
  f.controls.requestDelay=350;await f.dialog.getByRole('button',{name:'Send code',exact:true}).click();await f.dialog.getByRole('button',{name:'Close',exact:true}).click();await f.dialog.waitFor({state:'hidden'});await f.trigger.click();await f.dialog.locator('input[name=username]').waitFor();await pageDelay(f.page,500);check(await f.dialog.locator('input[name=code]').count()===0,'aborted old request cannot update reopened dialog');await f.context.close();
 }
 // Expiration and resend use wall-clock time, and resend discards entered secrets.
 {
  const f=await fixture();await f.page.clock.install();await send(f);await fillReset(f);await f.page.clock.runFor(61_000);await f.dialog.getByRole('button',{name:'Resend code',exact:true}).click();await f.page.waitForFunction(()=>document.querySelector('input[name=code]')?.value==='');check(await f.dialog.locator('input[name=code]').inputValue()==='','resend clears old code');check(await f.dialog.locator('input[name=new-password]').inputValue()==='','resend clears old password');await f.page.clock.runFor(601_000);await f.dialog.getByText('This code has expired. Please request a new one.').waitFor();check(await f.dialog.getByRole('button',{name:'Set new password',exact:true}).isDisabled(),'expired code cannot submit');check(await f.dialog.getByRole('button',{name:'Resend code',exact:true}).isEnabled(),'expired code can resend');await f.context.close();
 }
 console.log(JSON.stringify({suite:'password-recovery-ui',checks,viewports:[320,390,1280],languages:['zh','en'],themes:['light','dark'],apiMocked:true,productionDataWrites:0}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}
async function pageDelay(page,ms){await page.evaluate(ms=>new Promise(resolve=>setTimeout(resolve,ms)),ms);}
