import type {Account} from './auth';
import {learningDb} from './learning-server';
import {classroomAccess} from './parents-server';
import {parentLessonRange} from './parent-calendar';
import {captureParentScope,parentLinkedChildren,parentFinancialChildSql,parentCoursePage,parentNextCourse} from './parent-course-server';
import {parentPage,parentText,type ParentChild} from './parents';
import type {ParentHomeResponse} from './parent-home-types';

export async function parentHome(actor:Account,params:URLSearchParams):Promise<ParentHomeResponse>{
 const snapshot=await captureParentScope(actor),date=parentText(params.get('date'))||new Date(Date.now()+8*3600000).toISOString().slice(0,10),month=date.slice(0,7);
 const range=parentLessonRange(new URLSearchParams({month,date})),linked=parentLinkedChildren(actor),childrenPage=parentPage(params.get('childrenPage')),lessonsPage=parentPage(params.get('lessonsPage'));
 const children=(await learningDb().prepare(`WITH linked_children AS (${linked.sql}) SELECT studentId,student,grade,coalesce((SELECT json_extract(syllabus.value,'$.name') FROM academic_catalogues menu JOIN json_each(menu.content_json,'$.syllabuses') syllabus WHERE menu.scope='student' AND json_extract(syllabus.value,'$.id')=ch.syllabusId LIMIT 1),ch.syllabusId) AS syllabusName FROM linked_children ch ORDER BY student,studentId LIMIT 20 OFFSET ?`).bind(...linked.args,(childrenPage-1)*20).all<ParentChild>()).results||[];
 const today=await parentCoursePage(actor,new URLSearchParams({view:'lessons',studentId:'all',month,date,page:String(lessonsPage)}),"l.status<>'cancelled'");
 const nextLesson=today.total===0?await parentNextCourse(actor,range.end):null;
 // The count is based on current published recipients and real submissions,
 // independent of grading. Classroom access remains the child's own access.
 const homework=await learningDb().prepare(`WITH linked_children AS (${linked.sql}),pending_homework AS (SELECT ch.studentId,ch.student,ch.childPage,h.due_at AS dueAt,h.id FROM homework h JOIN homework_recipients r ON r.group_id=h.group_id AND r.homework_id=h.id JOIN linked_children ch ON ch.student=r.student_name WHERE h.group_id=? AND julianday(h.starts_at)<=julianday(?) AND ${classroomAccess('h','ch.student')} AND NOT EXISTS(SELECT 1 FROM homework_submissions sub WHERE sub.group_id=h.group_id AND sub.homework_id=h.id AND sub.student_name=ch.student)) SELECT count(*) AS total,(SELECT json_object('studentId',studentId,'childPage',childPage,'month',substr(datetime(dueAt,'+8 hours'),1,7)) FROM pending_homework ORDER BY julianday(dueAt),student,id LIMIT 1) AS target FROM pending_homework`).bind(...linked.args,actor.groupId,new Date().toISOString()).first<{total:number;target:string|null}>();
 // Mirror the issued-invoice ledger formula; unissued estimates and unauthorized
 // children's amounts never enter this query or its response.
 const financialChildren=(await learningDb().prepare(`WITH linked_children AS (${linked.sql}) SELECT count(*) AS total FROM linked_children ch WHERE ${parentFinancialChildSql}`).bind(...linked.args,actor.groupId,actor.id).first<{total:number}>())?.total||0;
 const finance=await learningDb().prepare(`WITH linked_children AS (${linked.sql}),authorized_children AS (SELECT ch.studentId FROM linked_children ch WHERE ${parentFinancialChildSql}),balances AS (
  SELECT max(0,i.total_cents+coalesce(f.charge_cents,0)-coalesce(f.credit_cents,0)-coalesce(f.received_cents,0)+coalesce(f.reversed_cents,0)+coalesce(f.refunded_cents,0)-coalesce(f.prepayment_cents,0)) AS remaining
  FROM invoices i JOIN authorized_children ch ON ch.studentId=i.student_id LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.status='issued' AND f.voided_at IS NULL
 ) SELECT count(*) AS unpaidInvoices,coalesce(sum(remaining),0) AS remainingCents FROM balances WHERE remaining>0`).bind(...linked.args,actor.groupId,actor.id,actor.groupId).first<{unpaidInvoices:number;remainingCents:number}>();
 const financeTarget=await learningDb().prepare(`WITH linked_children AS (${linked.sql}) SELECT ch.studentId,ch.childPage FROM linked_children ch WHERE ${parentFinancialChildSql} ORDER BY EXISTS(SELECT 1 FROM invoices i LEFT JOIN invoice_finance_accounts f ON f.group_id=i.group_id AND f.invoice_id=i.id WHERE i.group_id=? AND i.student_id=ch.studentId AND i.status='issued' AND f.voided_at IS NULL AND i.total_cents+coalesce(f.charge_cents,0)-coalesce(f.credit_cents,0)-coalesce(f.received_cents,0)+coalesce(f.reversed_cents,0)+coalesce(f.refunded_cents,0)-coalesce(f.prepayment_cents,0)>0) DESC,ch.student,ch.studentId LIMIT 1`).bind(...linked.args,actor.groupId,actor.id,actor.groupId).first<{studentId:string;childPage:number}>();
 await snapshot.recheck();
 return{date,children:{items:children,page:childrenPage,pages:Math.max(1,Math.ceil(snapshot.totalChildren/20)),total:snapshot.totalChildren,pageSize:20},today,nextLesson,financeTarget,homeworkTarget:homework?.target?JSON.parse(homework.target):null,summary:{pendingHomework:homework?.total||0,unpaidInvoices:finance?.unpaidInvoices||0,remainingCents:finance?.remainingCents||0,financialChildren,totalChildren:snapshot.totalChildren}};
}
