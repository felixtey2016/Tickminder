import type {Account} from './auth';
import {learningDb} from './learning-server';
import {accountSessionPredicate} from './account-session';
import {configuredAdminGrantPredicate} from './admin-permissions-server';
import {classPlanSubjectSql} from './academic-subject-match';
import {operationalRowVisible, requireGroup} from './group-data';
import {OWNER_EMAIL} from './owner';
import {appendAudit} from './audit-log';
import {
  CLASSROOM_TASK_PAGE_SIZE, ClassroomTaskError, classroomTaskFields, classroomTaskId,
  type ClassroomTask, type ClassroomTaskMutationResult, type ClassroomTasksState,
} from './classroom-tasks';

type Guard = {sql: string; args: unknown[]};
type TaskAction = 'create' | 'complete' | 'archive';
type EventRow = {id: string; taskId: string; actorId: string; action: string; after: string; at: string};
type TaskEvent = {
  schemaVersion: 1; groupId: string; classroomId: string; taskId: string; revision: 1;
  operationId: string; requestHash: string; title?: string; description?: string;
  studentName?: string; archived?: true;
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
  const key = action === 'create' ? 'tasks.create' : action === 'archive' ? 'tasks.archive' : 'tasks.view';
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
function completionEvent(groupId: string, classroomId: string, taskId: string, studentName: string): Guard {
  const event = eventFor(groupId, classroomId, taskId, 'complete', `AND json_extract(${eventJson('task_event')},'$.studentName')=?`);
  return {...event, args: [...event.args, studentName]};
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

export async function readClassroomTasks(actor: Account, params: URLSearchParams): Promise<ClassroomTasksState> {
  const classroomId = classroomTaskId(params.get('classroomId')), groupId = group(actor), readScope = scope(actor, classroomId);
  await assertAllowed(readScope);
  const cursor = readCursor(params.get('cursor'), groupId, classroomId);
  const classrooms = await readRows<{archived: number}>(readScope, 'SELECT archived FROM classrooms WHERE group_id=? AND id=?', [groupId, classroomId]);
  if (!classrooms.length) throw new ClassroomTaskError('找不到这个班级', 404);
  const json = eventJson('a');
  const creations = await readRows<EventRow>(readScope, `SELECT a.id,json_extract(${json},'$.taskId') AS taskId,a.actor_id AS actorId,a.action,a.after_json AS after,a.at
    FROM audit a WHERE a.group_id=? AND a.action='classTask.create' AND ${validEvent('a')}
    AND json_extract(${json},'$.classroomId')=? AND json_type(${json},'$.title')='text'
    AND length(trim(json_extract(${json},'$.title'))) BETWEEN 1 AND 120
    AND json_type(${json},'$.description')='text' AND length(json_extract(${json},'$.description'))<=2000
    ${cursor ? 'AND (a.at<? OR (a.at=? AND a.id<?))' : ''}
    ORDER BY a.at DESC,a.id DESC LIMIT ?`, [groupId, classroomId, ...(cursor ? [cursor.a, cursor.a, cursor.i] : []), CLASSROOM_TASK_PAGE_SIZE + 1]);
  const page = creations.slice(0, CLASSROOM_TASK_PAGE_SIZE), taskIds = page.map(row => 'class-task:' + row.taskId);
  const roster = actor.role === 'student' ? [] : await readRows<{studentName: string}>(readScope, `SELECT DISTINCT m.student_name AS studentName FROM classroom_members m
    JOIN classrooms c ON c.group_id=m.group_id AND c.id=m.classroom_id
    JOIN students s ON s.group_id=m.group_id AND s.name=m.student_name AND s.active=1
    JOIN plans p ON p.group_id=m.group_id AND p.student=m.student_name AND p.active=1 AND p.teacher_name=c.teacher_name AND ${classPlanSubjectSql()}
    JOIN teachers t ON t.group_id=c.group_id AND t.name=c.teacher_name AND t.active=1
    WHERE m.group_id=? AND m.classroom_id=? AND ${operationalRowVisible('students', 's')} AND ${operationalRowVisible('classroom_members', 'm')}
    ORDER BY m.student_name`, [groupId, classroomId]);
  const events = taskIds.length ? await readRows<{taskId: string; action: string; studentName: string | null; at: string}>(readScope,
    `SELECT json_extract(${json},'$.taskId') AS taskId,a.action,json_extract(${json},'$.studentName') AS studentName,min(a.at) AS at
      FROM audit a WHERE a.group_id=? AND a.lesson_id IN(SELECT value FROM json_each(?)) AND a.action IN('classTask.complete','classTask.archive')
      AND ${validEvent('a')} AND json_extract(${json},'$.classroomId')=?
      AND ((a.action='classTask.archive' AND json_type(${json},'$.archived')='true') OR (a.action='classTask.complete' AND json_type(${json},'$.studentName')='text'
        AND json_extract(${json},'$.studentName') IN(SELECT value FROM json_each(?))))
      GROUP BY a.lesson_id,a.action,json_extract(${json},'$.studentName')`,
    [groupId, JSON.stringify(taskIds), classroomId, JSON.stringify(actor.role === 'student' ? [actor.studentName] : roster.map(row => row.studentName))]) : [];
  const archivedIds = new Set<string>(), completions = new Map<string, Map<string, string>>();
  for (const event of events) {
    if (event.action === 'classTask.archive') archivedIds.add(event.taskId);
    else if (event.studentName !== null) {
      if (!completions.has(event.taskId)) completions.set(event.taskId, new Map());
      completions.get(event.taskId)!.set(event.studentName, event.at);
    }
  }
  const tasks: ClassroomTask[] = page.map(row => {
    const data = JSON.parse(row.after) as TaskEvent;
    const completed = completions.get(row.taskId);
    const task: ClassroomTask = {id: row.taskId, title: data.title!, description: data.description!, revision: 1, archived: archivedIds.has(row.taskId), createdAt: row.at};
    if (actor.role === 'student') task.completedAt = completed?.get(actor.studentName!) || null;
    else {
      const students = roster.map(student => ({studentName: student.studentName, completedAt: completed?.get(student.studentName) || null}));
      task.progress = {completed: students.filter(student => student.completedAt !== null).length, total: students.length, students};
    }
    return task;
  });
  const readOnly = Boolean(classrooms[0].archived);
  const canCreate = !readOnly && actor.role !== 'student' && await allowed(scope(actor, classroomId, 'create', true));
  const canArchive = !readOnly && actor.role !== 'student' && await allowed(scope(actor, classroomId, 'archive', true));
  const canComplete = !readOnly && actor.role === 'student' && await allowed(scope(actor, classroomId, 'complete', true));
  await assertAllowed(readScope);
  return {classroomId, readOnly, canCreate, canArchive, canComplete, tasks, nextCursor: creations.length > CLASSROOM_TASK_PAGE_SIZE ? cursorFor(groupId, classroomId, page[page.length - 1]) : null};
}

async function digest(value: unknown): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function mutateClassroomTask(actor: Account, data: Record<string, unknown>): Promise<ClassroomTaskMutationResult> {
  const groupId = group(actor), classroomId = classroomTaskId(data.classroomId);
  if (!['create', 'complete', 'archive'].includes(String(data.action))) throw new ClassroomTaskError('不支持这个任务操作');
  const action = data.action as TaskAction;
  if (!['admin', 'teacher', 'student'].includes(actor.role) || (action === 'complete' ? actor.role !== 'student' : actor.role === 'student')) throw new ClassroomTaskError('没有班级任务权限', 403);
  if ('groupId' in data && data.groupId !== groupId || 'studentName' in data) throw new ClassroomTaskError('只能完成自己班级中的任务', 403);
  if (typeof data.operationId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(data.operationId)) throw new ClassroomTaskError('操作编号无效，请刷新后重试');
  const operationId = data.operationId, operationEventId = 'class-task-op:' + groupId + ':' + operationId;
  const fields = action === 'create' ? classroomTaskFields(data) : null;
  const requestedId = action === 'create' ? null : classroomTaskId(data.id);
  const requestHash = await digest([1, groupId, actor.id, actor.role, actor.teacherName, actor.studentName, classroomId, action, requestedId, fields]);
  const readScope = scope(actor, classroomId, action);
  await assertAllowed(readScope);
  const replay = async (): Promise<ClassroomTaskMutationResult | null> => {
    const previous = (await readRows<EventRow>(readScope, `SELECT id,lesson_id AS taskId,actor_id AS actorId,action,after_json AS after,at FROM audit WHERE group_id=? AND id=?`, [groupId, operationEventId]))[0];
    if (!previous) return null;
    let event: TaskEvent | null = null;
    try { event = JSON.parse(previous.after) as TaskEvent; } catch { /* reject malformed operation claims */ }
    if (previous.actorId !== actor.id || previous.action !== 'classTask.' + action || event?.schemaVersion !== 1 || event.groupId !== groupId || event.classroomId !== classroomId || event.operationId !== operationId || event.requestHash !== requestHash || previous.taskId !== 'class-task:' + event.taskId) throw new ClassroomTaskError('操作编号已被使用，请刷新后重试', 409);
    await assertAllowed(readScope);
    return {ok: true, id: event.taskId, replayed: true};
  };
  const previous = await replay();
  if (previous) return previous;
  const id = requestedId || crypto.randomUUID(), writable = scope(actor, classroomId, action, true);
  const exists = createdEvent(groupId, classroomId, id), archived = archiveEvent(groupId, classroomId, id);
  const completed = action === 'complete' ? completionEvent(groupId, classroomId, id, actor.studentName!) : truth;
  const claim: Guard = {sql: 'NOT EXISTS(SELECT 1 FROM audit WHERE id=?)', args: [operationEventId]};
  const guard = and(writable, claim, action === 'create' ? not(exists) : exists,
    action === 'create' ? truth : not(archived), action === 'complete' ? not(completed) : truth);
  const event: TaskEvent = {schemaVersion: 1, groupId, classroomId, taskId: id, revision: 1, operationId, requestHash,
    ...(fields || {}), ...(action === 'complete' ? {studentName: actor.studentName!} : {}), ...(action === 'archive' ? {archived: true as const} : {})};
  try {
    const result = await appendAudit(learningDb(), {groupId, id: operationEventId, lessonId: 'class-task:' + id, actorId: actor.id, action: 'classTask.' + action, after: event, at: new Date().toISOString(), guard}).run();
    if (result.meta.changes === 1) return {ok: true, id};
  } catch (error) {
    await assertAllowed(readScope);
    const duplicate = await replay();
    if (duplicate) return duplicate;
    throw error;
  }
  await assertAllowed(readScope);
  const duplicate = await replay();
  if (duplicate) return duplicate;
  if (!await allowed(writable)) throw new ClassroomTaskError('班级已归档，只能查看任务', 409);
  if (action !== 'create' && !await allowed(and(readScope, exists))) throw new ClassroomTaskError('找不到这个班级任务', 404);
  if (action === 'archive' && await allowed(and(readScope, archived))) return {ok: true, id, replayed: true};
  if (action === 'complete' && await allowed(and(readScope, archived))) throw new ClassroomTaskError('任务已归档，不能再完成', 409);
  // A second operation completing the same student/task is also a no-op. Only
  // the first completion event is stored, even when two requests race.
  if (action === 'complete' && await allowed(and(readScope, completed))) return {ok: true, id, replayed: true};
  throw new ClassroomTaskError('任务状态已变更，请刷新后重试', 409);
}
