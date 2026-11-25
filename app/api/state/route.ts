import {reportUnexpectedError} from '@/lib/diagnostics-server';
import { isLegacyBusinessRole } from '@/lib/legacy-business-access';
import {classSessionState} from "@/lib/class-sessions";
import {groupRows,operationalStudentVisible} from "@/lib/group-data";
import { groupWhere } from "@/lib/group-data";
import { NextResponse } from "next/server";
import { and, desc, eq, inArray,notLike,or,sql } from "drizzle-orm";
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
import { learningDb, learningState, rows } from "@/lib/learning-server";
import { mergedAccountNames } from "@/lib/merged-account-names";
import { classroomsState } from "@/lib/classrooms-server";
import {studentLessonResponse,studentRescheduleResponse,studentSessionResponse} from "@/lib/student-course-response";
import { adminPermissionContext, adminPermissionFailure, adminPermissionReadCondition, requireAdminPermission, AdminPermissionDenied, type AdminPermissionContext } from "@/lib/admin-permission-access";
import { restrictedAdminCoreState, permissionAllows, adminCoreOptions } from "@/lib/admin-permission-state";
import { monthlySummary } from "@/lib/lesson-summary";
import {configuredAdminGrantPredicate} from '@/lib/admin-permissions-server';
import {courseRange,courseRangeState,courseAggregates,assertCourseActor,CourseQueryError,type CourseRange} from '@/lib/course-query';

import {readAuditHistory} from "@/lib/audit-history-server";
import {AuditHistoryError} from "@/lib/audit-history";

type Scope = "core" | "learning" | "classrooms" | "accounts" | "activity";
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
// Sensitive activity requires explicit live grants even during preparation or
// recovery. Filter complete events in SQL before applying the activity limit.
function restrictedActivityCondition(account:Account,key:'payroll.view'|'expenses.view'|'payments.view'|'prepayments.view'|'parents.view'){
  const predicate=configuredAdminGrantPredicate(account,key),parts=predicate.sql.split('?');
  if(parts.length!==predicate.args.length+1)throw new Error('Invalid financial activity predicate');
  return sql.join(parts.flatMap((part,index)=>index<predicate.args.length?[sql.raw(part),sql`${predicate.args[index]}`]:[sql.raw(part)]),sql.raw(''));
}

async function coreState(account: Account, selected: string, range:CourseRange) {
  const [revision,roster]=await Promise.all([readRevision(account.groupId),readRoster(account)]);
  const plans=account.role==='teacher'?roster.plans.filter(p=>p.teacher===account.teacherName):roster.allPlans;
  const [courses,aggregates]=await Promise.all([courseRangeState(account,range),courseAggregates(account,selected,plans)]);
  const base={revision,month:selected,courseRange:{from:range.from,to:range.to},...courses,...aggregates};
  if(account.role==='student')return base;
  if(account.role==='teacher')return{...base,plans};
  return{...base,plans:roster.plans,allPlans:roster.allPlans,students:roster.students,allStudents:roster.allStudents,teachers:roster.teachers,allTeachers:roster.allTeachers};
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
  if(scope==="activity"){const result=await readAuditHistory(account,new URLSearchParams());return {activity:result.entries,activityPage:result};}
  const db = getDb();
  if(scope==="accounts")await requireAdminPermission(account,"accounts.view");

  const users = await db.select().from(accounts).where(groupWhere(accounts,account.groupId,adminPermissionReadCondition(account,scope==="accounts"?"accounts.view":"audit.view"))).all();
  if (scope === "accounts") {
    const [credentials, hierarchy] = await Promise.all([
      db.select({ accountId: localCredentials.accountId, username: localCredentials.username, mustChangePassword: localCredentials.mustChangePassword }).from(localCredentials).where(inArray(localCredentials.accountId,users.map(u=>u.id))).all(),
      adminAuthority(account),
    ]);
    const byId = new Map(credentials.map(c => [c.accountId, c]));
    const parentPermission=configuredAdminGrantPredicate(account,'parents.view');
    const mayReadParents=async()=>Boolean(await learningDb().prepare('SELECT 1 WHERE '+parentPermission.sql).bind(...parentPermission.args).first());
    const showParentChildren=await mayReadParents(),parentIds=showParentChildren?users.filter(u=>u.role==='parent').map(u=>u.id):[];
    const parentChildren=new Map<string,string[]>();
    if(parentIds.length){
      const linked=await learningDb().prepare('SELECT l.parent_account_id AS parentId,b.student_name AS student FROM parent_child_links l JOIN billing_students b ON b.group_id=l.group_id AND b.id=l.student_id WHERE l.group_id=? AND l.active=1 AND l.parent_account_id IN (SELECT value FROM json_each(?)) AND '+operationalStudentVisible('b.group_id','b.student_name')+' AND '+parentPermission.sql+' ORDER BY b.student_name,b.id').bind(account.groupId,JSON.stringify(parentIds),...parentPermission.args).all<{parentId:string;student:string}>();
      for(const child of linked.results){const names=parentChildren.get(child.parentId)||[];names.push(child.student);parentChildren.set(child.parentId,names);}
    }
    if(showParentChildren&&!await mayReadParents())throw new AdminPermissionDenied();
    return {users: users.map(u => ({...u, ...lifecycleView(u), isOwner:isOwnerAccount(u), isGroupChief:u.role==='admin'&&!u.disabledAt&&u.id===hierarchy.chiefAdminId, username: byId.get(u.id)?.username || null, mustChangePassword: byId.get(u.id)?.mustChangePassword || false,...(showParentChildren&&u.role==='parent'?{parentChildren:parentChildren.get(u.id)||[]}: {})}))};
  }
  return {};
}

export async function GET(request: Request) {
  const account = await currentAccount();
  if (!account) return json({error: "Sign in required"}, 401);
  if (!isLegacyBusinessRole(account.role) && account.role !== "pending") return json({error: "没有权限执行此操作"}, 403);
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
    const range=courseRange(url.searchParams,selected);
    // Compatible clients receive a bounded month; long history is an explicit paged request.
    const defaults:Scope[]=account.role === "admin" ? ["core","learning","classrooms","accounts"] : ["core","learning","classrooms"];
    const scopes: Scope[] = scope ? [scope as Scope] : defaults.filter(item=>!access.enforced||item!=="accounts"&&item!=="activity"||permissionAllows(access,item==="accounts"?"accounts.view":"audit.view"));
    const parts = await Promise.all(scopes.map(s => s === "core" ? account.role==="admin"&&access.enforced?restrictedAdminCoreState(account,selected,access,range):coreState(account, selected,range) : extraState(account, s, access)));
    await assertCourseActor(account,[]);
    if(access.enforced&&JSON.stringify(access)!==JSON.stringify(await adminPermissionContext(account)))throw new AdminPermissionDenied();
    return json(Object.assign({account: identity, loadedScopes: scopes}, ...parts));
  } catch (error) {
    if(error instanceof AuditHistoryError)return json({error:error.message},error.status);
    if(error instanceof CourseQueryError)return json({error:error.message},error.status);
    const failure=adminPermissionFailure(error);if(failure)return json({error:failure.error},failure.status);
    reportUnexpectedError(error,{operation:'api-state'});
    return json({error: "资料暂时无法载入，请稍后刷新"}, 503);
  }
}
