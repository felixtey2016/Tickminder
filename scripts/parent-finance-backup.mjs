import {createHash} from 'node:crypto';
export const PARENT_FINANCIAL_TABLES=['parent_financial_operations','parent_financial_access','parent_financial_events'];
// Expired grants and deleted identities are restored as history, without current
// activation rules or generated duplicate events.
export const PARENT_FINANCIAL_REPLAY_TRIGGERS=['parent_financial_identity_insert','parent_financial_insert_history'];
export function checkRestoredParentFinance(db){
 const count=PARENT_FINANCIAL_TABLES.filter(name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)).length;
 if(!count)return;
 const fail=()=>{throw Error('Restored parent financial authorization, binding epoch or immutable history is invalid');};
 if(count!==PARENT_FINANCIAL_TABLES.length||!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='parent_child_links'").get())fail();
 const key=(...parts)=>JSON.stringify(parts),rows=name=>db.prepare('SELECT * FROM '+name).all();
 const text=(v,max=200,min=1)=>typeof v==='string'&&v.length>=min&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
 const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
 const parse=v=>{try{return JSON.parse(v);}catch{fail();}},positive=v=>Number.isSafeInteger(v)&&v>0;
 const groups=new Set(db.prepare('SELECT id FROM tuition_groups').all().map(g=>g.id));
 const teachingLinks=new Map(rows('parent_child_links').map(l=>[key(l.group_id,l.id),l]));
 const teachingEvents=new Map(rows('parent_link_events').map(e=>[key(e.group_id,e.link_id,e.revision),e]));
 const operations=new Map(),results=new Map(),history=new Map(),usedOperations=new Set();
 for(const op of rows('parent_financial_operations')){
  const identity=key(op.group_id,op.operation_id),result=parse(op.result_json);
  if(!groups.has(op.group_id)||!text(op.actor_id)||!text(op.operation_id,100,16)||!/^[a-zA-Z0-9_-]+$/.test(op.operation_id)||!text(op.execution_id,100,16)||!/^[a-f0-9]{64}$/.test(op.request_hash)||!stamp(op.created_at)||!result||result.ok!==true||!result.access||Array.isArray(result.access))fail();
  operations.set(identity,op);results.set(identity,result.access);
 }
 for(const e of rows('parent_financial_events')){
  const identity=key(e.group_id,e.operation_id),op=operations.get(identity),result=results.get(identity),accessKey=key(e.group_id,e.access_id),events=history.get(accessKey)||[];
  const binding=teachingEvents.get(key(e.group_id,e.link_id,e.link_revision)),ended=teachingEvents.get(key(e.group_id,e.link_id,e.link_revision+1));
  if(!groups.has(e.group_id)||!text(e.id)||!text(e.access_id)||!text(e.link_id)||!text(e.parent_account_id)||!text(e.student_id)||!text(e.student_name,80)||!text(e.parent_name,200)||!text(e.actor_id)||!(typeof e.reason==='string'&&e.reason.length>=2&&e.reason.length<=500&&e.reason.trim()===e.reason)||!['grant','revoke'].includes(e.action)||!positive(e.revision)||!positive(e.link_revision)||!stamp(e.created_at)||!op||usedOperations.has(identity)||op.actor_id!==e.actor_id||op.created_at!==e.created_at||result.id!==e.access_id||result.linkId!==e.link_id||result.parentId!==e.parent_account_id||result.studentId!==e.student_id||result.revision!==e.revision||result.linkRevision!==e.link_revision||result.active!==(e.action==='grant')||result.updatedAt!==e.created_at)fail();
  if(!binding||binding.action!=='grant'||binding.parent_account_id!==e.parent_account_id||binding.student_id!==e.student_id||binding.created_at>e.created_at||e.action==='grant'&&ended&&ended.created_at<e.created_at)fail();
  const hash=createHash('sha256').update(JSON.stringify({action:e.action==='grant'?'financialGrant':'financialRevoke',parentId:e.parent_account_id,studentId:e.student_id,revision:e.revision-1,linkRevision:e.link_revision,reason:e.reason})).digest('hex');
  if(hash!==op.request_hash)fail();
  usedOperations.add(identity);events.push(e);history.set(accessKey,events);
 }
 if(usedOperations.size!==operations.size)fail();
 const current=new Map(rows('parent_financial_access').map(a=>[key(a.group_id,a.id),a]));
 for(const [identity,events]of history){
  events.sort((a,b)=>a.revision-b.revision);
  for(const [index,e]of events.entries()){
   const previous=events[index-1];
   if(e.revision!==index+1||e.link_id!==events[0].link_id||e.parent_account_id!==events[0].parent_account_id||e.student_id!==events[0].student_id||!previous&&e.action!=='grant'||previous&&(e.created_at<previous.created_at||e.link_revision<previous.link_revision||e.action==='revoke'&&(previous.action!=='grant'||e.link_revision!==previous.link_revision)||e.action==='grant'&&previous.action==='grant'&&e.link_revision<=previous.link_revision))fail();
  }
  const last=events.at(-1),access=current.get(identity),link=teachingLinks.get(key(last.group_id,last.link_id));
  if(!access){if(link)fail();continue;}
  if(!link||link.parent_account_id!==access.parent_account_id||link.student_id!==access.student_id||link.revision<access.link_revision||access.link_id!==last.link_id||access.parent_account_id!==last.parent_account_id||access.student_id!==last.student_id||access.revision!==last.revision||access.link_revision!==last.link_revision||access.active!==(last.action==='grant'?1:0)||access.updated_by!==last.actor_id||access.updated_at!==last.created_at||access.operation_id!==last.operation_id||access.reason!==last.reason)fail();
  current.delete(identity);
 }
 if(current.size||db.prepare('PRAGMA foreign_key_check').all().length)fail();
}
