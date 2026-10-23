import type {Account} from './auth';
import {billingMonth,malaysiaDate,rateOnDate,policyOnDate,billHourlyCents,type BillingRate,type BillingPolicy} from './billing';
import {PrepaymentError,type PrepaymentPreview,type PrepaymentLesson,type PrepaymentRequestLine} from './prepayments';
import {prepaymentRead,prepaymentStudent,prepaymentInstitution,digest,limited} from './prepayment-access';
export const prepaymentBasisSql=`WITH f AS(SELECT ? AS gid,? AS sid,? AS lo,? AS hi),b AS(SELECT s.* FROM billing_students s,f WHERE s.group_id=f.gid AND s.id=f.sid)
 SELECT json_object(
 'student',(SELECT json_object('id',s.name,'active',s.active,'syllabus',s.syllabus_id,'grade',s.grade) FROM students s,b,f WHERE s.group_id=f.gid AND s.name=b.student_name),
 'lessons',(SELECT json_group_array(json(j)) FROM(SELECT json_object('lessonId',l.id,'subject',l.subject,'subjectId',c.subject_id,'teacherName',l.teacher_name,'plannedStart',l.planned_start,'plannedEnd',l.planned_end,'status',l.status,'sessionStatus',cs.status) AS j FROM lessons l LEFT JOIN class_sessions cs ON cs.group_id=l.group_id AND cs.id=l.session_id LEFT JOIN classrooms c ON c.group_id=cs.group_id AND c.id=cs.classroom_id,b,f WHERE l.group_id=f.gid AND l.student=b.student_name AND l.planned_start>=f.lo AND l.planned_start<f.hi ORDER BY l.planned_start,l.id)),
 'subjects',(SELECT json_group_array(json(j)) FROM(SELECT json_object('subjectKey',s.subject_key,'subject',s.subject,'subjectId',s.subject_id,'createdAt',s.created_at) AS j FROM billing_subjects s,b,f WHERE s.group_id=f.gid AND s.student_id=b.id ORDER BY s.subject_key)),
 'rates',(SELECT json_group_array(json(j)) FROM(SELECT json_object('id',v.id,'rateId',v.rate_id,'revision',v.revision,'mode',v.mode,'amountCents',v.amount_cents,'currency',v.currency,'effectiveFrom',v.effective_from,'createdAt',v.created_at,'subject',v.subject_snapshot,'subjectKey',r.subject_key) AS j FROM billing_rate_versions v JOIN billing_rates r ON r.group_id=v.group_id AND r.id=v.rate_id,b,f WHERE r.group_id=f.gid AND r.student_id=b.id ORDER BY r.subject_key,v.effective_from,v.revision)),
 'policies',(SELECT json_group_array(json(j)) FROM(SELECT json_object('id',v.id,'revision',v.revision,'currency',v.currency,'hourRounding',v.hour_rounding,'attendanceBasis',v.attendance_basis,'monthlyPartial',v.monthly_partial,'effectiveFrom',v.effective_from,'createdAt',v.created_at) AS j FROM billing_policy_versions v,f WHERE v.group_id=f.gid ORDER BY v.effective_from,v.revision)),
 'brand',(SELECT coalesce(s.settings_json,g.name) FROM tuition_groups g LEFT JOIN invoice_brand_settings s ON s.group_id=g.id,f WHERE g.id=f.gid))`;
