import {practiceImageAllowed} from '@/lib/quiz-practice';
import {quizActor,quizFailure,quizHeaders,quizResponse,quizRequestBytes,quizAuthority,quizAuthorityValues} from '@/lib/quiz-server';
import {learningDb} from '@/lib/learning-server';
import {pdfBucket,pdfLimits} from '@/lib/pdf-storage';
import {QuizError,quizImageMime} from '@/lib/quiz';
export async function POST(request:Request){try{
 if(new URL(request.url).origin!==request.headers.get('origin'))throw new QuizError('quiz.forbidden',403);
 const actor=await quizActor(),body=await quizRequestBytes(request,5242880+10000,'quiz.imageSize');let form:FormData;try{form=await new Response(body,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();}catch{throw new QuizError('quiz.imageType');}const file=form.get('file');if(!(file instanceof File)||!file.size||file.size>5242880)throw new QuizError('quiz.imageSize',413);
 const bytes=new Uint8Array(await file.arrayBuffer()),mime=quizImageMime(bytes);if(!mime)throw new QuizError('quiz.imageType');
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join(''),db=learningDb(),bucket=pdfBucket();
 const existing=await db.prepare(`SELECT id,status,object_key FROM quiz_images WHERE group_id=? AND owner_id=? AND sha256=? AND ${quizAuthority}`).bind(actor.groupId,actor.id,hash,...quizAuthorityValues(actor)).first<{id:string;status:string;object_key:string}>();
 if(existing?.status==='ready')return quizResponse({id:existing.id,replayed:true});
 const id=existing?.id||crypto.randomUUID(),objectKey=existing?.object_key||'quiz/'+crypto.randomUUID();
 if(!existing){try{const inserted=await db.prepare(`INSERT INTO quiz_images(id,group_id,owner_id,object_key,filename,mime,bytes,sha256,status,created_at) SELECT ?,?,?,?,?,?,?,?,'uploading',? WHERE coalesce((SELECT used_bytes FROM storage_quota WHERE group_id=? AND id=1),0)+(SELECT coalesce(sum(bytes),0) FROM quiz_images WHERE group_id=?)+?<=? AND ${quizAuthority}`).bind(id,actor.groupId,actor.id,objectKey,file.name.replace(/[\r\n]/g,'').slice(0,160),mime,bytes.length,hash,new Date().toISOString(),actor.groupId,actor.groupId,bytes.length,pdfLimits().total,...quizAuthorityValues(actor)).run();if(!inserted.meta.changes){if(!await db.prepare(`SELECT 1 WHERE ${quizAuthority}`).bind(...quizAuthorityValues(actor)).first())throw new QuizError('quiz.forbidden',403);throw new QuizError('quiz.storageFull',409);}}catch(e){if(/UNIQUE constraint/.test(String(e))){const completed=await db.prepare("SELECT id FROM quiz_images WHERE group_id=? AND owner_id=? AND sha256=? AND status='ready'").bind(actor.groupId,actor.id,hash).first<{id:string}>();if(completed)return quizResponse({id:completed.id,replayed:true});throw new QuizError('quiz.uploadBusy',409);}throw e;}}
 // Resumable content-hash uploads: a failed R2 put keeps its reserved row; a
 // retry resumes the same object instead of leaking another quota reservation.
 await bucket.put(objectKey,bytes,{httpMetadata:{contentType:mime}});const ready=await db.prepare(`UPDATE quiz_images SET status='ready' WHERE id=? AND group_id=? AND owner_id=? AND sha256=? AND ${quizAuthority}`).bind(id,actor.groupId,actor.id,hash,...quizAuthorityValues(actor)).run();if(!ready.meta.changes)throw new QuizError('quiz.forbidden',403);return quizResponse({id});
 }catch(e){return quizFailure(e);}}
export async function GET(request:Request){try{
 const actor=await quizActor(true),id=new URL(request.url).searchParams.get('id')||'';if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw new QuizError('quiz.notFound',404);
 let file=await learningDb().prepare(`SELECT i.object_key,i.mime FROM quiz_images i WHERE i.id=? AND i.status='ready' AND ((i.owner_id=? AND i.group_id=? AND ?<>'student') OR EXISTS(SELECT 1 FROM quiz_version_images l JOIN quiz_versions v ON v.id=l.version_id JOIN quizzes q ON q.id=v.quiz_id JOIN tuition_groups g ON g.id=q.group_id AND g.active=1 WHERE l.image_id=i.id AND q.deleted_at IS NULL AND ((q.group_id=? AND (q.owner_id=? OR ?='admin') AND v.revision=q.revision) OR (v.revision=q.shared_revision AND (q.visibility='public' OR q.visibility='organisation' AND q.group_id=?)))))`).bind(id,actor.id,actor.groupId,actor.role,actor.groupId,actor.role==='student'?'':actor.id,actor.role,actor.groupId).first<{object_key:string;mime:string}>();
 if(!file&&await practiceImageAllowed(actor,id))file=await learningDb().prepare("SELECT object_key,mime FROM quiz_images WHERE id=? AND status='ready'").bind(id).first<{object_key:string;mime:string}>();
 if(!file)throw new QuizError('quiz.notFound',404);const object=await pdfBucket().get(file.object_key);if(!object)throw new QuizError('quiz.unavailable',503);
 return new Response(object.body,{headers:{...quizHeaders,'Content-Type':file.mime,'Content-Length':String(object.size),'Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline'}});
 }catch(e){return quizFailure(e);}}
