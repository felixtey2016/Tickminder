import type {Account} from './auth';
import {learningDb} from './learning-server';
import {requireGroup} from './group-data';
import {isOwnerAccount} from './owner';
import {ownerAuthorityGuard} from './admin-authority';
import {requireAdminPermission,adminPermissionStatements} from './admin-permission-access';
import {operationHash} from './learning-operations';
import {checkQuiz,QuizError} from './quiz';
import {quizAuthority,quizAuthorityValues,quizKeys} from './quiz-server';
import {quizApprovedPublicSql,type QuizPublication,type QuizPublicationSource,type QuizModerationSummary} from './quiz-moderation-types';

const identifier=(value:unknown)=>{if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(value))throw new QuizError('quiz.invalidFields');return value;};
const reason=(value:unknown,max=4000)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new QuizError('quiz.moderationReasonRequired');return value.trim();};
const revision=(value:unknown)=>{if(!Number.isSafeInteger(value)||Number(value)<1)throw new QuizError('quiz.invalidFields');return Number(value);};
const offset=(value:unknown)=>Math.max(0,Math.min(1000000,Math.floor(Number(value)||0)));
function source(value:unknown):QuizPublicationSource{
 const s=value as QuizPublicationSource;if(!s||s.rightsConfirmed!==true||!['original','licensed'].includes(s.sourceType))throw new QuizError('quiz.publicDeclarationRequired');
 const authorDisplayName=reason(s.authorDisplayName,120),authorization=reason(s.authorization,4000),sourceUrl=typeof s.sourceUrl==='string'?s.sourceUrl.trim():'';
 if(sourceUrl.length>1500||s.sourceType==='licensed'&&!sourceUrl)throw new QuizError('quiz.publicSourceRequired');
 if(sourceUrl){let url:URL;try{url=new URL(sourceUrl);}catch{throw new QuizError('quiz.publicSourceRequired');}if(url.protocol!=='https:'||url.username||url.password)throw new QuizError('quiz.publicSourceRequired');}
 return {authorDisplayName,sourceType:s.sourceType,sourceUrl,authorization,rightsConfirmed:true};
}
function moderator(a:Account){if(!isOwnerAccount(a))throw new QuizError('quiz.forbidden',403);}
type PublicationRow={id:string;group_id:string;quiz_id:string;version_id:string;applicant_id:string;author_display_name:string;source_type:'original'|'licensed'|'unknown';source_url:string;authorization:string;rights_confirmed:number;status:QuizPublication['status'];revision:number;review_reason:string;created_at:string;updated_at:string;reviewed_at:string|null;quiz_revision:number;title:string;subject:string;exam:string;content_json:string;deleted_at:string|null;public_blocked_at:string|null;visibility:string;shared_revision:number|null};
// Queue cards and editor status never transfer full question bodies from D1.
const publicationFields=`p.*,v.revision AS quiz_revision,json_extract(v.content_json,'$.title') AS title,json_extract(v.content_json,'$.subject') AS subject,json_extract(v.content_json,'$.exam') AS exam,q.deleted_at,q.public_blocked_at,q.visibility,q.shared_revision`;
const publicationFrom=`FROM quiz_publications p JOIN quiz_versions v ON v.id=p.version_id AND v.quiz_id=p.quiz_id JOIN quizzes q ON q.id=p.quiz_id`;
function publication(row:PublicationRow):QuizPublication{return{id:row.id,quizId:row.quiz_id,versionId:row.version_id,quizRevision:row.quiz_revision,title:row.title,subject:row.subject,exam:row.exam,status:row.status,revision:row.revision,authorDisplayName:row.author_display_name,sourceType:row.source_type,sourceUrl:row.source_url,authorization:row.authorization,rightsConfirmed:Boolean(row.rights_confirmed),reason:row.review_reason,createdAt:row.created_at,updatedAt:row.updated_at,reviewedAt:row.reviewed_at};}
async function publicationRow(id:string){const row=await learningDb().prepare(`SELECT ${publicationFields},v.content_json ${publicationFrom} WHERE p.id=?`).bind(id).first<PublicationRow>();if(!row)throw new QuizError('quiz.notFound',404);return row;}
function ownPublication(a:Account,p:PublicationRow){if(p.applicant_id!==a.id||p.group_id!==a.groupId)throw new QuizError('quiz.notFound',404);}
async function replay(a:Account,data:Record<string,unknown>,kind:string){const operation=identifier(data.operationId);if(operation.length<16||operation.length>80)throw new QuizError('quiz.invalidFields');const hash=await operationHash(data),prior=await learningDb().prepare('SELECT actor_id,kind,request_hash,record_id FROM quiz_moderation_operations WHERE id=?').bind(operation).first<{actor_id:string;kind:string;request_hash:string;record_id:string}>();if(prior&&(prior.actor_id!==a.id||prior.kind!==kind||prior.request_hash!==hash))throw new QuizError('quiz.conflict',409);return{operation,hash,prior};}
type Operation=Awaited<ReturnType<typeof replay>>;
function operationStatement(a:Account,o:Operation,groupId:string,recordId:string,kind:string,now:string){return learningDb().prepare('INSERT INTO quiz_moderation_operations(id,group_id,actor_id,record_id,kind,request_hash,created_at) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(o.operation,groupId,a.id,recordId,kind,o.hash,now);}
function eventStatements(a:Account,o:Operation,groupId:string,quizId:string,entityId:string,kind:string,before:unknown,after:unknown,now:string){const db=learningDb(),guard='EXISTS(SELECT 1 FROM quiz_moderation_operations WHERE id=?)';return[
 db.prepare(`INSERT INTO quiz_moderation_events(id,group_id,quiz_id,entity_id,actor_id,action,before_json,after_json,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`).bind(o.operation,groupId,quizId,entityId,a.id,kind,before==null?null:JSON.stringify(before),JSON.stringify(after),now,o.operation),
 db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`).bind(groupId,'quizmoderation:'+o.operation,'quiz:'+quizId,a.id,'quiz.'+kind,before==null?null:JSON.stringify(before),JSON.stringify(after),now,o.operation),
 ];}
async function commit(statements:D1PreparedStatement[],index=0){const result=await learningDb().batch(statements);if(result[index]?.meta.changes!==1)throw new QuizError('quiz.conflict',409);}

export async function readQuizModeration(a:Account,quizId:string):Promise<QuizModerationSummary>{
 const db=learningDb(),q=await db.prepare('SELECT owner_id,group_id,shared_revision,public_blocked_at FROM quizzes WHERE id=?').bind(quizId).first<{owner_id:string;group_id:string;shared_revision:number|null;public_blocked_at:string|null}>();
 if(!q||!isOwnerAccount(a)&&(q.owner_id!==a.id||q.group_id!==a.groupId))throw new QuizError('quiz.notFound',404);
 const rows=await db.prepare(`SELECT ${publicationFields} ${publicationFrom} WHERE p.quiz_id=? ORDER BY p.created_at DESC,p.id DESC LIMIT 1`).bind(quizId).all<PublicationRow>();
 const active=await db.prepare(`SELECT v.id FROM quiz_versions v JOIN quizzes q ON q.id=v.quiz_id WHERE q.id=? AND q.visibility='public' AND q.deleted_at IS NULL AND v.revision=q.shared_revision AND ${quizApprovedPublicSql()}`).bind(quizId).first<{id:string}>();
 return {latest:rows.results[0]?publication(rows.results[0]):null,publicVersionId:active?.id||null,blockedAt:q.public_blocked_at};
}
export async function requestQuizPublic(a:Account,data:Record<string,unknown>){
 await requireAdminPermission(a,'quizzes.share');if(!['teacher','admin'].includes(a.role))throw new QuizError('quiz.forbidden',403);
 const quizId=identifier(data.quizId??data.id),quizRevision=revision(data.quizRevision??data.revision),declaration=source(data.source),o=await replay(a,data,'requestPublic');if(o.prior)return{ok:true,publicationId:o.prior.record_id,replayed:true};
 const db=learningDb(),q=await db.prepare('SELECT q.group_id,q.owner_id,q.revision,q.deleted_at,v.id AS version_id FROM quizzes q JOIN quiz_versions v ON v.quiz_id=q.id AND v.revision=q.revision WHERE q.id=?').bind(quizId).first<{group_id:string;owner_id:string;revision:number;deleted_at:string|null;version_id:string}>();
 if(!q||q.deleted_at||q.owner_id!==a.id||q.group_id!==a.groupId)throw new QuizError('quiz.notFound',404);if(q.revision!==quizRevision)throw new QuizError('quiz.conflict',409);
 const now=new Date().toISOString(),id=crypto.randomUUID();
 const insert=db.prepare(`INSERT INTO quiz_publications(id,group_id,quiz_id,version_id,applicant_id,author_display_name,source_type,source_url,authorization,rights_confirmed,status,created_at,updated_at)
 SELECT ?,?,?,?,?,?,?,?,?,1,'pending',?,? WHERE EXISTS(SELECT 1 FROM quizzes q WHERE q.id=? AND q.group_id=? AND q.owner_id=? AND q.revision=? AND q.deleted_at IS NULL) AND NOT EXISTS(SELECT 1 FROM quiz_publications p WHERE p.version_id=? AND p.applicant_id=? AND p.status='pending') AND ${quizAuthority}`)
 .bind(id,q.group_id,quizId,q.version_id,a.id,declaration.authorDisplayName,declaration.sourceType,declaration.sourceUrl,declaration.authorization,now,now,quizId,q.group_id,a.id,quizRevision,q.version_id,a.id,...quizAuthorityValues(a));
 await commit([insert,operationStatement(a,o,q.group_id,id,'requestPublic',now),...eventStatements(a,o,q.group_id,quizId,id,'requestPublic',null,{versionId:q.version_id,status:'pending',source:declaration},now),...adminPermissionStatements(a,'quizzes.share')]);
 return {ok:true,publicationId:id,moderation:publication(await publicationRow(id))};
}
export async function reviewQuizPublic(a:Account,data:Record<string,unknown>){
 moderator(a);const id=identifier(data.id),expected=revision(data.revision),decision=String(data.decision);if(!['approved','returned','rejected'].includes(decision))throw new QuizError('quiz.invalidFields');const note=reason(data.reason),o=await replay(a,data,'review');if(o.prior)return{ok:true,replayed:true};
 const p=await publicationRow(id);if(!['pending','legacy_pending'].includes(p.status)||p.revision!==expected||p.deleted_at)throw new QuizError('quiz.conflict',409);if(decision==='approved'&&(p.rights_confirmed!==1||!['original','licensed'].includes(p.source_type)||!p.author_display_name||!p.authorization||p.source_type==='licensed'&&!p.source_url))throw new QuizError('quiz.publicDeclarationRequired');
 if(decision==='approved')checkQuiz(JSON.parse(p.content_json),await quizKeys(p.version_id));
 const now=new Date().toISOString(),db=learningDb(),update=db.prepare("UPDATE quiz_publications SET status=?,revision=revision+1,reviewer_id=?,review_reason=?,reviewed_at=?,updated_at=? WHERE id=? AND revision=? AND status IN('pending','legacy_pending') AND EXISTS(SELECT 1 FROM quizzes q WHERE q.id=quiz_publications.quiz_id AND q.deleted_at IS NULL)").bind(decision,a.id,note,now,now,id,expected);
 const statements=[ownerAuthorityGuard(a,p.group_id),update,operationStatement(a,o,p.group_id,id,'review',now)];
 if(decision==='approved')statements.push(db.prepare("UPDATE quizzes SET visibility='public',shared_revision=?,public_blocked_at=NULL,updated_at=? WHERE id=? AND deleted_at IS NULL AND EXISTS(SELECT 1 FROM quiz_moderation_operations WHERE id=?)").bind(p.quiz_revision,now,p.quiz_id,o.operation));
 statements.push(...eventStatements(a,o,p.group_id,p.quiz_id,id,'review',{status:p.status,revision:p.revision},{status:decision,versionId:p.version_id,reason:note},now));await commit(statements,1);return{ok:true,moderation:publication(await publicationRow(id))};
}
export async function withdrawQuizPublicRequest(a:Account,data:Record<string,unknown>){
 await requireAdminPermission(a,'quizzes.share');const id=identifier(data.id),expected=revision(data.revision),note=reason(data.reason),o=await replay(a,data,'withdrawRequest');if(o.prior)return{ok:true,replayed:true};const p=await publicationRow(id);ownPublication(a,p);if(p.revision!==expected||!['pending','legacy_pending'].includes(p.status))throw new QuizError('quiz.conflict',409);
 const now=new Date().toISOString(),db=learningDb();await commit([db.prepare(`UPDATE quiz_publications SET status='withdrawn',revision=revision+1,review_reason=?,updated_at=? WHERE id=? AND revision=? AND applicant_id=? AND group_id=? AND status IN('pending','legacy_pending') AND ${quizAuthority}`).bind(note,now,id,expected,a.id,a.groupId,...quizAuthorityValues(a)),operationStatement(a,o,p.group_id,id,'withdrawRequest',now),...eventStatements(a,o,p.group_id,p.quiz_id,id,'withdrawRequest',{status:p.status},{status:'withdrawn',reason:note},now),...adminPermissionStatements(a,'quizzes.share')]);return{ok:true};
}
export async function takeDownQuizPublic(a:Account,data:Record<string,unknown>){
 moderator(a);const quizId=identifier(data.quizId),note=reason(data.reason),o=await replay(a,data,'takeDown');if(o.prior)return{ok:true,replayed:true};const db=learningDb(),q=await db.prepare('SELECT group_id,deleted_at,public_blocked_at FROM quizzes WHERE id=?').bind(quizId).first<{group_id:string;deleted_at:string|null;public_blocked_at:string|null}>();if(!q)throw new QuizError('quiz.notFound',404);
 const now=new Date().toISOString();await commit([ownerAuthorityGuard(a,q.group_id),db.prepare('UPDATE quizzes SET public_blocked_at=?,updated_at=? WHERE id=?').bind(now,now,quizId),operationStatement(a,o,q.group_id,quizId,'takeDown',now),db.prepare("UPDATE quiz_publications SET status='taken_down',revision=revision+1,reviewer_id=?,review_reason=?,reviewed_at=?,updated_at=? WHERE quiz_id=? AND status='approved' AND EXISTS(SELECT 1 FROM quiz_moderation_operations WHERE id=?)").bind(a.id,note,now,now,quizId,o.operation),...eventStatements(a,o,q.group_id,quizId,quizId,'takeDown',{blockedAt:q.public_blocked_at},{blockedAt:now,reason:note},now)],1);return{ok:true};
}
const reporterAuthority=`EXISTS(SELECT 1 FROM accounts live JOIN tuition_groups g ON g.id=? AND g.active=1 WHERE live.id=? AND live.role=? AND live.disabled_at IS NULL AND (live.group_id=g.id OR ?=1) AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=live.id AND c.must_change_password=1) AND (live.role='admin' OR live.role='teacher' AND EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=g.id AND t.name=live.teacher_name AND t.active=1) OR live.role='student' AND EXISTS(SELECT 1 FROM students s WHERE s.group_id=g.id AND s.name=live.student_name AND s.active=1)))`;
function reporterValues(a:Account){return[a.groupId,a.id,a.role,isOwnerAccount(a)?1:0];}
function reportAccessSql(){return `((q.owner_id=? AND q.group_id=?) OR ?=1 OR (q.deleted_at IS NULL AND v.revision=q.shared_revision AND (q.visibility='organisation' AND q.group_id=? OR q.visibility='public' AND ${quizApprovedPublicSql()})) OR EXISTS(SELECT 1 FROM quiz_practice_attempts own_attempt WHERE own_attempt.version_id=v.id AND own_attempt.account_id=? AND own_attempt.group_id=? AND own_attempt.discarded_at IS NULL))`;}
function reportAccessValues(a:Account){return[a.id,a.groupId,isOwnerAccount(a)?1:0,a.groupId,a.id,a.groupId];}
export async function reportQuizPublic(a:Account,data:Record<string,unknown>){
 const groupId=requireGroup(a.groupId);
 const quizId=identifier(data.quizId),versionId=data.versionId==null?null:identifier(data.versionId),category=String(data.category);if(!['content','rights'].includes(category))throw new QuizError('quiz.invalidFields');const note=reason(data.reason),o=await replay(a,data,'report');if(o.prior)return{ok:true,reportId:o.prior.record_id,replayed:true};
 const db=learningDb(),q=await db.prepare(`SELECT v.id AS version_id FROM quiz_versions v JOIN quizzes q ON q.id=v.quiz_id JOIN tuition_groups g ON g.id=q.group_id WHERE q.id=? AND (? IS NULL AND v.revision=q.shared_revision OR v.id=?) AND ${reportAccessSql()} ORDER BY v.revision DESC LIMIT 1`).bind(quizId,versionId,versionId,...reportAccessValues(a)).first<{version_id:string}>();if(!q)throw new QuizError('quiz.notFound',404);
 const now=new Date().toISOString(),id=crypto.randomUUID();await commit([db.prepare(`INSERT INTO quiz_publication_reports(id,group_id,quiz_id,version_id,reporter_id,category,reason,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${reporterAuthority} AND EXISTS(SELECT 1 FROM quiz_versions v JOIN quizzes q ON q.id=v.quiz_id WHERE v.id=? AND q.id=? AND ${reportAccessSql()})`).bind(id,groupId,quizId,q.version_id,a.id,category,note,now,now,...reporterValues(a),q.version_id,quizId,...reportAccessValues(a)),operationStatement(a,o,groupId,id,'report',now),...eventStatements(a,o,groupId,quizId,id,'report',null,{versionId:q.version_id,category,reason:note},now)]);return{ok:true,reportId:id};
}
export async function resolveQuizReport(a:Account,data:Record<string,unknown>){
 moderator(a);const id=identifier(data.id),expected=revision(data.revision),status=String(data.status);if(!['in_review','resolved','dismissed'].includes(status))throw new QuizError('quiz.invalidFields');const note=reason(data.reason),o=await replay(a,data,'resolveReport');if(o.prior)return{ok:true,replayed:true};const db=learningDb(),r=await db.prepare('SELECT * FROM quiz_publication_reports WHERE id=?').bind(id).first<{group_id:string;quiz_id:string;status:string;revision:number}>();if(!r||r.revision!==expected)throw new QuizError('quiz.conflict',409);
 const now=new Date().toISOString();await commit([ownerAuthorityGuard(a,r.group_id),db.prepare('UPDATE quiz_publication_reports SET status=?,resolution=?,reviewer_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?').bind(status,note,a.id,now,id,expected),operationStatement(a,o,r.group_id,id,'resolveReport',now),...eventStatements(a,o,r.group_id,r.quiz_id,id,'resolveReport',{status:r.status},{status,reason:note},now)],1);return{ok:true};
}
export async function appealQuizPublication(a:Account,data:Record<string,unknown>){
 await requireAdminPermission(a,'quizzes.share');const id=identifier(data.id),expected=revision(data.revision),note=reason(data.reason),o=await replay(a,data,'appeal');if(o.prior)return{ok:true,appealId:o.prior.record_id,replayed:true};const p=await publicationRow(id);ownPublication(a,p);if(p.revision!==expected||!['returned','rejected','taken_down'].includes(p.status))throw new QuizError('quiz.conflict',409);
 const now=new Date().toISOString(),appealId=crypto.randomUUID(),db=learningDb();await commit([db.prepare(`INSERT INTO quiz_publication_appeals(id,group_id,publication_id,quiz_id,applicant_id,reason,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM quiz_publications p WHERE p.id=? AND p.revision=? AND p.applicant_id=? AND p.status IN('returned','rejected','taken_down')) AND NOT EXISTS(SELECT 1 FROM quiz_publication_appeals prior WHERE prior.publication_id=? AND prior.status='open') AND ${quizAuthority}`).bind(appealId,p.group_id,id,p.quiz_id,a.id,note,now,now,id,expected,a.id,id,...quizAuthorityValues(a)),operationStatement(a,o,p.group_id,appealId,'appeal',now),...eventStatements(a,o,p.group_id,p.quiz_id,appealId,'appeal',null,{publicationId:id,reason:note},now),...adminPermissionStatements(a,'quizzes.share')]);return{ok:true,appealId};
}
export async function resolveQuizAppeal(a:Account,data:Record<string,unknown>){
 moderator(a);const id=identifier(data.id),expected=revision(data.revision),status=String(data.status);if(!['resolved','rejected'].includes(status))throw new QuizError('quiz.invalidFields');const note=reason(data.reason),o=await replay(a,data,'resolveAppeal');if(o.prior)return{ok:true,replayed:true};const db=learningDb(),r=await db.prepare('SELECT * FROM quiz_publication_appeals WHERE id=?').bind(id).first<{group_id:string;quiz_id:string;publication_id:string;status:string;revision:number}>();if(!r||r.status!=='open'||r.revision!==expected)throw new QuizError('quiz.conflict',409);
 const now=new Date().toISOString(),statements=[ownerAuthorityGuard(a,r.group_id),db.prepare("UPDATE quiz_publication_appeals SET status=?,resolution=?,reviewer_id=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status='open'").bind(status,note,a.id,now,id,expected),operationStatement(a,o,r.group_id,id,'resolveAppeal',now)];
 if(status==='resolved')statements.push(db.prepare("UPDATE quiz_publications SET status=CASE WHEN rights_confirmed=1 THEN 'pending' ELSE 'legacy_pending' END,revision=revision+1,review_reason=?,updated_at=? WHERE id=? AND status IN('returned','rejected','taken_down') AND EXISTS(SELECT 1 FROM quiz_moderation_operations WHERE id=?)").bind(note,now,r.publication_id,o.operation));
 statements.push(...eventStatements(a,o,r.group_id,r.quiz_id,id,'resolveAppeal',{status:r.status},{status,reason:note,publicationId:r.publication_id},now));await commit(statements,1);return{ok:true};
}
export async function listQuizModeration(a:Account,params:URLSearchParams){
 const view=params.get('view')||'mine',db=learningDb(),start=offset(params.get('offset')),owner=isOwnerAccount(a);
 if(view==='detail'){
  const row=await publicationRow(identifier(params.get('id')));if(!owner)ownPublication(a,row);return {publication:publication(row),content:JSON.parse(row.content_json),keys:await quizKeys(row.version_id),canModerate:owner};
 }
 if(view==='mine'||view==='queue'){
  if(view==='queue')moderator(a);else if(!['teacher','admin'].includes(a.role))throw new QuizError('quiz.forbidden',403);
  const status=params.get('status')||(view==='queue'?'pending':''),quizId=params.get('quizId'),values:unknown[]=[],conditions:string[]=[];
  if(view==='mine'){conditions.push('p.applicant_id=? AND p.group_id=?');values.push(a.id,a.groupId);}
  if(quizId){conditions.push('p.quiz_id=?');values.push(identifier(quizId));}
  if(status){if(!['pending','legacy_pending','approved','returned','rejected','withdrawn','taken_down','all'].includes(status))throw new QuizError('quiz.invalidFields');if(status==='pending')conditions.push("p.status IN('pending','legacy_pending')");else if(status!=='all'){conditions.push('p.status=?');values.push(status);}}
  const rows=await db.prepare(`SELECT ${publicationFields} ${publicationFrom} WHERE ${conditions.join(' AND ')||'1=1'} ORDER BY p.updated_at DESC,p.id DESC LIMIT 41 OFFSET ?`).bind(...values,start).all<PublicationRow>();return{items:rows.results.slice(0,40).map(publication),hasMore:rows.results.length>40,canModerate:owner};
 }
 if(view==='reports'||view==='appeals'){
  const report=view==='reports',table=report?'quiz_publication_reports':'quiz_publication_appeals',person=report?'reporter_id':'applicant_id',status=params.get('status'),values:unknown[]=[],conditions:string[]=[];
  if(!owner){conditions.push(`${person}=?`);values.push(a.id);}
  if(status&&status!=='all'){if(!(report?['open','in_review','resolved','dismissed']:['open','resolved','rejected']).includes(status))throw new QuizError('quiz.invalidFields');conditions.push('status=?');values.push(status);}
  const rows=await db.prepare(`SELECT id,quiz_id AS quizId,${report?'version_id AS versionId,category':'publication_id AS publicationId'},reason,status,revision,resolution,created_at AS createdAt,updated_at AS updatedAt FROM ${table} WHERE ${conditions.join(' AND ')||'1=1'} ORDER BY updated_at DESC,id DESC LIMIT 41 OFFSET ?`).bind(...values,start).all();return{items:rows.results.slice(0,40),hasMore:rows.results.length>40,canModerate:owner};
 }
 throw new QuizError('quiz.invalidFields');
}
