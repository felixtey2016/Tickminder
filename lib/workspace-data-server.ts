import type {Account} from './auth';
import {adminAuthority} from './admin-authority';
import {adminPermissionContext, AdminPermissionDenied, type AdminPermissionContext} from './admin-permission-access';
import {adminTargetKeys, permissionAllows} from './admin-permission-state';
import {courseRange, courseRangeState, CourseQueryError} from './course-query';
import {classSessionState} from './class-sessions';
import {learningState, studentStudyProjection} from './learning-server';
import {isOwnerAccount} from './owner';
import {readRevision} from './revision';
import {assertWorkspaceActor, workspaceReader} from './workspace-data-access';
import {WORKSPACE_DATA_VIEWS, type WorkspaceDataMap, type WorkspaceDataResponse, type WorkspaceDataView, type WorkspaceIdentity, type WorkspacePlan, type WorkspacePlanOption, type WorkspaceStudent, type WorkspaceStudentOption, type WorkspaceTeacher} from './workspace-data-types';

type Row = Record<string, unknown>;
const adminViews: Partial<Record<WorkspaceDataView, string[]>> = {
  calendar: ['lessons.view', 'attendance.view'], schedule: ['lessons.create', 'lessons.edit'],
  students: ['students.view'], teachers: ['teachers.view'], subjects: ['plans.view'],
  'account-options': ['accounts.view', 'parents.view'], 'course-options': ['lessons.view', 'attendance.view', 'statistics.view'],
  'classroom-options': ['classrooms.view', 'classrooms.create', 'classrooms.edit'], terms: ['terms.view'],
  materials: ['materials.view'], homework: ['homework.view'],
};
const toBoolean = <T extends {active: unknown}>(value: T) => ({...value, active: Boolean(value.active)});

/** Each endpoint selects only its own records/options. Full-profile grants remain separate. */
function projections(actor: Account, access: AdminPermissionContext) {
  const can = (key: string) => actor.role !== 'admin' || permissionAllows(access, key as Parameters<typeof permissionAllows>[1]);
  const keys = (kind: 'students' | 'teachers' | 'plans', full = false): string[] => {
    if (actor.role !== 'admin') return [];
    const view = kind + '.view';
    if (can(view)) return [view];
    return full ? [] : adminTargetKeys(access, kind).slice(0, 1);
  };
  const people = async (kind: 'students' | 'teachers', full = false) => {
    const grants = keys(kind, full);
    if (actor.role === 'admin' && !grants.length) return [];
    const field = kind === 'students' ? 'student' : 'teacher_name', person = actor.role === 'teacher' ? 'teacher_name' : 'student';
    const bound = actor.role === 'teacher' ? actor.teacherName : actor.studentName;
    const filter = actor.role === 'admin' ? '' : ` WHERE name IN(SELECT ${field} FROM plans WHERE ${person}=?)`;
    const columns = kind === 'teachers' ? 'name,active' + (full ? ',group_id AS groupId,created_at AS createdAt' : '')
      : 'name,active,syllabus_id AS syllabusId,grade' + (full ? ',name_key AS nameKey,age,group_id AS groupId,created_at AS createdAt' : '');
    const rows = await workspaceReader(actor, grants).rows(`SELECT ${columns} FROM ${kind}${filter} ORDER BY name`, ...actor.role === 'admin' ? [] : [bound]);
    return rows.map(row => toBoolean(row as Row & {active: unknown}));
  };
  const names = async () => {
    const [students, teachers] = await Promise.all([people('students'), people('teachers')]);
    return {students: students.filter(row => row.active).map(row => String(row.name)).sort(), teachers: teachers.filter(row => row.active).map(row => String(row.name)).sort()};
  };
  const plans = async (full = false) => {
    const grants = keys('plans', full);
    if (actor.role === 'admin' && !grants.length) return [];
    const condition = actor.role === 'teacher' ? ' WHERE p.teacher_name=?' : actor.role === 'student' ? ' WHERE p.student=?' : '';
    const rows = await workspaceReader(actor, grants).rows(`SELECT p.key,p.student,p.subject,p.subject_id AS subjectId,p.teacher_name AS teacherName,p.duration,p.online_link AS onlineLink,p.active,
      s.syllabus_id AS syllabusId,s.grade${full ? ',p.group_id AS groupId,p.created_at AS createdAt' : ''}
      FROM plans p LEFT JOIN students s ON s.name=p.student${condition}`, ...actor.role === 'admin' ? [] : [actor.role === 'teacher' ? actor.teacherName : actor.studentName]);
    return rows.map(row => ({...row, active: Boolean(row.active), teacher: row.teacherName})) as WorkspacePlanOption[];
  };
  const planData = async () => {
    const [options, namesData] = await Promise.all([plans(), names()]);
    const students = new Set(namesData.students), teachers = new Set(namesData.teachers);
    const active = options.filter(plan => plan.active && students.has(plan.student) && teachers.has(plan.teacherName)).map(({active: _active, teacherName, ...plan}) => ({...plan, teacher: teacherName})) as WorkspacePlan[];
    return {...namesData, plans: active, planOptions: options};
  };
  return {can, people, names, plans, planData};
}

