import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {drizzle} from 'drizzle-orm/d1';
import {createFixtureLoader} from './fixture-loader.mjs';

// Actual state handler, permission predicates, ORM SQL and migrations. Only
// authentication/network bindings are substituted; no hosted database is used.
globalThis.fetch=async()=>{throw Error('Network forbidden in financial activity privacy fixture');};
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
for(const file of fs.readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
let actor=null,beforeAuditRead=null,checks=0;
function statement(query,values=[]){const execute=arrays=>{assert(values.length<=100,'D1 binding limit');if(beforeAuditRead&&/FROM\s+"audit"/i.test(query)){const hook=beforeAuditRead;beforeAuditRead=null;hook();}const st=sqlite.prepare(query);if(arrays)st.setReturnArrays(true);return st.columns().length?{results:st.all(...values),meta:{changes:0}}:{results:[],meta:st.run(...values)};};return{bind:(...v)=>statement(query,v),all:async()=>execute(false),raw:async()=>execute(true).results,first:async()=>execute(false).results[0]||null,run:async()=>execute(false),execute:()=>execute(false)};}
const db={prepare:statement,batch:async statements=>{sqlite.exec('BEGIN');try{const result=statements.map(s=>s.execute());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const gid='activity-school',foreign='activity-foreign',now=new Date().toISOString();
globalThis.__financialActivityRuntime={
 env:{DB:db,ADMIN_PERMISSIONS_MODE:'enforced',BACKUP_EXPORT_TOKEN:'fictional-private-export-token-1234567890'},
 learningDb:()=>db,currentBusinessAccount:async()=>actor,
 OWNER_EMAIL:'owner@activity.example.test',isOwnerAccount:a=>a?.role==='admin'&&a.email==='owner@activity.example.test'&&!a.id.startsWith('local:'),
 getDb:()=>drizzle(db),
 first:async(query,...values)=>sqlite.prepare(query).get(...values)||null,
 rows:async(query,...values)=>sqlite.prepare(query).all(...values),
 learningState:async()=>({}),classroomsState:async()=>[],classroomMayManage:async()=>false,activeClassroomMemberNames:async()=>[],pdfBucket:()=>({get:async()=>null}),
};
const dataUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64'),runtimeUrl=dataUrl('export const {env,learningDb,currentBusinessAccount,OWNER_EMAIL,isOwnerAccount,getDb,first,rows,learningState,classroomsState,classroomMayManage,activeClassroomMemberNames,pdfBucket,studentHasMaterial,studentHasHomework,pdfLimits}=globalThis.__financialActivityRuntime;'),nextUrl=dataUrl('export const NextResponse={json:(value,options)=>Response.json(value,options)};');
const load=createFixtureLoader({runtimeUrl,environmentUrl:runtimeUrl,runtimeFiles:['lib/auth.ts','lib/owner.ts','lib/learning-server.ts','lib/classrooms-server.ts','lib/pdf-storage.ts'],transform:(_file,code)=>code.replaceAll("'next/server'",JSON.stringify(nextUrl)).replaceAll('"next/server"',JSON.stringify(nextUrl)).replaceAll("'@/db'",JSON.stringify(runtimeUrl)).replaceAll('"@/db"',JSON.stringify(runtimeUrl))});
const state=(await load('app/api/state/route.ts')).module,backup=(await load('app/api/backup-export/route.ts')).module;
for(const groupId of[gid,foreign])sqlite.prepare('INSERT INTO tuition_groups(id,name,join_code,created_at,updated_at) VALUES(?,?,?,?,?)').run(groupId,groupId,groupId,now,now);
function account(id,role='admin',groupId=gid,email=id+'@activity.example.test'){const value={id,role,groupId,email,name:id,teacherName:role==='teacher'?'Teacher':null,studentName:role==='student'?'Student':null};sqlite.prepare('INSERT INTO accounts(id,email,name,role,group_id,teacher_name,student_name,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,email,id,role,groupId,value.teacherName,value.studentName,now);return value;}
const owner=account('activity-owner','admin',gid,'owner@activity.example.test'),chief=account('activity-chief'),admin=account('activity-admin'),teacher=account('activity-teacher','teacher'),student=account('activity-student','student'),outsider=account('activity-outsider','admin',foreign);
sqlite.prepare('UPDATE tuition_groups SET chief_admin_id=? WHERE id=?').run(chief.id,gid);
function grant(values,who=admin,origin='new'){sqlite.prepare('INSERT INTO admin_permission_profiles(group_id,account_id,revision,grants_json,origin,updated_at) VALUES(?,?,1,?,?,?) ON CONFLICT(group_id,account_id) DO UPDATE SET grants_json=excluded.grants_json,origin=excluded.origin,revision=revision+1').run(who.groupId,who.id,JSON.stringify(values),origin,now);}
for(const groupId of[gid,foreign]){
 for(let i=0;i<35;i++)sqlite.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) VALUES(?,?,?,?,?,?,?)').run(groupId,'normal-'+groupId+'-'+i,'ordinary-record',owner.id,'edit',JSON.stringify({title:'Ordinary event '+i}),'2025-01-01T00:00:'+String(i).padStart(2,'0')+'.000Z');
 for(let i=0;i<40;i++){
  const stamp='2025-02-01T00:'+String(i).padStart(2,'0')+':00.000Z';
  sqlite.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,?,?,?)').run(groupId,'payroll-'+groupId+'-'+i,'payroll:private-run',owner.id,['payroll.saveRate','payroll.generate','payroll.adjust','payroll.pay','payroll.reversePayment'][i%5],JSON.stringify({reason:'PAYROLL_PRIVATE_BEFORE_'+groupId,amountCents:87654321}),JSON.stringify({reason:'PAYROLL_PRIVATE_AFTER_'+groupId,amountCents:76543210}),stamp);
  sqlite.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,?,?,?)').run(groupId,'expense-'+groupId+'-'+i,'expense:private-expense',owner.id,i%2?'finance.recordExpense':'finance.reverseExpense',JSON.stringify({reason:'EXPENSE_PRIVATE_BEFORE_'+groupId,amountCents:65432109}),JSON.stringify({reason:'EXPENSE_PRIVATE_AFTER_'+groupId,amountCents:54321098}),'2025-03-01T00:'+String(i).padStart(2,'0')+':00.000Z');
 }
}
const check=fn=>{fn();checks++;};
async function get(as=admin,scope='activity'){actor=as;const r=await state.GET(new Request('https://activity.example.test/api/state'+(scope?'?scope='+scope:'')));return{status:r.status,data:await r.json()};}
function expect(r,status,label){check(()=>assert.equal(r.status,status,label+': '+JSON.stringify(r.data)));return r.data;}
const assertPrivateAbsent=(value,label)=>check(()=>assert(!/PAYROLL_PRIVATE|EXPENSE_PRIVATE|PAYMENT_PRIVATE|87654321|76543210|65432109|54321098|12345678|12345000|payroll:private-run|expense:private-expense/.test(JSON.stringify(value)),label));
for(const mode of['enforced','preparation']){
 globalThis.__financialActivityRuntime.env.ADMIN_PERMISSIONS_MODE=mode;
 grant(['audit.view']);const ordinary=expect(await get(),200,mode+' audit-only activity');check(()=>assert.equal(ordinary.activity.length,30,'financial exclusions run before latest-30 limit'));check(()=>assert(ordinary.activity.every(e=>e.action==='edit'&&e.groupId===gid)));assertPrivateAbsent(ordinary,mode+' audit-only never receives money metadata');
 grant(['audit.view','invoices.view','payments.view','finance.view']);assertPrivateAbsent(expect(await get(),200,mode+' general finance viewer'),mode+' financial reports do not imply payroll or expenses');
 grant(['audit.view','payroll.view']);const salary=expect(await get(),200,mode+' authorized salary audit');check(()=>assert.equal(salary.activity.length,30));check(()=>assert(salary.activity.every(e=>e.action.startsWith('payroll.')&&e.groupId===gid)));check(()=>assert(JSON.stringify(salary).includes('PAYROLL_PRIVATE_AFTER_'+gid)));check(()=>assert(!JSON.stringify(salary).includes('EXPENSE_PRIVATE')));
 grant(['audit.view','expenses.view']);const expenses=expect(await get(),200,mode+' authorized expense audit');check(()=>assert(expenses.activity.every(e=>e.action.startsWith('finance.')&&e.groupId===gid)));check(()=>assert(JSON.stringify(expenses).includes('EXPENSE_PRIVATE_BEFORE_'+gid)));check(()=>assert(!JSON.stringify(expenses).includes('PAYROLL_PRIVATE')));
 grant(['audit.view','payroll.pay']);const incomplete=expect(await get(),mode==='enforced'?403:200,mode+' incomplete financial profile');assertPrivateAbsent(incomplete,mode+' incomplete dependency profile cannot expose finances');
 grant(['audit.view']);sqlite.prepare('UPDATE admin_permission_profiles SET draft_grants_json=? WHERE group_id=? AND account_id=?').run(JSON.stringify(['audit.view','payroll.view','expenses.view']),gid,admin.id);assertPrivateAbsent(expect(await get(),200,mode+' draft financial profile'),mode+' unapplied financial grants remain private');
 for(const who of[owner,chief]){const privileged=expect(await get(who),200,mode+' privileged audit');check(()=>assert(privileged.activity.every(e=>e.groupId===gid)));check(()=>assert(JSON.stringify(privileged).includes('EXPENSE_PRIVATE_AFTER_'+gid)));}
 grant(['audit.view','payroll.view','expenses.view'],outsider);const other=expect(await get(outsider),200,mode+' foreign own audit');check(()=>assert(other.activity.every(e=>e.groupId===foreign)));check(()=>assert(!JSON.stringify(other).includes('PRIVATE_AFTER_'+gid)));
 for(const who of[teacher,student]){assertPrivateAbsent(expect(await get(who),403,mode+' non-admin activity denied'),mode+' denied role contains no private payload');assertPrivateAbsent(expect(await get(who,'core'),200,mode+' role core safe'),mode+' role core contains no money metadata');}
 grant(['audit.view']);assertPrivateAbsent(expect(await get(admin,''),200,mode+' compatible full state'),mode+' full state response contains no money metadata');
}
// Invoice-only viewers keep normal generation/issue history, while money
// movements and attendance corrections with financial amounts need payments.view.
for(const action of['invoice.save','invoice.issue'])sqlite.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) VALUES(?,?,?,?,?,?,?)').run(gid,action,'ordinary-invoice',owner.id,action,JSON.stringify({status:action.endsWith('issue')?'issued':'draft'}),'2035-01-01T00:00:00.000Z');
for(let i=0;i<40;i++)sqlite.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) VALUES(?,?,?,?,?,?,?)').run(gid,'private-payment-'+i,'invoice:private-payment',owner.id,'invoice.finance.recordPayment',JSON.stringify({reason:'PAYMENT_PRIVATE_REASON',amountCents:12345678}),'2036-01-01T00:'+String(i).padStart(2,'0')+':00.000Z');
sqlite.prepare('INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) VALUES(?,?,?,?,?,?,?)').run(gid,'private-finance-correction','invoice:private-correction',owner.id,'invoice.correctAttendance',JSON.stringify({reason:'PAYMENT_PRIVATE_CORRECTION',financialAmountCents:12345000}),'2037-01-01T00:00:00.000Z');
for(const mode of['enforced','preparation']){
 globalThis.__financialActivityRuntime.env.ADMIN_PERMISSIONS_MODE=mode;
 grant(['audit.view','invoices.view']);const invoiceOnly=expect(await get(),200,mode+' invoice-only audit');assertPrivateAbsent(invoiceOnly,mode+' invoice view cannot expose payment or financial correction reasons');check(()=>assert(invoiceOnly.activity.some(e=>e.action==='invoice.save')&&invoiceOnly.activity.some(e=>e.action==='invoice.issue'),'normal invoice generation and issue audit remain visible'));
 grant(['audit.view','invoices.view','payments.view']);const paid=expect(await get(),200,mode+' authorized payment audit');check(()=>assert(paid.activity.some(e=>e.action==='invoice.correctAttendance'&&e.after.includes('PAYMENT_PRIVATE_CORRECTION'))));check(()=>assert(paid.activity.some(e=>e.action.startsWith('invoice.finance.')&&e.after.includes('PAYMENT_PRIVATE_REASON'))));check(()=>assert(!JSON.stringify(paid).includes('PAYROLL_PRIVATE')&&!JSON.stringify(paid).includes('EXPENSE_PRIVATE')));
}
globalThis.__financialActivityRuntime.env.ADMIN_PERMISSIONS_MODE='enforced';grant(['audit.view','payroll.view','expenses.view']);beforeAuditRead=()=>grant(['audit.view']);assertPrivateAbsent(expect(await get(),403,'live financial revocation invalidates state response'),'revoked grant response includes no money');
for(const who of[admin,teacher,student,owner]){actor=who;const r=await backup.GET(new Request('https://activity.example.test/api/backup-export')),body=await r.text();check(()=>assert.equal(r.status,404,'interactive identity cannot read token-protected backup'));check(()=>assert.equal(body,''));}
check(()=>assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(),[]));check(()=>assert.equal(sqlite.prepare('PRAGMA integrity_check').get().integrity_check,'ok'));
console.log(JSON.stringify({suite:'financial-activity-privacy',checks,productionWrites:false}));
