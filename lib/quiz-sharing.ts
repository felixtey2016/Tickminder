import type {Account} from './auth';
import {learningDb} from './learning-server';
import {requireAdminPermission,adminPermissionStatements,adminPermissionPredicate} from './admin-permission-access';
import {accountSessionPredicate} from './account-session';
import {authorityGuard} from './admin-authority';
import {operationHash} from './learning-operations';
import {QuizError,checkQuiz} from './quiz';
import {readQuiz,quizKeys,quizAuthority,quizAuthorityValues} from './quiz-server';
import {quizShareTargetEligibleSql} from './quiz-sharing-access';

export type QuizSharingMode='private'|'public'|'selected';
type Policy={mode:QuizSharingMode;version_id:string|null;revision:number;author_name:string};
const text=(value:unknown)=>typeof value==='string'?value.trim():'';
function identity(value:unknown){const result=text(value);if(!result||result.length>160)throw new QuizError('quiz.invalidFields');return result;}
function ownerOnly(actor:Account){if(!['teacher','admin'].includes(actor.role)||!actor.groupId)throw new QuizError('quiz.forbidden',403);}
async function policy(quizId:string){return learningDb().prepare('SELECT mode,version_id,revision,author_name FROM quiz_share_settings WHERE quiz_id=?').bind(quizId).first<Policy>();}
export async function quizSharingDetails(actor:Account,q:{id:string;group_id:string;owner_id:string;visibility:string}){
 const setting=await policy(q.id),own=['teacher','admin'].includes(actor.role)&&q.owner_id===actor.id&&q.group_id===actor.groupId;
 const recipients=own?(await learningDb().prepare('SELECT account_id AS id FROM quiz_share_recipients WHERE quiz_id=? AND group_id=? ORDER BY account_id').bind(q.id,q.group_id).all<{id:string}>()).results:[];
 return {sharingMode:setting?.mode||q.visibility,sharingRevision:setting?.revision||0,...own?{recipientIds:recipients.map(item=>item.id)}:{}};
}

export async function readQuizShareTargets(actor:Account,url:URL){
 ownerOnly(actor);await requireAdminPermission(actor,'quizzes.share');
 const rawOffset=url.searchParams.get('offset')||'0';if(!/^\d{1,7}$/.test(rawOffset)||Number(rawOffset)>1000000)throw new QuizError('quiz.invalidFields');
 const offset=Number(rawOffset),search=(url.searchParams.get('search')||'').trim().slice(0,100),quizId=url.searchParams.get('quizId'),db=learningDb();
 let selectedIds:string[]=[],legacyOrganisation=false;
 if(quizId){const q=await db.prepare('SELECT id,group_id,owner_id,visibility FROM quizzes WHERE id=? AND group_id=? AND owner_id=? AND deleted_at IS NULL').bind(identity(quizId),actor.groupId,actor.id).first<{id:string;group_id:string;owner_id:string;visibility:string}>();if(!q)throw new QuizError('quiz.notFound',404);const detail=await quizSharingDetails(actor,q);selectedIds=detail.recipientIds||[];legacyOrganisation=detail.sharingMode==='organisation';}
 const permission=adminPermissionPredicate(actor,'quizzes.share'),eligibility=quizShareTargetEligibleSql('share_input.group_id','share_input.owner_id','target.id'),from=`FROM accounts target JOIN (SELECT ? AS group_id,? AS owner_id) share_input WHERE ${eligibility} AND (${permission.sql})`;
 const result=await db.prepare(`SELECT target.id,target.name,target.role,target.student_name AS studentName,target.teacher_name AS teacherName ${from} ${search?'AND (instr(lower(target.name),lower(?))>0 OR instr(lower(coalesce(target.student_name,target.teacher_name,\'\')),lower(?))>0)':''} ORDER BY lower(target.name),target.id LIMIT 41 OFFSET ?`).bind(actor.groupId,actor.id,...permission.args,...search?[search,search]:[],offset).all<{id:string;name:string;role:string;studentName:string|null;teacherName:string|null}>();
 const selected=selectedIds.length?(await db.prepare(`SELECT target.id,target.name,target.role ${from} AND target.id IN(SELECT value FROM json_each(?)) ORDER BY lower(target.name),target.id`).bind(actor.groupId,actor.id,...permission.args,JSON.stringify(selectedIds)).all<{id:string;name:string;role:string}>()).results:[];
 return {items:result.results.slice(0,40),hasMore:result.results.length>40,selectedIds,selected,scope:actor.role==='teacher'?'students':'group',legacyOrganisation};
}

