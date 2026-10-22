import type {Account} from './auth';
import {learningDb} from './learning-server';
import {requireGroup} from './group-data';
import {OWNER_EMAIL} from './owner';
import {accountSessionPredicate} from './account-session';
import {adminPermissionPredicate,requireAdminPermission,hasAdminPermission} from './admin-permission-access';
import {operationHash,operationId} from './learning-operations';
import {RecordingError,recordingText as str,recordingDate,recordingDriveUrl,recordingStudents,recordingCursor,type Recording} from './recordings';

type Grant='recordings.view'|'recordings.create'|'recordings.edit'|'recordings.delete';
type Sql={sql:string;args:unknown[]};
type Stored=Omit<Recording,'canEdit'|'canDelete'>;
const columns=`r.id,r.classroom_id AS classroomId,c.title AS classroomTitle,c.subject,c.teacher_name AS teacherName,r.session_id AS sessionId,r.lesson_date AS lessonDate,r.title,r.description,r.drive_url AS driveUrl,r.status,r.audience_mode AS audienceMode,r.revision,r.created_at AS createdAt,r.updated_at AS updatedAt,r.created_by AS createdBy,(SELECT count(*) FROM recording_recipients rr WHERE rr.group_id=r.group_id AND rr.recording_id=r.id) AS recipientCount`;
function authority(actor:Account,key:Grant):Sql{
 const group=requireGroup(actor.groupId),session=accountSessionPredicate(actor),permission=adminPermissionPredicate(actor,key);
 return{sql:`EXISTS(SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? WHERE a.id=? AND a.role=? AND a.disabled_at IS NULL AND g.active=1
 AND (a.group_id=g.id OR a.role='admin' AND lower(trim(a.email))=? AND substr(a.id,1,6)<>'local:')
 AND NOT EXISTS(SELECT 1 FROM local_credentials lc WHERE lc.account_id=a.id AND lc.must_change_password=1)
 AND (a.role='admin' OR a.role='teacher' AND a.teacher_name=? AND EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=g.id AND t.name=a.teacher_name AND t.active=1) OR a.role='student' AND a.student_name=? AND EXISTS(SELECT 1 FROM students s WHERE s.group_id=g.id AND s.name=a.student_name AND s.active=1))) AND ${session.sql} AND ${permission.sql}`,
 args:[group,actor.id,actor.role,OWNER_EMAIL,actor.teacherName||'',actor.studentName||'',...session.args,...permission.args]};
}
async function requireAccess(actor:Account,key:Grant){
 if(!['admin','teacher','student'].includes(actor.role)||key!=='recordings.view'&&actor.role==='student')throw new RecordingError('没有课堂录影操作权限',403);
 if(actor.role==='admin')await requireAdminPermission(actor,key);
 const guard=authority(actor,key);if(!await learningDb().prepare(`SELECT 1 AS ok WHERE ${guard.sql}`).bind(...guard.args).first())throw new RecordingError('没有课堂录影操作权限',403);
 return requireGroup(actor.groupId);
}
function visibility(actor:Account):Sql{
 if(actor.role==='teacher')return{sql:'c.teacher_name=?',args:[actor.teacherName||'']};
 if(actor.role==='student')return{sql:`r.status='published' AND (r.audience_mode='classroom' OR EXISTS(SELECT 1 FROM recording_recipients recipient WHERE recipient.group_id=r.group_id AND recipient.recording_id=r.id AND recipient.student_name=?)) AND EXISTS(SELECT 1 FROM classroom_members member WHERE member.group_id=c.group_id AND member.classroom_id=c.id AND member.student_name=?)`,args:[actor.studentName||'',actor.studentName||'']};
 return{sql:'1',args:[]};
}
async function can(actor:Account,key:Grant){return actor.role==='admin'?hasAdminPermission(actor,key):actor.role==='teacher';}
async function present(actor:Account,item:Stored,permissions?:{canEdit:boolean;canDelete:boolean}):Promise<Recording>{
 const own=actor.role==='admin'||actor.role==='teacher'&&item.createdBy===actor.id&&item.teacherName===actor.teacherName;
 return{...item,recipientCount:actor.role==='student'?0:item.recipientCount,canEdit:own&&(permissions?.canEdit??await can(actor,'recordings.edit')),canDelete:own&&(permissions?.canDelete??await can(actor,'recordings.delete'))};
}
async function stored(actor:Account,id:string){
 const group=await requireAccess(actor,'recordings.view'),scope=visibility(actor),guard=authority(actor,'recordings.view');
 const item=await learningDb().prepare(`SELECT ${columns} FROM class_recordings r JOIN classrooms c ON c.group_id=r.group_id AND c.id=r.classroom_id WHERE r.group_id=? AND r.id=? AND ${scope.sql} AND ${guard.sql}`).bind(group,id,...scope.args,...guard.args).first<Stored>();
 if(!item)throw new RecordingError('录影不存在或没有查看权限',404);return item;
}
export async function recordingDetail(actor:Account,id:string){
 const item=await present(actor,await stored(actor,id));
 if(actor.role!=='student'){
  const scope=visibility(actor),guard=authority(actor,'recordings.view');
  item.students=(await learningDb().prepare(`SELECT rr.student_name AS name FROM recording_recipients rr JOIN class_recordings r ON r.group_id=rr.group_id AND r.id=rr.recording_id JOIN classrooms c ON c.group_id=r.group_id AND c.id=r.classroom_id WHERE rr.group_id=? AND rr.recording_id=? AND ${scope.sql} AND ${guard.sql} ORDER BY rr.student_name`).bind(requireGroup(actor.groupId),id,...scope.args,...guard.args).all<{name:string}>()).results?.map(r=>r.name)||[];
 }
 return{recording:item};
}
export async function listRecordings(actor:Account,params:URLSearchParams){
 const group=await requireAccess(actor,'recordings.view'),scope=visibility(actor),guard=authority(actor,'recordings.view'),where=['r.group_id=?',scope.sql,guard.sql],args:unknown[]=[group,...scope.args,...guard.args];
 const classId=str(params.get('classroomId')),subject=str(params.get('subject')),month=str(params.get('month')),q=str(params.get('q')),status=str(params.get('status'));
 if(classId){where.push('r.classroom_id=?');args.push(classId);}if(subject){where.push('c.subject=?');args.push(subject);}
 if(month){if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))throw new RecordingError('请选择有效月份');where.push('substr(r.lesson_date,1,7)=?');args.push(month);}
 if(q){if(q.length>120)throw new RecordingError('搜索内容最多 120 字');where.push("r.title LIKE ? ESCAPE '\\'");args.push('%'+q.replace(/[\\%_]/g,'\\$&')+'%');}
 if(status){if(!['draft','published'].includes(status))throw new RecordingError('录影状态无效');where.push('r.status=?');args.push(status);}
 const cursor=recordingCursor(params.get('cursor'));if(cursor){where.push('(r.lesson_date,r.created_at,r.id)<(?,?,?)');args.push(...cursor);}
 const result=(await learningDb().prepare(`SELECT ${columns} FROM class_recordings r JOIN classrooms c ON c.id=r.classroom_id AND c.group_id=r.group_id WHERE ${where.join(' AND ')} ORDER BY r.lesson_date DESC,r.created_at DESC,r.id DESC LIMIT 25`).bind(...args).all<Stored>()).results||[];
 const permissions={canEdit:await can(actor,'recordings.edit'),canDelete:await can(actor,'recordings.delete')},page=result.slice(0,24),last=page.at(-1);
 return{recordings:await Promise.all(page.map(r=>present(actor,r,permissions))),nextCursor:result.length>24&&last?btoa(JSON.stringify([last.lessonDate,last.createdAt,last.id])):null};
}
export async function recordingContext(actor:Account,params:URLSearchParams){
 const group=await requireAccess(actor,'recordings.view'),guard=authority(actor,'recordings.view');
 const scope=actor.role==='teacher'?{sql:'c.teacher_name=?',args:[actor.teacherName||'']}:actor.role==='student'?{sql:'EXISTS(SELECT 1 FROM classroom_members m WHERE m.group_id=c.group_id AND m.classroom_id=c.id AND m.student_name=?)',args:[actor.studentName||'']}:{sql:'1',args:[]};
 const classrooms=(await learningDb().prepare(`SELECT c.id,c.title,c.subject,c.teacher_name AS teacherName,c.archived FROM classrooms c WHERE c.group_id=? AND ${scope.sql} AND ${guard.sql} ORDER BY c.archived,c.title LIMIT 501`).bind(group,...scope.args,...guard.args).all<{id:string;title:string;subject:string;teacherName:string;archived:number}>()).results||[];
 const id=str(params.get('classroomId')),selected=classrooms.find(c=>c.id===id);if(id&&!selected)throw new RecordingError('班级不存在或没有查看权限',404);
 let students:string[]=[],sessions:{id:string;plannedStart:string;plannedEnd:string;title:string}[]=[];
 if(selected&&actor.role!=='student'){
  students=(await learningDb().prepare(`SELECT DISTINCT m.student_name AS name FROM classroom_members m JOIN students s ON s.group_id=m.group_id AND s.name=m.student_name AND s.active=1 JOIN classrooms c ON c.group_id=m.group_id AND c.id=m.classroom_id WHERE m.group_id=? AND m.classroom_id=? AND ${scope.sql} AND ${guard.sql} ORDER BY m.student_name`).bind(group,id,...scope.args,...guard.args).all<{name:string}>()).results?.map(r=>r.name)||[];
  let month=str(params.get('month'));if(!month)month=new Date(Date.now()+8*3600000).toISOString().slice(0,7);
  if(!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))throw new RecordingError('请选择有效月份');
  sessions=(await learningDb().prepare(`SELECT cs.id,cs.planned_start AS plannedStart,cs.planned_end AS plannedEnd,coalesce(cs.classroom_title,cs.subject) AS title FROM class_sessions cs JOIN classrooms c ON c.group_id=cs.group_id AND c.id=cs.classroom_id WHERE cs.group_id=? AND cs.classroom_id=? AND cs.status<>'cancelled' AND substr(datetime(cs.planned_start,'+8 hours'),1,7)=? AND ${scope.sql} AND ${guard.sql} ORDER BY cs.planned_start DESC LIMIT 300`).bind(group,id,month,...scope.args,...guard.args).all<{id:string;plannedStart:string;plannedEnd:string;title:string}>()).results||[];
 }
 return{classrooms:classrooms.slice(0,500),classroomsTruncated:classrooms.length>500,students,sessions,permissions:{canCreate:await can(actor,'recordings.create'),canEdit:await can(actor,'recordings.edit'),canDelete:await can(actor,'recordings.delete')}};
}
async function activeMembers(group:string,classId:string){return(await learningDb().prepare('SELECT DISTINCT m.student_name AS name FROM classroom_members m JOIN students s ON s.group_id=m.group_id AND s.name=m.student_name AND s.active=1 WHERE m.group_id=? AND m.classroom_id=? ORDER BY m.student_name').bind(group,classId).all<{name:string}>()).results?.map(r=>r.name)||[];}
async function replay(group:string,actor:Account,op:string,hash:string){
 const row=await learningDb().prepare('SELECT actor_id AS actorId,request_hash AS requestHash,result_json AS resultJson FROM recording_operations WHERE group_id=? AND operation_id=?').bind(group,op).first<{actorId:string;requestHash:string;resultJson:string}>();
 if(!row)return null;if(row.actorId!==actor.id||row.requestHash!==hash)throw new RecordingError('操作标识已被使用，请刷新后重试',409);return JSON.parse(row.resultJson);
}
export async function saveRecording(actor:Account,data:Record<string,unknown>){
 const action=str(data.action),id=str(data.id),key:Grant=action==='delete'?'recordings.delete':id?'recordings.edit':'recordings.create';
 if(!['save','delete'].includes(action)||action==='delete'&&!id)throw new RecordingError('未知录影操作');
 const group=await requireAccess(actor,key);if('groupId'in data&&data.groupId!==group)throw new RecordingError('没有其他集团的操作权限',403);
 let op:string;try{op=operationId(data.operationId);}catch{throw new RecordingError('操作标识已失效，请重新打开窗口',409);}
 const hash=await operationHash(data),previous=await replay(group,actor,op,hash);if(previous)return previous;
 const existing=id?await stored(actor,id):null,expected=existing?Number(data.revision):0;
 if(existing&&(!Number.isInteger(expected)||expected!==existing.revision))throw new RecordingError('录影已被修改，请刷新后重试',409);
 if(existing&&actor.role==='teacher'&&existing.createdBy!==actor.id)throw new RecordingError('只能修改自己发布的课堂录影',403);
 const db=learningDb(),now=new Date().toISOString(),newId=id||crypto.randomUUID(),revision=expected+1,execution=crypto.randomUUID(),auth=authority(actor,key);
 const claim={sql:'EXISTS(SELECT 1 FROM recording_operations WHERE group_id=? AND operation_id=? AND execution_id=?)',args:[group,op,execution]};
 const conditions=[auth.sql],conditionArgs:unknown[]=[...auth.args];
 if(existing){conditions.push("EXISTS(SELECT 1 FROM class_recordings old JOIN classrooms old_class ON old_class.group_id=old.group_id AND old_class.id=old.classroom_id WHERE old.group_id=? AND old.id=? AND old.revision=? AND (?='admin' OR old.created_by=? AND old_class.teacher_name=?))");conditionArgs.push(group,id,expected,actor.role,actor.id,actor.teacherName||'');}
 const result={ok:true,id:newId,revision,...action==='delete'?{deleted:true}:{}};
 const mutations:D1PreparedStatement[]=[];
 if(action==='delete'){
  mutations.push(db.prepare(`DELETE FROM class_recordings WHERE group_id=? AND id=? AND revision=? AND ${claim.sql}`).bind(group,id,expected,...claim.args));
 }else{
  const classroomId=str(data.classroomId),title=str(data.title),description=str(data.description),sessionId=str(data.sessionId)||null,lessonDate=recordingDate(data.lessonDate),driveUrl=recordingDriveUrl(data.driveUrl),status=str(data.status),audienceMode='audienceMode'in data?str(data.audienceMode):existing?.audienceMode||'classroom';
  if(!title||title.length>200||description.length>4000)throw new RecordingError('请输入录影标题（最多 200 字），说明最多 4000 字');
  if(!['draft','published'].includes(status))throw new RecordingError('请选择草稿或已发布状态');
  if(!['classroom','selected'].includes(audienceMode))throw new RecordingError('请选择全班或指定学生');
  const classroom=await db.prepare('SELECT id,teacher_name AS teacherName,archived FROM classrooms WHERE group_id=? AND id=?').bind(group,classroomId).first<{id:string;teacherName:string;archived:number}>();
  if(!classroom||actor.role==='teacher'&&classroom.teacherName!==actor.teacherName)throw new RecordingError('班级不存在或没有管理权限',404);
  if(classroom.archived)throw new RecordingError('已封存班级不能新增或修改录影',409);
  if(sessionId&&!await db.prepare("SELECT 1 FROM class_sessions WHERE group_id=? AND id=? AND classroom_id=? AND status<>'cancelled' AND date(planned_start,'+8 hours')=?").bind(group,sessionId,classroomId,lessonDate).first())throw new RecordingError('所选课次与班级或上课日期不一致');
  const members=await activeMembers(group,classroomId);
  const oldStudents=existing?(await db.prepare('SELECT student_name AS name FROM recording_recipients WHERE group_id=? AND recording_id=?').bind(group,id).all<{name:string}>()).results?.map(r=>r.name)||[]:[];
  const selected=audienceMode==='classroom'?[]:'students'in data?recordingStudents(data.students):!existing||existing.classroomId!==classroomId||existing.status==='draft'&&status==='published'&&!oldStudents.length?members:oldStudents;
  if(selected.length>500||selected.some(name=>!members.includes(name)))throw new RecordingError('只能分配给当前班级内的有效学生');
  if(status==='published'&&audienceMode==='selected'&&!selected.length)throw new RecordingError('发布前请至少选择一位班级学生');
  conditions.push("EXISTS(SELECT 1 FROM classrooms c WHERE c.group_id=? AND c.id=? AND c.archived=0 AND (?='admin' OR c.teacher_name=?))");conditionArgs.push(group,classroomId,actor.role,actor.teacherName||'');
  if(sessionId){conditions.push("EXISTS(SELECT 1 FROM class_sessions WHERE group_id=? AND id=? AND classroom_id=? AND status<>'cancelled' AND date(planned_start,'+8 hours')=?)");conditionArgs.push(group,sessionId,classroomId,lessonDate);}
  // One JSON parameter covers the recipient set without exceeding D1's parameter limit.
  conditions.push('NOT EXISTS(SELECT 1 FROM json_each(?) selected WHERE NOT EXISTS(SELECT 1 FROM classroom_members m JOIN students s ON s.group_id=m.group_id AND s.name=m.student_name AND s.active=1 WHERE m.group_id=? AND m.classroom_id=? AND m.student_name=selected.value))');conditionArgs.push(JSON.stringify(selected),group,classroomId);
  if(existing)mutations.push(db.prepare(`UPDATE class_recordings SET classroom_id=?,session_id=?,title=?,description=?,drive_url=?,lesson_date=?,status=?,audience_mode=?,revision=?,updated_at=? WHERE group_id=? AND id=? AND revision=? AND ${claim.sql}`).bind(classroomId,sessionId,title,description,driveUrl,lessonDate,status,audienceMode,revision,now,group,id,expected,...claim.args));
  else mutations.push(db.prepare(`INSERT INTO class_recordings(id,group_id,classroom_id,session_id,title,description,drive_url,lesson_date,status,audience_mode,revision,created_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,1,?,?,? WHERE ${claim.sql}`).bind(newId,group,classroomId,sessionId,title,description,driveUrl,lessonDate,status,audienceMode,actor.id,now,now,...claim.args));
  mutations.push(db.prepare(`DELETE FROM recording_recipients WHERE group_id=? AND recording_id=? AND ${claim.sql}`).bind(group,newId,...claim.args));
  mutations.push(db.prepare(`INSERT INTO recording_recipients(group_id,recording_id,student_name) SELECT ?,?,value FROM json_each(?) WHERE ${claim.sql}`).bind(group,newId,JSON.stringify(selected),...claim.args));
 }
 const claimStatement=db.prepare(`INSERT OR IGNORE INTO recording_operations(group_id,operation_id,actor_id,request_hash,execution_id,result_json,created_at) SELECT ?,?,?,?,?,?,? WHERE ${conditions.join(' AND ')}`).bind(group,op,actor.id,hash,execution,JSON.stringify(result),now,...conditionArgs);
 const audit=db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,?,?,?,?,? WHERE ${claim.sql}`).bind(group,crypto.randomUUID(),'recording:'+newId,actor.id,'recordings.'+action,JSON.stringify({id:newId,revision,status:action==='delete'?'deleted':data.status}),now,...claim.args);
 await db.batch([claimStatement,...mutations,audit]);
 const completed=await replay(group,actor,op,hash);if(!completed)throw new RecordingError('班级、权限或录影已发生变化，请刷新后重试',409);return completed;
}
