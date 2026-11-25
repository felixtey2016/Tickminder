import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Real auth, linking, password and skip routes against a fresh fictional SQLite.
// Google keys are fictional and fetch rejects every non-certificate request.
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,values=[]){
 const execute=arrays=>{const st=sqlite.prepare(sql);if(arrays)st.setReturnArrays(true);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};
 return {bind:(...args)=>statement(sql,args),async first(){return execute(false).results[0]||null;},async all(){return execute(false);},async raw(){return execute(true).results;},async run(){return execute(false);},execute:()=>execute(false)};
}
const d1={prepare:statement,async batch(items){sqlite.exec('BEGIN');try{const result=items.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
let token='',requestHeaders=new Headers();
const env={DB:d1,GOOGLE_CLIENT_ID:'fictional-google-onboarding-client'};
const NextResponse={json(body,options){const response=Response.json(body,options);response.cookies={set(name,value){response.headers.set('set-cookie',name+'='+value+'; Path=/; HttpOnly; Secure');},delete(name){response.headers.set('set-cookie',name+'=; Max-Age=0');}};return response;}};
globalThis.__googleOnboarding={env,NextResponse,headers:async()=>requestHeaders,cookies:async()=>({get:name=>name==='tuition_session'&&token?{value:token}:undefined}),getDb:()=>drizzle(d1)};
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,NextResponse,headers,cookies,getDb}=globalThis.__googleOnboarding;').toString('base64');
const root=new URL('../',import.meta.url).href;
const hooks=registerHooks({
 resolve(specifier,context,next){if(['cloudflare:workers','next/server','next/headers','@/db'].includes(specifier))return {url:stub,shortCircuit:true};if(specifier.startsWith('@/'))return {url:new URL(specifier.slice(2)+'.ts',root).href,shortCircuit:true};if(specifier.startsWith('.')&&context.parentURL?.startsWith(root)&&context.parentURL.endsWith('.ts'))return {url:new URL(/\.[cm]?[jt]sx?$/.test(specifier)?specifier:specifier+'.ts',context.parentURL).href,shortCircuit:true};return next(specifier,context);},
 load(url,context,next){if(url.startsWith(root)&&url.endsWith('.ts'))return {format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(url,context);},
});
const load=async file=>import(new URL('../'+file,import.meta.url).href);
const auth=await load('app/api/auth/route.ts'),skip=await load('app/api/google-link-onboarding/route.ts'),link=await load('app/api/account-link/route.ts'),password=await load('app/api/password/route.ts');
const {createSession,hashToken}=await load('lib/auth.ts'),{hashPassword}=await load('lib/password.ts'),{googleLinkOnboardingEligible}=await load('lib/google-link-onboarding.ts');
const now=new Date().toISOString(),oldPassword='Fictional-original-26!',newPassword='Fictional-updated-26!',hash=await hashPassword(oldPassword);
function add(id,overrides={}){const row={role:'student',activationReason:'admin-created',nameConfirmedAt:now,mustChange:0,...overrides};sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,created_at,activated_at,activation_reason,name_confirmed_at) VALUES(?,?,?,?,?,?,?,?,?)').run('next-genn-edu',id,'',id,row.role,now,now,row.activationReason,row.nameConfirmedAt);sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,?,?)').run(id,id,hash,row.mustChange,now);}
async function login(id){const session=await createSession(id);token=session.token;return token;}
function req(body,path='/api/google-link-onboarding',origin='https://fictional.invalid'){return new Request('https://fictional.invalid'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});}
async function call(route,body,path){const response=await route.POST(req(body,path));if(response.headers.has('set-cookie'))token=response.headers.get('set-cookie').split(';')[0].split('=')[1];return {status:response.status,data:await response.json()};}
async function account(){return (await (await auth.GET()).json()).account;}
let checks=0;function check(value,expected,message){assert.equal(value,expected,message);checks++;}

add('new-local',{mustChange:1});await login('new-local');
check((await account()).showGoogleLinkOnboarding,false,'Initial-password change takes precedence');
check((await call(skip,{decision:'skip'})).status,403,'Skip cannot bypass mandatory password change');
check((await call(link,{credential:'unverified',password:oldPassword},'/api/account-link')).status,403,'Google link also requires changed initial password');
const oldToken=token;
check((await call(password,{currentPassword:oldPassword,newPassword},'/api/password')).status,200,'Real mandatory password route completes setup');
const currentToken=token;token=oldToken;check(await account(),null,'Old session is invalid after password change');token=currentToken;
check((await account()).showGoogleLinkOnboarding,true,'Prompt appears immediately after mandatory setup');
check((await skip.POST(req({decision:'skip'},undefined,'https://evil.invalid'))).status,403,'Cross-origin skip rejected');
check((await call(skip,{decision:'activate',role:'admin'})).status,400,'Skip endpoint never assigns roles');
check((await call(skip,null)).status,400,'Null request is rejected safely');
check(sqlite.prepare('SELECT role FROM accounts WHERE id=?').get('new-local').role,'student','Client role spoof has no effect');
check((await call(skip,{decision:'skip',accountId:'someone-else'})).status,200,'Skip is scoped to current identity');
check((await account()).showGoogleLinkOnboarding,false,'Skip hides prompt');
check(sqlite.prepare("SELECT count(*) n FROM audit WHERE action='googleLinkPromptSkipped' AND actor_id='new-local'").get().n,1,'Account acknowledgement saved once');
check((await call(skip,{decision:'skip'})).status,200,'Retry is idempotent');
check(sqlite.prepare("SELECT count(*) n FROM audit WHERE action='googleLinkPromptSkipped'").get().n,1,'Retries do not add duplicates');
await login('new-local');check((await account()).showGoogleLinkOnboarding,false,'A fresh session on another device retains skip');
add('another-local');await login('another-local');check((await account()).showGoogleLinkOnboarding,true,'Skip never hides another account prompt');
check(sqlite.prepare("SELECT count(*) n FROM audit WHERE action='googleLinkPromptSkipped' AND actor_id='another-local'").get().n,0,'Body account id never writes to another profile');