export async function updateQuizSharing(actor:Account,data:Record<string,unknown>){
 ownerOnly(actor);await requireAdminPermission(actor,'quizzes.share');
 const quizId=identity(data.id),mode=data.visibility as QuizSharingMode,operation=identity(data.operationId),revision=Number(data.revision);
 if(!['private','public','selected'].includes(mode)||!Number.isSafeInteger(revision)||revision<1||!/^[a-zA-Z0-9_-]{16,80}$/.test(operation))throw new QuizError('quiz.invalidFields');
 const selected=data.recipientIds===undefined?[]:data.recipientIds;if(!Array.isArray(selected)||selected.length>1000||selected.some(value=>typeof value!=='string'||!value||value.length>160))throw new QuizError('quiz.invalidFields');
 const recipientIds=[...new Set(selected as string[])].sort();if(mode==='selected'&&!recipientIds.length||mode!=='selected'&&recipientIds.length)throw new QuizError('quiz.invalidFields');
 const requestedSharingRevision=data.sharingRevision===undefined?0:Number(data.sharingRevision);if(!Number.isSafeInteger(requestedSharingRevision)||requestedSharingRevision<0)throw new QuizError('quiz.invalidFields');
 const requestHash=await operationHash({quizId,mode,revision,sharingRevision:requestedSharingRevision,recipientIds}),db=learningDb(),auditId='quizshare:'+operation;
 const prior=await db.prepare("SELECT after_json FROM audit WHERE id=? AND group_id=? AND actor_id=? AND action='quiz.visibility'").bind(auditId,actor.groupId,actor.id).first<{after_json:string}>();
 if(prior){const old=JSON.parse(prior.after_json);if(old.requestHash!==requestHash)throw new QuizError('quiz.conflict',409);return {ok:true,replayed:true,visibility:mode,sharingMode:mode,sharingRevision:old.sharingRevision,sharedRevision:mode==='private'?null:revision};}
 const source=await readQuiz(actor,quizId),q=source.q;if(q.owner_id!==actor.id||q.group_id!==actor.groupId)throw new QuizError('quiz.forbidden',403);if(source.revision!==revision||q.revision!==revision)throw new QuizError('quiz.conflict',409);
 if(mode!=='private'&&q.public_blocked_at!==null)throw new QuizError('quiz.publicBlocked',409);
 if(mode!=='private')checkQuiz(source.content,await quizKeys(source.v.id));
 const previous=await policy(quizId);if((previous?.revision||0)!==requestedSharingRevision)throw new QuizError('quiz.conflict',409);
 if(recipientIds.length){const targetCheck=await db.prepare(`SELECT count(*) AS n FROM json_each(?) requested JOIN (SELECT ? AS group_id,? AS owner_id) share_live WHERE ${quizShareTargetEligibleSql('share_live.group_id','share_live.owner_id','requested.value')}`).bind(JSON.stringify(recipientIds),actor.groupId,actor.id).first<{n:number}>();if(targetCheck?.n!==recipientIds.length)throw new QuizError('quiz.shareTargetInvalid',400);}
 const mapped=mode==='selected'?'organisation':mode,now=new Date().toISOString(),session=accountSessionPredicate(actor),eligible=quizShareTargetEligibleSql('share_live.group_id','share_live.owner_id','requested.value');
 const guard={sql:`${quizAuthority} AND (${session.sql}) AND EXISTS(SELECT 1 FROM quizzes share_live WHERE share_live.id=? AND share_live.group_id=? AND share_live.owner_id=? AND share_live.deleted_at IS NULL AND share_live.revision=? AND (?='private' OR share_live.public_blocked_at IS NULL) AND coalesce((SELECT current_share.revision FROM quiz_share_settings current_share WHERE current_share.quiz_id=share_live.id),0)=? AND NOT EXISTS(SELECT 1 FROM json_each(?) requested WHERE NOT (${eligible})))`,args:[...quizAuthorityValues(actor),...session.args,quizId,actor.groupId,actor.id,revision,mode,requestedSharingRevision,JSON.stringify(recipientIds)]};
 const after={id:quizId,revision,visibility:mode,sharingMode:mode,sharingRevision:requestedSharingRevision+1,recipientIds,requestHash},statements=[authorityGuard(guard,'quiz_sharing_changed'),
 db.prepare(`INSERT INTO quiz_share_settings(quiz_id,group_id,mode,version_id,revision,author_name,updated_by,updated_at) SELECT ?,?,?,?,?,substr(coalesce(nullif(trim(a.name),''),'Quiz creator'),1,120),?,? FROM accounts a WHERE a.id=? ON CONFLICT(quiz_id) DO UPDATE SET mode=excluded.mode,version_id=excluded.version_id,revision=excluded.revision,author_name=excluded.author_name,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(quizId,actor.groupId,mode,mode==='private'?null:source.v.id,requestedSharingRevision+1,actor.id,now,actor.id),
 db.prepare('DELETE FROM quiz_share_recipients WHERE quiz_id=? AND group_id=?').bind(quizId,actor.groupId),
 db.prepare('INSERT INTO quiz_share_recipients(group_id,quiz_id,account_id,created_at) SELECT ?,?,value,? FROM json_each(?)').bind(actor.groupId,quizId,now,JSON.stringify(recipientIds)),
 db.prepare('UPDATE quizzes SET visibility=?,shared_revision=?,updated_at=? WHERE id=? AND group_id=? AND owner_id=? AND revision=?').bind(mapped,mode==='private'?null:revision,now,quizId,actor.groupId,actor.id,revision),
 db.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,'quiz.visibility',?,?,?)").bind(actor.groupId,auditId,'quiz:'+quizId,actor.id,JSON.stringify({visibility:previous?.mode||q.visibility,sharingRevision:requestedSharingRevision}),JSON.stringify(after),now),
 db.prepare("INSERT INTO quiz_moderation_events(id,group_id,quiz_id,entity_id,actor_id,action,before_json,after_json,created_at) SELECT 'share-withdraw:'||p.id||':'||?,p.group_id,p.quiz_id,p.id,?,'withdrawRequest',json_object('status',p.status),json_object('status','withdrawn','reason',?),? FROM quiz_publications p WHERE p.quiz_id=? AND p.status IN('pending','legacy_pending')").bind(operation,actor.id,'Author selected '+mode+' sharing',now,quizId),
 db.prepare("UPDATE quiz_publications SET status='withdrawn',revision=revision+1,review_reason=?,updated_at=? WHERE quiz_id=? AND status IN('pending','legacy_pending')").bind('Author selected '+mode+' sharing',now,quizId),...adminPermissionStatements(actor,'quizzes.share')];
 await db.batch(statements);return {ok:true,visibility:mode,sharingMode:mode,sharingRevision:requestedSharingRevision+1,sharedRevision:mode==='private'?null:revision};
}
