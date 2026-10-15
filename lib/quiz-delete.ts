import type {Account} from '@/lib/auth';
import {isOwnerAccount} from '@/lib/owner';
import {learningDb} from '@/lib/learning-server';
import {operationHash} from '@/lib/learning-operations';
import {QuizError} from '@/lib/quiz';
export async function quizManager(actor:Account){return isOwnerAccount(actor)||actor.role==='admin'&&Boolean(await learningDb().prepare('SELECT 1 FROM tuition_groups WHERE id=? AND chief_admin_id=? AND active=1').bind(actor.groupId,actor.id).first());}
export function quizCanDelete(actor:Account,q:{group_id:string;owner_id:string},manager:boolean){return actor.role!=='student'&&(isOwnerAccount(actor)||q.group_id===actor.groupId&&(q.owner_id===actor.id||manager));}
export async function deleteQuiz(actor:Account,data:Record<string,unknown>){
 const id=data.id,operation=data.operationId;
 if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(id)||typeof operation!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(operation))throw new QuizError('quiz.invalidFields');
 const db=learningDb(),hash=await operationHash({id,action:'quiz.delete'}),auditId='quizdelete:'+operation;
 const prior=await db.prepare("SELECT actor_id,after_json FROM audit WHERE id=? AND action='quiz.delete'").bind(auditId).first<{actor_id:string;after_json:string}>();
 if(prior){if(prior.actor_id!==actor.id||JSON.parse(prior.after_json).requestHash!==hash)throw new QuizError('quiz.conflict',409);return {ok:true,replayed:true};}
 const q=await db.prepare('SELECT id,group_id,owner_id,revision,deleted_at,source_key FROM quizzes WHERE id=?').bind(id).first<{id:string;group_id:string;owner_id:string;revision:number;deleted_at:string|null;source_key:string|null}>();
 if(!q||!quizCanDelete(actor,q,await quizManager(actor)))throw new QuizError('quiz.notFound',404);
 if(q.deleted_at)return {ok:true,alreadyDeleted:true};
 if(data.revision!==undefined&&data.revision!==q.revision)throw new QuizError('quiz.conflict',409);
 const now=new Date().toISOString();
 // Recheck current identity, role and designation in the same atomic write.
 const authority=`EXISTS(SELECT 1 FROM accounts a WHERE a.id=? AND a.disabled_at IS NULL AND a.role IN ('teacher','admin') AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=a.id AND c.must_change_password=1) AND ((?=1 AND a.role='admin' AND lower(trim(a.email))=? AND substr(a.id,1,6)<>'local:') OR (a.group_id=quizzes.group_id AND EXISTS(SELECT 1 FROM tuition_groups g WHERE g.id=quizzes.group_id AND g.active=1 AND ((quizzes.owner_id=a.id AND (a.role='admin' OR EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=g.id AND t.name=a.teacher_name AND t.active=1))) OR (a.role='admin' AND g.chief_admin_id=a.id))))))`;
 try{const results=await db.batch([
  db.prepare(`UPDATE quizzes SET deleted_at=?,deleted_by=?,visibility='private',shared_revision=NULL,source_key=NULL,updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL AND ${authority}`).bind(now,actor.id,now,id,q.revision,actor.id,isOwnerAccount(actor)?1:0,actor.email.trim().toLowerCase()),
  db.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,'quiz.delete',?,?,? WHERE changes()=1").bind(q.group_id,auditId,'quiz:'+id,actor.id,JSON.stringify({revision:q.revision,sourceKey:q.source_key}),JSON.stringify({id,requestHash:hash,deletedAt:now}),now),
 ]);if(results[0].meta.changes!==1)throw new QuizError('quiz.conflict',409);return {ok:true};}
 catch(error){const committed=await db.prepare("SELECT actor_id,after_json FROM audit WHERE id=? AND action='quiz.delete'").bind(auditId).first<{actor_id:string;after_json:string}>();if(committed&&committed.actor_id===actor.id&&JSON.parse(committed.after_json).requestHash===hash)return {ok:true,replayed:true};throw error;}
}
