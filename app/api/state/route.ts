import {classSessionState} from "@/lib/class-sessions";
import {groupRows} from "@/lib/group-data";
import { groupWhere } from "@/lib/group-data";
import { NextResponse } from "next/server";
import { and, desc, eq, inArray,notLike,or } from "drizzle-orm";
import {isOwnerAccount} from '@/lib/owner';
import { currentBusinessAccount as currentAccount, type Account } from "@/lib/auth";
import { lifecycleView } from "@/lib/account-lifecycle";
import { adminAuthority,adminManagementReadCondition } from "@/lib/admin-authority";
import { readRoster } from "@/lib/roster";
import { getDb } from "@/db";
import { accounts, audit, lessons, localCredentials, rescheduleRequests } from "@/db/schema";
import { approvedActualHours, approvedHoursInMonth, checkinInMonth, currentMalaysiaMonth, inMonth } from "@/lib/lesson-rules";
import { teacherMaySeeLesson } from "@/lib/access";
import { readRevision } from "@/lib/revision";
import { learningState, rows } from "@/lib/learning-server";
import { mergedAccountNames } from "@/lib/merged-account-names";
import { classroomsState } from "@/lib/classrooms-server";
import {studentLessonResponse,studentRescheduleResponse,studentSessionResponse} from "@/lib/student-course-response";
import { adminPermissionContext, adminPermissionFailure, adminPermissionReadCondition, requireAdminPermission, AdminPermissionDenied, type AdminPermissionContext } from "@/lib/admin-permission-access";
import { restrictedAdminCoreState, permissionAllows, adminCoreOptions } from "@/lib/admin-permission-state";
import { monthlySummary } from "@/lib/lesson-summary";

type Scope = "core" | "learning" | "classrooms" | "accounts" | "activity";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function coreState(account: Account, selected: string) {
  const db = getDb();
  const lessonFilter = account.role === "teacher" ? eq(lessons.teacherName, account.teacherName || "") : account.role === "student" ? eq(lessons.student, account.studentName || "") : undefined;
  const [revision, roster, allLessons, allRequests, sessionData] = await Promise.all([
    readRevision(account.groupId), readRoster(account), db.select().from(lessons).where(groupWhere(lessons,account.groupId,lessonFilter)).all(),
    lessonFilter ? db.select({request: rescheduleRequests}).from(rescheduleRequests).innerJoin(lessons, eq(lessons.id, rescheduleRequests.lessonId)).where(groupWhere(rescheduleRequests,account.groupId,lessonFilter)).all().then(items => items.map(item => item.request)) : db.select().from(rescheduleRequests).where(groupWhere(rescheduleRequests,account.groupId)).all(),
    classSessionState(account),
  ]);
  const groupIds=new Set(sessionData.sessions.map(s=>s.id)),legacyRequests=allRequests.filter(r=>!r.sessionId||!groupIds.has(r.sessionId));
  const classSessionRequests=account.role==="student"?[]:allRequests.filter(r=>r.sessionId&&groupIds.has(r.sessionId));
  const linkByPlan = new Map(roster.allPlans.map(plan => [plan.key, plan]));
  const withOnlineLink = (lesson: typeof lessons.$inferSelect) => {
    const plan = linkByPlan.get(`${lesson.student}|${lesson.subject}`);
    const session=lesson.sessionId?sessionData.byId.get(lesson.sessionId):null;
    const participant=session?.participants.find(p=>p.lessonId===lesson.id);
    return { ...lesson,teachingStatus:session?.teachingStatus,teachingStart:session?.actualStart,teachingEnd:session?.actualEnd,personalAttendance:participant?.attendanceStatus, onlineLink:session?.sessionType==="group"?session.onlineLink:plan?.teacherName===lesson.teacherName?plan.onlineLink:session?.onlineLink||null,sessionType:session?.sessionType||"one_to_one",classroomId:session?.classroomId||null,classroomTitle:session?.classroomTitle,participantCount:session?.participantCount||1,sessionRevision:session?.revision,sessionStatus:session?.status,...(account.role!=="student"?{participantNames:session?.participants.map(p=>p.studentName)}:{}) };
  };
  const base = { revision, month: selected,...(account.role!=="student"?{attendanceSessions:sessionData.allSessions}:{}),classSessions:account.role==="student"?sessionData.sessions.map(session=>studentSessionResponse(session,account.studentName)):sessionData.sessions,classSessionRequests };
  if (account.role === "student") {
    const visible = allLessons.filter(l => l.status !== "cancelled");
    const ids = new Set(visible.map(l => l.id));
    return {...base, lessons: visible.map(withOnlineLink).map(studentLessonResponse), proposals: legacyRequests.filter(r => ids.has(r.lessonId)).map(studentRescheduleResponse)};
  }
  const plans = roster.plans.filter(p => p.teacher === account.teacherName);
  const keys = new Set(plans.map(p => p.key));
  const visible = account.role === "teacher" ? allLessons.filter(l => teacherMaySeeLesson(account, l, keys)||Boolean(l.sessionId&&groupIds.has(l.sessionId)&&l.teacherName===account.teacherName)) : allLessons;
  const ids = new Set(visible.map(l => l.id));
  const records = visible.filter(l => l.actualStart && inMonth(l.actualStart, selected) && approvedActualHours(l) > 0).sort((a,b) => a.actualStart!.localeCompare(b.actualStart!));
  const checkins = visible.filter(l => checkinInMonth(l, selected)).sort((a,b) => (a.actualStart || a.plannedStart).localeCompare(b.actualStart || b.plannedStart)).map(withOnlineLink);
  if (account.role === "teacher") return {...base, plans, lessons: visible.map(withOnlineLink), proposals: legacyRequests.filter(r => ids.has(r.lessonId)), records, checkins, summary: monthlySummary(plans, visible, selected,sessionData.byId)};
  return {...base, plans: roster.plans, allPlans: roster.allPlans, students: roster.students, allStudents: roster.allStudents, teachers: roster.teachers, allTeachers: roster.allTeachers,
    lessons: visible.map(withOnlineLink), proposals: legacyRequests, records, checkins, summary: monthlySummary(roster.allPlans, visible, selected,sessionData.byId)};
}

