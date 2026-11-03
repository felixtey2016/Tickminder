import type {Account} from './auth';
import {learningDb} from './learning-server';
import {accountSessionPredicate} from './account-session';
import {configuredAdminGrantPredicate} from './admin-permissions-server';
import {classPlanSubjectSql} from './academic-subject-match';
import {operationalRowVisible, requireGroup} from './group-data';
import {OWNER_EMAIL} from './owner';
import {appendAudit} from './audit-log';
import {
  CLASSROOM_TASK_PAGE_SIZE, CLASSROOM_TASK_REASON_MAX, ClassroomTaskError, classroomTaskFields, classroomTaskId,
  type ClassroomTask, type ClassroomTaskMutationResult, type ClassroomTasksState, type ClassroomTaskStudent, type ClassroomTaskHistory, type ClassroomTaskInbox,
} from './classroom-tasks';

type Guard = {sql: string; args: unknown[]};
type TaskAction = 'create' | 'complete' | 'submit' | 'approve' | 'return' | 'archive';
type EventRow = {id: string; taskId: string; actorId: string; action: string; after: string; at: string};
type TaskEvent = {
  schemaVersion: 1; groupId: string; classroomId: string; taskId: string; revision: 1;
  operationId: string; requestHash: string; title?: string; description?: string;
  studentName?: string; archived?: true; previousEventId?: string|null; reason?:string; requiresReview?:boolean;
};
const truth: Guard = {sql: '1', args: []};
const and = (...guards: Guard[]): Guard => ({sql: guards.map(g => '(' + g.sql + ')').join(' AND '), args: guards.flatMap(g => g.args)});

function group(actor: Account): string {
  try { return requireGroup(actor.groupId); } catch { throw new ClassroomTaskError('没有班级任务权限', 403); }
}
function grant(actor: Account, key: string): Guard {
  return actor.role === 'admin' ? configuredAdminGrantPredicate(actor, key) : truth;
}

// Do not trust an account object authenticated before a role, binding, password,
// session or organisation change. This same predicate also guards each INSERT.
function actorScope(actor: Account): Guard {
  if (!['admin', 'teacher', 'student'].includes(actor.role)) throw new ClassroomTaskError('没有班级任务权限', 403);
  const groupId = group(actor), session = accountSessionPredicate(actor);
  return {
    sql: `EXISTS(SELECT 1 FROM accounts task_actor JOIN tuition_groups task_group ON task_group.id=? AND task_group.active=1
      WHERE task_actor.id=? AND task_actor.role=? AND task_actor.disabled_at IS NULL
      AND (task_actor.group_id=task_group.id OR task_actor.role='admin' AND lower(trim(task_actor.email))=? AND substr(task_actor.id,1,6)<>'local:')
      AND task_actor.teacher_name IS ? AND task_actor.student_name IS ?
      AND NOT EXISTS(SELECT 1 FROM local_credentials credentials WHERE credentials.account_id=task_actor.id AND credentials.must_change_password=1)
      AND (task_actor.role<>'teacher' OR EXISTS(SELECT 1 FROM teachers t WHERE t.group_id=task_group.id AND t.name=task_actor.teacher_name AND t.active=1))
      AND (task_actor.role<>'student' OR EXISTS(SELECT 1 FROM students s WHERE s.group_id=task_group.id AND s.name=task_actor.student_name AND s.active=1 AND ${operationalRowVisible('students', 's')}))
      AND ${session.sql})`,
    args: [groupId, actor.id, actor.role, OWNER_EMAIL, actor.teacherName, actor.studentName, ...session.args],
  };
}

