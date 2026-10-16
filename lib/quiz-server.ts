import {requireAdminPermission,hasAdminPermission,adminPermissionStatements,adminPermissionPredicate,adminPermissionFailure} from '@/lib/admin-permission-access';
import {currentBusinessAccount,type Account} from '@/lib/auth';
import {learningDb} from '@/lib/learning-server';
import {requireGroup} from '@/lib/group-data';
import {isOwnerAccount} from '@/lib/owner';
import {operationHash} from '@/lib/learning-operations';
import {checkQuiz,QuizError,type QuizContent,type QuizKey,type QuizVisibility} from '@/lib/quiz';
import {quizBankKind,quizWriteForbidden} from '@/lib/quiz-catalog';
import {readAcademicCatalogue} from '@/lib/academic-catalogue-server';
import {checkQuizAcademic} from '@/lib/quiz-academic';
export const quizHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export function quizResponse(data:unknown,status=200){return Response.json(data,{status,headers:quizHeaders});}
export async function quizActor(allowStudent=false){
 const a=await currentBusinessAccount();if(!a)throw new QuizError('quiz.signIn',401);
 if(!['teacher','admin',...(allowStudent?['student']:[])].includes(a.role))throw new QuizError('quiz.forbidden',403);
 requireGroup(a.groupId);
 // Keep group and active roster checks in one read. This is request-local;
 // revocation is still checked afresh on every request and atomic mutation.
 const permitted=await learningDb().prepare(`SELECT 1 FROM tuition_groups g WHERE g.id=? AND g.active=1 AND (?<>'teacher' OR EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=g.id AND t.name=? AND t.active=1)) AND (?<>'student' OR EXISTS(SELECT 1 FROM students s WHERE s.group_id=g.id AND s.name=? AND s.active=1))`).bind(a.groupId,a.role,a.teacherName,a.role,a.studentName).first();
 if(!permitted)throw new QuizError('quiz.forbidden',403);return a;
}
export function quizFailure(error:unknown){const denied=adminPermissionFailure(error);if(denied)return quizResponse({error:'quiz.forbidden'},denied.status);if(error instanceof QuizError)return quizResponse({error:error.code},error.status);if(/UNIQUE constraint|quiz group mismatch|quiz key group mismatch|quiz image grant mismatch/.test(String(error)))return quizResponse({error:'quiz.conflict'},409);console.error('Quiz request failed',error instanceof Error?error.name:'unknown');return quizResponse({error:'quiz.unavailable'},503);}
export async function quizRequestBytes(request:Request,maximum:number,error='quiz.tooLarge'){
 const declared=Number(request.headers.get('content-length')||0);if(!Number.isFinite(declared)||declared>maximum)throw new QuizError(error,413);
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maximum){await reader.cancel();throw new QuizError(error,413);}chunks.push(value);}}finally{reader.releaseLock();}
 const result=new Uint8Array(size);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}return result;
}
type QuizRow={id:string;group_id:string;owner_id:string;revision:number;shared_revision:number|null;visibility:QuizVisibility;title:string;source_key:string|null};
export async function readQuiz(actor:Account,id:string,bank=false){
 const permission=adminPermissionPredicate(actor,'quizzes.view');
 const db=learningDb(),row=await db.prepare(`SELECT q.*,v.id AS version_id,v.content_json,v.revision AS version_revision FROM quizzes q JOIN tuition_groups g ON g.id=q.group_id AND g.active=1 JOIN quiz_versions v ON v.quiz_id=q.id AND v.group_id=q.group_id AND v.revision=CASE WHEN ?=1 THEN q.shared_revision WHEN ?<>'student' AND (?=1 OR q.group_id=? AND (q.owner_id=? OR ?='admin')) THEN q.revision ELSE q.shared_revision END WHERE q.id=? AND q.deleted_at IS NULL AND ${permission.sql}`).bind(bank?1:0,actor.role,isOwnerAccount(actor)?1:0,actor.groupId,actor.id,actor.role,id,...permission.args).first<QuizRow&{version_id:string;content_json:string;version_revision:number}>();
 if(!row)throw new QuizError('quiz.notFound',404);
 const {version_id,content_json,version_revision,...q}=row;
 const own=actor.role!=='student'&&(isOwnerAccount(actor)||q.group_id===actor.groupId&&(q.owner_id===actor.id||actor.role==='admin'));
 const shared=q.shared_revision!==null&&(q.visibility==='public'||q.visibility==='organisation'&&q.group_id===actor.groupId);
 if(!own&&!shared||bank&&!shared)throw new QuizError('quiz.notFound',404);
 const revision=version_revision,v={id:version_id,content_json};
 const content=JSON.parse(content_json) as QuizContent;
 return {q,v,revision,content,canEdit:await hasAdminPermission(actor,'quizzes.edit')&&q.owner_id===actor.id&&q.group_id===actor.groupId&&!bank&&(quizBankKind(content)!=='platform'||actor.role==='admin')};
}
export async function quizKeys(versionId:string){const r=await learningDb().prepare('SELECT answers_json FROM quiz_answer_keys WHERE version_id=?').bind(versionId).first<{answers_json:string}>();if(!r)throw new QuizError('quiz.unavailable',503);return JSON.parse(r.answers_json) as QuizKey[];}
function mutationId(v:unknown){if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(v))throw new QuizError('quiz.invalidFields');return v;}
export type QuizCopyRequest={sourceId:string;bank:boolean;title:string|null};
export async function quizCopyReplay(actor:Account,data:Record<string,unknown>,intent:QuizCopyRequest){
 await requireAdminPermission(actor,'quizzes.duplicate');
 const operation=mutationId(data.operationId),id=mutationId(data.id),hash=await operationHash({id,duplicate:intent});
 const prior=await learningDb().prepare('SELECT quiz_id,revision,request_hash,actor_id,group_id FROM quiz_versions WHERE operation_id=?').bind(operation).first<{quiz_id:string;revision:number;request_hash:string;actor_id:string;group_id:string}>();
 if(!prior)return null;if(prior.actor_id!==actor.id||prior.group_id!==actor.groupId||prior.request_hash!==hash)throw new QuizError('quiz.conflict',409);return {id:prior.quiz_id,revision:prior.revision,replayed:true};
}
export const quizAuthority=`EXISTS(SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? AND g.active=1 WHERE a.id=? AND a.role=? AND a.disabled_at IS NULL AND (a.group_id=? OR ?=1) AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=a.id AND c.must_change_password=1) AND (a.role='admin' OR EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=g.id AND t.name=a.teacher_name AND t.active=1)))`;
export function quizAuthorityValues(a:Account){return [a.groupId,a.id,a.role,a.groupId,isOwnerAccount(a)?1:0];}
const authority=quizAuthority,authorityValues=quizAuthorityValues;
export async function saveQuiz(actor:Account,data:Record<string,unknown>,copiedFrom?:{versionId:string;request?:QuizCopyRequest;legacyMetadata?:QuizContent},maintenance=false){
 const db=learningDb(),group=requireGroup(actor.groupId),operation=mutationId(data.operationId),quizId=mutationId(data.id),revision=data.revision as number;
 if(!Number.isSafeInteger(revision)||revision<0)throw new QuizError('quiz.invalidFields');
 const permissionKey=maintenance?'quizzes.import':copiedFrom?'quizzes.duplicate':revision>0?'quizzes.edit':'quizzes.create';
 await requireAdminPermission(actor,permissionKey);
 if(maintenance&&!['teacher','admin'].includes(actor.role)||(data.content as {bankKind?:unknown}|null)?.bankKind==='platform'&&(!maintenance||actor.role!=='admin'))throw new QuizError('quiz.maintenanceOnly',403);
 const checked=checkQuiz(data.content,data.keys),providedSourceKey=data.sourceKey==null?null:typeof data.sourceKey==='string'&&/^[a-f0-9]{64}$/.test(data.sourceKey)?data.sourceKey:(()=>{throw new QuizError('quiz.invalidFields');})();
 const previous=await db.prepare('SELECT q.owner_id,q.group_id,q.revision,q.source_key,q.deleted_at,v.content_json FROM quizzes q LEFT JOIN quiz_versions v ON v.quiz_id=q.id AND v.group_id=q.group_id AND v.revision=q.revision WHERE q.id=?').bind(quizId).first<{owner_id:string;group_id:string;revision:number;source_key:string|null;deleted_at:string|null;content_json:string|null}>();
 if(previous?.deleted_at)throw new QuizError('quiz.notFound',404);
 if(previous&&(previous.owner_id!==actor.id||previous.group_id!==group))throw new QuizError('quiz.notFound',404);
 const academicCatalogue=await readAcademicCatalogue('quiz'),previousContent=previous?.content_json?JSON.parse(previous.content_json) as QuizContent:copiedFrom?.legacyMetadata?{...copiedFrom.legacyMetadata,catalog:null}:null;
 checked.content=checkQuizAcademic(academicCatalogue,checked.content,previousContent,false);
 const sourceKey=providedSourceKey??previous?.source_key??null,previousKind=previous?.content_json?quizBankKind(JSON.parse(previous.content_json)):undefined;
 if(quizWriteForbidden({administrator:actor.role==='admin',teacher:actor.role==='teacher',maintenance,sourceKey:maintenance?providedSourceKey:sourceKey,bankKind:quizBankKind(checked.content),previous:previous?{sourceKey:previous.source_key,bankKind:previousKind||'creator'}:undefined,copied:Boolean(copiedFrom)}))throw new QuizError('quiz.maintenanceOnly',403);
 const hash=await operationHash(copiedFrom?.request?{id:quizId,duplicate:copiedFrom.request}:{id:quizId,revision,content:checked.content,keys:checked.keys,sourceKey,copiedFrom:copiedFrom?.versionId||null});
 const prior=await db.prepare('SELECT quiz_id,revision,request_hash,actor_id,group_id FROM quiz_versions WHERE operation_id=?').bind(operation).first<{quiz_id:string;revision:number;request_hash:string;actor_id:string;group_id:string}>();
 if(prior){if(prior.actor_id!==actor.id||prior.group_id!==group||prior.request_hash!==hash)throw new QuizError('quiz.conflict',409);return {id:prior.quiz_id,revision:prior.revision,replayed:true};}
 checked.content=checkQuizAcademic(academicCatalogue,checked.content,previousContent);
 if(previous?.revision!==revision&&!(revision===0&&!previous))throw new QuizError('quiz.conflict',409);
 if(sourceKey&&!previous){const imported=await db.prepare('SELECT id,revision FROM quizzes WHERE group_id=? AND owner_id=? AND source_key=?').bind(group,actor.id,sourceKey).first();if(imported)return {...imported,existingImport:true};}
 // A file must be owned by the editor, granted by a prior saved version, or
 // explicitly granted by the server-authorised source of a duplicate.
 if(checked.images.length){const allowed=(await db.prepare(`SELECT i.id FROM quiz_images i WHERE i.status='ready' AND i.id IN (SELECT value FROM json_each(?)) AND ((i.group_id=? AND i.owner_id=?) OR EXISTS(SELECT 1 FROM quiz_version_images l JOIN quiz_versions v ON v.id=l.version_id WHERE l.image_id=i.id AND v.quiz_id=? AND v.group_id=?) OR EXISTS(SELECT 1 FROM quiz_version_images l WHERE l.image_id=i.id AND l.version_id=?))`).bind(JSON.stringify(checked.images),group,actor.id,quizId,group,copiedFrom?.versionId||'').all<{id:string}>()).results;if(new Set(allowed.map(x=>x.id)).size!==checked.images.length)throw new QuizError('quiz.invalidImage',403);}
 const sourceGuard=copiedFrom?` AND EXISTS(SELECT 1 FROM quiz_versions sv JOIN quizzes sq ON sq.id=sv.quiz_id JOIN tuition_groups sg ON sg.id=sq.group_id AND sg.active=1 WHERE sv.id=? AND sq.deleted_at IS NULL AND ((sq.group_id=? AND (sq.owner_id=? OR ?='admin')) OR (sv.revision=sq.shared_revision AND (sq.visibility='public' OR sq.visibility='organisation' AND sq.group_id=?))))`:'';
 const sourceValues=copiedFrom?[copiedFrom.versionId,group,actor.id,actor.role,group]:[];
 const maintenanceGuard=maintenance?" AND EXISTS(SELECT 1 FROM accounts ma WHERE ma.id=? AND (ma.role='admin' OR ma.role='teacher' AND ?='creator'))":'',maintenanceValues=maintenance?[actor.id,quizBankKind(checked.content)]:[];
 const versionId=crypto.randomUUID(),now=new Date().toISOString(),c=checked.content,av=authorityValues(actor),statements=[];
 // Topic + difficulty + Set identifies one platform paper. Check both the
 // current and shared immutable versions inside the write transaction so two
 // concurrent imports cannot create ambiguous duplicate Set 1 entries.
 const catalogGuard=c.bankKind==='platform'?" AND NOT EXISTS(SELECT 1 FROM quizzes other JOIN quiz_versions ov ON ov.quiz_id=other.id AND ov.group_id=other.group_id AND ov.revision IN (other.revision,other.shared_revision) WHERE other.deleted_at IS NULL AND other.id<>? AND other.group_id=? AND json_extract(ov.content_json,'$.bankKind')='platform' AND lower(trim(coalesce(json_extract(ov.content_json,'$.exam'),'')))=lower(?) AND lower(trim(json_extract(ov.content_json,'$.subject')))=lower(?) AND json_extract(ov.content_json,'$.difficulty')=? AND json_extract(ov.content_json,'$.catalog.level')=? AND json_extract(ov.content_json,'$.catalog.kind')=? AND json_extract(ov.content_json,'$.catalog.chapterCode')=? AND json_extract(ov.content_json,'$.catalog.subtopicCode')=? AND json_extract(ov.content_json,'$.catalog.setNumber')=?)":'',catalogValues=c.bankKind==='platform'?[quizId,group,c.exam,c.subject,c.difficulty,c.catalog!.level,c.catalog!.kind,c.catalog!.chapterCode,c.catalog!.subtopicCode,c.catalog!.setNumber]:[];
 if(!previous)statements.push(db.prepare(`INSERT INTO quizzes(id,group_id,owner_id,title,source_key,source_version_id,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE ${authority}${sourceGuard}${maintenanceGuard}${catalogGuard}`).bind(quizId,group,actor.id,c.title,sourceKey,copiedFrom?.versionId||null,now,now,...av,...sourceValues,...maintenanceValues,...catalogValues));
 statements.push(db.prepare(`INSERT INTO quiz_versions(id,group_id,quiz_id,revision,content_json,actor_id,operation_id,request_hash,created_at) SELECT ?,?,?,?, ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM quizzes WHERE id=? AND group_id=? AND owner_id=? AND revision=?) AND ${authority}${sourceGuard}${maintenanceGuard}${catalogGuard}`).bind(versionId,group,quizId,revision+1,JSON.stringify(c),actor.id,operation,hash,now,quizId,group,actor.id,revision,...av,...sourceValues,...maintenanceValues,...catalogValues));
 statements.push(db.prepare('INSERT INTO quiz_answer_keys(version_id,group_id,answers_json) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM quiz_versions WHERE id=?)').bind(versionId,group,JSON.stringify(checked.keys),versionId));
 // json_each keeps the statement count constant for large image-based papers.
 statements.push(db.prepare('INSERT INTO quiz_version_images(version_id,image_id,group_id) SELECT ?,value,? FROM json_each(?) WHERE EXISTS(SELECT 1 FROM quiz_versions WHERE id=?)').bind(versionId,group,JSON.stringify(checked.images),versionId));
 statements.push(db.prepare('UPDATE quizzes SET title=?,subject=?,exam=?,year=?,difficulty=?,question_count=?,total_score=?,time_limit_seconds=?,revision=?,updated_at=? WHERE id=? AND group_id=? AND revision=? AND EXISTS(SELECT 1 FROM quiz_versions WHERE id=?)').bind(c.title,c.subject,c.exam,c.year,c.difficulty,c.questions.length,checked.total,c.timeLimitSeconds,revision+1,now,quizId,group,revision,versionId));
 statements.push(db.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,?,NULL,?,? WHERE EXISTS(SELECT 1 FROM quiz_versions WHERE id=?)").bind(group,crypto.randomUUID(),'quiz:'+quizId,actor.id,previous?'quiz.saveDraft':'quiz.create',JSON.stringify({revision:revision+1,questionCount:c.questions.length,sourceVersionId:copiedFrom?.versionId||null}),now,versionId));
 try{const results=await db.batch([...statements,...adminPermissionStatements(actor,permissionKey)]);if(results[previous?0:1].meta.changes!==1)throw new QuizError('quiz.conflict',409);return {id:quizId,revision:revision+1};}
 catch(error){if(adminPermissionFailure(error))throw error;const committed=await db.prepare('SELECT quiz_id,revision,request_hash,actor_id,group_id FROM quiz_versions WHERE operation_id=?').bind(operation).first<{quiz_id:string;revision:number;request_hash:string;actor_id:string;group_id:string}>();if(committed){if(committed.actor_id!==actor.id||committed.group_id!==group||committed.request_hash!==hash)throw new QuizError('quiz.conflict',409);return {id:committed.quiz_id,revision:committed.revision,replayed:true};}if(sourceKey&&!previous){const imported=await db.prepare('SELECT id,revision FROM quizzes WHERE group_id=? AND owner_id=? AND source_key=? AND revision>0').bind(group,actor.id,sourceKey).first();if(imported)return {...imported,existingImport:true};}throw error;}
}
export async function shareQuiz(actor:Account,data:Record<string,unknown>){
 await requireAdminPermission(actor,'quizzes.share');
 const {q,content}=await readQuiz(actor,String(data.id)),scope=data.visibility as QuizVisibility;
 if(quizBankKind(content)==='platform'&&actor.role!=='admin')throw new QuizError('quiz.maintenanceOnly',403);
 if(q.owner_id!==actor.id||q.group_id!==actor.groupId)throw new QuizError('quiz.forbidden',403);
 if(!['private','organisation','public'].includes(scope))throw new QuizError('quiz.invalidFields');
 const now=new Date().toISOString(),op=mutationId(data.operationId),db=learningDb();
 const prior=await db.prepare('SELECT after_json FROM audit WHERE id=? AND group_id=? AND actor_id=? AND action=?').bind('quizshare:'+op,actor.groupId,actor.id,'quiz.visibility').first<{after_json:string}>();
 if(prior){const old=JSON.parse(prior.after_json);if(old.id!==q.id||old.visibility!==scope||old.revision!==Number(data.revision))throw new QuizError('quiz.conflict',409);return {ok:true};}
 if(q.revision!==Number(data.revision))throw new QuizError('quiz.conflict',409);
 try{const result=await db.batch([db.prepare(`UPDATE quizzes SET visibility=?,shared_revision=?,updated_at=? WHERE id=? AND group_id=? AND owner_id=? AND revision=? AND ${authority}`).bind(scope,scope==='private'?null:q.revision,now,q.id,actor.groupId,actor.id,q.revision,...authorityValues(actor)),db.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,'quiz.visibility',NULL,?,? WHERE changes()=1").bind(actor.groupId,'quizshare:'+op,'quiz:'+q.id,actor.id,JSON.stringify({id:q.id,revision:q.revision,visibility:scope}),now),...adminPermissionStatements(actor,'quizzes.share')]);
 if(!result[0].meta.changes)throw new QuizError('quiz.conflict',409);return {ok:true};}
 catch(error){if(adminPermissionFailure(error))throw error;const committed=await db.prepare('SELECT after_json FROM audit WHERE id=? AND group_id=? AND actor_id=? AND action=?').bind('quizshare:'+op,actor.groupId,actor.id,'quiz.visibility').first<{after_json:string}>();if(committed){const old=JSON.parse(committed.after_json);if(old.id!==q.id||old.visibility!==scope||old.revision!==Number(data.revision))throw new QuizError('quiz.conflict',409);return {ok:true,replayed:true};}throw error;}
}
