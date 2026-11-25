import type {Account} from './auth';
import {malaysiaDate} from './billing';
import {PrepaymentError,type PrepaymentPreview} from './prepayments';
import {cents,digest,prepaymentRead,prepaymentStudent,prepaymentInstitution} from './prepayment-access';
import {prepaymentAccountState} from './prepayment-account';

// A date-free notice has no course estimate. Its month is an internal creation
// period only, never a promised service date or an invoice source lock.
export const prepaymentAmountBasisSql=`WITH f AS(SELECT ? AS gid,? AS sid),b AS(SELECT bs.* FROM billing_students bs,f WHERE bs.group_id=f.gid AND bs.id=f.sid)
 SELECT json_object(
 'student',(SELECT json_object('active',s.active,'syllabus',s.syllabus_id,'grade',s.grade,'name',s.name) FROM students s,b,f WHERE s.group_id=f.gid AND s.name=b.student_name),
 'plans',(SELECT json_group_array(json(j)) FROM(SELECT json_object('key',p.key,'active',p.active,'teacherActive',coalesce(t.active,0),'subjectKey',CASE WHEN p.subject_id IS NOT NULL THEN 'id:'||s.syllabus_id||':'||p.subject_id ELSE 'label:'||lower(trim(p.subject)) END) AS j FROM plans p JOIN students s ON s.group_id=p.group_id AND s.name=p.student LEFT JOIN teachers t ON t.group_id=p.group_id AND t.name=p.teacher_name,b,f WHERE p.group_id=f.gid AND p.student=b.student_name ORDER BY p.key)),
 'rates',(SELECT json_group_array(json(j)) FROM(SELECT json_object('key',r.subject_key,'mode',v.mode,'includedSessions',v.included_sessions,'date',v.effective_from,'revision',v.revision,'id',v.id) AS j FROM billing_rates r JOIN billing_rate_versions v ON v.group_id=r.group_id AND v.rate_id=r.id,b,f WHERE r.group_id=f.gid AND r.student_id=b.id ORDER BY v.effective_from DESC,v.revision DESC,v.id)),
 'brand',(SELECT coalesce(s.settings_json,g.name) FROM tuition_groups g LEFT JOIN invoice_brand_settings s ON s.group_id=g.id,f WHERE g.id=f.gid))`;
export async function amountRequestSource(actor:Account,studentId:string,key='prepayments.view'){
 const args=[actor.groupId,studentId],row=(await prepaymentRead<{basis:string}>(actor,key,`SELECT (${prepaymentAmountBasisSql}) AS basis`,...args))[0];
 if(!row)throw new PrepaymentError('预收资料已改变，请刷新重试',409);
 return{basis:row.basis,args};
}
export function advanceModes(basis:string,now=new Date().toISOString()){
 const data=JSON.parse(basis) as {student:{active:number}|null;plans:{active:number;teacherActive:number;subjectKey:string|null}[];rates:{key:string;mode:string;date:string}[]};
 const today=malaysiaDate(now),modes=data.student?.active===1?data.plans.filter(p=>p.active===1&&p.teacherActive===1).map(p=>data.rates.find(r=>r.key===p.subjectKey&&r.date<=today)?.mode):[];
 return{advanceEligible:modes.includes('hour'),hasMonthly:modes.includes('month')};
}
export async function amountPrepayment(actor:Account,studentId:string,amount:unknown,key='prepayments.view',createdAt?:string):Promise<PrepaymentPreview&{basis:string;basisArgs:unknown[];accountGuard?:{basis:string;basisArgs:unknown[];nextBoundary:string|null}}>{
 const totalCents=cents(amount),source=await amountRequestSource(actor,studentId,key),now=new Date().toISOString();
 let accountGuard:Awaited<ReturnType<typeof prepaymentAccountState>>|undefined;
 if(!advanceModes(source.basis,now).advanceEligible){accountGuard=await prepaymentAccountState(actor,studentId,key);if(!accountGuard.summary.advanceEligible)throw new PrepaymentError('此学生没有当前有效的小时收费配对或历史小时欠费；月费请通过正式账单直接收款',409);}
 const student=await prepaymentStudent(actor,studentId,key),institution=await prepaymentInstitution(actor,key),sourceHash=await digest({requestKind:'amount',basis:source.basis,totalCents});
 return{basis:source.basis,basisArgs:source.args,...(accountGuard?{accountGuard}:{}),blockers:[],document:{id:'',groupId:actor.groupId!,studentId,student,requestKind:'amount',month:malaysiaDate(createdAt||now).slice(0,7),subjectKey:null,status:'draft',revision:0,number:null,issuedAt:null,createdAt:createdAt||now,updatedAt:now,dueDate:'',notes:'',currency:'MYR',institution,sourceHash,lessons:[],lines:[{subjectKey:'',subject:'学生预收款',mode:'amount',unitAmountCents:totalCents,amountCents:totalCents,lessonCount:0,durationSeconds:0}],totalCents,lessonCount:0,monthlyReviewed:false,warnings:[],printUrl:''}};
}