function classroomScope(actor: Account, classroomId: string, writable = false): Guard {
  const role = actor.role === 'admin' ? truth : actor.role === 'teacher'
    ? {sql: 'c.teacher_name=?', args: [actor.teacherName]}
    : {
      sql: `EXISTS(SELECT 1 FROM classroom_members m
        JOIN students s ON s.group_id=m.group_id AND s.name=m.student_name AND s.active=1
        JOIN plans p ON p.group_id=m.group_id AND p.student=m.student_name AND p.active=1 AND p.teacher_name=c.teacher_name AND ${classPlanSubjectSql()}
        JOIN teachers t ON t.group_id=c.group_id AND t.name=c.teacher_name AND t.active=1
        WHERE m.group_id=c.group_id AND m.classroom_id=c.id AND m.student_name=?
        AND ${operationalRowVisible('students', 's')} AND ${operationalRowVisible('classroom_members', 'm')})`,
      args: [actor.studentName],
    };
  return {sql: `EXISTS(SELECT 1 FROM classrooms c WHERE c.group_id=? AND c.id=? AND ${operationalRowVisible('classrooms', 'c')} ${writable ? 'AND c.archived=0' : ''} AND (${role.sql}))`, args: [group(actor), classroomId, ...role.args]};
}
function scope(actor: Account, classroomId: string, action?: TaskAction, writable = false): Guard {
  const key = action === 'create' ? 'tasks.create' : action === 'archive' ? 'tasks.archive' : action === 'approve' || action === 'return' ? 'tasks.review' : 'tasks.view';
  return and(actorScope(actor), grant(actor, 'tasks.view'), grant(actor, key), classroomScope(actor, classroomId, writable));
}
async function allowed(guard: Guard): Promise<boolean> {
  return Boolean(await learningDb().prepare('SELECT 1 WHERE ' + guard.sql).bind(...guard.args).first());
}
async function assertAllowed(guard: Guard) {
  if (!await allowed(guard)) throw new ClassroomTaskError('班级成员或操作权限已变更，请刷新后重试', 403);
}
async function readRows<T>(guard: Guard, sql: string, args: unknown[] = []): Promise<T[]> {
  return (await learningDb().prepare(`SELECT * FROM (${sql}) WHERE ${guard.sql}`).bind(...args, ...guard.args).all<T>()).results || [];
}

// Audit is the canonical append-only Task event store. It is already included in
// full backups. Tasks never masquerade as lessons, PDFs or announcement reads;
// there are no UPDATE/DELETE operations and no metadata in _audit.objectName.
function eventJson(alias: string) { return `CASE WHEN json_valid(${alias}.after_json) THEN ${alias}.after_json ELSE '{}' END`; }
function validEvent(alias: string): string {
  const json = eventJson(alias);
  return `json_type(${json},'$.schemaVersion')='integer' AND json_extract(${json},'$.schemaVersion')=1
    AND json_type(${json},'$.revision')='integer' AND json_extract(${json},'$.revision')=1
    AND json_extract(${json},'$.groupId')=${alias}.group_id
    AND json_type(${json},'$.classroomId')='text' AND json_type(${json},'$.taskId')='text'
    AND ${alias}.lesson_id='class-task:'||json_extract(${json},'$.taskId')`;
}
function eventFor(groupId: string, classroomId: string, taskId: string, action: TaskAction, extra = ''): Guard {
  return {
    sql: `EXISTS(SELECT 1 FROM audit task_event WHERE task_event.group_id=? AND task_event.lesson_id=? AND task_event.action=? AND ${validEvent('task_event')}
      AND json_extract(${eventJson('task_event')},'$.classroomId')=? ${extra})`,
    args: [groupId, 'class-task:' + taskId, 'classTask.' + action, classroomId],
  };
}
function createdEvent(groupId: string, classroomId: string, taskId: string): Guard {
  return eventFor(groupId, classroomId, taskId, 'create', `AND json_type(${eventJson('task_event')},'$.title')='text' AND length(trim(json_extract(${eventJson('task_event')},'$.title'))) BETWEEN 1 AND 120 AND json_type(${eventJson('task_event')},'$.description')='text' AND length(json_extract(${eventJson('task_event')},'$.description'))<=2000`);
}
function archiveEvent(groupId: string, classroomId: string, taskId: string) {
  return eventFor(groupId, classroomId, taskId, 'archive', `AND json_type(${eventJson('task_event')},'$.archived')='true'`);
}
const not = (guard: Guard): Guard => ({sql: 'NOT(' + guard.sql + ')', args: guard.args});

