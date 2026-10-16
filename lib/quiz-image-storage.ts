import type {Account} from './auth';
import {adminPermissionPredicate} from './admin-permission-access';
import {learningDb} from './learning-server';
import {pdfBucket} from './pdf-storage';

// A content-hash reservation can be shared by another session. Only remove it
// when this owner currently has no legal upload identity or upload grant at all;
// revoking one session alone must not cancel another session's active upload.
export async function cleanupRevokedQuizUpload(actor:Account,id:string,objectKey:string) {
 const unbound={...actor,role:'admin'},grants=['quizzes.create','quizzes.edit','quizzes.import'].map(key=>adminPermissionPredicate(unbound,key));
 const permitted=`EXISTS(SELECT 1 FROM accounts upload_owner JOIN tuition_groups upload_group ON upload_group.id=? AND upload_group.active=1
  WHERE upload_owner.id=? AND upload_owner.disabled_at IS NULL AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=upload_owner.id AND c.must_change_password=1)
  AND ((upload_owner.role='teacher' AND upload_owner.group_id=upload_group.id AND EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=upload_owner.group_id AND t.name=upload_owner.teacher_name AND t.active=1))
   OR (upload_owner.role='admin' AND (${grants.map(item=>item.sql).join(' OR ')}))))`;
 // Detach only an unpublished, unreferenced reservation in the same statement
 // that verifies revocation. A successful concurrent ready/publish wins this race.
 const removed=await learningDb().prepare(`DELETE FROM quiz_images WHERE id=? AND group_id=? AND owner_id=? AND object_key=? AND status='uploading'
  AND NOT EXISTS(SELECT 1 FROM quiz_version_images vi WHERE vi.image_id=quiz_images.id) AND NOT (${permitted}) RETURNING id`)
  .bind(id,actor.groupId,actor.id,objectKey,actor.groupId,actor.id,...grants.flatMap(item=>item.args)).first<{id:string}>();
 if(!removed)return;
 // Quiz quota derives directly from image rows, so only the deleted row's bytes
 // are released. R2 cleanup never touches another reservation's unique key.
 try{await pdfBucket().delete(objectKey);}catch{console.error('Revoked Quiz upload object cleanup requires retry');}
}
