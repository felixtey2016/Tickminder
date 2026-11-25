import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createFixtureLoader} from './fixture-loader.mjs';

const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const name of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let actor=null,beforeBatch=null,checks=0;const cleanup=[];
function statement(sql,values=[]){const execute=()=>{const query=sqlite.prepare(sql);return query.columns().length?{results:query.all(...values),meta:{changes:0}}:{results:[],meta:query.run(...values)};};return{bind:(...args)=>statement(sql,args),all:async()=>execute(),first:async()=>execute().results[0]||null,run:async()=>execute(),execute};}
const db={prepare:statement,batch:async list=>{const hook=beforeBatch;beforeBatch=null;await hook?.();sqlite.exec('BEGIN');try{const result=list.map(item=>item.execute());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
globalThis.__resourceFolder={learningDb:()=>db,currentBusinessAccount:async()=>actor,deleteUnreferencedFile:async id=>cleanup.push(id),first:async(sql,...args)=>statement(sql,args).first(),rows:async(sql,...args)=>(await statement(sql,args).all()).results,change:async()=>{},OWNER_EMAIL:'owner@folder.example.test',isOwnerAccount:()=>false};
const data=value=>'data:text/javascript;base64,'+Buffer.from(value).toString('base64');
const runtimeUrl=data('export const {learningDb,currentBusinessAccount,deleteUnreferencedFile,first,rows,change,OWNER_EMAIL,isOwnerAccount}=globalThis.__resourceFolder;'),environmentUrl=data("export const env={ADMIN_PERMISSIONS_MODE:'enforced',DB:globalThis.__resourceFolder.learningDb()};");
const load=createFixtureLoader({runtimeUrl,environmentUrl,runtimeFiles:['lib/auth.ts','lib/learning-server.ts','lib/owner.ts','lib/pdf-storage.ts'],transform:(file,code)=>code.replaceAll('"next/server"',JSON.stringify(data('export const NextResponse={json:(data,options)=>Response.json(data,options)};')))}),route=(await load('app/api/folders/route.ts')).module,{normalizeAdminGrants}=(await load('lib/admin-permissions.ts')).module;
const now=new Date().toISOString(),group='folder-resources',other='folder-resources-other';
for(const id of[group,other])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,id,now,now);
function account(id,role,groupId=group,teacherName=null){const value={id,role,groupId,teacherName,studentName:null,name:id,email:id+'@folder.example.test'};sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,teacher_name,created_at) VALUES(?,?,?,?,?,?,?)').run(id,value.email,id,role,groupId,teacherName,now);return value;}
const admin=account('folder-admin','admin'),teacher=account('folder-teacher','teacher',group,'Teacher A'),outsider=account('folder-other','admin',other);
sqlite.prepare('INSERT INTO teachers(group_id,name,created_at) VALUES(?,?,?)').run(group,'Teacher A',now);
sqlite.prepare('INSERT INTO classrooms(id,group_id,title,subject,teacher_name,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('folder-class',group,'Resource class','Mathematics','Teacher A',teacher.id,now,now);
function folder(id,parent=null){sqlite.prepare('INSERT INTO classroom_folders(id,group_id,classroom_id,parent_id,name,name_key,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,group,'folder-class',parent,id,id,teacher.id,now,now);}
folder('folder-root');folder('folder-child','folder-root');folder('folder-empty');
function grant(resources){sqlite.prepare("INSERT INTO admin_permission_profiles(group_id,account_id,grants_json,origin,updated_at) VALUES(?,?,?,'new',?) ON CONFLICT(group_id,account_id) DO UPDATE SET grants_json=excluded.grants_json,revision=admin_permission_profiles.revision+1").run(group,admin.id,JSON.stringify(normalizeAdminGrants(['folders.delete',...resources?['resources.assign']:[]])),now);}
grant(false);
sqlite.prepare('INSERT INTO pdf_files(id,group_id,object_key,owner_id,kind,filename,bytes,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('retained-pdf',group,'fictional/folder-pdf',teacher.id,'material','fixture.pdf',500,'attached',now);
sqlite.prepare('INSERT INTO storage_quota(id,group_id,used_bytes) VALUES(1,?,500)').run(group);
function resource(id,file=false){sqlite.prepare('INSERT INTO resource_catalog(id,group_id,owner_id,kind,link_url,file_id,title,syllabus_id,syllabus_name,resource_type,source_name,source_url,license_type,authorization_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,group,teacher.id,file?'file':'link',file?null:'https://example.org/resource',file?'retained-pdf':null,id,'spm','SPM','reference','Fictional rights holder','https://example.org/',file?'original':'permission','Fictional permission',now,now);}
function assignment(id,resourceId,folderId,active=1,file=false){sqlite.prepare('INSERT INTO resource_assignments(id,group_id,resource_id,classroom_id,folder_id,file_id,active,assigned_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,group,resourceId,'folder-class',folderId,file?'retained-pdf':null,active,teacher.id,now,now);}
resource('source-link');resource('source-pdf',true);resource('source-inactive');assignment('placement-root','source-link','folder-root');assignment('placement-child','source-pdf','folder-child',1,true);assignment('placement-inactive','source-inactive','folder-child',0);
function check(fn){fn();checks++;}
async function post(body,as=teacher,status=200){actor=as;const response=await route.POST(new Request('https://folder.example.test/api/folders',{method:'POST',headers:{origin:'https://folder.example.test'},body:JSON.stringify({classroomId:'folder-class',...body})})),result=await response.json();check(()=>assert.equal(response.status,status,JSON.stringify(result)));return result;}
await post({action:'previewDelete',id:'folder-root'},admin,403);
const first=(await post({action:'previewDelete',id:'folder-root'})).preview;
check(()=>assert.equal(first.resourceAssignments,3));check(()=>assert.equal(first.folders,1));check(()=>assert.equal(first.materials,0));
await post({action:'delete',id:'folder-root',revision:first.revision,token:first.token,confirmed:true},admin,403);
await post({action:'previewDelete',id:'folder-root'},outsider,403);
grant(true);const approved=(await post({action:'previewDelete',id:'folder-root'},admin)).preview;
beforeBatch=()=>grant(false);
await post({action:'delete',id:'folder-root',revision:approved.revision,token:approved.token,confirmed:true},admin,403);
check(()=>assert.equal(sqlite.prepare("SELECT count(*) n FROM resource_assignments WHERE classroom_id='folder-class'").get().n,3));check(()=>assert.ok(sqlite.prepare("SELECT 1 FROM classroom_folders WHERE id='folder-root'").get()));
grant(true);const beforeRace=(await post({action:'previewDelete',id:'folder-root'},admin)).preview;
beforeBatch=()=>sqlite.prepare("UPDATE resource_assignments SET active=1,revision=revision+1 WHERE id='placement-inactive'").run();
await post({action:'delete',id:'folder-root',revision:beforeRace.revision,token:beforeRace.token,confirmed:true},admin,409);
check(()=>assert.ok(sqlite.prepare("SELECT 1 FROM classroom_folders WHERE id='folder-child'").get()));
const current=(await post({action:'previewDelete',id:'folder-root'},admin)).preview;
check(()=>assert.notEqual(current.token,beforeRace.token));
await post({action:'delete',id:'folder-root',revision:current.revision,token:'stale',confirmed:true},admin,409);
await post({action:'delete',id:'folder-root',revision:current.revision,token:current.token,confirmed:true},admin);
check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM resource_assignments').get().n,0));check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM resource_catalog').get().n,3));check(()=>assert.equal(sqlite.prepare("SELECT status FROM pdf_files WHERE id='retained-pdf'").get().status,'attached'));check(()=>assert.equal(sqlite.prepare('SELECT used_bytes FROM storage_quota WHERE group_id=?').get(group).used_bytes,500));check(()=>assert.deepEqual(cleanup,[]));
grant(false);const empty=(await post({action:'previewDelete',id:'folder-empty'},admin)).preview;check(()=>assert.equal(empty.resourceAssignments,0));await post({action:'delete',id:'folder-empty',revision:empty.revision,token:empty.token,confirmed:true},admin);
check(()=>assert.equal(sqlite.prepare('SELECT count(*) n FROM classroom_folders').get().n,0));check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));
console.log('Folder resource assignment impact, live revoke authority, stale preview and retained originals: '+checks+' checks passed');