async function extraState(account: Account, scope: Exclude<Scope, "core">, access?:AdminPermissionContext) {
  if (scope === "learning") return { learning: await learningState(account) };
  if (scope === "classrooms") {
    if(access?.enforced&&!permissionAllows(access,"classrooms.view")) {
      const options=await adminCoreOptions(account,access);
      return {classrooms:[],terms:permissionAllows(access,"terms.view")?options.termOptions:[],classroomOptions:options.classroomOptions,termOptions:options.termOptions};
    }
    const [classrooms, terms] = await Promise.all([classroomsState(account), access?.enforced&&!permissionAllows(access,"terms.view")?Promise.resolve([]):groupRows(account.groupId,"SELECT id,name,is_current AS isCurrent FROM academic_terms ORDER BY created_at DESC")]);
    return {classrooms, terms};
  }
  const db = getDb();
  if(scope==="accounts")await requireAdminPermission(account,"accounts.view");
  if(scope==="activity")await requireAdminPermission(account,"audit.view");
  const users = await db.select().from(accounts).where(groupWhere(accounts,account.groupId,adminPermissionReadCondition(account,scope==="accounts"?"accounts.view":"audit.view"))).all();
  if (scope === "accounts") {
    const [credentials, hierarchy] = await Promise.all([
      db.select({ accountId: localCredentials.accountId, username: localCredentials.username, mustChangePassword: localCredentials.mustChangePassword }).from(localCredentials).where(inArray(localCredentials.accountId,users.map(u=>u.id))).all(),
      adminAuthority(account),
    ]);
    const byId = new Map(credentials.map(c => [c.accountId, c]));
    return {users: users.map(u => ({...u, ...lifecycleView(u), isOwner:isOwnerAccount(u), isGroupChief:u.role==='admin'&&!u.disabledAt&&u.id===hierarchy.chiefAdminId, username: byId.get(u.id)?.username || null, mustChangePassword: byId.get(u.id)?.mustChangePassword || false}))};
  }
  const activityVisibility=and(adminPermissionReadCondition(account,"audit.view"),isOwnerAccount(account)?undefined:notLike(audit.action,'billing.%'),or(notLike(audit.action,'invoice.%'),adminPermissionReadCondition(account,'invoices.view')),or(notLike(audit.action,'adminPermissions.%'),adminManagementReadCondition(account)));
  const [changes, mergedNames] = await Promise.all([db.select().from(audit).where(groupWhere(audit,account.groupId,activityVisibility)).orderBy(desc(audit.at)).limit(30).all(), mergedAccountNames(account.groupId)]);
  const changedLessons = changes.length ? await db.select({id: lessons.id, student: lessons.student, subject: lessons.subject}).from(lessons).where(groupWhere(lessons,account.groupId,inArray(lessons.id, changes.map(c => c.lessonId)))).all() : [];
  const byId = new Map(changedLessons.map(l => [l.id, `${l.student} · ${l.subject}`]));
  const readableSnapshot=(action:string)=>{
    if(!access?.enforced)return true;
    if(isOwnerAccount(account))return true;
    if(action.startsWith('adminPermissions.'))return access.privileged;
    const direct:Record<string,string>={saveTeacher:'teachers',saveStudent:'students',updateStudentProfile:'students',setStudentActive:'students',savePlan:'plans',create:'lessons',edit:'lessons',cancel:'lessons',attendance:'attendance',review:'attendance',createLocalAccount:'accounts',resetLocalPassword:'accounts',activateAccount:'accounts',deleteAccount:'accounts',restoreAccount:'accounts',bind:'accounts',proposeReschedule:'reschedules',respondReschedule:'reschedules',saveClassroom:'classrooms',archiveClassroom:'classrooms',saveTerm:'terms',createTerm:'terms',saveAnnouncement:'announcements',deleteAnnouncement:'announcements',saveSessionAttendance:'attendance',reviewSessionAttendance:'attendance',autoConfirmAttendance:'attendance',createClassSession:'lessons',editClassSession:'lessons',cancelClassSession:'lessons',proposeClassReschedule:'reschedules',respondClassReschedule:'reschedules'};
    const module=direct[action]||(action.startsWith('invoice.')?'invoices':action.startsWith('quiz.')?'quizzes':action.startsWith('quizPractice.')||action.startsWith('quizAssignment.')?'quizAssignments':action.startsWith('folder.')?'folders':action.startsWith('material.')?'materials':action.startsWith('homework.')?'homework':action.startsWith('sheet')?'sheetSync':null);
    return module?access.grants.some(key=>key===`${module}.view`):false;
  };
  const visibleSnapshot=(value:string|null,action:string)=>{
    if(!readableSnapshot(action))return null;
    if(!value||!access?.enforced||isOwnerAccount(account))return value;
    const attendanceFields=new Set(['actualStart','actualEnd','attendanceKind','chargeable','reviewedAt','reviewedBy','teachingStatus','teachingStart','teachingEnd','personalAttendance','attendanceStatus','arrivedAt','leftAt','attendanceNote','attendanceRecordedAt','attendanceRecordedBy','attendanceReviewedAt','attendanceReviewedBy']);
    const lessonAction=['create','edit','cancel','reschedule','createClassSession','editClassSession','cancelClassSession','updateClassSessionLink'].includes(action);
    const filter=(input:unknown):unknown=>Array.isArray(input)?input.map(filter):input&&typeof input==='object'?Object.fromEntries(Object.entries(input).filter(([key])=>(key!=='age'||permissionAllows(access,'students.view'))&&(!attendanceFields.has(key)&&!(key==='note'&&lessonAction)||permissionAllows(access,'attendance.view'))).map(([key,item])=>[key,filter(item)])):input;
    try{return JSON.stringify(filter(JSON.parse(value)));}catch{return null;}
  };
  return {activity: changes.map(c => ({...c,before:visibleSnapshot(c.before,c.action),after:visibleSnapshot(c.after,c.action), actorName: (c.actorId===account.id?account.name:users.find(u => u.id === c.actorId)?.name) || mergedNames.get(c.actorId) || c.actorId, lessonName: !access?.enforced||permissionAllows(access,"lessons.view")?byId.get(c.lessonId) || c.lessonId:c.lessonId}))};
}

