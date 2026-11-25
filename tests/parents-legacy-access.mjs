import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
// Execute the real HTTP boundary with every data/service dependency set to fail.
// A parent must be rejected before a legacy query, ownership shortcut or notice
// read can run; the dedicated parent API supplies its own child projection.
let actor=null,dependencyCalls=0,checks=0;
const dataUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const compile=file=>ts.transpileModule(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const helperUrl=dataUrl(compile('lib/legacy-business-access.ts'));
globalThis.__parentLegacy={actor:()=>actor,query:()=>{dependencyCalls++;throw Error('Legacy data boundary was reached');}};
async function route(file){
 let code=compile(file);
 code=code.replace(/import\s*\{([^}]+)\}\s*from\s*(['"])([^'"]+)\2;?/g,(_statement,bindings,_quote,spec)=>{
  if(spec==='@/lib/legacy-business-access')return 'import {'+bindings+'} from '+JSON.stringify(helperUrl)+';';
  const names=bindings.split(',').map(binding=>binding.trim().split(/\s+as\s+/)[0]).filter(Boolean);
  const source=names.map(name=>name==='NextResponse'?'export const NextResponse={json:(body,options)=>Response.json(body,options)};':name==='currentBusinessAccount'?'export const currentBusinessAccount=async()=>globalThis.__parentLegacy.actor();':name==='currentIdentity'?'export const currentIdentity=async()=>({account:globalThis.__parentLegacy.actor()});':name==='isOwnerAccount'?'export const isOwnerAccount=()=>false;':name==='selectedGroup'||name==='registrationGroup'?'export const '+name+'=async()=>({id:"school-a",name:"Demo School",joinCode:"private-registration-code",active:1});':name==='translate'?'export const translate=value=>value;':name==='adminPermissionFailure'?'export const adminPermissionFailure=()=>null;':/Error$/.test(name)?'export class '+name+' extends Error{constructor(message,status=400){super(message);this.status=status;}}':'export const '+name+'=(...args)=>globalThis.__parentLegacy.query(...args);').join('\n');
  return 'import {'+bindings+'} from '+JSON.stringify(dataUrl(source))+';';
 });
 return import(dataUrl(code));
}
const files=[
 ['app/api/state/route.ts',['GET']],
 ['app/api/revision/route.ts',['GET']],
 ['app/api/files/[id]/route.ts',['GET']],
 ['app/api/notifications/route.ts',['GET','POST']],
 ['app/api/recordings/route.ts',['GET','POST']],
 ['app/api/learning/review/route.ts',['GET','POST']],
 ['app/api/learning/versions/route.ts',['GET','POST']],
 ['app/api/folders/route.ts',['GET','POST']],
 ['app/api/lesson-history/route.ts',['GET']],
 ['app/api/class-sessions/route.ts',['GET']],
];
for(const [file,methods]of files){
 const handlers=await route(file);
 for(const method of methods){
  for(const role of ['parent','future-role']){
   actor={id:'former-teacher',role,groupId:'school-a',teacherName:'Former Teacher',studentName:'Former Student'};dependencyCalls=0;
   const request=new Request('https://parents.test/api/test?scope=core&classroomId=foreign&lessonId=foreign',{method,headers:{origin:'https://parents.test','content-type':'application/json'},...(method==='POST'?{body:JSON.stringify({action:'readAll'})}:{})});
   const result=await handlers[method](request,{params:Promise.resolve({id:'formerly-owned-file'})});
   assert.equal(result.status,403,file+' '+method+' must deny '+role);checks++;
   assert.equal(dependencyCalls,0,file+' '+method+' must reject before legacy data access');checks++;
   assert.equal(typeof (await result.json()).error,'string');checks++;
  }
 }
}
const groups=await route('app/api/groups/route.ts');
actor={id:'parent-account',role:'parent',groupId:'school-a'};dependencyCalls=0;
const metadata=await groups.GET(new Request('https://parents.test/api/groups'));
assert.equal(metadata.status,200);checks++;
assert.deepEqual(await metadata.json(),{groups:[{id:'school-a',name:'Demo School',active:1}],isOwner:false});checks++;
assert.equal(dependencyCalls,0);checks++;
const invitation=await groups.GET(new Request('https://parents.test/api/groups?code=known-code'));
assert.deepEqual(await invitation.json(),{group:{id:'school-a',name:'Demo School'}});checks++;
const {isLegacyBusinessRole}=await import(helperUrl);
for(const role of['admin','teacher','student']){assert.equal(isLegacyBusinessRole(role),true);checks++;}
for(const role of['parent','pending','future-role','',null,undefined,{},['admin']]){assert.equal(isLegacyBusinessRole(role),false);checks++;}
console.log('Parent legacy API isolation checks passed: '+checks);
