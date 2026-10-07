import { env } from "cloudflare:workers";
import type { Account } from "@/lib/auth";
import { hashToken } from "@/lib/auth";
import { first, learningDb, rows } from "@/lib/learning-server";
import { meetCode, summarizeMeet, type MeetEvidence } from "@/lib/meet";
import { fetchMeetConferences, googleFetch, MeetError } from "@/lib/meet-provider";

const scope="openid email https://www.googleapis.com/auth/meetings.space.readonly";
type Lesson={id:string;student:string;subject:string;teacher_name:string;planned_start:string;planned_end:string;status:string;online_link:string|null};
type Connection={account_id:string;google_subject:string;google_email:string;refresh_cipher:string;connected_at:string;last_error:string|null;version:string};
type Observation={id:string;lesson_id:string;meeting_code:string;planned_start:string;planned_end:string;evidence_json:string|null;synced_at:string|null;last_error:string|null;next_sync_at:string;lock_id:string|null};
const encode=(bytes:Uint8Array)=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(""));
const decode=(text:string)=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
const random=()=>encode(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
const iso=(time:number)=>new Date(time).toISOString();
export function meetConfigured(){
  try {const redirect=new URL(env.MEET_OAUTH_REDIRECT_URI||"");return Boolean(env.MEET_OAUTH_CLIENT_ID && env.MEET_OAUTH_CLIENT_SECRET && decode(env.MEET_TOKEN_KEY||"").length===32 && redirect.protocol==="https:" && redirect.pathname==="/api/meet/callback" && !redirect.search && !redirect.hash && !redirect.username && !redirect.password);}
  catch{return false;}
}
async function key(){if(!meetConfigured())throw new MeetError("not_configured",503);return crypto.subtle.importKey("raw",decode(env.MEET_TOKEN_KEY!).buffer as ArrayBuffer,"AES-GCM",false,["encrypt","decrypt"]);}
export async function sealMeet(value:string,context:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(context)},await key(),new TextEncoder().encode(value));
  return `${encode(iv)}.${encode(new Uint8Array(cipher))}`;
}
export async function openMeet(value:string,context:string){
  try{const [iv,cipher]=value.split(".");return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(iv),additionalData:new TextEncoder().encode(context)},await key(),decode(cipher).buffer as ArrayBuffer));}
  catch{throw new MeetError("reconnect",409);}
}
async function authorizedTeacher(account:Account){
  if(account.role!=="teacher" || !account.teacherName || !await first("SELECT 1 AS ok FROM teachers WHERE name=? AND active=1",account.teacherName))throw new MeetError("forbidden",403);
}
export async function startMeetOAuth(account:Account,origin:string){
  await authorizedTeacher(account);if(!meetConfigured())throw new MeetError("not_configured",503);
  const redirect=new URL(env.MEET_OAUTH_REDIRECT_URI!);if(redirect.origin!==origin)throw new MeetError("forbidden",403);
  const state=random(),stateHash=await hashToken(state),verifier=random(),db=learningDb();
  await db.batch([
    db.prepare("DELETE FROM meet_oauth_states WHERE expires_at < ? OR account_id=?").bind(iso(Date.now()),account.id),
    db.prepare("INSERT INTO meet_oauth_states (state_hash,account_id,verifier_cipher,expires_at) VALUES (?,?,?,?)").bind(stateHash,account.id,await sealMeet(verifier,`${account.id}:oauth:${stateHash}`),iso(Date.now()+600_000)),
  ]);
  const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for(const [k,v] of Object.entries({client_id:env.MEET_OAUTH_CLIENT_ID!,redirect_uri:redirect.href,response_type:"code",scope,access_type:"offline",prompt:"consent select_account",state,code_challenge:await hashToken(verifier),code_challenge_method:"S256"}))url.searchParams.set(k,v);
  return {url:url.href,state};
}
export async function finishMeetOAuth(account:Account,state:string,code:string){
  await authorizedTeacher(account);if(!meetConfigured() || state.length>128 || !code || code.length>4096)throw new MeetError("oauth");
  const db=learningDb(),stateHash=await hashToken(state);
  const stored=await db.prepare("DELETE FROM meet_oauth_states WHERE state_hash=? AND account_id=? AND expires_at>? RETURNING verifier_cipher").bind(stateHash,account.id,iso(Date.now())).first<{verifier_cipher:string}>();
  if(!stored)throw new MeetError("oauth");
  const token=await googleFetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:env.MEET_OAUTH_CLIENT_ID!,client_secret:env.MEET_OAUTH_CLIENT_SECRET!,redirect_uri:env.MEET_OAUTH_REDIRECT_URI!,grant_type:"authorization_code",code_verifier:await openMeet(stored.verifier_cipher,`${account.id}:oauth:${stateHash}`)})});
  if(typeof token.access_token!=="string" || typeof token.refresh_token!=="string" || !String(token.scope||"").split(" ").includes("https://www.googleapis.com/auth/meetings.space.readonly"))throw new MeetError("oauth");
  const profile=await googleFetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:`Bearer ${token.access_token}`}});
  if(typeof profile.sub!=="string" || typeof profile.email!=="string" || profile.email_verified!==true)throw new MeetError("oauth");
  if(await first("SELECT 1 AS found FROM meet_connections WHERE google_subject=? AND account_id<>?",profile.sub,account.id))throw new MeetError("duplicate",409);
  await db.prepare(`INSERT INTO meet_connections (account_id,google_subject,google_email,refresh_cipher,connected_at,last_error,version) VALUES (?,?,?,?,?,NULL,?)
    ON CONFLICT(account_id) DO UPDATE SET google_subject=excluded.google_subject,google_email=excluded.google_email,refresh_cipher=excluded.refresh_cipher,connected_at=excluded.connected_at,last_error=NULL,version=excluded.version`)
    .bind(account.id,profile.sub,profile.email.toLowerCase(),await sealMeet(token.refresh_token,`${account.id}:refresh`),iso(Date.now()),random()).run();
}
export async function disconnectMeet(account:Account){
  await authorizedTeacher(account);
  // Erase locally even when Google's revoke endpoint is unreachable. Do not revoke a
  // client-wide Google grant used by other accounts: the owner may revoke it in Google.
  await learningDb().batch([
    learningDb().prepare("DELETE FROM meet_connections WHERE account_id=?").bind(account.id),
    learningDb().prepare("DELETE FROM meet_oauth_states WHERE account_id=?").bind(account.id),
  ]);
}
export async function meetSettings(account:Account){
  if(!["teacher","admin","student"].includes(account.role))throw new MeetError("forbidden",403);
  const connection=account.role==="teacher"?await first<{connected_at:string;google_email:string;last_error:string|null}>("SELECT connected_at,google_email,last_error FROM meet_connections WHERE account_id=?",account.id):null;
  const runtime=await first<{last_dispatch_at:string}>("SELECT last_dispatch_at FROM meet_runtime WHERE id=1");
  return {configured:meetConfigured(),connection:connection?{connectedAt:connection.connected_at,email:connection.google_email,error:connection.last_error}:null,
    clockActive:Boolean(runtime && Date.now()-Date.parse(runtime.last_dispatch_at)<180_000)};
}
async function lessonById(id:string){
  return first<Lesson>(`SELECT l.*,p.online_link FROM lessons l LEFT JOIN plans p ON p.student=l.student AND p.subject=l.subject AND p.teacher_name=l.teacher_name AND p.active=1 WHERE l.id=?`,id);
}
export async function accessibleMeetLesson(account:Account,id:unknown){
  if(typeof id!=="string" || id.length>128)throw new MeetError("invalid");
  const l=await lessonById(id);if(!l)throw new MeetError("forbidden",403);
  if(account.role==="admin")return l;
  if(l.status==="cancelled")throw new MeetError("forbidden",403);
  if(account.role==="student" && account.studentName===l.student && await first("SELECT 1 AS ok FROM students WHERE name=? AND active=1",l.student))return l;
  if(account.role==="teacher" && account.teacherName===l.teacher_name && await first(`SELECT 1 AS ok FROM plans p JOIN teachers t ON t.name=p.teacher_name AND t.active=1 JOIN students s ON s.name=p.student AND s.active=1 WHERE p.student=? AND p.subject=? AND p.teacher_name=? AND p.active=1`,l.student,l.subject,l.teacher_name))return l;
  throw new MeetError("forbidden",403);
}
async function connectionFor(l:Lesson){
  // An unassigned/disabled account can no longer poll even if a token remains.
  return first<Connection>(`SELECT c.* FROM meet_connections c JOIN accounts a ON a.id=c.account_id JOIN teachers t ON t.name=a.teacher_name AND t.active=1
    WHERE a.role='teacher' AND a.teacher_name=? AND a.disabled_at IS NULL AND a.activated_at IS NOT NULL ORDER BY c.connected_at DESC LIMIT 1`,l.teacher_name);
}
async function observationId(l:Lesson,code:string){return hashToken(JSON.stringify([l.id,l.student,l.teacher_name,code,l.planned_start,l.planned_end]));}
async function accessToken(connection:Connection){
  let token;
  try{token=await googleFetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.MEET_OAUTH_CLIENT_ID!,client_secret:env.MEET_OAUTH_CLIENT_SECRET!,refresh_token:await openMeet(connection.refresh_cipher,`${connection.account_id}:refresh`),grant_type:"refresh_token"})});}
  catch(error){if(error instanceof MeetError && error.code==="oauth")throw new MeetError("reconnect",409);throw error;}
  if(typeof token.access_token!=="string")throw new MeetError("reconnect",409);
  return token.access_token;
}
export async function syncMeetLesson(l:Lesson,force=false){
  if(!meetConfigured())throw new MeetError("not_configured",503);
  const code=meetCode(l.online_link);if(!code || l.status==="cancelled")throw new MeetError("invalid");
  const now=Date.now();if(now-Date.parse(l.planned_end)>29*86400_000)throw new MeetError("expired",409);
  const connection=await connectionFor(l);if(!connection)throw new MeetError("reconnect",409);
  const db=learningDb(),id=await observationId(l,code),lock=random();
  await db.prepare("INSERT OR IGNORE INTO meet_observations (id,lesson_id,meeting_code,planned_start,planned_end,next_sync_at) VALUES (?,?,?,?,?,?)").bind(id,l.id,code,l.planned_start,l.planned_end,iso(now)).run();
  // Compare-and-set prevents a browser and the clock from synchronizing the same
  // snapshot simultaneously. Leases expire after network failures/worker death.
  const leased=await db.prepare(`UPDATE meet_observations SET lock_id=?,lock_until=?,attempted_at=? WHERE id=? AND (lock_until IS NULL OR lock_until<?) AND
    (attempted_at IS NULL OR attempted_at<?) ${force?"":"AND next_sync_at<=?"} RETURNING id`).bind(lock,iso(now+120_000),iso(now),id,iso(now),iso(now-30_000),...(force?[]:[iso(now)])).first();
  if(!leased)throw new MeetError("busy",409);
  try{
    const ids=await identityIds(l,connection);
    const conferences=await fetchMeetConferences(await accessToken(connection),code,l.planned_start,l.planned_end,new Set([...ids.teacher,...ids.student]));
    const at=iso(Date.now()),evidence:MeetEvidence={conferences,observedAt:at,teacherUsers:[...ids.teacher],studentUsers:[...ids.student]};
    // Reject stale results after cancellation, editing, reassignment or disconnect.
    const current=await lessonById(l.id),stillConnected=await first("SELECT 1 AS ok FROM meet_connections WHERE account_id=? AND version=?",connection.account_id,connection.version);
    if(!current || current.status==="cancelled" || await observationId(current,meetCode(current.online_link)||"")!==id || !stillConnected)throw new MeetError("busy",409);
    const ended=Date.parse(l.planned_end)<Date.now();const wait=ended?300_000:60_000;
    await db.batch([
      db.prepare("UPDATE meet_observations SET evidence_json=?,synced_at=?,last_error=NULL,next_sync_at=?,lock_id=NULL,lock_until=NULL WHERE id=? AND lock_id=?").bind(JSON.stringify(evidence),at,iso(Date.now()+wait),id,lock),
      db.prepare("UPDATE meet_connections SET last_error=NULL WHERE account_id=? AND version=?").bind(connection.account_id,connection.version),
    ]);
  }catch(error){
    const code=error instanceof MeetError?error.code:"unavailable";
    await db.batch([
      db.prepare("UPDATE meet_observations SET last_error=?,next_sync_at=?,lock_id=NULL,lock_until=NULL WHERE id=? AND lock_id=?").bind(code,iso(Date.now()+300_000),id,lock),
      db.prepare("UPDATE meet_connections SET last_error=? WHERE account_id=? AND version=?").bind(code,connection.account_id,connection.version),
    ]);throw error;
  }
}
async function identityIds(l:Lesson,connection:Connection|null){
  const identities=await rows<{subject:string;role:string}>(`SELECT g.subject,a.role FROM google_identities g JOIN accounts a ON a.id=g.account_id WHERE a.disabled_at IS NULL AND
    ((a.role='teacher' AND a.teacher_name=?) OR (a.role='student' AND a.student_name=?))`,l.teacher_name,l.student);
  const teacher=new Set(identities.filter(i=>i.role==="teacher").map(i=>`users/${i.subject}`));if(connection)teacher.add(`users/${connection.google_subject}`);
  return {teacher,student:new Set(identities.filter(i=>i.role==="student").map(i=>`users/${i.subject}`))};
}
export async function meetLessonState(account:Account,l:Lesson){
  const code=meetCode(l.online_link),connection=await connectionFor(l);
  const current=code?await first<Observation>("SELECT * FROM meet_observations WHERE id=?",await observationId(l,code)):null;
  const old=await rows<Observation>("SELECT * FROM meet_observations WHERE lesson_id=? AND synced_at IS NOT NULL ORDER BY planned_start DESC,synced_at DESC LIMIT 12",l.id);
  const ids=await identityIds(l,connection);
  function publicObservation(o:Observation){
    const evidence=o.evidence_json?JSON.parse(o.evidence_json) as MeetEvidence:null;
    const teacherIds=new Set(evidence?.teacherUsers||[...ids.teacher]),studentIds=new Set(evidence?.studentUsers||[...ids.student]);
    const summary=evidence?summarizeMeet(evidence,o.planned_start,o.planned_end,teacherIds,studentIds):null;
    // Students only receive their own and the teacher's sessions; no peer names,
    // Google IDs, emails or complete provider payload leaves this endpoint.
    const from=Date.parse(o.planned_start),until=Date.parse(o.planned_end);
    const participants=evidence?.conferences.flatMap(c=>c.participants).filter(p=>account.role!=="student" || Boolean(p.googleUser && (teacherIds.has(p.googleUser)||studentIds.has(p.googleUser))))
      .map(p=>({displayName:account.role==="student"?(p.googleUser && teacherIds.has(p.googleUser)?l.teacher_name:l.student):p.displayName,
        role:p.googleUser && teacherIds.has(p.googleUser)?"teacher":p.googleUser && studentIds.has(p.googleUser)?"student":"unmatched",
        sessions:p.sessions.filter(s=>Date.parse(s.startTime)<until && (!s.endTime || Date.parse(s.endTime)>from)).map(s=>({startTime:s.startTime,endTime:s.endTime}))})).filter(p=>p.sessions.length) || [];
    return {id:o.id,plannedStart:o.planned_start,plannedEnd:o.planned_end,summary,error:o.last_error,participants};
  }
  return {supported:Boolean(code),connected:Boolean(connection),configured:meetConfigured(),current:current?publicObservation(current):null,
    history:old.filter(o=>o.id!==current?.id).map(publicObservation),canSync:account.role!=="student" && Boolean(connection) && l.status!=="cancelled"};
}
export async function dispatchMeet(){
  if(!meetConfigured())throw new MeetError("not_configured",503);
  const db=learningDb(),now=Date.now();
  await db.prepare("DELETE FROM meet_oauth_states WHERE expires_at<?").bind(iso(now)).run();
  const candidates=await rows<Lesson>(`SELECT l.*,p.online_link FROM lessons l JOIN plans p ON p.student=l.student AND p.subject=l.subject AND p.teacher_name=l.teacher_name AND p.active=1
    JOIN students s ON s.name=p.student AND s.active=1 JOIN teachers t ON t.name=p.teacher_name AND t.active=1
    WHERE l.status<>'cancelled' AND l.planned_start<=? AND l.planned_end>=? AND p.online_link LIKE 'https://meet.google.com/%'
    AND EXISTS (SELECT 1 FROM meet_connections c JOIN accounts a ON a.id=c.account_id WHERE a.teacher_name=l.teacher_name AND a.role='teacher' AND a.disabled_at IS NULL AND a.activated_at IS NOT NULL)
    ORDER BY l.planned_start DESC LIMIT 300`,iso(now+30*60_000),iso(now-86400_000));
  const observations=await rows<{id:string;next_sync_at:string}>("SELECT o.id,o.next_sync_at FROM meet_observations o JOIN lessons l ON l.id=o.lesson_id WHERE l.planned_start<=? AND l.planned_end>=?",iso(now+30*60_000),iso(now-86400_000));
  const byId=new Map(observations.map(o=>[o.id,o]));
  const due:Array<{lesson:Lesson;due:string}>=[];
  for(const l of candidates){const code=meetCode(l.online_link);if(!code)continue;const o=byId.get(await observationId(l,code));if(!o || o.next_sync_at<=iso(now))due.push({lesson:l,due:o?.next_sync_at||l.planned_start});}
  let synced=0,failed=0;
  // Keep requests bounded. Oldest due rows advance first; large installations can
  // raise the batch/worker allowance after measuring Google's quota.
  for(const {lesson} of due.sort((a,b)=>a.due.localeCompare(b.due)).slice(0,2)){
    try{await syncMeetLesson(lesson);synced++;}catch(error){if(!(error instanceof MeetError && error.code==="busy"))failed++;}
  }
  await db.prepare("INSERT INTO meet_runtime (id,last_dispatch_at) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET last_dispatch_at=excluded.last_dispatch_at").bind(iso(Date.now())).run();
  return {synced,failed,remaining:Math.max(0,due.length-2)};
}