export async function GET(request: Request) {
  const account = await currentAccount();
  if (!account) return json({error: "Sign in required"}, 401);
  const url = new URL(request.url), selected = url.searchParams.get("month") || currentMalaysiaMonth();
  const scope = url.searchParams.get("scope");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)) return json({error: "Invalid month"}, 400);
  if (scope && !["core","learning","classrooms","accounts","activity"].includes(scope)) return json({error: "请求无效，请刷新后重试"}, 400);
  if ((scope === "accounts" || scope === "activity") && account.role !== "admin") return json({error: "没有权限执行此操作"}, 403);
  const hierarchy=account.role==='admin'?await adminAuthority(account):{isGroupChief:false,canManageAdministrators:false};
  const access=await adminPermissionContext(account);
  const identity = {groupId:account.groupId,id: account.id, name: account.name, email: account.email, role: account.role, isOwner:isOwnerAccount(account), isGroupChief:hierarchy.isGroupChief, canManageAdministrators:hierarchy.canManageAdministrators, teacherName: account.teacherName, studentName: account.studentName,...(account.role==="admin"?{adminPermissions:access}:{})};
  if (account.role === "pending") return json({account: {...identity, ...lifecycleView(account)}, lessons:[], classrooms:[], proposals:[], loadedScopes: ["core"]});
  try {
    // No scope preserves the existing full response for compatible clients.
    const defaults:Scope[]=account.role === "admin" ? ["core","learning","classrooms","accounts","activity"] : ["core","learning","classrooms"];
    const scopes: Scope[] = scope ? [scope as Scope] : defaults.filter(item=>!access.enforced||item!=="accounts"&&item!=="activity"||permissionAllows(access,item==="accounts"?"accounts.view":"audit.view"));
    const parts = await Promise.all(scopes.map(s => s === "core" ? account.role==="admin"&&access.enforced?restrictedAdminCoreState(account,selected,access):coreState(account, selected) : extraState(account, s, access)));
    if(access.enforced&&JSON.stringify(access)!==JSON.stringify(await adminPermissionContext(account)))throw new AdminPermissionDenied();
    return json(Object.assign({account: identity, loadedScopes: scopes}, ...parts));
  } catch (error) {
    const failure=adminPermissionFailure(error);if(failure)return json({error:failure.error},failure.status);
    return json({error: "资料暂时无法载入，请稍后刷新"}, 503);
  }
}
