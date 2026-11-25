import {createHash} from 'node:crypto';
export const PARENT_TABLES=['parent_operations','parent_child_links','parent_link_events'];
// Cached grants can be revoked, have multiple revisions, or belong to a now
// disabled parent/student. Restore exact history instead of generating grants.
export const PARENT_REPLAY_TRIGGERS=['parent_link_identity_insert','parent_link_insert_history'];
export function checkRestoredParents(db){
 const count=PARENT_TABLES.filter(name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)).length;
 if(!count)return;
 const fail=()=>{throw Error('Restored parent grant, immutable history or idempotent operation is invalid');};
 if(count!==PARENT_TABLES.length)fail();
 const key=(...parts)=>JSON.stringify(parts),rows=name=>db.prepare('SELECT * FROM '+name).all();
 const text=(v,max=200,min=1)=>typeof v==='string'&&v.length>=min&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
 const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 const parse=v=>{try{return JSON.parse(v);}catch{fail();}};
 const groups=new Set(db.prepare('SELECT id FROM tuition_groups').all().map(g=>g.id));
 const parents=new Map(db.prepare('SELECT id,group_id,role FROM accounts').all().map(a=>[a.id,a]));
 const students=new Map(db.prepare('SELECT id,group_id FROM billing_students').all().map(s=>[key(s.group_id,s.id),s]));
 const operations=new Map(),results=new Map(),history=new Map(),usedOperations=new Set();
 for(const op of rows('parent_operations')){
  const identity=key(op.group_id,op.operation_id),result=parse(op.result_json);
  if(!groups.has(op.group_id)||!text(op.actor_id)||!text(op.operation_id,100,16)||!/^[a-zA-Z0-9_-]+$/.test(op.operation_id)||!text(op.execution_id,100,16)||!/^[a-f0-9]{64}$/.test(op.request_hash)||!stamp(op.created_at)||!result||result.ok!==true||!result.link||Array.isArray(result.link))fail();
  operations.set(identity,op);results.set(identity,result.link);
 }
 for(const e of rows('parent_link_events')){
  const identity=key(e.group_id,e.operation_id),op=operations.get(identity),result=results.get(identity),linkKey=key(e.group_id,e.link_id),events=history.get(linkKey)||[];
  if(!groups.has(e.group_id)||!text(e.id)||!text(e.link_id)||!text(e.parent_account_id)||!text(e.student_id)||!text(e.student_name,80)||!text(e.parent_name,200)||!text(e.actor_id)||!(typeof e.reason==='string'&&e.reason.length>=2&&e.reason.length<=500)||e.reason.trim()!==e.reason||!['grant','revoke'].includes(e.action)||!Number.isSafeInteger(e.revision)||e.revision<1||!stamp(e.created_at)||!op||usedOperations.has(identity)||op.actor_id!==e.actor_id||op.created_at!==e.created_at||result.id!==e.link_id||result.studentId!==e.student_id||result.student!==e.student_name||result.revision!==e.revision||result.active!==(e.action==='grant')||result.updatedAt!==e.created_at)fail();
  const hash=createHash('sha256').update(JSON.stringify({action:e.action,parentId:e.parent_account_id,studentId:e.student_id,revision:e.revision-1,reason:e.reason,verified:e.action==='grant'})).digest('hex');
  if(hash!==op.request_hash)fail();
  usedOperations.add(identity);events.push(e);history.set(linkKey,events);
 }
 if(usedOperations.size!==operations.size)fail();
 const current=new Map(rows('parent_child_links').map(l=>[key(l.group_id,l.id),l]));
 for(const [identity,events]of history){
  events.sort((a,b)=>a.revision-b.revision);
  for(const [index,e]of events.entries())if(e.revision!==index+1||e.action!==(index%2?'revoke':'grant')||e.parent_account_id!==events[0].parent_account_id||e.student_id!==events[0].student_id||index&&e.created_at<events[index-1].created_at)fail();
  const last=events.at(-1),link=current.get(identity),parent=parents.get(last.parent_account_id),student=students.get(key(last.group_id,last.student_id));
  if(!link){
   // Cascading deletion of either identity intentionally preserves its ledger.
   if(parent&&student)fail();
   continue;
  }
  if(!parent||parent.group_id!==link.group_id||!student||parent.id!==link.parent_account_id||link.student_id!==last.student_id||!Number.isSafeInteger(link.revision)||link.revision!==last.revision||link.active!==(last.action==='grant'?1:0)||link.updated_by!==last.actor_id||link.updated_at!==last.created_at||link.operation_id!==last.operation_id||link.reason!==last.reason||link.active===1&&parent.role!=='parent')fail();
  current.delete(identity);
 }
 if(current.size||db.prepare('PRAGMA foreign_key_check').all().length)fail();
}