for(const [id,override] of [['name-needed',{nameConfirmedAt:null}],['pending-role',{role:'pending'}],['google-first-origin',{activationReason:'identity-bound'}]]){
 add(id,override);await login(id);check((await account()).showGoogleLinkOnboarding,false,id+' bypasses optional guidance');check((await call(skip,{decision:'skip'})).status,403,id+' cannot skip required lifecycle');
}
add('unconfigured-local');await login('unconfigured-local');env.GOOGLE_CLIENT_ID='';check((await account()).showGoogleLinkOnboarding,false,'Unconfigured Google does not block app access');env.GOOGLE_CLIENT_ID='fictional-google-onboarding-client';
sqlite.prepare("UPDATE tuition_groups SET active=0 WHERE id='next-genn-edu'").run();check((await account()).showGoogleLinkOnboarding,false,'Inactive organisation takes precedence');check((await call(skip,{decision:'skip'})).status,409,'Concurrent group disable cannot write acknowledgement');sqlite.prepare("UPDATE tuition_groups SET active=1 WHERE id='next-genn-edu'").run();
sqlite.prepare("UPDATE accounts SET disabled_at=? WHERE id='unconfigured-local'").run(now);check((await account()),null,'Disabled identity cannot enter onboarding');check((await call(skip,{decision:'skip'})).status,401,'Disabled identity cannot write skip');
token='';check((await call(skip,{decision:'skip'})).status,401,'Anonymous skip rejected');

// The existing signed-Google and password-verification flow remains unchanged.
const key=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',key.publicKey),originalFetch=globalThis.fetch;
globalThis.fetch=async url=>{assert.equal(String(url),'https://www.googleapis.com/oauth2/v3/certs');return Response.json({keys:[{...jwk,kid:'fictional-key'}]},{headers:{'cache-control':'public,max-age=3600'}});};
async function google(subject,email){const enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url'),head=enc({alg:'RS256',kid:'fictional-key'}),body=enc({sub:subject,email,name:'Fictional Google',aud:env.GOOGLE_CLIENT_ID,iss:'https://accounts.google.com',email_verified:true,exp:Math.floor(Date.now()/1000)+600});return head+'.'+body+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key.privateKey,new TextEncoder().encode(head+'.'+body))).toString('base64url');}
await login('another-local');const credential=await google('fictional-link-google','fictional-linked@example.test');
check((await call(link,{credential,password:'wrong'},'/api/account-link')).status,403,'Current password is still verified');
check((await call(link,{credential,password:oldPassword},'/api/account-link')).status,200,'Verified Google binds to the existing account');
check((await account()).id,'another-local','Google link never creates a replacement profile');check((await account()).showGoogleLinkOnboarding,false,'Successful link ends optional onboarding');check((await account()).googleLinked,true,'Auth reflects linked identity');
check(sqlite.prepare("SELECT count(*) n FROM audit WHERE action='googleLinkPromptSkipped' AND actor_id='another-local'").get().n,0,'Successful Google link needs no skip marker');
add('conflicting-local');await login('conflicting-local');check((await call(link,{credential,password:oldPassword},'/api/account-link')).status,409,'An existing assigned Google account cannot be taken over');check((await account()).googleLinked,false,'Conflict does not silently merge or link');
check(googleLinkOnboardingEligible({id:'a',groupId:'g',role:'student',activationReason:'admin-created',nameConfirmedAt:now},{username:'a',mustChangePassword:false},null),true,'Pure eligibility matches route');
// Native storage is deliberately not used for dismissal: the audit marker is per account.
const component=readFileSync(new URL('../app/google-link-onboarding.tsx',import.meta.url),'utf8');check(component.includes('localStorage'),false,'Skip persistence does not depend on browser storage');
globalThis.fetch=originalFetch;hooks.deregister();sqlite.close();
console.log(`PASS: ${checks} Google onboarding checks; mandatory password/name/role gates; persistent account-scoped skip; same identity linking; password verification; conflicts; inactive and anonymous safety. Fictional SQLite only.`);
