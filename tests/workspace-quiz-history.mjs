import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import ts from 'typescript';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'tickminder-quiz-history-'));
const parse=file=>ts.createSourceFile(file,fs.readFileSync(path.join(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const scheduler=parse('app/scheduler.tsx'),parent=parse('app/parent-shell.tsx');
function find(source,name,kind){let found;const visit=node=>{if(!found&&kind(node)&&node.name?.getText(source)===name)found=node;ts.forEachChild(node,visit);};visit(source);assert(found,'Missing real handler '+name);return found;}
const arrow=(source,name)=>find(source,name,ts.isVariableDeclaration).initializer.getText(source);
const exit=find(scheduler,'exitLinkedQuiz',ts.isVariableDeclaration).initializer.arguments[0].getText(scheduler);
const parentChoose=find(parent,'choose',ts.isFunctionDeclaration).getText(parent).replace('function choose(','function parentChoose(');
const openWorkspace=find(parent,'openWorkspace',ts.isFunctionDeclaration).getText(parent);
const entry=`import{workspaceUrl,workspaceViewFromPath}from'./lib/workspace-route';import{quizLinkIdFromPath,quizAssignmentFromSearch}from'./lib/quiz-link';
window.__allowed=true;window.addEventListener('tickminder-navigate',event=>{if(!window.__allowed)event.preventDefault();});
window.__setup=(role)=>{
 const initialQuizId='abcdefghijklmnop',account={id:'fictional-'+role,groupId:'fictional-group'},activeView='quizzes',view='quizzes';
 window.__linked=initialQuizId;window.__selected='quizzes';
 const setLinkedQuizId=value=>{window.__linked=value;},setSelectedView=value=>{window.__selected=value;},updateView=setSelectedView;
 const currentUrlRef={current:location.pathname+location.search},viewRef={current:view},urlRef=currentUrlRef;
 const navigationAllowed=()=>window.dispatchEvent(new Event('tickminder-navigate',{cancelable:true}));
 const setNavigation=()=>{},setTarget=()=>{},setPendingNotice=()=>{};
 const canView=()=>true,available=value=>['home','calendar','quizzes'].includes(value),lastManagementViews={current:{people:'studentRoster',settings:'groupInfo'}},lastCourseView={current:'calendar'},items=[];
 const managementArea=()=>null,isCourseView=()=>true,normalizeManagementView=(_role,value)=>value,normalizeCourseView=(_role,value)=>value;
 const exitLinkedQuiz=${exit};
 const onLinkedQuizExit=exitLinkedQuiz;
 const setView=${arrow(parent,'setView')};
 const choose=${arrow(scheduler,'choose')};
 ${parentChoose}
 ${openWorkspace}
 window.__goHome=()=>role==='parent'?parentChoose('home'):choose('home');
 window.__openParentCalendar=()=>openWorkspace({view:'calendar'});
 window.__closeLinked=exitLinkedQuiz;
 window.__assignment=()=>quizAssignmentFromSearch(location.search);
 window.__routeView=()=>workspaceViewFromPath(location.pathname,role);
 history.replaceState({...history.state,timelyoRole:role,timelyoGroup:account.groupId,timelyoAccount:account.id,timelyoView:'quizzes',timelyoRoute:1},'');
};`;
await build({absWorkingDir:root,stdin:{contents:entry,resolveDir:root,sourcefile:'quiz-native-history.tsx',loader:'tsx'},bundle:true,write:true,platform:'browser',format:'esm',outfile:path.join(temp,'ui.js'),alias:{'@':root},logLevel:'silent'});
const server=http.createServer((req,res)=>{if(req.url==='/ui.js'){res.setHeader('content-type','application/javascript');res.end(fs.readFileSync(path.join(temp,'ui.js')));}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><body><script type="module" src="/ui.js"></script></body></html>');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE_URL||'file:///C:/Users/felix/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
let browser,checks=0;const check=(value,label)=>{assert(value,label);checks++;};
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const variants=['','assignment=qrstuvwxyz123456','assignment=bad','assignment=qrstuvwxyz123456&assignment=duplicate'];
 for(const role of ['admin','teacher','student','parent'])for(const query of variants){
  const page=await browser.newPage(),original='/quiz/abcdefghijklmnop?'+(query?query+'&':'')+'lang=en';await page.goto(origin+original);await page.waitForFunction(()=>Boolean(window.__setup));await page.evaluate(role=>window.__setup(role),role);
  await page.evaluate(()=>{window.__allowed=false;window.__goHome();});
  check(new URL(page.url()).pathname+new URL(page.url()).search===original,'unsaved guard retains exact Quiz URL');check(await page.evaluate(()=>window.__linked)==='abcdefghijklmnop','blocked navigation keeps linked state');
  await page.evaluate(()=>{window.__allowed=true;window.__goHome();});
  check(new URL(page.url()).pathname==='/'&&!new URL(page.url()).searchParams.has('assignment'),'Home has its own clean destination');
  check(await page.evaluate(()=>window.__linked)===undefined,'navigation clears only live linked state');
  await page.goBack();check(new URL(page.url()).pathname+new URL(page.url()).search===original,'Back restores original Quiz entry including assignment');
  const intent=await page.evaluate(()=>window.__assignment());check(intent.present===Boolean(query),'assignment presence preserved');check(intent.id===(query==='assignment=qrstuvwxyz123456'?'qrstuvwxyz123456':null),'invalid/duplicate assignment cannot become valid or self-practice');
  if(role==='parent'){
   await page.evaluate(()=>window.__setup('parent'));await page.evaluate(()=>window.__openParentCalendar());check(new URL(page.url()).pathname==='/courses/calendar','parent workspace destination');
   await page.goBack();check(new URL(page.url()).pathname+new URL(page.url()).search===original,'parent workspace Back preserves Quiz intent');
  }
  await page.evaluate(role=>window.__setup(role),role);const length=await page.evaluate(()=>history.length);
  await page.evaluate(()=>window.__closeLinked());
  check(new URL(page.url()).pathname==='/quizzes'&&!new URL(page.url()).searchParams.has('assignment'),'explicit close returns to Quiz catalogue and clears assignment');
  check(await page.evaluate(()=>history.length)===length,'explicit close replaces only current linked entry');
  check(await page.evaluate(()=>window.__routeView()==='quizzes'&&window.__linked===undefined),'URL resolves to Quiz catalogue for every role');
  await page.close();
 }
 console.log(JSON.stringify({passed:true,checks,nativeBrowserHistory:true,actualHandlersExtracted:true,realNetworkWrites:0}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(temp,{recursive:true,force:true});}

