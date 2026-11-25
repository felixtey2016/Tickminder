import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {drizzle} from 'drizzle-orm/d1';
import ts from 'typescript';

// Actual username/auth routes, credentials and all migrations, isolated fictional SQLite.
// Only D1's transport and framework cookies/responses are adapted; no remote services.
const sqlite=new DatabaseSync(':memory:');
for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
function statement(sql,values=[]){
 const execute=arrays=>{const st=sqlite.prepare(sql);if(arrays)st.setReturnArrays(true);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};
 return{bind:(...args)=>statement(sql,args),async first(){return execute(false).results[0]||null;},async all(){return execute(false);},async raw(){return execute(true).results;},async run(){return execute(false);},execute:()=>execute(false)};
}
let beforeBatch=null;
const d1={prepare:statement,async batch(items){if(beforeBatch){const hook=beforeBatch;beforeBatch=null;await hook();}sqlite.exec('BEGIN');try{const result=items.map(item=>item.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
let token='',tickLearnNonce='',entryNonce='',googleBridgeToken='',requestHeaders=new Headers();
const env={DB:d1,GOOGLE_CLIENT_ID:'fictional-username-client',PASSWORD_RECOVERY_SECRET:'local-fixture-only-password-recovery-secret'};
const NextResponse={json(body,options){const response=Response.json(body,options);response.cookies={set(name,value){response.headers.append('set-cookie',name+'='+value+'; Path=/; HttpOnly; Secure');},delete(name){response.headers.append('set-cookie',name+'=; Max-Age=0');}};return response;}};
globalThis.__usernameQa={env,NextResponse,headers:async()=>requestHeaders,cookies:async()=>({get:name=>name==='tuition_session'&&token?{value:token}:name==='__Host-ticklearn-nonce'&&tickLearnNonce?{value:tickLearnNonce}:name==='__Host-ticklearn-entry'&&entryNonce?{value:entryNonce}:name==='__Host-ticklearn-google-session'&&googleBridgeToken?{value:googleBridgeToken}:undefined}),getDb:()=>drizzle(d1)};
const stub='data:text/javascript;base64,'+Buffer.from('export const {env,NextResponse,headers,cookies,getDb}=globalThis.__usernameQa;').toString('base64');
const root=new URL('../',import.meta.url).href;
const hooks=registerHooks({
 resolve(specifier,context,next){if(['cloudflare:workers','next/server','next/headers','@/db'].includes(specifier))return{url:stub,shortCircuit:true};if(specifier.startsWith('@/'))return{url:new URL(specifier.slice(2)+'.ts',root).href,shortCircuit:true};if(specifier.startsWith('.')&&context.parentURL?.startsWith(root)&&context.parentURL.endsWith('.ts'))return{url:new URL(/\.[cm]?[jt]sx?$/.test(specifier)?specifier:specifier+'.ts',context.parentURL).href,shortCircuit:true};return next(specifier,context);},
 load(url,context,next){if(url.startsWith(root)&&url.endsWith('.ts'))return{format:'module',source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText,shortCircuit:true};return next(url,context);},
});
const load=async file=>import(new URL('../'+file,import.meta.url).href);
const route=await load('app/api/username/route.ts'),authRoute=await load('app/api/auth/route.ts');
const {createSession}=await load('lib/auth.ts'),{hashPassword}=await load('lib/password.ts');
const {OWNER_EMAIL}=await load('lib/owner.ts');
const {auditActionLabel}=await load('lib/audit-i18n.ts'),{setLanguage}=await load('lib/i18n.ts');
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('External calls are forbidden in username API tests');};
const group='next-genn-edu',now=new Date().toISOString(),password='Fictional-Username-26!';
const passwordHash=await hashPassword(password);
sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run('foreign-group','Fictional second group','foreign-group',now,now);
let checks=0;function check(fn){fn();checks++;}function expect(result,status,label){assert.equal(result.status,status,label+': '+JSON.stringify(result.data));checks++;return result.data;}
const row=id=>sqlite.prepare('SELECT * FROM local_credentials WHERE account_id=?').get(id);
const count=()=>sqlite.prepare("SELECT count(*) AS n FROM audit WHERE action='accountUsername.update'").get().n;
function add(id,role='student',opts={}){
 const ownGroup=opts.group===undefined?group:opts.group;
 if(role==='student')sqlite.prepare('INSERT INTO students(group_id,name,name_key,active,created_at) VALUES(?,?,?,1,?)').run(ownGroup,id,id,now);
 sqlite.prepare('INSERT INTO accounts(group_id,id,email,name,role,student_name,created_at,activated_at,name_confirmed_at) VALUES(?,?,?,?,?,?,?,?,?)').run(ownGroup,id,ownGroup===null?OWNER_EMAIL:'',id,role,role==='student'?id:null,now,now,now);
 if(opts.local!==false)sqlite.prepare('INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,?,?)').run(id,opts.username||id,passwordHash,opts.mustChange?1:0,now);
 if(opts.google)sqlite.prepare('INSERT INTO google_identities(subject,account_id,email,linked_at) VALUES(?,?,?,?)').run('google-'+id,id,id+'@example.invalid',now);
}
async function login(id){token=(await createSession(id)).token;}
function request(body,{origin='https://fictional.invalid',contentType='application/json',raw,headers={}}={}){return new Request('https://fictional.invalid/api/username',{method:'POST',headers:{origin,'content-type':contentType,...headers},body:raw===undefined?JSON.stringify(body):raw});}
async function post(body,options){const response=await route.POST(request(body,options));return{status:response.status,data:await response.json(),headers:response.headers};}
async function passwordLogin(username){const response=await authRoute.POST(new Request('https://fictional.invalid/api/auth',{method:'POST',headers:{origin:'https://fictional.invalid','content-type':'application/json'},body:JSON.stringify({username,password})}));return{status:response.status,data:await response.json()};}
for(const [id,role,opts]of [['alpha','student',{google:true}],['beta','student',{}],['teacher','teacher',{}],['admin','admin',{}],['parent','parent',{}],['pending','pending',{}],['google-only','student',{local:false,google:true}],['initial','student',{mustChange:true}],['foreign','student',{group:'foreign-group',username:'global.taken'}],['legacy','student',{username:'Legacy.Mixed'}],['owner','admin',{group:null}]])add(id,role,opts);

sqlite.exec('PRAGMA foreign_keys=ON');
const devices=await load('app/api/account-devices/route.ts'),prefs=await load('app/api/notification-preferences/route.ts');
const {hashToken,currentIdentity}=await load('lib/auth.ts');
const {notificationPreferenceSql}=await load('lib/notification-preferences.ts');
const {sessionDeviceLabel}=await load('lib/session-device-label.ts');
const tickLearnAuth=await load('app/api/ticklearn/auth/route.ts');
const signupRequest=data=>new Request('https://fictional.invalid/api/ticklearn/auth',{method:'POST',
 headers:{origin:'https://fictional.invalid','content-type':'application/json'},body:JSON.stringify(data)});
const signup={action:'signup',name:'Fictional Learner',username:'fictional.learn',password};
assert.equal((await tickLearnAuth.POST(signupRequest(signup))).status,400,'signup requires a mobile number');
const mobile='+60123456789';
const registered=await tickLearnAuth.POST(signupRequest({...signup,phone:'0123456789'}));
assert.equal(registered.status,200,JSON.stringify(await registered.json()));
assert.match(registered.headers.getSetCookie()[0],/^tuition_session=.*HttpOnly/i);
const free=sqlite.prepare("SELECT accounts.* FROM accounts JOIN local_credentials ON local_credentials.account_id=accounts.id WHERE username=?").get(signup.username);
assert.equal(free.group_id,null);
assert.equal(free.role,'learner');
assert.equal(free.contact_phone,mobile);
assert.equal((await tickLearnAuth.POST(signupRequest({...signup,phone:mobile}))).status,409);
assert.equal((await passwordLogin(signup.username)).status,200);

const {normalizeTickLearnPhone}=await load('lib/ticklearn-phone.ts');
for(const input of ['012-3456789','12 345 6789','60123456789','+60123456789','0060123456789'])
 assert.equal(normalizeTickLearnPhone(input),mobile);
assert.equal(normalizeTickLearnPhone('01112345678'),'+601112345678');
assert.equal(normalizeTickLearnPhone('+6581234567'),'+6581234567');
assert.throws(()=>normalizeTickLearnPhone('0123'));
const {nonce}=await (await tickLearnAuth.GET()).json();
tickLearnNonce=nonce;
const rsa=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const fixtureKey={...await crypto.subtle.exportKey('jwk',rsa.publicKey),kid:'ticklearn-test'};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function googleCredential(id,claimedNonce){
 const payload=encode({kid:fixtureKey.kid,alg:'RS256'})+'.'+encode({iss:'https://accounts.google.com',
   aud:env.GOOGLE_CLIENT_ID,email_verified:true,sub:id,email:'learner@example.invalid',name:'Fictional Google Learner',
   exp:Math.floor(Date.now()/1000)+1200,nonce:claimedNonce});
 const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',rsa.privateKey,Buffer.from(payload));
 return payload+'.'+Buffer.from(sig).toString('base64url');
}
const offlineFetch=globalThis.fetch;
globalThis.fetch=async url=>{
 assert.equal(url,'https://www.googleapis.com/oauth2/v3/certs');
 return Response.json({keys:[fixtureKey]},{headers:{'cache-control':'max-age=120'}});
};
try {
 const credential=await googleCredential('fictional-google-ticklearn',nonce);
 const forged=await googleCredential('fictional-google-ticklearn','wrong-nonce');
 assert.equal((await tickLearnAuth.POST(signupRequest({action:'google',credential:forged,phone:mobile}))).status,401);
 const prompt=await tickLearnAuth.POST(signupRequest({action:'google',credential}));
 assert.equal(prompt.status,422);
 assert.equal((await prompt.json()).needsPhone,true);
 assert.equal((await tickLearnAuth.POST(signupRequest({action:'google',credential,phone:'12 345 6789'}))).status,200);
 assert.equal((await tickLearnAuth.POST(signupRequest({action:'google',credential}))).status,200,'returning Google users need no new number');
 assert.equal(sqlite.prepare("SELECT contact_phone FROM accounts WHERE id='fictional-google-ticklearn'").get().contact_phone,mobile);
 const preservedBusinessToken=(await createSession('alpha')).token;
 token=preservedBusinessToken;
 const bridge=await tickLearnAuth.POST(new Request('https://www.tickminder.com/api/ticklearn/auth',{method:'POST',
  headers:{origin:'https://www.tickminder.com','content-type':'application/json'},body:JSON.stringify({action:'google',credential,googleBridge:true})}));
 assert.equal(bridge.status,200);
 assert(!bridge.headers.getSetCookie().some(cookie=>cookie.startsWith('tuition_session=')));
 googleBridgeToken=bridge.headers.getSetCookie().find(cookie=>cookie.startsWith('__Host-ticklearn-google-session=')).split(';')[0].split('=')[1];
 assert.equal((await currentIdentity()).account.id,'alpha');
} finally {
 globalThis.fetch=offlineFetch;
}
const watch=await load('lib/watch-preview-server.ts');
const videoInsert=sqlite.prepare("INSERT INTO watch_preview_videos(id,group_id,youtube_id,title,kind,created_at) VALUES(?,?,?,?,'lesson',?)");
const videoId = n => '00000000-0000-4000-a000-' + String(n).padStart(12,'0');
for(let n=0;n<13;n++)videoInsert.run(videoId(n),group,String(n).padStart(11,'0'),'Test video '+n,new Date(Date.parse(now)+n*1000).toISOString());
assert.equal((await watch.watchVideoList(group,new URLSearchParams(),true)).videos.length,12);
assert.equal((await watch.watchVideoList(group,new URLSearchParams(),true)).nextCursor,null);
assert.equal(await watch.watchVideoDetail(group,videoId(12),true),null);
assert.equal((await watch.watchVideoDetail(group,videoId(12))).title,'Test video 12');
assert.equal((await watch.watchVideoList(group,new URLSearchParams({q:'video 12'}),true)).videos.length,0,'free filters cannot discover excluded videos');

const malaysiaMidnight = Date.parse('2025-01-01T16:00:00Z');
const beforeMidnight = malaysiaMidnight - 1;
const otherLearner = 'fictional-google-ticklearn';
assert.deepEqual(await Promise.all([0,1,2].map(n => watch.openFreeWatchVideo(otherLearner,videoId(n),beforeMidnight))),[true,true,false]);
assert.equal(await watch.remainingFreeWatchVideos(otherLearner,beforeMidnight),0);
assert.equal(await watch.openFreeWatchVideo(otherLearner,videoId(0),beforeMidnight),true);
assert.equal(await watch.remainingFreeWatchVideos(otherLearner,malaysiaMidnight),2);
assert.equal(await watch.openFreeWatchVideo(otherLearner,videoId(2),malaysiaMidnight),true);
assert.equal(await watch.openFreeWatchVideo(otherLearner,videoId(1),beforeMidnight),false,'an older request cannot overwrite the new day');
assert.equal(await watch.remainingFreeWatchVideos(otherLearner,malaysiaMidnight),1);

env.TICKGAME_ASSETS={};
const game=await load('lib/tickgame-demo.ts');
await login(free.id);
const academicMenu=await load('app/api/academic-catalogues/route.ts');
const catalogueResponse=await academicMenu.GET(new Request('https://fictional.invalid/api/academic-catalogues?scope=quiz'));
assert.equal(catalogueResponse.status,200);
const learnerCatalogue=await catalogueResponse.json();
assert.equal(learnerCatalogue.scope,'quiz');
assert(learnerCatalogue.syllabuses.length>0);
assert.equal(learnerCatalogue.canManage,false);
assert.equal((await academicMenu.GET(new Request('https://fictional.invalid/api/academic-catalogues?scope=student'))).status,401);
assert.equal((await academicMenu.POST(new Request('https://fictional.invalid/api/academic-catalogues',{method:'POST',headers:{origin:'https://fictional.invalid'}}))).status,403);
const gameUrl=new URL('/sejarah/bab-1?lang=en',game.catalogOrigin);
const handoff=await game.openTickGameCatalog('en',(await currentIdentity()).account,'reader',gameUrl);
const entry=await game.tickGameCatalogRoute(new Request(handoff),env.TICKGAME_ASSETS);
assert.equal(entry.status,303);
assert.equal(entry.headers.get('location'),'/sejarah/bab-1?lang=en');
const gameCookie=entry.headers.get('set-cookie').split(';')[0];
assert.equal(await game.tickGameCatalogAccess(gameCookie.split('=')[1]),'reader');
assert.equal((await game.tickGameCatalogRoute(new Request(game.catalogOrigin+'/studio',{headers:{cookie:gameCookie}}),env.TICKGAME_ASSETS)).status,404);
assert.equal((await game.tickGameCatalogRoute(new Request(handoff),env.TICKGAME_ASSETS)).status,404,'the handoff is single-use');
const watchViewer=await watch.currentWatchViewer();
const playChallenge=watch.watchToken();
const playHandoff=await watch.issueWatchHandoff(watchViewer,playChallenge);
const playSession=await watch.redeemWatchHandoff(playHandoff,playChallenge);
const playRequest=new Request("https://fictional.invalid/",{headers:{cookie:watch.WATCH_COOKIE+"="+playSession}});
assert.equal((await watch.currentWatchSession(playRequest)).accountId,free.id);
env.WATCH_PREVIEW_APP_ORIGIN = 'https://fictional.invalid';
env.WATCH_PREVIEW_ORIGIN = 'https://tickplay.fictional.invalid';
const playRoute=await load('app/api/watch-preview/[action]/route.ts');
const playPage=(action,session,params={},method='GET') => playRoute.GET(
  new Request(env.WATCH_PREVIEW_ORIGIN+'/api/watch-preview/'+action+'?'+new URLSearchParams(params),{
    method,headers:{cookie:watch.WATCH_COOKIE+'='+session},
  }),{params:Promise.resolve({action})},
);
const issuePlaySession=async () => {
  const challenge=watch.watchToken();
  return watch.redeemWatchHandoff(await watch.issueWatchHandoff(await watch.currentWatchViewer(),challenge),challenge);
};
const library=await playPage('view',playSession,{lang:'zh'});
assert.equal(library.status,200);
const directLibrary = await library.text();
assert.match(directLibrary,/今日还可看 2 \/ 2 部新视频/);
assert.doesNotMatch(directLibrary,/ticklearn-back-button--minder/);
assert.match(directLibrary,/class="ticklearn-back-button" href="https:\/\/study\.tickminder\.com\/ticklearn\/study/);
const tuitionEntryLibrary=await playPage('view',playSession,{lang:'zh',learn:'1',minderFrom:'apex'});
const tuitionEntryHtml=await tuitionEntryLibrary.text();
assert.match(tuitionEntryHtml,/ticklearn-back-button--minder" href="https:\/\/tickminder\.com\/"/);
assert.match(tuitionEntryHtml,/minderFrom=apex/);
const directAgain=await playPage('view',playSession,{lang:'zh',learn:'1'});
assert.doesNotMatch(await directAgain.text(),/ticklearn-back-button--minder/,'a separate direct entry does not inherit the return link');
assert.equal((await playPage('catalog',playSession)).status,200);
assert.equal((await playPage('video',playSession,{video:videoId(12)})).status,404);
assert.equal((await playPage('video',playSession,{video:videoId(3)},'HEAD')).status,200);
assert.equal(await watch.remainingFreeWatchVideos(free.id),2,'list, unavailable videos and HEAD consume no quota');
sqlite.prepare("UPDATE watch_preview_videos SET kind='short' WHERE id=?").run(videoId(1));
for (const n of [0,1]) {
  const page=await playPage('video',playSession,{video:videoId(n)});
  assert.equal(page.status,200);
  assert.match(await page.text(),/youtube-nocookie\.com\/embed\//);
}
const originalLearnerToken=token;
const anotherDevice=await createSession(free.id);
token=anotherDevice.token;
const secondPlaySession=await issuePlaySession();
const denied=await playPage('video',secondPlaySession,{video:videoId(2),lang:'zh'});
assert.equal(denied.status,429);
assert.match(denied.headers.get('content-security-policy'),/frame-src 'none'/);
const deniedPage=await denied.text();
assert.match(deniedPage,/今日免费视频额度已用完/);
assert.doesNotMatch(deniedPage,/<iframe/);
assert.equal((await playPage('video',secondPlaySession,{video:videoId(0)})).status,200);
assert.match(await (await playPage('view',secondPlaySession,{lang:'en'})).text(),/0 of 2 new videos left today/);

await login('alpha');
const tuitionVideo=await playPage('video',await issuePlaySession(),{video:videoId(12)});
assert.equal(tuitionVideo.status,200);
assert.match(await tuitionVideo.text(),/youtube-nocookie\.com\/embed\//);
assert.equal(await watch.remainingFreeWatchVideos('alpha'),2,'tuition students do not consume free quota');
token=originalLearnerToken;
assert.equal((await passwordLogin("beta")).status,200);
assert.equal(await watch.currentWatchSession(playRequest),null,"switching accounts revokes the former browser product session");
assert(sqlite.prepare("SELECT 1 FROM sessions WHERE token_hash=?").get(await hashToken(anotherDevice.token)),"other devices keep their sessions");
assert.equal(await game.tickGameCatalogAccess(gameCookie.split('=')[1]),null,'game catalogue session is revoked with the main session');
console.log('PASS TickLearn local signup and signed Google registration, required mobile numbers, video cap, and scoped/revoked Game handoff');
async function get(api){const r=await api.GET();return{status:r.status,data:await r.json(),headers:r.headers};}
async function set(api,body,options){const r=await api.POST(request(body,options));return{status:r.status,data:await r.json()};}
expect(await get(devices),401,'anonymous devices');expect(await get(prefs),401,'anonymous preferences');
await login('alpha');
for(const api of[devices,prefs]){
 expect(await set(api,{},{origin:'https://evil.invalid'}),403,'cross origin');
 expect(await set(api,{},{contentType:'text/plain'}),400,'JSON only');
 expect(await set(api,{},{raw:'{'}),400,'malformed');
 for(const value of[null,[],{}, {accountId:'beta'}])expect(await set(api,value),400,'invalid shape');
}
let state=expect(await get(prefs),200,'student default');
check(()=>assert.deepEqual(state.availableCategories,['courses','homework']));check(()=>assert.deepEqual(state.preferences,{courses:true,homework:true,fees:true}));
check(()=>assert.equal(state.pushConfigured,false));
expect(await set(prefs,{category:'fees',enabled:false}),403,'student cannot set fees');
expect(await set(prefs,{category:'courses',enabled:0}),400,'boolean only');
expect(await set(prefs,{category:'courses',enabled:false,accountId:'beta'}),400,'cannot target other account');
state=expect(await set(prefs,{category:'courses',enabled:false}),200,'disable course push');
check(()=>assert.equal(state.preferences.courses,false));check(()=>assert.equal(state.preferences.homework,true));
check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM notification_preferences WHERE account_id=?').get('beta').n,0));
const courseAllowed=()=>sqlite.prepare('SELECT '+notificationPreferenceSql("'alpha'",'courses',"'2000-01-01T00:00:00.000Z'")+' AS enabled').get().enabled;
check(()=>assert.equal(courseAllowed(),0));
expect(await set(prefs,{category:'courses',enabled:true}),200,'reenable');
check(()=>assert.match(sqlite.prepare('SELECT courses_since FROM notification_preferences WHERE account_id=?').get('alpha').courses_since,/^20/));
check(()=>assert.equal(courseAllowed(),0)); // re-enabling cannot replay old reminders
const preferenceHeaders=(await get(prefs)).headers;check(()=>assert.match(preferenceHeaders.get('cache-control'),/no-store/));
await login('teacher');state=expect(await get(prefs),200,'teacher prefs');check(()=>assert.deepEqual(state.availableCategories,['courses']));
for(const id of['parent','admin','pending']){await login(id);state=expect(await get(prefs),200,id+' empty categories');check(()=>assert.deepEqual(state.availableCategories,[]));}
for(const id of['initial','google-only']){await login(id);expect(await get(devices),403,id+' gated');expect(await get(prefs),403,id+' gated');}
await login('alpha');const current=token,currentHash=await hashToken(token);
const second=await createSession('alpha',new Request('https://fictional.invalid',{headers:{'user-agent':'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'}}));
const foreignSession=await createSession('foreign');
state=expect(await get(devices),200,'devices');check(()=>assert.equal(state.devices.filter(d=>d.current).length,1));
check(()=>assert.equal(state.devices.find(d=>d.current).browser,'unknown'));
const otherHash=await hashToken(second.token),other=sqlite.prepare('SELECT * FROM session_devices WHERE token_hash=?').get(otherHash),foreignDevice=sqlite.prepare('SELECT * FROM session_devices WHERE token_hash=?').get(await hashToken(foreignSession.token));
check(()=>assert.equal(other.browser,'Chrome'));check(()=>assert.equal(other.os,'Android'));
check(()=>assert(!JSON.stringify(state).includes(currentHash)&&!JSON.stringify(state).includes(otherHash)&&!JSON.stringify(state).includes(current)));
expect(await set(devices,{action:'revoke',deviceId:state.devices.find(d=>d.current).id}),400,'keep current');
expect(await set(devices,{action:'revoke',deviceId:foreignDevice.id}),404,'cannot revoke foreign');
expect(await set(devices,{action:'revoke',deviceId:other.id,accountId:'foreign'}),400,'no explicit account');
const countSessions=()=>sqlite.prepare('SELECT count(*) n FROM sessions WHERE account_id=?').get('alpha').n;
const countBefore=countSessions();
sqlite.exec("CREATE TRIGGER fail_device_audit BEFORE INSERT ON audit WHEN NEW.action='accountSessions.revoke' BEGIN SELECT RAISE(ABORT,'fixture audit failure');END;");
expect(await set(devices,{action:'revoke',deviceId:other.id}),503,'audit failure rolls back');check(()=>assert.equal(countSessions(),countBefore));sqlite.exec('DROP TRIGGER fail_device_audit');
expect(await set(devices,{action:'revoke',deviceId:other.id}),200,'revoke single');check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM session_devices WHERE id=?').get(other.id).n,0));
token=second.token;check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE token_hash=?').get(otherHash).n,0));assert.equal(await currentIdentity(),null);checks++;
token=current;expect(await set(devices,{action:'revokeOthers'}),200,'revoke others');check(()=>assert.equal(countSessions(),1));check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE token_hash=?').get(currentHash).n,1));
check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM sessions WHERE token_hash=?').get(foreignDevice.token_hash).n,1));assert.equal((await currentIdentity()).account.id,'alpha');checks++;
// Missing legacy metadata is enriched for the caller only.
sqlite.prepare('DELETE FROM session_devices WHERE token_hash=?').run(currentHash);state=expect(await get(devices),200,'legacy metadata repair');check(()=>assert.equal(state.devices.length,1));check(()=>assert.equal(state.devices[0].createdAt,null));
beforeBatch=()=>sqlite.prepare("UPDATE accounts SET disabled_at='2026-01-01' WHERE id=?").run('alpha');
expect(await set(prefs,{category:'homework',enabled:false}),409,'account disabled during mutation');check(()=>assert.equal(sqlite.prepare('SELECT homework_enabled FROM notification_preferences WHERE account_id=?').get('alpha').homework_enabled,1));sqlite.prepare('UPDATE accounts SET disabled_at=NULL WHERE id=?').run('alpha');
beforeBatch=()=>sqlite.prepare('DELETE FROM sessions WHERE token_hash=?').run(currentHash);
expect(await set(devices,{action:'revokeOthers'}),409,'session revoked during mutation');
check(()=>assert.deepEqual(sessionDeviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18) AppleWebKit/605 Safari/604'),{browser:'Safari',os:'iOS'}));
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));
const gameEntryApi=await load('app/api/ticklearn/game/route.ts');
const apexGameEntry='https://tickminder.com/api/ticklearn/game';
const directGameTarget=new URL('/sejarah?lang=zh',game.catalogOrigin);
await login('alpha');
const directGame=await gameEntryApi.GET(new Request(apexGameEntry+'?'+new URLSearchParams({from:'minder',next:directGameTarget.href})));
assert.equal(directGame.status,303);
const directCatalog=await game.tickGameCatalogRoute(new Request(directGame.headers.get('location')),env.TICKGAME_ASSETS);
assert.equal(directCatalog.headers.get('location'),'/sejarah?lang=zh');
const directCookies=directCatalog.headers.getSetCookie().map(cookie=>cookie.split(';')[0]).join('; ');
assert(directCookies.includes(game.catalogMinderCookie+'=apex'));
assert((await game.tickGameCatalogRoute(new Request(directGameTarget,{headers:{cookie:directCookies}}),env.TICKGAME_ASSETS)) instanceof URL);
directGameTarget.searchParams.set('learn','1');
directGameTarget.searchParams.set('minderFrom','apex');
const switchGame=await game.tickGameCatalogRoute(new Request(directGameTarget,{headers:{cookie:directCookies}}),env.TICKGAME_ASSETS);
assert.equal(switchGame.status,303);
const learnedGame=await gameEntryApi.GET(new Request(switchGame.headers.get('location')));
const learnCatalog=await game.tickGameCatalogRoute(new Request(learnedGame.headers.get('location')),env.TICKGAME_ASSETS);
assert(learnCatalog.headers.getSetCookie().find(cookie=>cookie.startsWith(game.catalogMinderCookie+'=;')));
const learnCookies=learnCatalog.headers.getSetCookie()[0].split(';')[0];
assert.equal(new URL(learnCatalog.headers.get('location'),game.catalogOrigin).searchParams.get('minderFrom'),'apex');
assert((await game.tickGameCatalogRoute(new Request(directGameTarget,{headers:{cookie:learnCookies}}),env.TICKGAME_ASSETS)) instanceof URL,'normal TickLearn game landing should settle after the handoff');

const learnEntry=await load('app/api/ticklearn/entry/route.ts');
const learnSession=await load('app/api/ticklearn/session/route.ts');
const www='https://www.tickminder.com', apex='https://tickminder.com', study='https://study.tickminder.com';
const learn='https://learn.tickminder.com';
const entryUrl=study+'/api/ticklearn/entry?lang=zh';
const session=study+'/api/ticklearn/session';
const probe=(origin=learn)=>learnSession.GET(new Request(session,{headers:{origin}}));
const requestEntry=url=>learnEntry.GET(new Request(url));
const location=response=>response.headers.get('location');
const cookie=(response,name)=>response.headers.getSetCookie().find(value=>value.startsWith(name+'='));
const cookieValue=(response,name)=>cookie(response,name)?.split(';')[0].split('=')[1];
token='';
assert.equal((await probe()).status,401);
assert.equal((await probe('https://foreign.invalid')).status,403);
assert.equal((await probe('https://foreign.invalid')).headers.get('access-control-allow-origin'),null);
assert.equal(new URL(location(await requestEntry(www+'/api/ticklearn/entry'))).origin,study);
const marked=await requestEntry(apex+'/api/ticklearn/entry?from=minder&lang=en');
assert.equal(new URL(new URL(location(marked)).searchParams.get('next')).searchParams.get('minderFrom'),'apex');
const begin=await requestEntry(entryUrl);
assert.equal(begin.status,303);
assert.equal(new URL(location(begin)).origin,www);
const browserNonce=cookieValue(begin,'__Host-ticklearn-entry');
const apexStart=await requestEntry(location(begin));
assert.equal(new URL(location(apexStart)).searchParams.get('source'),'apex');
const apexBegin=await requestEntry(location(apexStart));
assert.equal(new URL(location(apexBegin)).origin,apex);
assert.match(location(await requestEntry(location(apexBegin))),/ticklearn\/login/);
await login('alpha');
const liveSource=token;
const entryHandoff=await requestEntry(location(begin));
assert.equal(entryHandoff.status,303);
assert.equal(new URL(location(entryHandoff)).origin,study);
assert.equal(location(entryHandoff).includes(liveSource),false);
token='';
assert.match(location(await requestEntry(location(entryHandoff))),/ticklearn\/login/);
entryNonce='p'.repeat(43);
assert.match(location(await requestEntry(location(entryHandoff))),/ticklearn\/login/);
entryNonce=browserNonce;
const completed=await requestEntry(location(entryHandoff));
assert.equal(location(completed),study+'/ticklearn/study?lang=zh');
const bridged=cookie(completed,'tuition_session');
assert(bridged&&!bridged.includes('Domain='));
token=cookieValue(completed,'tuition_session');
assert.notEqual(token,liveSource);
assert.equal((await currentIdentity()).account.id,'alpha');
assert.equal((await probe()).status,204);
assert.equal((await probe()).headers.get('access-control-allow-origin'),learn);
assert.equal((await probe()).headers.get('access-control-allow-credentials'),'true');
assert.equal(location(await requestEntry(entryUrl)),study+'/ticklearn/study?lang=zh');
const {tickLearnReturn,tickLearnAuthLink}=await load('lib/ticklearn-routes.ts');
const {tickLearnNavItems,tickMinderReturnItem}=await load('lib/ticklearn-navigation.ts');
assert.equal(tickMinderReturnItem('en'),null);
assert.equal(tickMinderReturnItem('en','apex').href,apex+'/');
for (const item of tickLearnNavItems('en','apex')) {
 const url=new URL(item.href);
 const product=item.key==='game'?new URL(url.searchParams.get('next')):url;
 assert.equal(product.searchParams.get('minderFrom'),'apex',item.key);
}
assert.equal(tickLearnReturn(study+'/ticklearn/study?minderFrom=https://example.org','en').searchParams.get('minderFrom'),null);
const marketingHome=learn+'/';
const pageReturn=marketingHome+'?lang=ms';
const marketingEntry=study+'/api/ticklearn/entry?'+new URLSearchParams({lang:'ms',next:marketingHome});
assert.equal(location(await requestEntry(marketingEntry)),pageReturn);
assert.equal(new URL(tickLearnAuthLink(pageReturn,'ms')).searchParams.get('next'),pageReturn);
assert.equal(tickLearnReturn(marketingHome+'?code=discard#private','en').href,marketingHome+'?lang=en');
assert.equal(tickLearnReturn(marketingHome+'about','zh').origin,study);
assert.equal(tickLearnReturn('https://learn.tickminder.com.example.invalid/','zh').origin,study);
assert.equal(tickLearnReturn(www+'/quizzes/history?lang=en','en').href,study+'/quizzes/history?lang=en&learn=1');
assert.equal(tickLearnReturn('https://tickplay.tickminder.com/videos/abc?enter=1','en').searchParams.get('from'),study);
await authRoute.DELETE();
assert.equal((await probe()).status,401,'logout revokes only the Study session');
token=liveSource;
assert.equal((await currentIdentity()).account.id,'alpha');
const googleBegin=await requestEntry(entryUrl+'&source=google');
assert.equal(new URL(location(googleBegin)).origin,www);
const googleForward=await requestEntry(location(googleBegin));
assert.match(cookie(googleForward,'__Host-ticklearn-google-session'),/Max-Age=0/);
assert.equal((await currentIdentity()).account.id,'alpha','the Google bridge keeps the business cookie');
entryNonce=cookieValue(googleBegin,'__Host-ticklearn-entry');
token='';
const googleStudy=await requestEntry(location(googleForward));
token=cookieValue(googleStudy,'tuition_session');
assert.equal((await currentIdentity()).account.id,'fictional-google-ticklearn');
token=liveSource;
await authRoute.DELETE();
token='';
entryNonce=browserNonce;
assert.match(location(await requestEntry(location(entryHandoff))),/ticklearn\/login/,'revoked sessions cannot be handed off');

await login(free.id);
assert.equal((await post({username:'fixture.renamed-learner'})).status,200);
assert.equal(row(free.id).username,'fixture.renamed-learner');
const accountSetup=await load('app/api/account-setup/route.ts');
await login('fictional-google-ticklearn');
const makeRequest=(route,body)=>new Request(www+'/api/'+route,{method:'POST',headers:{origin:www,'content-type':'application/json'},body:JSON.stringify(body)});
const configured=await accountSetup.POST(makeRequest('account-setup',{username:'fixture.google-learner',password}));
assert.equal(configured.status,200);
assert.equal(row('fictional-google-ticklearn').username,'fixture.google-learner');
assert.equal(sqlite.prepare('SELECT count(*) AS n FROM google_identities WHERE account_id=?').get('fictional-google-ticklearn').n,1);
await login(free.id);
const passwordRoute=await load('app/api/password/route.ts');
const changedPassword='Fictional-New-Password-2026!';
assert.equal((await passwordRoute.POST(makeRequest('password',{currentPassword:password,newPassword:changedPassword}))).status,200);
const {verifyPassword}=await load('lib/password.ts');
assert(await verifyPassword(changedPassword,row(free.id).password_hash));
console.log('TickLearn session continuity, homepage probe, and learner account edits passed.');
console.log(JSON.stringify({ok:true,checks,fixtureOnly:true}));globalThis.fetch=originalFetch;hooks.deregister();sqlite.close();