export function prepaymentBounds(month:string){billingMonth(month);const [y,m]=month.split('-').map(Number);return{start:new Date(month+'-01T00:00:00+08:00').toISOString(),end:new Date(Date.UTC(y,m,1)-8*3600000).toISOString()};}
export async function requestSource(actor:Account,studentId:string,month:string,key:string){const bounds=prepaymentBounds(month),args=[actor.groupId,studentId,bounds.start,bounds.end];const row=(await prepaymentRead<{basis:string}>(actor,key,`SELECT (${prepaymentBasisSql}) AS basis`,...args))[0];if(!row)throw new PrepaymentError('课次资料已改变',409);return{basis:row.basis,args};}
export async function estimatePrepayment(actor:Account,studentId:string,monthValue:string,subjectKeyValue='',monthlyReviewed=false,key='prepayments.view'):Promise<PrepaymentPreview&{basis:string;basisArgs:unknown[]}>{
 let month:string;try{month=billingMonth(monthValue);}catch{throw new PrepaymentError('请选择有效月份');}
 const subjectKey=limited(subjectKeyValue,240,'科目'),source=await requestSource(actor,studentId,month,key),student=await prepaymentStudent(actor,studentId,key),institution=await prepaymentInstitution(actor,key),basis=JSON.parse(source.basis);
 type Subject={subjectKey:string;subject:string;subjectId:string|null;createdAt:string};
 type SourceLesson={lessonId:string;subject:string;subjectId:string|null;teacherName:string;plannedStart:string;plannedEnd:string;status:string;sessionStatus:string|null};
 const subjects=basis.subjects as Subject[],rates=basis.rates as (BillingRate&{subjectKey:string})[],policies=basis.policies as BillingPolicy[],lessons:PrepaymentLesson[]=[],lines:PrepaymentRequestLine[]=[],blockers:string[]=[],warnings:string[]=[];
 if(subjectKey&&!subjects.some(s=>s.subjectKey===subjectKey))throw new PrepaymentError('学生科目不存在或已改变',404);
 for(const lesson of basis.lessons as SourceLesson[]){
  if(lesson.status==='cancelled'||lesson.sessionStatus==='cancelled')continue;
  const matches=subjects.filter(s=>(lesson.subjectId?s.subjectId===lesson.subjectId:s.subject.trim().toLowerCase()===lesson.subject.trim().toLowerCase())&&s.createdAt<=lesson.plannedStart).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),subject=matches[0];
  if(subjectKey&&subject?.subjectKey!==subjectKey)continue;
  const date=malaysiaDate(lesson.plannedStart),rate=subject?rateOnDate(rates.filter(r=>r.subjectKey===subject.subjectKey),date):null,policy=policyOnDate(policies,date),seconds=(Date.parse(lesson.plannedEnd)-Date.parse(lesson.plannedStart))/1000,lineWarnings:string[]=[];
  if(!subject||matches[1]?.createdAt===subject.createdAt)lineWarnings.push('missing_subject');
  if(!rate)lineWarnings.push('missing_rate');if(!policy)lineWarnings.push('missing_policy');if(!Number.isSafeInteger(seconds)||seconds<=0||seconds>86400)lineWarnings.push('invalid_planned_duration');
  let amountCents=0;if(rate&&!lineWarnings.length){if(rate.mode==='lesson')amountCents=rate.amountCents;else if(rate.mode==='hour')amountCents=billHourlyCents(rate.amountCents,seconds,policy!.hourRounding).amountCents;}
  blockers.push(...lineWarnings);
  lessons.push({lessonId:lesson.lessonId,subjectKey:subject?.subjectKey||'',subject:lesson.subject,teacherName:lesson.teacherName,plannedStart:lesson.plannedStart,plannedEnd:lesson.plannedEnd,status:lesson.status,rateVersionId:rate?.id||null,policyVersionId:policy?.id||null,mode:rate?.mode||null,unitAmountCents:rate?.amountCents??null,durationSeconds:Number.isSafeInteger(seconds)&&seconds>0?seconds:0,amountCents,warnings:lineWarnings});
 }
 if(!lessons.length)blockers.push('no_planned_lessons');
 for(const lesson of lessons){
  if(!lesson.mode||lesson.unitAmountCents===null)continue;
  const key=lesson.mode==='month'?lesson.subjectKey:JSON.stringify([lesson.subjectKey,lesson.mode,lesson.rateVersionId]);
  let line=lines.find(v=>(v.mode==='month'?v.subjectKey:JSON.stringify([v.subjectKey,v.mode,(v as PrepaymentRequestLine&{rateVersionId?:string}).rateVersionId]))===key);
  if(!line){line={subjectKey:lesson.subjectKey,subject:lesson.subject,mode:lesson.mode,unitAmountCents:lesson.unitAmountCents,amountCents:lesson.mode==='month'?lesson.unitAmountCents:0,lessonCount:0,durationSeconds:0};Object.assign(line,{rateVersionId:lesson.rateVersionId});lines.push(line);}
  line.lessonCount++;line.durationSeconds+=lesson.durationSeconds;if(lesson.mode!=='month')line.amountCents+=lesson.amountCents;
  if(lesson.mode==='month'&&line.unitAmountCents!==lesson.unitAmountCents)warnings.push('monthly_rate_change_review');
 }
 for(const subjectKey of new Set(lessons.filter(l=>l.mode==='month').map(l=>l.subjectKey))){const subjectLessons=lessons.filter(l=>l.subjectKey===subjectKey);if(new Set(subjectLessons.map(l=>l.rateVersionId)).size>1||new Set(subjectLessons.map(l=>l.mode)).size>1)blockers.push('monthly_rate_change_review');}if(lines.some(l=>l.mode==='month')){warnings.push('fixed_monthly_manual_review');if(!monthlyReviewed)blockers.push('monthly_manual_review');}
 const totalCents=lines.reduce((sum,l)=>sum+l.amountCents,0);if(!Number.isSafeInteger(totalCents)||totalCents<0||totalCents>100000000)throw new PrepaymentError('预计预收金额超过上限');
 const after=await requestSource(actor,studentId,month,key);if(after.basis!==source.basis)throw new PrepaymentError('排课、学生或收费资料已改变，请重新预览',409);const now=new Date().toISOString(),sourceHash=await digest({basis:source.basis,subjectKey,monthlyReviewed});
 return{document:{id:'',groupId:actor.groupId!,studentId,student,month,subjectKey:subjectKey||null,status:'draft',revision:0,number:null,issuedAt:null,createdAt:now,updatedAt:now,dueDate:month+'-01',notes:'',currency:'MYR',institution,sourceHash,lessons,lines,totalCents,lessonCount:lessons.length,monthlyReviewed,warnings:[...new Set(warnings)],printUrl:''},blockers:[...new Set(blockers)],basis:source.basis,basisArgs:source.args};
}