function parsedQuery(params: URLSearchParams) {
  const allowed = new Set(['view', 'from', 'to']);
  for (const key of params.keys()) if (!allowed.has(key) || params.getAll(key).length !== 1) throw new CourseQueryError('页面请求参数无效');
  const view = params.get('view') as WorkspaceDataView;
  if (!(WORKSPACE_DATA_VIEWS as readonly string[]).includes(view)) throw new CourseQueryError('页面请求无效');
  const ranged = view === 'calendar' || view === 'study';
  if (ranged && (!params.has('from') || !params.has('to')) || !ranged && (params.has('from') || params.has('to'))) throw new CourseQueryError('请选择有效日期范围');
  return {view, range: ranged ? courseRange(params) : null};
}

export async function workspaceData(actor: Account, params: URLSearchParams): Promise<WorkspaceDataResponse> {
  const {view, range} = parsedQuery(params);
  await assertWorkspaceActor(actor);
  const access = await adminPermissionContext(actor), projection = projections(actor, access);
  const can = projection.can;
  if (actor.role === 'admin') {
    const required = adminViews[view];
    if (!required || !required.some(can)) throw new AdminPermissionDenied();
  } else if (actor.role === 'teacher') {
    if (!['calendar', 'schedule', 'teacher-plans', 'course-options', 'classroom-options', 'materials', 'homework'].includes(view)) throw new AdminPermissionDenied();
  } else if (actor.role === 'student' && !['calendar', 'materials', 'homework', 'study'].includes(view)) throw new AdminPermissionDenied();

  let data: WorkspaceDataMap[WorkspaceDataView];
  if (view === 'calendar') {
    const courses = can('lessons.view') ? await courseRangeState(actor, range!) : {
      lessons: [], attendanceSessions: can('attendance.view') ? (await classSessionState(actor, {from: range!.start, to: range!.end, permissionKey: 'attendance.view'})).allSessions : [], classSessions: [], classSessionRequests: [], proposals: [],
    };
    const names = actor.role === 'admin' ? await projection.names() : {students: [], teachers: []};
    data = {...courses, attendanceSessions: actor.role === 'student' || !can('attendance.view') ? [] : courses.attendanceSessions || [], courseRange: {from: range!.from, to: range!.to}, ...names} as WorkspaceDataMap['calendar'];
  } else if (view === 'schedule') data = await projection.planData();
  else if (view === 'teacher-plans') data = {plans: (await projection.planData()).plans};
  else if (view === 'students') data = {allStudents: await projection.people('students', true) as WorkspaceStudent[]};
  else if (view === 'teachers') data = {allTeachers: await projection.people('teachers', true) as WorkspaceTeacher[]};
  else if (view === 'subjects') {
    const [allPlans, allStudents, studentOptions, names] = await Promise.all([projection.plans(true), can('students.view') ? projection.people('students', true) : [], projection.people('students'), projection.names()]);
    data = {allPlans, allStudents: allStudents as WorkspaceStudent[], studentOptions: studentOptions as WorkspaceStudentOption[], ...names};
  } else if (view === 'account-options') {
    const [studentOptions, teacherOptions] = await Promise.all([projection.people('students'), projection.people('teachers')]);
    data = {studentOptions: studentOptions as WorkspaceStudentOption[], teacherOptions: teacherOptions as WorkspaceTeacher[], students: studentOptions.filter(row => row.active).map(row => String(row.name)), teachers: teacherOptions.filter(row => row.active).map(row => String(row.name))};
  } else if (view === 'course-options') {
    const [students, teachers] = await Promise.all([projection.people('students'), projection.people('teachers')]);
    data = {students: students.filter(row=>row.active).map(row=>String(row.name)).sort(), teachers: teachers.filter(row=>row.active).map(row=>String(row.name)).sort(), teacherOptions: teachers as WorkspaceTeacher[]};
  }
  else if (view === 'classroom-options') {
    const [options, allPlans] = await Promise.all([projection.planData(), actor.role === 'admin' && can('plans.view') ? projection.plans(true) : []]);
    data = {plans: options.plans, planOptions: options.planOptions, allPlans, teachers: options.teachers};
  } else if (view === 'terms') data = {terms: await workspaceReader(actor, ['terms.view']).rows<{id: string; name: string; isCurrent: number}>('SELECT id,name,is_current AS isCurrent FROM academic_terms ORDER BY created_at DESC')};
  else if (view === 'study') data = await studentStudyProjection(actor, range!, workspaceReader(actor).rows);
  else {
    const learning = await learningState(actor, {part: view, rows: workspaceReader(actor, [view === 'materials' ? 'materials.view' : 'homework.view']).rows});
    data = (view === 'materials' ? {materials: learning.materials, eligible: learning.eligible, limits: learning.limits} : {homework: learning.homework, submissions: learning.submissions, eligible: learning.eligible, limits: learning.limits}) as WorkspaceDataMap['materials' | 'homework'];
  }
  const [revision, hierarchy] = await Promise.all([readRevision(actor.groupId), actor.role === 'admin' ? adminAuthority(actor) : Promise.resolve({isGroupChief: false, canManageAdministrators: false})]);
  await assertWorkspaceActor(actor);
  if (JSON.stringify(access) !== JSON.stringify(await adminPermissionContext(actor))) throw new AdminPermissionDenied();
  const account: WorkspaceIdentity = {id: actor.id, name: actor.name, email: actor.email, role: actor.role, groupId: actor.groupId, teacherName: actor.teacherName, studentName: actor.studentName, isOwner: isOwnerAccount(actor), isGroupChief: hierarchy.isGroupChief, canManageAdministrators: hierarchy.canManageAdministrators, ...actor.role === 'admin' ? {adminPermissions: access} : {}};
  return {view, account, revision, data} as WorkspaceDataResponse;
}
