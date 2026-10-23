import type {Account} from './auth';
import {learningDb} from './learning-server';
import {configuredAdminGrantPredicate} from './admin-permissions-server';
import {accountSessionPredicate} from './account-session';
import {authorityGuard} from './admin-authority';
import {requireGroup} from './group-data';
import {classPlanSubjectSql} from './academic-subject-match';
import {ParentsError,parentText as str,parentPage,parentMonth,parentOperationId,type ParentChild,type ParentPage,type ParentLink,type ParentLesson,type ParentHomework,type ParentMaterial,type ParentRecording} from './parents';

type Predicate={sql:string;args:unknown[]};
const columns='l.id,l.student_id AS studentId,b.student_name AS student,l.active,l.revision,l.updated_at AS updatedAt';
const linkRow=(value:Omit<ParentLink,'active'>&{active:number}):ParentLink=>({...value,active:Boolean(value.active)});
const search=(value:string)=>'%'+value.replace(/[\\%_]/g,'\\$&')+'%';
const queryId=(value:unknown)=>{const id=str(value);if(!id||id.length>200)throw new ParentsError('记录不存在或没有查看权限',404);return id;};
function manager(actor:Account,key:'parents.view'|'parents.manage'):Predicate {if(actor.role!=='admin')throw new ParentsError('没有家长账号管理权限',403);return configuredAdminGrantPredicate(actor,key);}
async function assertPredicate(predicate:Predicate,status=403,message='权限已改变，请刷新后重试'){if(!await learningDb().prepare(`SELECT 1 AS ok WHERE ${predicate.sql}`).bind(...predicate.args).first())throw new ParentsError(message,status);}
export async function requireParentManagement(actor:Account,key:'parents.view'|'parents.manage'='parents.view'){const p=manager(actor,key);await assertPredicate(p);return p;}
function parentIdentity(actor:Account):Predicate {
 if(actor.role!=='parent')throw new ParentsError('此入口仅供家长查看已授权的孩子资料',403);
 const session=accountSessionPredicate(actor);
 return{sql:`EXISTS(SELECT 1 FROM accounts parent_actor JOIN tuition_groups parent_group ON parent_group.id=parent_actor.group_id WHERE parent_actor.id=? AND parent_actor.group_id=? AND parent_actor.role='parent' AND parent_actor.disabled_at IS NULL AND parent_group.active=1 AND NOT EXISTS(SELECT 1 FROM local_credentials c WHERE c.account_id=parent_actor.id AND c.must_change_password=1) AND ${session.sql})`,args:[actor.id,requireGroup(actor.groupId),...session.args]};
}
function childScope(actor:Account,studentId:string,student?:string):Predicate {
 const identity=parentIdentity(actor);
 return{sql:`${identity.sql} AND EXISTS(SELECT 1 FROM parent_child_links parent_link JOIN billing_students parent_student ON parent_student.group_id=parent_link.group_id AND parent_student.id=parent_link.student_id JOIN students parent_roster ON parent_roster.group_id=parent_student.group_id AND parent_roster.name=parent_student.student_name WHERE parent_link.group_id=? AND parent_link.parent_account_id=? AND parent_link.student_id=? AND parent_link.active=1 AND parent_roster.active=1 ${student===undefined?'':'AND parent_student.student_name=?'})`,args:[...identity.args,actor.groupId,actor.id,studentId,...student===undefined?[]:[student]]};
}
async function selectedChild(actor:Account,studentId:string):Promise<ParentChild>{
 const scope=childScope(actor,queryId(studentId));
 const child=await learningDb().prepare(`SELECT b.id AS studentId,b.student_name AS student,s.grade,coalesce((SELECT json_extract(syllabus.value,'$.name') FROM academic_catalogues menu JOIN json_each(menu.content_json,'$.syllabuses') syllabus WHERE menu.scope='student' AND json_extract(syllabus.value,'$.id')=s.syllabus_id LIMIT 1),s.syllabus_id) AS syllabusName FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE b.group_id=? AND b.id=? AND ${scope.sql}`).bind(actor.groupId,studentId,...scope.args).first<ParentChild>();
 if(!child)throw new ParentsError('孩子关联已解除、已停用或没有查看权限',404);return child;
}
async function recheckChild(actor:Account,child:ParentChild){await assertPredicate(childScope(actor,child.studentId,child.student),404,'孩子关联已解除、已停用或没有查看权限');}
export async function parentChildren(actor:Account,params:URLSearchParams){
 const identity=parentIdentity(actor),page=parentPage(params.get('page')),group=requireGroup(actor.groupId);
 await assertPredicate(identity);
 const scope=`l.group_id=? AND l.parent_account_id=? AND l.active=1 AND s.active=1 AND ${identity.sql}`,args=[group,actor.id,...identity.args];
 const count=await learningDb().prepare(`SELECT count(*) AS total FROM parent_child_links l JOIN billing_students b ON b.group_id=l.group_id AND b.id=l.student_id JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE ${scope}`).bind(...args).first<{total:number}>();
 const children=(await learningDb().prepare(`SELECT b.id AS studentId,b.student_name AS student,s.grade,coalesce((SELECT json_extract(syllabus.value,'$.name') FROM academic_catalogues menu JOIN json_each(menu.content_json,'$.syllabuses') syllabus WHERE menu.scope='student' AND json_extract(syllabus.value,'$.id')=s.syllabus_id LIMIT 1),s.syllabus_id) AS syllabusName FROM parent_child_links l JOIN billing_students b ON b.group_id=l.group_id AND b.id=l.student_id JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE ${scope} ORDER BY b.student_name,b.id LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20).all<ParentChild>()).results||[];
 await assertPredicate({sql:`${identity.sql} AND (SELECT count(*) FROM json_each(?) selected_child WHERE EXISTS(SELECT 1 FROM parent_child_links current_link JOIN billing_students current_student ON current_student.group_id=current_link.group_id AND current_student.id=current_link.student_id JOIN students current_roster ON current_roster.group_id=current_student.group_id AND current_roster.name=current_student.student_name WHERE current_link.group_id=? AND current_link.parent_account_id=? AND current_link.active=1 AND current_roster.active=1 AND current_student.id=json_extract(selected_child.value,'$.studentId') AND current_student.student_name=json_extract(selected_child.value,'$.student')))=?`,args:[...identity.args,JSON.stringify(children.map(c=>({studentId:c.studentId,student:c.student}))),group,actor.id,children.length]});
 return{children,page,pages:Math.max(1,Math.ceil((count?.total||0)/20)),total:count?.total||0,pageSize:20,permissions:{readOnly:true,finance:false,grades:false}};
}
async function managedParent(actor:Account,parentId:string,key:'parents.view'|'parents.manage'='parents.view'){
 const guard=await requireParentManagement(actor,key);
 const target=await learningDb().prepare(`SELECT id,name,disabled_at AS disabledAt FROM accounts WHERE id=? AND group_id=? AND role='parent' AND ${guard.sql}`).bind(queryId(parentId),requireGroup(actor.groupId),...guard.args).first<{id:string;name:string;disabledAt:string|null}>();
 if(!target)throw new ParentsError('家长账号不存在或没有查看权限',404);return{parent:{id:target.id,name:target.name,disabled:Boolean(target.disabledAt)},guard};
}
export async function parentLinks(actor:Account,params:URLSearchParams){
 const parentId=queryId(params.get('parentId')),page=parentPage(params.get('page')),{parent,guard}=await managedParent(actor,parentId),group=requireGroup(actor.groupId);
 const scope=`l.group_id=? AND l.parent_account_id=? AND ${guard.sql}`,args=[group,parentId,...guard.args];
 const count=await learningDb().prepare(`SELECT count(*) AS total FROM parent_child_links l WHERE ${scope}`).bind(...args).first<{total:number}>();
 const links=(await learningDb().prepare(`SELECT ${columns} FROM parent_child_links l JOIN billing_students b ON b.group_id=l.group_id AND b.id=l.student_id WHERE ${scope} ORDER BY l.active DESC,b.student_name,l.id LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20).all<Omit<ParentLink,'active'>&{active:number}>()).results||[];
 const mayManage=manager(actor,'parents.manage'),canManage=Boolean(await learningDb().prepare(`SELECT 1 WHERE ${mayManage.sql}`).bind(...mayManage.args).first());
 await managedParent(actor,parentId);
 return{parent,links:links.map(linkRow),canManage,page,pages:Math.max(1,Math.ceil((count?.total||0)/20)),total:count?.total||0,pageSize:20};
}
export async function parentStudentSearch(actor:Account,params:URLSearchParams){
 const parentId=queryId(params.get('parentId')),{guard}=await managedParent(actor,parentId),group=requireGroup(actor.groupId),page=parentPage(params.get('page')),q=str(params.get('q'));
 if(q.length>100)throw new ParentsError('搜索内容最多 100 字');
 const scope=`b.group_id=? AND s.active=1 AND b.student_name LIKE ? ESCAPE '\\' AND ${guard.sql}`,args=[group,search(q),...guard.args];
 const count=await learningDb().prepare(`SELECT count(*) AS total FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE ${scope}`).bind(...args).first<{total:number}>();
 const items=(await learningDb().prepare(`SELECT b.id AS studentId,b.student_name AS student,s.active,coalesce((SELECT l.revision FROM parent_child_links l WHERE l.group_id=b.group_id AND l.student_id=b.id AND l.parent_account_id=?),0) AS linkRevision,coalesce((SELECT l.active FROM parent_child_links l WHERE l.group_id=b.group_id AND l.student_id=b.id AND l.parent_account_id=?),0) AS linked FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE ${scope} ORDER BY b.student_name,b.id LIMIT 20 OFFSET ?`).bind(parentId,parentId,...args,(page-1)*20).all<{studentId:string;student:string;active:number;linkRevision:number;linked:number}>()).results||[];
 await managedParent(actor,parentId);return{items:items.map(i=>({...i,active:Boolean(i.active),linked:Boolean(i.linked)})),page,pages:Math.max(1,Math.ceil((count?.total||0)/20)),total:count?.total||0,pageSize:20};
}
export async function studentParents(actor:Account,params:URLSearchParams){
 const guard=await requireParentManagement(actor),group=requireGroup(actor.groupId),student=queryId(params.get('studentName')||params.get('student')),page=parentPage(params.get('page'));
 const row=await learningDb().prepare(`SELECT id FROM billing_students WHERE group_id=? AND student_name=? AND ${guard.sql}`).bind(group,student,...guard.args).first<{id:string}>();
 if(!row)throw new ParentsError('学生不存在或没有查看权限',404);
 const args=[group,row.id,...guard.args],scope=`l.group_id=? AND l.student_id=? AND a.role='parent' AND a.group_id=l.group_id AND ${guard.sql}`;
 const total=(await learningDb().prepare(`SELECT count(*) AS total FROM parent_child_links l JOIN accounts a ON a.id=l.parent_account_id WHERE ${scope}`).bind(...args).first<{total:number}>())?.total||0;
 const parents=(await learningDb().prepare(`SELECT a.id,a.name,l.active,a.disabled_at AS disabledAt FROM parent_child_links l JOIN accounts a ON a.id=l.parent_account_id WHERE ${scope} ORDER BY l.active DESC,a.name,a.id LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20).all<{id:string;name:string;active:number;disabledAt:string|null}>()).results||[];
 const manage=manager(actor,'parents.manage'),canManage=Boolean(await learningDb().prepare(`SELECT 1 WHERE ${manage.sql}`).bind(...manage.args).first());
 await assertPredicate(guard);return{student,parents:parents.map(p=>({id:p.id,name:p.name,active:Boolean(p.active),disabled:Boolean(p.disabledAt)})),canManage,page,pages:Math.max(1,Math.ceil(total/20)),total,pageSize:20};
}
async function hash(value:unknown){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
export async function saveParentLink(actor:Account,data:Record<string,unknown>){
 const action=str(data.action);if(!['grant','revoke'].includes(action))throw new ParentsError('家长关联操作无效');
 if('groupId' in data&&data.groupId!==actor.groupId)throw new ParentsError('没有跨集团操作权限',403);
 const parentId=queryId(data.parentId),studentId=queryId(data.studentId),operation=parentOperationId(data.operationId),reason=str(data.reason),revision=Number(data.revision),group=requireGroup(actor.groupId);
 if(!Number.isSafeInteger(revision)||revision<0)throw new ParentsError('关联资料已更新，请刷新后重试',409);
 if(reason.length<2||reason.length>500)throw new ParentsError('请填写 2 至 500 字的核实或解除原因');
 if(action==='grant'&&data.verified!==true)throw new ParentsError('请先确认已核实家长与孩子的关系');
 const {guard}=await managedParent(actor,parentId,'parents.manage'),requestHash=await hash({action,parentId,studentId,revision,reason,verified:action==='grant'});
 const replay=await learningDb().prepare(`SELECT actor_id AS actorId,request_hash AS requestHash,result_json AS resultJson FROM parent_operations WHERE group_id=? AND operation_id=? AND ${guard.sql}`).bind(group,operation,...guard.args).first<{actorId:string;requestHash:string;resultJson:string}>();
 if(replay){if(replay.actorId!==actor.id||replay.requestHash!==requestHash)throw new ParentsError('操作标识已被使用，请刷新后重试',409);return JSON.parse(replay.resultJson);}
 const child=await learningDb().prepare(`SELECT b.student_name AS student,s.active FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE b.id=? AND b.group_id=? AND ${guard.sql}`).bind(studentId,group,...guard.args).first<{student:string;active:number}>();
 if(!child)throw new ParentsError('学生不存在或没有查看权限',404);
 const existing=await learningDb().prepare(`SELECT id,active,revision FROM parent_child_links WHERE group_id=? AND parent_account_id=? AND student_id=? AND ${guard.sql}`).bind(group,parentId,studentId,...guard.args).first<{id:string;active:number;revision:number}>();
 if((existing?.revision||0)!==revision||existing?.active===(action==='grant'?1:0)||!existing&&action==='revoke')throw new ParentsError('关联资料已更新，请刷新后重试',409);
 const now=new Date().toISOString(),id=existing?.id||crypto.randomUUID(),execution=crypto.randomUUID(),active=action==='grant'?1:0;
 const result={ok:true,link:{id,studentId,student:child.student,active:Boolean(active),revision:revision+1,updatedAt:now}};
 const target:Predicate={sql:`EXISTS(SELECT 1 FROM accounts target WHERE target.id=? AND target.group_id=? AND target.role='parent' ${active?'AND target.disabled_at IS NULL':''}) AND EXISTS(SELECT 1 FROM billing_students b JOIN students s ON s.group_id=b.group_id AND s.name=b.student_name WHERE b.group_id=? AND b.id=? AND b.student_name=? ${active?'AND s.active=1':''}) AND coalesce((SELECT revision FROM parent_child_links WHERE group_id=? AND parent_account_id=? AND student_id=?),0)=?`,args:[parentId,group,group,studentId,child.student,group,parentId,studentId,revision]};
 const claim=`EXISTS(SELECT 1 FROM parent_operations WHERE group_id=? AND operation_id=? AND execution_id=?)`,claimArgs=[group,operation,execution];
 try{
  const db=learningDb();await db.batch([
   authorityGuard(guard,'parents_authority_changed'),authorityGuard(target,'parents_link_changed'),
   db.prepare('INSERT INTO parent_operations(group_id,operation_id,actor_id,request_hash,execution_id,result_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(group,operation,actor.id,requestHash,execution,JSON.stringify(result),now),
   existing?db.prepare(`UPDATE parent_child_links SET active=?,revision=revision+1,updated_by=?,updated_at=?,operation_id=?,reason=? WHERE group_id=? AND id=? AND revision=? AND ${claim}`).bind(active,actor.id,now,operation,reason,group,id,revision,...claimArgs):db.prepare(`INSERT INTO parent_child_links(id,group_id,parent_account_id,student_id,active,revision,updated_by,updated_at,operation_id,reason) SELECT ?,?,?,?,?,1,?,?,?,? WHERE ${claim}`).bind(id,group,parentId,studentId,active,actor.id,now,operation,reason,...claimArgs),
   authorityGuard({sql:'EXISTS(SELECT 1 FROM parent_child_links WHERE group_id=? AND id=? AND revision=? AND operation_id=?)',args:[group,id,revision+1,operation]},'parents_link_changed'),
   db.prepare(`INSERT INTO audit(id,group_id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?, ?,?,?,? WHERE ${claim}`).bind(crypto.randomUUID(),group,'parent:'+parentId,actor.id,'parents.'+action,existing?JSON.stringify({studentId,active:Boolean(existing.active),revision}):null,JSON.stringify({...result.link,reason}),now,...claimArgs),
  ]);
 }catch(error){
  if(/parents_authority_changed/.test(String(error)))throw new ParentsError('家长管理权限已改变，请刷新后重试',403);
  if(/parents_link_changed|parent_link_|UNIQUE constraint/.test(String(error)))throw new ParentsError('关联资料已更新，请刷新后重试',409);
  throw error;
 }
 return result;
}
/** Apply exactly the child's current classroom and subject assignment, never a parent's identity. */
function classroomAccess(alias:string){return`(${alias}.classroom_id IS NULL OR EXISTS(SELECT 1 FROM classroom_members cm JOIN classrooms c ON c.group_id=cm.group_id AND c.id=cm.classroom_id JOIN students s ON s.group_id=cm.group_id AND s.name=cm.student_name AND s.active=1 JOIN plans p ON p.group_id=cm.group_id AND p.student=cm.student_name AND p.teacher_name=c.teacher_name AND p.active=1 AND ${classPlanSubjectSql('p','c','s')} JOIN teachers t ON t.group_id=c.group_id AND t.name=c.teacher_name AND t.active=1 WHERE cm.group_id=${alias}.group_id AND cm.classroom_id=${alias}.classroom_id AND cm.student_name=?))`;}
async function paged<T>(select:string,from:string,where:string,args:unknown[],page:number,order:string):Promise<ParentPage<T>>{
 const total=(await learningDb().prepare(`SELECT count(*) AS total ${from} WHERE ${where}`).bind(...args).first<{total:number}>())?.total||0;
 const items=(await learningDb().prepare(`SELECT ${select} ${from} WHERE ${where} ORDER BY ${order} LIMIT 20 OFFSET ?`).bind(...args,(page-1)*20).all<T>()).results||[];
 return{items,page,pages:Math.max(1,Math.ceil(total/20)),total,pageSize:20};
}
async function lessonsFor(actor:Account,child:ParentChild,params:URLSearchParams):Promise<ParentPage<ParentLesson>>{
 const scope=childScope(actor,child.studentId,child.student),month=parentMonth(params.get('month'));
 return paged<ParentLesson>(`l.id,l.subject,l.teacher_name AS teacherName,c.title AS classroomTitle,l.planned_start AS plannedStart,l.planned_end AS plannedEnd,l.status,coalesce(p.attendance_status,'pending') AS attendanceStatus,p.arrived_at AS arrivedAt,p.left_at AS leftAt`,`FROM lessons l LEFT JOIN class_sessions cs ON cs.id=l.session_id AND cs.group_id=l.group_id LEFT JOIN classrooms c ON c.id=cs.classroom_id AND c.group_id=l.group_id LEFT JOIN class_session_participants p ON p.lesson_id=l.id AND p.group_id=l.group_id AND p.student_name=l.student`,`l.group_id=? AND l.student=? AND substr(datetime(l.planned_start,'+8 hours'),1,7)=? AND ${scope.sql}`,[actor.groupId,child.student,month,...scope.args],parentPage(params.get('page')),'l.planned_start,l.id');
}
async function homeworkFor(actor:Account,child:ParentChild,params:URLSearchParams):Promise<ParentPage<ParentHomework>>{
 const scope=childScope(actor,child.studentId,child.student),month=parentMonth(params.get('month'));
 const result=await paged<Omit<ParentHomework,'completed'|'attachmentUrl'>&{attachmentId:string|null;completed:number}>(`h.id,h.title,h.description,h.subject,h.due_at AS dueAt,h.starts_at AS startsAt,h.attachment_file_id AS attachmentId,EXISTS(SELECT 1 FROM homework_submissions sub WHERE sub.group_id=h.group_id AND sub.homework_id=h.id AND sub.student_name=r.student_name) AS completed,(SELECT max(sub.submitted_at) FROM homework_submissions sub WHERE sub.group_id=h.group_id AND sub.homework_id=h.id AND sub.student_name=r.student_name) AS submittedAt`,`FROM homework h JOIN homework_recipients r ON r.group_id=h.group_id AND r.homework_id=h.id`,`h.group_id=? AND r.student_name=? AND h.starts_at<=? AND substr(datetime(h.due_at,'+8 hours'),1,7)=? AND ${classroomAccess('h')} AND ${scope.sql}`,[actor.groupId,child.student,new Date().toISOString(),month,child.student,...scope.args],parentPage(params.get('page')),'h.due_at,h.id');
 return{...result,items:result.items.map(({attachmentId,completed,...item})=>({...item,completed:Boolean(completed),attachmentUrl:attachmentId?fileUrl(child.studentId,attachmentId):null}))};
}
function fileUrl(studentId:string,id:string){return'/api/parents/files/'+encodeURIComponent(id)+'?studentId='+encodeURIComponent(studentId);}
async function materialsFor(actor:Account,child:ParentChild,params:URLSearchParams):Promise<ParentPage<ParentMaterial>>{
 const scope=childScope(actor,child.studentId,child.student);
 const result=await paged<Omit<ParentMaterial,'fileUrl'>&{fileId:string}>(`m.id,m.title,m.description,r.subject,m.created_at AS createdAt,m.file_id AS fileId`,`FROM teaching_materials m JOIN material_recipients r ON r.group_id=m.group_id AND r.material_id=m.id JOIN pdf_files f ON f.group_id=m.group_id AND f.id=m.file_id AND f.status='attached'`,`m.group_id=? AND r.student_name=? AND ${classroomAccess('m')} AND ${scope.sql}`,[actor.groupId,child.student,child.student,...scope.args],parentPage(params.get('page')),'m.created_at DESC,m.id DESC');
 return{...result,items:result.items.map(({fileId,...item})=>({...item,fileUrl:fileUrl(child.studentId,fileId)}))};
}
function recordingAudience(){return`r.status='published' AND EXISTS(SELECT 1 FROM classroom_members member WHERE member.group_id=r.group_id AND member.classroom_id=r.classroom_id AND member.student_name=?) AND (r.audience_mode='classroom' OR EXISTS(SELECT 1 FROM recording_recipients recipient WHERE recipient.group_id=r.group_id AND recipient.recording_id=r.id AND recipient.student_name=?))`;}
async function recordingsFor(actor:Account,child:ParentChild,params:URLSearchParams):Promise<ParentPage<ParentRecording>>{
 const scope=childScope(actor,child.studentId,child.student);
 const result=await paged<Omit<ParentRecording,'openUrl'>>(`r.id,r.title,r.description,c.subject,c.title AS classroomTitle,r.lesson_date AS lessonDate`,`FROM class_recordings r JOIN classrooms c ON c.group_id=r.group_id AND c.id=r.classroom_id`,`r.group_id=? AND ${recordingAudience()} AND ${scope.sql}`,[actor.groupId,child.student,child.student,...scope.args],parentPage(params.get('page')),'r.lesson_date DESC,r.created_at DESC,r.id DESC');
 return{...result,items:result.items.map(item=>({...item,openUrl:'/api/parents/recordings/'+encodeURIComponent(item.id)+'?studentId='+encodeURIComponent(child.studentId)}))};
}
export async function parentChildView(actor:Account,params:URLSearchParams){
 const child=await selectedChild(actor,queryId(params.get('studentId'))),view=str(params.get('view')),month=parentMonth(params.get('month'));
 let result:unknown;
 if(view==='lessons')result={child,month,...await lessonsFor(actor,child,params)};
 else if(view==='homework')result={child,month,...await homeworkFor(actor,child,params)};
 else if(view==='materials')result={child,...await materialsFor(actor,child,params)};
 else if(view==='recordings')result={child,...await recordingsFor(actor,child,params)};
 else {const[lessons,homework]=await Promise.all([lessonsFor(actor,child,params),homeworkFor(actor,child,params)]);result={child,month,lessons,homework};}
 await recheckChild(actor,child);return result;
}
export async function parentFile(actor:Account,studentId:string,fileId:string){
 const child=await selectedChild(actor,queryId(studentId)),scope=childScope(actor,child.studentId,child.student);
 const file=await learningDb().prepare(`SELECT f.id,f.object_key AS objectKey,f.filename,f.bytes FROM pdf_files f WHERE f.group_id=? AND f.id=? AND f.status='attached' AND ${scope.sql} AND (EXISTS(SELECT 1 FROM homework h JOIN homework_recipients r ON r.group_id=h.group_id AND r.homework_id=h.id WHERE h.group_id=f.group_id AND h.attachment_file_id=f.id AND r.student_name=? AND h.starts_at<=? AND ${classroomAccess('h')}) OR EXISTS(SELECT 1 FROM teaching_materials m JOIN material_recipients r ON r.group_id=m.group_id AND r.material_id=m.id WHERE m.group_id=f.group_id AND m.file_id=f.id AND r.student_name=? AND ${classroomAccess('m')}))`).bind(actor.groupId,queryId(fileId),...scope.args,child.student,new Date().toISOString(),child.student,child.student,child.student).first<{id:string;objectKey:string;filename:string;bytes:number}>();
 if(!file)throw new ParentsError('文件不存在或没有查看权限',404);
 return{file,recheck:async()=>{await parentFile(actor,studentId,fileId);}};
}
export async function parentRecording(actor:Account,studentId:string,id:string){
 const child=await selectedChild(actor,queryId(studentId)),scope=childScope(actor,child.studentId,child.student);
 const recording=await learningDb().prepare(`SELECT r.drive_url AS driveUrl FROM class_recordings r JOIN classrooms c ON c.group_id=r.group_id AND c.id=r.classroom_id WHERE r.group_id=? AND r.id=? AND ${recordingAudience()} AND ${scope.sql}`).bind(actor.groupId,queryId(id),child.student,child.student,...scope.args).first<{driveUrl:string}>();
 if(!recording)throw new ParentsError('录影不存在或没有查看权限',404);
 // The stored value must still be a valid Drive URL, including after a restore.
 const url=new URL(recording.driveUrl);if(url.protocol!=='https:'||url.hostname!=='drive.google.com'||url.username||url.password||url.port)throw new ParentsError('录影链接无效',503);
 await recheckChild(actor,child);return url.toString();
}
