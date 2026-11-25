import type {Account} from './auth';
import {learningDb} from './learning-server';
import {adminActorGuard,adminAuthority} from './admin-authority';
import {classPlanSubjectSql,planSubjectLabelSql} from './academic-subject-match';
import {appendAudit} from './audit-log';

export class UnusedPlanBillingError extends Error {
  constructor(message:string,public status=409){super(message);}
}
type Write=(sql:string,...params:unknown[])=>D1PreparedStatement;
type Row=Record<string,unknown>;
const financialMessage='此记录已有收费或费用调整历史，不能永久删除。请改为停用，以保留核算依据。';
const subjectKey=(plan:string,student:string)=>`CASE WHEN ${plan}.subject_id IS NOT NULL THEN 'id:'||${student}.syllabus_id||':'||${plan}.subject_id ELSE 'label:'||lower(trim(${plan}.subject)) END`;

/** Only an unused, exclusively owned configuration may leave the historical
 * rate guard. No invoice, cash ledger, policy, operation or audit is deleted.
 * All reads are repeated inside the eventual deletion transaction. */
export async function unusedPlanBillingCleanup(actor:Account,planKey:string,write:Write){
  const groupId=actor.groupId!,db=learningDb(),guards:D1PreparedStatement[]=[],watches:Array<{name:string;value:string}>=[];
  async function watch(name:string,sql:string,fields:string[],args:unknown[]){
    const query=`SELECT coalesce(json_group_array(json_object(${fields.map(field=>`'${field}',source.${field}`).join(',')})),'[]') AS value FROM (${sql}) source`;
    const value=(await db.prepare(query).bind(...args).first<{value:string}>())?.value||'[]';
    watches.push({name:'unused-plan-billing:'+planKey+':'+name,value});
    guards.push(db.prepare(`SELECT CASE WHEN (${query})=? THEN 1 ELSE json_extract('[]','$[unused_plan_billing_changed') END`).bind(...args,value));
    return JSON.parse(value) as Row[];
  }
  const context=await watch('identity',`SELECT p.key,p.student,p.subject,p.subject_id,p.active,p.created_at AS plan_created_at,s.syllabus_id,s.created_at AS student_created_at,b.id AS student_id,bs.id AS subject_id_row,bs.subject_key,bs.subject AS billing_subject,bs.subject_id AS billing_subject_id,bs.syllabus_id AS billing_syllabus_id,bs.created_at AS subject_created_at
    FROM plans p JOIN students s ON s.group_id=p.group_id AND s.name=p.student
    JOIN billing_students b ON b.group_id=p.group_id AND b.student_name=p.student
    JOIN billing_subjects bs ON bs.group_id=b.group_id AND bs.student_id=b.id AND bs.subject_key=${subjectKey('p','s')}
    WHERE p.group_id=? AND p.key=?`,['key','student','subject','subject_id','active','plan_created_at','syllabus_id','student_created_at','student_id','subject_id_row','subject_key','billing_subject','billing_subject_id','billing_syllabus_id','subject_created_at'],[groupId,planKey]);
  if(context.length!==1)return null;
  const current=context[0],studentId=String(current.student_id),key=String(current.subject_key),subjectId=String(current.subject_id_row);
  const rates=await watch('rates','SELECT id,group_id,student_id,subject_key,revision,current_version_id,updated_at FROM billing_rates WHERE group_id=? AND student_id=? AND subject_key=? ORDER BY id',['id','group_id','student_id','subject_key','revision','current_version_id','updated_at'],[groupId,studentId,key]);
  const collection=await watch('collection','SELECT group_id,student_id,subject_key,timing,revision,updated_by,updated_at FROM prepayment_collection_settings WHERE group_id=? AND student_id=? AND subject_key=?',['group_id','student_id','subject_key','timing','revision','updated_by','updated_at'],[groupId,studentId,key]);
  if(!rates.length&&!collection.length)return null;

  // Deleting rate configuration requires the same owner/chief boundary as
  // editing it, in addition to the route's plans.delete permission.
  const authority=await adminAuthority(actor);
  if(!authority.canManageAdministrators||!await db.prepare('SELECT 1 FROM tuition_groups WHERE id=? AND active=1').bind(groupId).first())throw new UnusedPlanBillingError('收费设置仅对平台最高管理员及本集团最高管理员开放。',403);
  guards.push(adminActorGuard(actor,true));
  guards.push(db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM tuition_groups WHERE id=? AND active=1) THEN 1 ELSE json_extract('[]','$[unused_plan_billing_changed') END").bind(groupId));

  const shared=await watch('shared-plans',`SELECT p.key FROM plans p JOIN students s ON s.group_id=p.group_id AND s.name=p.student WHERE p.group_id=? AND p.student=? AND ${subjectKey('p','s')}=? ORDER BY p.key`,['key'],[groupId,current.student,key]);
  if(shared.length!==1||shared[0].key!==planKey)throw new UnusedPlanBillingError('此收费配置仍由其他课程设置共用，不能永久删除。请改为停用。');
  const lessons=await watch('lessons',`SELECT l.id FROM lessons l JOIN plans p ON p.group_id=l.group_id AND p.student=l.student JOIN students s ON s.group_id=p.group_id AND s.name=p.student WHERE p.group_id=? AND p.key=? AND ${planSubjectLabelSql('p','s','l.subject')} ORDER BY l.id LIMIT 1`,['id'],[groupId,planKey]);
  if(lessons.length)throw new UnusedPlanBillingError('此收费配置已有课程记录，不能永久删除。请改为停用。');
  const rooms=await watch('classrooms',`SELECT c.id FROM classroom_members m JOIN classrooms c ON c.group_id=m.group_id AND c.id=m.classroom_id JOIN plans p ON p.group_id=m.group_id AND p.student=m.student_name JOIN students s ON s.group_id=p.group_id AND s.name=p.student WHERE p.group_id=? AND p.key=? AND ${classPlanSubjectSql()} ORDER BY c.id LIMIT 1`,['id'],[groupId,planKey]);
  if(rooms.length)throw new UnusedPlanBillingError('此科目仍用于班级，请先移出班级');
  const sessions=await watch('sessions',`SELECT cs.id FROM class_sessions cs JOIN class_session_participants cp ON cp.group_id=cs.group_id AND cp.session_id=cs.id JOIN plans p ON p.group_id=cp.group_id AND p.student=cp.student_name JOIN students s ON s.group_id=p.group_id AND s.name=p.student WHERE p.group_id=? AND p.key=? AND ${planSubjectLabelSql('p','s','cs.subject')} ORDER BY cs.id LIMIT 1`,['id'],[groupId,planKey]);
  if(sessions.length)throw new UnusedPlanBillingError('此收费配置已有课程记录，不能永久删除。请改为停用。');

  // Invoices/advance balances can span subjects. Fail closed for any such
  // student history, including drafts, voided documents, refunds and reversals.
  // Their FK children include every payment, receipt and ledger event.
  for(const table of ['invoices','invoice_finance_accounts','invoice_payments','invoice_source_locks','prepayment_accounts','prepayment_requests','prepayment_payments','prepayment_allocations','prepayment_events','billing_adjustments']){
    const history=await watch(table,`SELECT 1 AS found FROM ${table} WHERE group_id=? AND student_id=? LIMIT 1`,['found'],[groupId,studentId]);
    if(history.length)throw new UnusedPlanBillingError(financialMessage);
  }
  const rateIds=JSON.stringify(rates.map(rate=>rate.id));
  const versions=await watch('versions','SELECT id,group_id,rate_id,revision,mode,amount_cents,currency,effective_from,subject_snapshot,actor_id,created_at FROM billing_rate_versions WHERE group_id=? AND rate_id IN(SELECT value FROM json_each(?)) ORDER BY rate_id,revision',['id','group_id','rate_id','revision','mode','amount_cents','currency','effective_from','subject_snapshot','actor_id','created_at'],[groupId,rateIds]);
  if(versions.length>200)throw new UnusedPlanBillingError(financialMessage);
  // Billing preview includes the current month's future-effective monthly
  // segments. No-attendance is therefore not proof that month pricing is unused.
  const monthly=await watch('monthly-accrual',"SELECT 1 AS found FROM billing_rate_versions WHERE group_id=? AND rate_id IN(SELECT value FROM json_each(?)) AND mode='month' AND effective_from<date('now','+8 hours','start of month','+1 month') LIMIT 1",['found'],[groupId,rateIds]);
  if(monthly.length)throw new UnusedPlanBillingError('此收费配置已进入月费计算范围，不能永久删除。请改为停用。');

  // Keep existing DB history triggers unchanged. Once the independently proven
  // unused configuration is removed, the normal plan DELETE satisfies them.
  const statements=[
    write('DELETE FROM billing_rate_versions WHERE group_id=? AND rate_id IN(SELECT value FROM json_each(?))',groupId,rateIds),
    write('DELETE FROM billing_rates WHERE group_id=? AND student_id=? AND subject_key=?',groupId,studentId,key),
    write('DELETE FROM prepayment_collection_settings WHERE group_id=? AND student_id=? AND subject_key=?',groupId,studentId,key),
    write('DELETE FROM billing_subjects WHERE group_id=? AND id=? AND student_id=? AND subject_key=?',groupId,subjectId,studentId,key),
    appendAudit(db,{groupId,actorId:actor.id,actorName:actor.name,lessonId:'plan:'+planKey,objectName:String(current.student)+' · '+String(current.subject),action:'billing.deleteUnusedPlanConfiguration',before:{planKey,studentId,subjectKey:key,subject:current,rates,versions,collection},after:{unusedConfigurationRemoved:true,rateVersions:versions.length,financialHistoryRemoved:false}}),
  ];
  return {statements,guards,watches};
}
