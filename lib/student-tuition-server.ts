import type {Account} from './auth';
import {BillingError,billingMonth} from './billing';
import {requireBillingViewer,requireBillingManager} from './billing-server';
import {estimatePrepayment} from './prepayment-estimate';
import {PrepaymentError} from './prepayments';
import {prepaymentRead,prepaymentStudent,withFeeForecastReader} from './prepayment-access';
import {scheduledTuition} from './student-tuition';

export async function studentScheduledTuition(actor:Account,studentId:string,month:string){
 await requireBillingViewer(actor);billingMonth(month);
 if(!studentId||studentId.length>100)throw new BillingError('请选择有效的学生');
 try{const estimate=await withFeeForecastReader(actor,scoped=>estimatePrepayment(scoped,studentId,month,'',false,'fees.view'));await requireBillingViewer(actor);return scheduledTuition(estimate);}
 catch(error){await requireBillingViewer(actor);if(error instanceof PrepaymentError)throw new BillingError(error.message,error.status);throw error;}
}
/** The same manager check as the existing rate editor; never grants rates to a fee viewer. */
export async function studentRateOptions(actor:Account,studentId:string){
 const gid=await requireBillingManager(actor);if(!studentId||studentId.length>100)throw new BillingError('请选择有效的学生');
 try{await prepaymentStudent(actor,studentId,'fees.view');}catch(error){if(error instanceof PrepaymentError)throw new BillingError(error.message,error.status);throw error;}
 const items=await prepaymentRead<{planKey:string;subject:string;teacherName:string}>(actor,'fees.view',`SELECT p.key AS planKey,p.subject,p.teacher_name AS teacherName FROM plans p JOIN billing_students b ON b.group_id=p.group_id AND b.student_name=p.student JOIN students s ON s.group_id=p.group_id AND s.name=p.student WHERE p.group_id=? AND b.id=? AND p.active=1 AND s.active=1 ORDER BY p.subject,p.teacher_name,p.key`,gid,studentId);
 await requireBillingManager(actor);return{studentId,items};
}
