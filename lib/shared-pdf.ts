import type {Account} from './auth';
import {accountSessionPredicate} from './account-session';
import {learningDb} from './learning-server';

export type FileScope = {sql:string;args:unknown[]};
export class SharedPdfError extends Error {
  constructor(message='文件不存在或无权共享',readonly status=403){super(message);}
}

// Publishing a file in the group catalog is an explicit sharing decision. A
// readable student submission or another teacher's private file is not a source.
// The caller must include this scope in its write transaction, not just precheck.
export async function assertReusablePdfSource(actor:Account,fileId:string):Promise<{fileId:string;scope:FileScope}> {
  const session=accountSessionPredicate(actor);
  const scope:FileScope={sql:`EXISTS(SELECT 1 FROM pdf_files reusable_file
    JOIN accounts reusable_actor ON reusable_actor.id=reusable_file.owner_id AND reusable_actor.group_id=reusable_file.group_id
    JOIN tuition_groups reusable_group ON reusable_group.id=reusable_actor.group_id AND reusable_group.active=1
    JOIN teachers reusable_teacher ON reusable_teacher.group_id=reusable_actor.group_id AND reusable_teacher.name=reusable_actor.teacher_name AND reusable_teacher.active=1
    WHERE reusable_file.id=? AND reusable_file.group_id=? AND reusable_actor.id=? AND reusable_actor.role='teacher' AND reusable_actor.disabled_at IS NULL
      AND reusable_file.status='attached' AND reusable_file.kind IN('material','homework')
      AND NOT EXISTS(SELECT 1 FROM local_credentials credentials WHERE credentials.account_id=reusable_actor.id AND credentials.must_change_password=1)
      AND (${session.sql})
      AND (EXISTS(SELECT 1 FROM teaching_materials m WHERE m.file_id=reusable_file.id AND m.group_id=reusable_file.group_id AND m.owner_id=reusable_actor.id
        AND (m.classroom_id IS NULL OR EXISTS(SELECT 1 FROM classrooms c WHERE c.id=m.classroom_id AND c.group_id=m.group_id AND c.archived=0 AND c.teacher_name=reusable_actor.teacher_name)))
       OR EXISTS(SELECT 1 FROM homework h WHERE h.attachment_file_id=reusable_file.id AND h.group_id=reusable_file.group_id AND h.owner_id=reusable_actor.id
        AND (h.classroom_id IS NULL OR EXISTS(SELECT 1 FROM classrooms c WHERE c.id=h.classroom_id AND c.group_id=h.group_id AND c.archived=0 AND c.teacher_name=reusable_actor.teacher_name)))))`,
    args:[fileId,actor.groupId,actor.id,...session.args]};
  if(actor.role!=='teacher'||!actor.groupId||!fileId||!await learningDb().prepare(`SELECT 1 WHERE ${scope.sql}`).bind(...scope.args).first())throw new SharedPdfError();
  return {fileId,scope};
}