type Cursor = {v: 1; g: string; c: string; a: string; i: string};
function readCursor(input: string | null, groupId: string, classroomId: string): Cursor | null {
  if (!input) return null;
  try {
    if (input.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(input)) throw new Error();
    const value = JSON.parse(atob(input.replaceAll('-', '+').replaceAll('_', '/'))) as Cursor;
    if (value.v !== 1 || value.g !== groupId || value.c !== classroomId || typeof value.a !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.a) || !Number.isFinite(Date.parse(value.a)) || typeof value.i !== 'string' || !value.i.startsWith('class-task-op:' + groupId + ':') || value.i.length > 250) throw new Error();
    return value;
  } catch { throw new ClassroomTaskError('任务分页参数无效，请刷新后重试'); }
}
function cursorFor(groupId: string, classroomId: string, row: EventRow): string {
  return btoa(JSON.stringify({v: 1, g: groupId, c: classroomId, a: row.at, i: row.id})).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

const stateActions = "'classTask.complete','classTask.submit','classTask.approve','classTask.return'";
// Uses the indexed group/lesson scope. Rowid is the append order even when two
// audit entries share a millisecond timestamp; clients never supply this value.
function latestStateSql(groupExpression:string, taskExpression:string, studentExpression:string, field='id') {
  return `(SELECT state_event.${field} FROM audit state_event WHERE state_event.group_id=${groupExpression}
    AND state_event.lesson_id='class-task:'||${taskExpression} AND state_event.action IN(${stateActions})
    AND ${validEvent('state_event')} AND json_extract(${eventJson('state_event')},'$.studentName')=${studentExpression}
    ORDER BY state_event.rowid DESC LIMIT 1)`;
}
function rosterFrom() {
  return `FROM classroom_members m JOIN classrooms c ON c.group_id=m.group_id AND c.id=m.classroom_id
    JOIN students s ON s.group_id=m.group_id AND s.name=m.student_name AND s.active=1
    JOIN plans p ON p.group_id=m.group_id AND p.student=m.student_name AND p.active=1 AND p.teacher_name=c.teacher_name AND ${classPlanSubjectSql()}
    JOIN teachers t ON t.group_id=c.group_id AND t.name=c.teacher_name AND t.active=1
    WHERE ${operationalRowVisible('students','s')} AND ${operationalRowVisible('classroom_members','m')}`;
}
function rosterMember(groupId:string,classroomId:string,studentName:string):Guard {
  return {sql:`EXISTS(SELECT 1 ${rosterFrom()} AND m.group_id=? AND m.classroom_id=? AND m.student_name=?)`,args:[groupId,classroomId,studentName]};
}
type StateRow={taskId:string;id:string;action:string;studentName:string;at:string;after:string;sequence:number};
function studentState(studentName:string,events:StateRow[]):ClassroomTaskStudent {
  const history:ClassroomTaskHistory[]=events.map(row=>{
    const data=JSON.parse(row.after) as TaskEvent & {_audit?:{actorName?:string}};
    return {eventId:row.id,action:row.action.slice('classTask.'.length) as ClassroomTaskHistory['action'],at:row.at,actorName:data._audit?.actorName||'',reason:data.reason||''};
  });
  const latest=history[0],status=!latest?'pending':latest.action==='complete'?'legacy_completed':latest.action==='approve'?'completed':latest.action==='return'?'needs_redo':'awaiting_review';
  return {studentName,status,stateVersion:latest?.eventId||null,completedAt:latest&&['complete','approve'].includes(latest.action)?latest.at:null,
    submittedAt:history.find(event=>event.action==='submit')?.at||null,reviewedAt:latest&&['approve','return'].includes(latest.action)?latest.at:null,
    reason:latest?.action==='return'?latest.reason:'',history};
}
async function taskStates(guard:Guard,groupId:string,classroomId:string,taskIds:string[],students:string[]) {
  if(!taskIds.length||!students.length)return new Map<string,ClassroomTaskStudent>();
  const json=eventJson('a');
  const events=await readRows<StateRow>(guard,`SELECT * FROM (
    SELECT json_extract(${json},'$.taskId') AS taskId,a.id,a.action,json_extract(${json},'$.studentName') AS studentName,a.at,a.after_json AS after,a.rowid AS sequence,
      row_number() OVER(PARTITION BY a.lesson_id,json_extract(${json},'$.studentName') ORDER BY a.rowid DESC) AS rank
    FROM audit a WHERE a.group_id=? AND a.lesson_id IN(SELECT 'class-task:'||value FROM json_each(?))
      AND a.action IN(${stateActions}) AND ${validEvent('a')} AND json_extract(${json},'$.classroomId')=?
      AND json_extract(${json},'$.studentName') IN(SELECT value FROM json_each(?))) WHERE rank<=10 ORDER BY sequence DESC`,
    [groupId,JSON.stringify(taskIds),classroomId,JSON.stringify(students)]);
  const result=new Map<string,ClassroomTaskStudent>();
  for(const taskId of taskIds)for(const student of students)result.set(taskId+'\0'+student,studentState(student,events.filter(event=>event.taskId===taskId&&event.studentName===student)));
  return result;
}

export async function readClassroomTasks(actor: Account, params: URLSearchParams): Promise<ClassroomTasksState> {
  const classroomId=classroomTaskId(params.get('classroomId')),groupId=group(actor),readScope=scope(actor,classroomId);
  await assertAllowed(readScope);
  const selectedTask=params.has('taskId')?classroomTaskId(params.get('taskId')):null;
  const cursor=selectedTask?null:readCursor(params.get('cursor'),groupId,classroomId);
  const classrooms=await readRows<{archived:number}>(readScope,'SELECT archived FROM classrooms WHERE group_id=? AND id=?',[groupId,classroomId]);
  if(!classrooms.length)throw new ClassroomTaskError('找不到这个班级',404);
  const json=eventJson('a');
  const creations=await readRows<EventRow>(readScope,`SELECT a.id,json_extract(${json},'$.taskId') AS taskId,a.actor_id AS actorId,a.action,a.after_json AS after,a.at
    FROM audit a WHERE a.group_id=? AND a.action='classTask.create' AND ${validEvent('a')}
    AND json_extract(${json},'$.classroomId')=? AND json_type(${json},'$.title')='text' AND length(trim(json_extract(${json},'$.title'))) BETWEEN 1 AND 120
    AND json_type(${json},'$.description')='text' AND length(json_extract(${json},'$.description'))<=2000
    ${selectedTask?'AND a.lesson_id=?':''} ${cursor?'AND (a.at<? OR (a.at=? AND a.id<?))':''} ORDER BY a.at DESC,a.id DESC LIMIT ?`,
    [groupId,classroomId,...selectedTask?['class-task:'+selectedTask]:[],...cursor?[cursor.a,cursor.a,cursor.i]:[],CLASSROOM_TASK_PAGE_SIZE+1]);
  if(selectedTask&&!creations.length)throw new ClassroomTaskError('找不到这个班级任务',404);
  const page=creations.slice(0,CLASSROOM_TASK_PAGE_SIZE),ids=page.map(row=>row.taskId);
  const roster=actor.role==='student'?[{studentName:actor.studentName!}]:await readRows<{studentName:string}>(readScope,`SELECT DISTINCT m.student_name AS studentName ${rosterFrom()} AND m.group_id=? AND m.classroom_id=? ORDER BY m.student_name`,[groupId,classroomId]);
  const states=await taskStates(readScope,groupId,classroomId,ids,roster.map(s=>s.studentName));
  const archived=ids.length?await readRows<{taskId:string}>(readScope,`SELECT DISTINCT json_extract(${json},'$.taskId') AS taskId FROM audit a WHERE a.group_id=?
    AND a.lesson_id IN(SELECT 'class-task:'||value FROM json_each(?)) AND a.action='classTask.archive' AND ${validEvent('a')} AND json_extract(${json},'$.classroomId')=? AND json_type(${json},'$.archived')='true'`,[groupId,JSON.stringify(ids),classroomId]):[];
  const tasks:ClassroomTask[]=page.map(row=>{
    const data=JSON.parse(row.after) as TaskEvent;
    const task:ClassroomTask={id:row.taskId,title:data.title!,description:data.description!,revision:1,archived:archived.some(event=>event.taskId===row.taskId),createdAt:row.at};
    if(actor.role==='student'){task.studentState=states.get(row.taskId+'\0'+actor.studentName)!;task.completedAt=task.studentState.completedAt;}
    else {const students=roster.map(student=>states.get(row.taskId+'\0'+student.studentName)!);task.progress={students,total:students.length,
      completed:students.filter(s=>s.status==='completed').length,awaitingReview:students.filter(s=>s.status==='awaiting_review').length,
      needsRedo:students.filter(s=>s.status==='needs_redo').length,legacyCompleted:students.filter(s=>s.status==='legacy_completed').length};}
    return task;
  });
  const readOnly=Boolean(classrooms[0].archived),canCreate=!readOnly&&actor.role!=='student'&&await allowed(scope(actor,classroomId,'create',true)),canArchive=!readOnly&&actor.role!=='student'&&await allowed(scope(actor,classroomId,'archive',true));
  const canComplete=!readOnly&&actor.role==='student'&&await allowed(scope(actor,classroomId,'submit',true)),canReview=!readOnly&&actor.role!=='student'&&await allowed(scope(actor,classroomId,'approve',true));
  await assertAllowed(readScope);
  return {classroomId,readOnly,canCreate,canArchive,canComplete,canReview,tasks,nextCursor:creations.length>CLASSROOM_TASK_PAGE_SIZE?cursorFor(groupId,classroomId,page[page.length-1]):null};
}

// Home inbox reads at most 21 actionable tasks per page. It is loaded on demand,
// not included in periodic navigation badge queries.
export async function readClassroomTaskInbox(actor:Account,params:URLSearchParams):Promise<ClassroomTaskInbox> {
  const groupId=group(actor),staff=actor.role!=='student',guard=and(actorScope(actor),grant(actor,'tasks.view'),staff?grant(actor,'tasks.review'):truth);
  await assertAllowed(guard);
  const status=params.get('status')||'all';
  if(!['all','pending','needs_redo','awaiting_review'].includes(status)||staff&&status!=='all')throw new ClassroomTaskError('任务分页参数无效，请刷新后重试');
  const cursorScope='inbox:'+status,cursor=readCursor(params.get('cursor'),groupId,cursorScope),json=eventJson('a'),taskId=`json_extract(${json},'$.taskId')`;
  const stateAction=`coalesce(${latestStateSql('a.group_id',taskId,'m.student_name','action')},'')`;
  const studentStatus=status==='pending'?`${stateAction}=''`:status==='needs_redo'?`${stateAction}='classTask.return'`:status==='awaiting_review'?`${stateAction}='classTask.submit'`:`${stateAction} NOT IN('classTask.complete','classTask.approve')`;
  const liveClass=`EXISTS(SELECT 1 FROM classrooms inbox_class WHERE inbox_class.group_id=a.group_id AND inbox_class.id=json_extract(${json},'$.classroomId') AND inbox_class.archived=0 AND ${operationalRowVisible('classrooms','inbox_class')} ${actor.role==='teacher'?'AND inbox_class.teacher_name=?':''})`;
  const eligible=`EXISTS(SELECT 1 ${rosterFrom()} AND m.group_id=a.group_id AND m.classroom_id=json_extract(${json},'$.classroomId') ${staff?'':'AND m.student_name=?'}
    AND ${staff?latestStateSql('a.group_id',taskId,'m.student_name','action')+"='classTask.submit'":studentStatus})`;
  const found=await readRows<EventRow&{classroomId:string;classroomTitle:string}>(guard,`SELECT a.id,${taskId} AS taskId,a.actor_id AS actorId,a.action,a.after_json AS after,a.at,
    json_extract(${json},'$.classroomId') AS classroomId,(SELECT title FROM classrooms WHERE group_id=a.group_id AND id=json_extract(${json},'$.classroomId')) AS classroomTitle
    FROM audit a WHERE a.group_id=? AND a.action='classTask.create' AND ${validEvent('a')} AND json_type(${json},'$.title')='text'
    AND ${liveClass} AND ${eligible} AND NOT EXISTS(SELECT 1 FROM audit ar WHERE ar.group_id=a.group_id AND ar.lesson_id=a.lesson_id AND ar.action='classTask.archive' AND ${validEvent('ar')} AND json_type(${eventJson('ar')},'$.archived')='true')
    ${cursor?'AND (a.at<? OR (a.at=? AND a.id<?))':''} ORDER BY a.at DESC,a.id DESC LIMIT 21`,
    [groupId,...actor.role==='teacher'?[actor.teacherName]:[],...staff?[]:[actor.studentName],...cursor?[cursor.a,cursor.a,cursor.i]:[]]);
  const page=found.slice(0,20),items:ClassroomTaskInbox['items']=[],states=new Map<string,ClassroomTaskStudent>();
  const classroomIds=[...new Set(page.map(row=>row.classroomId))];
  // Reuse each class roster and history read for all of its task cards.
  for(const classroomId of classroomIds){
    const rowScope=and(guard,classroomScope(actor,classroomId,true));
    const roster=staff?await readRows<{studentName:string}>(rowScope,`SELECT DISTINCT m.student_name AS studentName ${rosterFrom()} AND m.group_id=? AND m.classroom_id=?`,[groupId,classroomId]):[{studentName:actor.studentName!}];
    const classStates=await taskStates(rowScope,groupId,classroomId,page.filter(row=>row.classroomId===classroomId).map(row=>row.taskId),roster.map(s=>s.studentName));
    for(const [key,value] of classStates)states.set(key,value);
  }
  for(const row of page){
    const waiting=[...states.entries()].filter(([key,state])=>key.startsWith(row.taskId+'\0')&&state.status==='awaiting_review').map(([,state])=>state);
    const own=states.get(row.taskId+'\0'+actor.studentName);
    if(staff&&!waiting.length||!staff&&(!own||['completed','legacy_completed'].includes(own.status)||status!=='all'&&own.status!==status))continue;
    const data=JSON.parse(row.after) as TaskEvent;
    items.push({taskId:row.taskId,classroomId:row.classroomId,classroomTitle:row.classroomTitle,title:data.title!,status:staff?'awaiting_review':own!.status,awaitingReview:waiting.length,at:staff?waiting[0].submittedAt||row.at:own!.reviewedAt||own!.submittedAt||row.at});
  }
  await assertAllowed(and(guard,...classroomIds.map(id=>classroomScope(actor,id,true))));
  return {items,nextCursor:found.length>20?cursorFor(groupId,cursorScope,page[page.length-1]):null};
}

async function digest(value:unknown):Promise<string>{return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
export async function mutateClassroomTask(actor:Account,data:Record<string,unknown>):Promise<ClassroomTaskMutationResult>{
  const groupId=group(actor),classroomId=classroomTaskId(data.classroomId);
  if(data.action==='complete')throw new ClassroomTaskError('任务完成方式已更新，请刷新后申请老师确认',409);
  if(!['create','submit','approve','return','archive'].includes(String(data.action)))throw new ClassroomTaskError('不支持这个任务操作');
  const action=data.action as TaskAction,review=action==='approve'||action==='return',transition=action==='submit'||review;
  if(!['admin','teacher','student'].includes(actor.role)||(action==='submit'?actor.role!=='student':actor.role==='student'))throw new ClassroomTaskError('没有班级任务权限',403);
  if('groupId' in data&&data.groupId!==groupId||!review&&'studentName' in data)throw new ClassroomTaskError('只能操作当前班级的任务',403);
  const studentName=review?typeof data.studentName==='string'?data.studentName.trim():'':action==='submit'?actor.studentName!:'';
  if(transition&&(!studentName||studentName.length>200))throw new ClassroomTaskError('学生资料无效');
  if(transition&&data.expectedEventId!==null&&(typeof data.expectedEventId!=='string'||data.expectedEventId.length>250))throw new ClassroomTaskError('请刷新任务状态后重试',409);
  const previousEventId=transition?data.expectedEventId as string|null:null;
  const reason=action==='return'?typeof data.reason==='string'?data.reason.trim():'':'';
  if(action==='return'&&(!reason||reason.length>CLASSROOM_TASK_REASON_MAX))throw new ClassroomTaskError('请填写 1 至 1000 字的重做原因');
  if(typeof data.operationId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(data.operationId))throw new ClassroomTaskError('操作编号无效，请刷新后重试');
  const operationId=data.operationId,operationEventId='class-task-op:'+groupId+':'+operationId;
  const fields=action==='create'?classroomTaskFields(data):null,requestedId=action==='create'?null:classroomTaskId(data.id);
  const requestHash=await digest([2,groupId,actor.id,actor.role,actor.teacherName,actor.studentName,classroomId,action,requestedId,fields,studentName,previousEventId,reason]);
  const readScope=scope(actor,classroomId,action);await assertAllowed(readScope);
  const replay=async():Promise<ClassroomTaskMutationResult|null>=>{
    const previous=(await readRows<EventRow>(readScope,'SELECT id,lesson_id AS taskId,actor_id AS actorId,action,after_json AS after,at FROM audit WHERE group_id=? AND id=?',[groupId,operationEventId]))[0];
    if(!previous)return null;
    let event:TaskEvent|null=null;try{event=JSON.parse(previous.after) as TaskEvent;}catch{}
    if(previous.actorId!==actor.id||previous.action!=='classTask.'+action||event?.schemaVersion!==1||event.groupId!==groupId||event.classroomId!==classroomId||event.operationId!==operationId||event.requestHash!==requestHash||previous.taskId!=='class-task:'+event.taskId)throw new ClassroomTaskError('操作编号已被使用，请刷新后重试',409);
    await assertAllowed(readScope);return {ok:true,id:event.taskId,replayed:true};
  };
  const previous=await replay();if(previous)return previous;
  const id=requestedId||crypto.randomUUID(),writable=scope(actor,classroomId,action,true),exists=createdEvent(groupId,classroomId,id),archived=archiveEvent(groupId,classroomId,id);
  const stateGuard:Guard=transition?{sql:`${latestStateSql('?','?','?')} IS ? AND coalesce(${latestStateSql('?','?','?','action')},'') IN(${action==='submit'?"'','classTask.return'":"'classTask.submit'"})`,args:[groupId,id,studentName,previousEventId,groupId,id,studentName]}:truth;
  const guard=and(writable,{sql:'NOT EXISTS(SELECT 1 FROM audit WHERE id=?)',args:[operationEventId]},action==='create'?not(exists):exists,action==='create'?truth:not(archived),stateGuard,transition?rosterMember(groupId,classroomId,studentName):truth);
  const event:TaskEvent={schemaVersion:1,groupId,classroomId,taskId:id,revision:1,operationId,requestHash,...fields||{},...(action==='create'?{requiresReview:true}:{}),...(transition?{studentName,previousEventId}:{}),...(reason?{reason}:{}),...(action==='archive'?{archived:true as const}:{})};
  try{
    const result=await appendAudit(learningDb(),{groupId,id:operationEventId,lessonId:'class-task:'+id,actorId:actor.id,actorName:actor.name,action:'classTask.'+action,after:event,at:new Date().toISOString(),guard}).run();
    if(result.meta.changes===1)return {ok:true,id};
  }catch(error){await assertAllowed(readScope);const duplicate=await replay();if(duplicate)return duplicate;throw error;}
  await assertAllowed(readScope);const duplicate=await replay();if(duplicate)return duplicate;
  if(!await allowed(writable))throw new ClassroomTaskError('班级已归档，只能查看任务',409);
  if(action!=='create'&&!await allowed(and(readScope,exists)))throw new ClassroomTaskError('找不到这个班级任务',404);
  if(action==='archive'&&await allowed(and(readScope,archived)))return {ok:true,id,replayed:true};
  if(transition&&!await allowed(rosterMember(groupId,classroomId,studentName)))throw new ClassroomTaskError('学生与班级的关联已变更，请刷新后重试',403);
  throw new ClassroomTaskError('任务状态已变更，请刷新后重试',409);
}
