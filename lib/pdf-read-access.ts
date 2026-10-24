import type {Account} from './auth';
import {accountSessionPredicate} from './account-session';
import {OWNER_EMAIL} from './owner';

export function pdfReaderIdentity(actor:Account){
  const session=accountSessionPredicate(actor);
  return {sql:`EXISTS(SELECT 1 FROM accounts pdf_actor JOIN tuition_groups pdf_group ON pdf_group.id=? AND pdf_group.active=1
    WHERE pdf_actor.id=? AND pdf_actor.role=? AND pdf_actor.disabled_at IS NULL
    AND (pdf_actor.group_id=pdf_group.id OR pdf_actor.role='admin' AND lower(trim(pdf_actor.email))=? AND substr(pdf_actor.id,1,6)<>'local:')
    AND pdf_actor.teacher_name IS ? AND pdf_actor.student_name IS ?
    AND NOT EXISTS(SELECT 1 FROM local_credentials credential WHERE credential.account_id=pdf_actor.id AND credential.must_change_password=1)
    AND (pdf_actor.role<>'teacher' OR EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=pdf_group.id AND t.name=pdf_actor.teacher_name AND t.active=1))
    AND (pdf_actor.role<>'student' OR EXISTS(SELECT 1 FROM students s WHERE s.group_id=pdf_group.id AND s.name=pdf_actor.student_name AND s.active=1))
    AND (${session.sql}))`,args:[actor.groupId,actor.id,actor.role,OWNER_EMAIL,actor.teacherName,actor.studentName,...session.args]};
}
