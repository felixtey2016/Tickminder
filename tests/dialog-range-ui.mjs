import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-dialog-range-'));
const evidence=process.env.DIALOG_UI_EVIDENCE_DIR||path.join(root,'../qa/dialog-range');fs.mkdirSync(evidence,{recursive:true});
const client=path.join(root,'dist/client'),manifest=JSON.parse(fs.readFileSync(path.join(client,'.vite/manifest.json'),'utf8'));
const parse=file=>JSON.parse(fs.readFileSync(path.join(root,'dist/server',file),'utf8').replace(/^\s*export default\s+/,'').replace(/;\s*$/,''));
const assets=parse('vinext-client-assets.js'),resources=parse('__vite_rsc_assets_manifest.js').serverResources;
const styles=new Set(resources['app/layout.tsx'].css);
for(const key of ['components/app-select-host.tsx','app/scheduler-entry.tsx','app/scheduler.tsx','app/roster-forms.tsx','app/class-session-schedule.tsx','app/scheduler-course-pages.tsx']){
 if(assets.dynamicPreloads[key]){for(const f of assets.dynamicPreloads[key])if(f.endsWith('.css'))styles.add(f);}
 else if(manifest[key]){const visit=k=>{for(const f of manifest[k]?.css||[])styles.add(f);for(const dep of manifest[k]?.imports||[])visit(dep)};visit(key);}
}
for(const key of Object.keys(assets.dynamicPreloads).filter(k=>/finance|invoice|payroll|prepayments/.test(k))){for(const file of assets.dynamicPreloads[key])if(file.endsWith('.css'))styles.add(file);}
const css=[...styles].map(f=>fs.readFileSync(path.join(client,f.replace(/^\//,'')),'utf8')).join('\n');
assert(css.includes('[data-pinned-close]')&&css.includes('.lesson-time-range'),'final CSS includes the changes');
const entry="import React,{useState,useRef,useEffect}from'react';import{createRoot}from'react-dom/client';import{Dialog,DialogContent,DialogBody,DialogHeader,DialogTitle,DialogDescription,DialogFooter}from'./components/ui/dialog';import{Sheet,SheetContent,SheetTitle,SheetDescription}from'./components/ui/sheet';import{LessonTimeRange}from'./components/lesson-time-range';import{FinanceModal}from'./app/finance-round2-shared';import{setLanguage}from'./lib/i18n';setLanguage('en');document.documentElement.classList.toggle('dark',new URLSearchParams(location.search).get('theme')==='dark');window.submits=[];\nfunction App(){const[open,setOpen]=useState(''),[start,setStart]=useState('2026-12-31T23:00'),[end,setEnd]=useState('2026-12-31T00:00'),ref=useRef(null);useEffect(()=>{if(ref.current)window.dialogRefWorks=true},[open]);const content=Array.from({length:36},(_,i)=><label key={i} style={{display:'block',padding:'12px 0'}}>Fictional field {i}<input defaultValue=\"Local fixture\"/></label>);return <main className=\"finance-operations-wave4\" style={{padding:20}}><button id=\"open-finance\" onClick={()=>setOpen(\"finance\")}>Finance modal</button>{open===\"finance\"&&<FinanceModal title=\"Fictional finance modal\" onClose={()=>setOpen(\"\")}>{content}</FinanceModal>}<button id=\"open-default\" onClick={()=>setOpen('default')}>Long dialog</button><button id=\"open-framed\" onClick={()=>setOpen('framed')}>Framed dialog</button><button id=\"open-range\" onClick={()=>setOpen('range')}>Range</button><button id=\"open-sheet\" onClick={()=>setOpen('sheet')}>Sheet</button><button id=\"too-long\" onClick={()=>{setStart('2026-11-04T08:00');setEnd('2026-11-04T20:01')}}>Too long</button><button id=\"new-date\" onClick={()=>{setStart('2028-02-28T23:00');setEnd('2028-02-29T00:00')}}>New date</button>\n<Dialog open={open==='default'} onOpenChange={v=>{if(!v)setOpen('')}}><DialogContent ref={ref} data-testid=\"long-dialog\" className=\"lesson-dialog\"><DialogHeader><DialogTitle>A deliberately long dialog title that wraps on narrow phones</DialogTitle><DialogDescription>Fictional local data</DialogDescription></DialogHeader>{content}</DialogContent></Dialog>\n<Dialog open={open==='framed'} onOpenChange={v=>{if(!v)setOpen('')}}><DialogContent data-testid=\"framed-dialog\" className=\"lesson-dialog\" layout=\"framed\"><DialogHeader><DialogTitle>Fixed title</DialogTitle><DialogDescription>Fictional local data</DialogDescription></DialogHeader><DialogBody>{content}</DialogBody><DialogFooter><button onClick={()=>setOpen('')}>Done</button></DialogFooter></DialogContent></Dialog>\n<Dialog open={open==='range'} onOpenChange={v=>{if(!v)setOpen('')}}><DialogContent data-testid=\"range-dialog\" className=\"lesson-dialog\"><DialogTitle>Lesson time</DialogTitle><DialogDescription>Local only</DialogDescription><form onSubmit={e=>{e.preventDefault();window.submits.push({start,end})}}><LessonTimeRange start={start} end={end} onChange={(s,e)=>{setStart(s);setEnd(e)}}/><button id=\"range-submit\">Save lesson</button></form></DialogContent></Dialog>\n<Sheet open={open==='sheet'} onOpenChange={v=>{if(!v)setOpen('')}}><SheetContent data-testid=\"long-sheet\" style={{overflowY:'auto'}}><SheetTitle>Long sheet</SheetTitle><SheetDescription>Local only</SheetDescription>{content}</SheetContent></Sheet></main>}\ncreateRoot(document.getElementById('root')).render(<App/>);";
await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'dialog-range-fixture.tsx',loader:'tsx'},bundle:true,platform:'browser',format:'esm',jsx:'automatic',outfile:path.join(temp,'ui.js'),alias:{'@':root},logLevel:'silent'});
let server,browser,active;let checks=0;const errors=[],cases=[];const check=(v,m)=>{assert(v,m);checks++};
try{
 server=http.createServer((req,res)=>{if(req.url.startsWith('/ui.js')){res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(path.join(temp,'ui.js')))}else if(req.url.startsWith('/ui.css')){res.setHeader('content-type','text/css');res.end(css)}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/ui.css"></head><body><div id="root"></div><script type="module" src="/ui.js"></script></body></html>')}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_PATH||'file:///C:/Users/felix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 for(const theme of ['light','dark'])for(const width of [360,390,1280]){
 const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'}),page=await context.newPage();active=page;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{errors.push('native dialog: '+d.message());void d.dismiss()});
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin+'/?theme='+theme);await page.locator('#open-default').click();
 const d=page.getByTestId('long-dialog'),x=d.locator(':scope > [data-pinned-close]');
 await d.waitFor();
 for(const position of [0,800,99999]){
 await d.evaluate((e,y)=>e.scrollTop=y,position);await page.waitForTimeout(90);
 const b=await d.boundingBox(),q=await x.boundingBox();check(q&&b&&q.y>=b.y&&q.y+q.height<=b.y+b.height&&q.x+q.width<=b.x+b.width,'close remains inside scrolled dialog');check(q.width>=44&&q.height>=44,'touch close target 44px');
 check(await x.evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}),'close is not covered');
 }
 await page.screenshot({path:path.join(evidence,theme+'-'+width+'-long.png')});await x.click();await d.waitFor({state:'hidden'});
 await page.locator('#open-framed').click();const f=page.getByTestId('framed-dialog'),body=f.locator('[data-slot=dialog-body]');
 await body.evaluate(e=>e.scrollTop=99999);check(await f.locator('[data-pinned-close]').isVisible(),'framed close visible');check(await f.locator('[data-slot=dialog-footer]').isVisible(),'framed footer visible');
 await page.setViewportSize({width,height:430});await page.waitForTimeout(60);
 const fb=await f.boundingBox();check(fb.y>=0&&fb.y+fb.height<=431,'framed fits shortened viewport');
 await f.locator('[data-pinned-close]').click();await page.setViewportSize({width,height:844});
 await page.locator('#open-range').click();const r=page.getByTestId('range-dialog');
 await page.locator('#range-submit').click();check(await page.evaluate(()=>window.submits.length)===0,'reversed same-day blocks native form submit');
 await r.getByRole('checkbox',{name:'Next-day end'}).check();check(await r.locator('.time-field-error').count()===0,'correcting next-day clears stale inline time errors');await page.locator('#range-submit').click();
 const saved=await page.evaluate(()=>window.submits);check(saved.length===1&&saved[0].end==='2027-01-01T00:00','explicit midnight saves next day');
 check((await r.locator('.lesson-time-range-summary').innerText()).includes('1h'),'one hour summary');
 await r.getByTestId('time-input-trigger').first().click();await page.getByTestId('time-picker-panel').waitFor();check(await page.getByTestId('time-picker-panel').getByRole('button',{name:'Close',exact:true}).isVisible(),'custom time close visible');
 await page.getByTestId('time-picker-panel').getByRole('button',{name:'Close',exact:true}).click();check(await r.isVisible(),'nested time close preserves parent');
 await page.locator('#too-long').evaluate(e=>e.click());await page.locator('#range-submit').click();check((await page.evaluate(()=>window.submits)).length===1,'more than 12h blocked');
 await page.locator('#new-date').evaluate(e=>e.click());check((await r.locator('.lesson-time-range-summary').innerText()).includes('2028-02-29'),'leap-date next day retained');
 await r.locator('[data-pinned-close]').click();check(await page.evaluate(()=>window.dialogRefWorks),'caller Dialog ref retained');
 await page.locator('#open-sheet').click();const sheet=page.getByTestId('long-sheet');await sheet.evaluate(e=>e.scrollTop=99999);await page.waitForTimeout(100);const sb=await sheet.boundingBox(),sx=await sheet.locator('[data-slot=sheet-close]').boundingBox();check(sx.y>=sb.y&&sx.y+sx.height<=sb.y+sb.height,'Sheet close remains inside scroll viewport');await sheet.locator('[data-slot=sheet-close]').click();
 await page.locator('#open-finance').click();const finance=page.locator('dialog.finance2-dialog');await finance.waitFor();await finance.evaluate(e=>e.scrollTop=99999);await page.waitForTimeout(70);const nb=await finance.boundingBox(),nx=await finance.locator('.finance2-close').boundingBox();check(nx.y>=nb.y&&nx.y+nx.height<=nb.y+nb.height,'native finance close remains inside scrolled dialog');await finance.locator('.finance2-close').click();await finance.waitFor({state:'hidden'});
 check((await page.evaluate(()=>document.documentElement.scrollWidth))<=width,'no horizontal overflow');cases.push({theme,width});await context.close();
 }
 check(errors.length===0,errors.join('\n'));fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({ok:true,checks,cases,styles:[...styles],productionWrites:false,productionDatabaseQueries:0,externalRequestsForwarded:0},null,2));console.log(JSON.stringify({ok:true,checks,evidence}));
}catch(e){await active?.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});throw e}
finally{await browser?.close();await new Promise(r=>server?server.close(r):r());fs.rmSync(temp,{recursive:true,force:true});}
