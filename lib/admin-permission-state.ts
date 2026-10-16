import { and, eq, or, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { lessons, plans, students, teachers, rescheduleRequests, classSessions, classrooms } from "@/db/schema";
import type { Account } from "@/lib/auth";
import { groupWhere } from "@/lib/group-data";
import { adminPermissionReadCondition, adminPermissionPredicate, type AdminPermissionContext } from "@/lib/admin-permission-access";
import { learningDb } from "@/lib/learning-server";
import { hasAdminGrant, type AdminGrantKey } from "@/lib/admin-permissions";
import { readRevision } from "@/lib/revision";
import { classSessionState } from "@/lib/class-sessions";
import { approvedActualHours, checkinInMonth, inMonth } from "@/lib/lesson-rules";
import { monthlySummary } from "@/lib/lesson-summary";

export const permissionAllows = (context: AdminPermissionContext, key: AdminGrantKey) => !context.enforced || hasAdminGrant(context.grants,key);
const studentTargets: AdminGrantKey[] = ["accounts.create","accounts.assign","plans.view","lessons.view","lessons.create","lessons.edit","reschedules.create","classrooms.create","classrooms.edit","quizAssignments.assign","students.promote","statistics.view","fees.view"];
const teacherTargets: AdminGrantKey[] = ["accounts.create","accounts.assign","plans.view","lessons.view","lessons.create","lessons.edit","reschedules.create","classrooms.create","classrooms.edit","statistics.view"];
const planTargets: AdminGrantKey[] = ["plans.view","lessons.create","lessons.edit","reschedules.create","classrooms.create","classrooms.edit","statistics.view"];
export function adminTargetKeys(context: AdminPermissionContext, kind:"students"|"teachers"|"plans") {
  return (kind==="students"?studentTargets:kind==="teachers"?teacherTargets:planTargets).filter(key=>permissionAllows(context,key));
}
function readCondition(account: Account, keys: AdminGrantKey[]): SQL | undefined {
  return keys.length ? or(...keys.map(key=>adminPermissionReadCondition(account,key))) : undefined;
}
// Each selector keeps statement-local authorization while staying below D1's
// 100-bound-parameter limit as the permission catalogue grows.
function permissionBatches(account:Account,keys:AdminGrantKey[]) {
  const batches:AdminGrantKey[][]=[];let batch:AdminGrantKey[]=[],parameters=1;
  for(const key of keys){const count=adminPermissionPredicate(account,key).args.length;if(count>99)throw Error('Permission predicate exceeds selector budget');if(parameters+count>100){batches.push(batch);batch=[];parameters=1;}batch.push(key);parameters+=count;}
  if(batch.length)batches.push(batch);return batches;
}
async function selectorRows<T>(account:Account,keys:AdminGrantKey[],select:(batch:AdminGrantKey[])=>Promise<T[]>,identify:(row:T)=>string):Promise<T[]> {
  const rows=(await Promise.all(permissionBatches(account,keys).map(select))).flat();
  return [...new Map(rows.map(row=>[identify(row),row])).values()];
}
function scheduleLesson(lesson: typeof lessons.$inferSelect) {
  return {id:lesson.id,student:lesson.student,subject:lesson.subject,teacherName:lesson.teacherName,plannedStart:lesson.plannedStart,plannedEnd:lesson.plannedEnd,status:lesson.status,kind:lesson.kind,seriesId:lesson.seriesId,replacementFor:lesson.replacementFor,sessionId:lesson.sessionId,updatedAt:lesson.updatedAt};
}
function statisticalLesson(lesson: typeof lessons.$inferSelect) {
  return {...scheduleLesson(lesson),actualStart:lesson.actualStart,actualEnd:lesson.actualEnd,attendanceKind:lesson.attendanceKind,reviewedAt:lesson.reviewedAt};
}

// Names and academic labels used in a module's own selectors are separate from
// complete people/plan records. No selector returns age, account or fee data.
export async function adminCoreOptions(account: Account, context: AdminPermissionContext) {
  const db=getDb(),studentKeys=adminTargetKeys(context,"students"),teacherKeys=adminTargetKeys(context,"teachers"),planKeys=adminTargetKeys(context,"plans");
  const classroomKeys=(["classrooms.view","classrooms.create","classrooms.edit","lessons.create","lessons.edit","quizAssignments.assign"] as AdminGrantKey[]).filter(key=>permissionAllows(context,key));
  const termKeys=(["terms.view","classrooms.create","classrooms.edit"] as AdminGrantKey[]).filter(key=>permissionAllows(context,key));
  async function optionRows<T extends {id:string}>(keys:AdminGrantKey[],query:string):Promise<T[]> {
    return selectorRows<T>(account,keys,async batch=>{
      const predicates=batch.map(key=>adminPermissionPredicate(account,key));
      return (await learningDb().prepare(query+" AND ("+predicates.map(item=>item.sql).join(" OR ")+")").bind(account.groupId,...predicates.flatMap(item=>item.args)).all<T>()).results;
    },row=>row.id);
  }
  const [studentOptions,teacherOptions,planOptions,classroomOptions,termOptions]=await Promise.all([
    selectorRows(account,studentKeys,batch=>db.select({name:students.name,active:students.active,syllabusId:students.syllabusId,grade:students.grade}).from(students).where(groupWhere(students,account.groupId,readCondition(account,batch))).all(),row=>row.name),
    selectorRows(account,teacherKeys,batch=>db.select({name:teachers.name,active:teachers.active}).from(teachers).where(groupWhere(teachers,account.groupId,readCondition(account,batch))).all(),row=>row.name),
    selectorRows(account,planKeys,batch=>db.select({key:plans.key,student:plans.student,subject:plans.subject,subjectId:plans.subjectId,teacherName:plans.teacherName,duration:plans.duration,onlineLink:plans.onlineLink,active:plans.active}).from(plans).where(groupWhere(plans,account.groupId,readCondition(account,batch))).all(),row=>row.key),
    optionRows<{id:string;title:string;teacherName:string;subject:string;subjectId:string|null;syllabusId:string|null;grade:string|null;termId:string|null}>(classroomKeys,"SELECT id,title,teacher_name AS teacherName,subject,subject_id AS subjectId,syllabus_id AS syllabusId,grade,term_id AS termId FROM classrooms WHERE archived=0 AND group_id=?"),
    optionRows<{id:string;name:string;isCurrent:number}>(termKeys,"SELECT id,name,is_current AS isCurrent FROM academic_terms WHERE group_id=?"),
  ]);
  const profiles=new Map(studentOptions.map(student=>[student.name,student]));
  return {studentOptions,teacherOptions,classroomOptions,termOptions,planOptions:planOptions.map(plan=>({...plan,teacher:plan.teacherName,syllabusId:profiles.get(plan.student)?.syllabusId||null,grade:profiles.get(plan.student)?.grade||null}))};
}

export async function restrictedAdminCoreState(account: Account, month: string, context: AdminPermissionContext) {
  const db=getDb(),can=(key:AdminGrantKey)=>permissionAllows(context,key);
  const lessonKeys=(["lessons.view","statistics.view"] as AdminGrantKey[]).filter(can);
  const [revision,options,studentRows,teacherRows,planRows,lessonRows,sessionData,requests,lessonLinks,statisticalSubjects]=await Promise.all([
    readRevision(account.groupId),adminCoreOptions(account,context),
    can("students.view")?db.select().from(students).where(groupWhere(students,account.groupId,adminPermissionReadCondition(account,"students.view"))).all():[],
    can("teachers.view")?db.select().from(teachers).where(groupWhere(teachers,account.groupId,adminPermissionReadCondition(account,"teachers.view"))).all():[],
    can("plans.view")?db.select().from(plans).where(groupWhere(plans,account.groupId,adminPermissionReadCondition(account,"plans.view"))).all():[],
    lessonKeys.length?db.select().from(lessons).where(groupWhere(lessons,account.groupId,readCondition(account,lessonKeys))).all():[],
    can("lessons.view")?classSessionState(account):{allSessions:[],sessions:[],byId:new Map()},
    can("reschedules.view")?db.select().from(rescheduleRequests).where(groupWhere(rescheduleRequests,account.groupId,adminPermissionReadCondition(account,"reschedules.view"))).all():[],
    can("lessons.view")?db.select({id:lessons.id,onlineLink:plans.onlineLink}).from(lessons).innerJoin(plans,and(eq(plans.groupId,lessons.groupId),eq(plans.student,lessons.student),eq(plans.subject,lessons.subject),eq(plans.teacherName,lessons.teacherName))).where(groupWhere(lessons,account.groupId,adminPermissionReadCondition(account,"lessons.view"))).all():[],
    can("statistics.view")?db.select({id:classSessions.id,subjectId:classrooms.subjectId,syllabusId:classrooms.syllabusId}).from(classSessions).leftJoin(classrooms,and(eq(classrooms.id,classSessions.classroomId),eq(classrooms.groupId,classSessions.groupId))).where(groupWhere(classSessions,account.groupId,adminPermissionReadCondition(account,"statistics.view"))).all():[],
  ]);
  const completeStudents=can("students.view")?studentRows:options.studentOptions,completeTeachers=can("teachers.view")?teacherRows:options.teacherOptions;
  const activeStudents=new Set(completeStudents.filter(row=>row.active).map(row=>row.name)),activeTeachers=new Set(completeTeachers.filter(row=>row.active).map(row=>row.name));
  const profiles=new Map(completeStudents.map(row=>[row.name,row]));
  const planData=planRows.map(plan=>({...plan,syllabusId:profiles.get(plan.student)?.syllabusId||null,grade:profiles.get(plan.student)?.grade||null}));
  const linkByLesson=new Map(lessonLinks.map(link=>[link.id,link.onlineLink]));
  const decorate=(lesson:typeof lessons.$inferSelect)=>{
    const session=lesson.sessionId?sessionData.byId.get(lesson.sessionId):undefined;
    const link=linkByLesson.get(lesson.id)||null;
    return {...(can("attendance.view")?lesson:scheduleLesson(lesson)),onlineLink:session?.onlineLink||link,sessionType:session?.sessionType||"one_to_one",classroomId:session?.classroomId||null,classroomTitle:session?.classroomTitle||null,participantCount:session?.participantCount||1,sessionRevision:session?.revision,sessionStatus:session?.status};
  };
  const records=can("statistics.view")||can("attendance.view")?lessonRows.filter(lesson=>lesson.actualStart&&inMonth(lesson.actualStart,month)&&approvedActualHours(lesson)>0).map(statisticalLesson):[];
  const summary=can("statistics.view")?monthlySummary(options.planOptions,lessonRows,month,new Map(statisticalSubjects.map(subject=>[subject.id,subject]))):[];
  const sessionIds=new Set(sessionData.sessions.map(session=>session.id));
  return {revision,month,...options,students:[...activeStudents].sort(),teachers:[...activeTeachers].sort(),allStudents:studentRows,allTeachers:teacherRows,
    plans:planData.filter(plan=>plan.active&&activeStudents.has(plan.student)&&activeTeachers.has(plan.teacherName)).map(plan=>({...plan,teacher:plan.teacherName})),allPlans:planData,
    lessons:can("lessons.view")?lessonRows.map(decorate):[],attendanceSessions:can("attendance.view")?sessionData.allSessions:[],classSessions:sessionData.sessions,
    records,checkins:can("attendance.view")?lessonRows.filter(lesson=>checkinInMonth(lesson,month)).map(decorate):[],summary,terms:can("terms.view")?options.termOptions:[],proposals:requests.filter(request=>!request.sessionId||!sessionIds.has(request.sessionId)),classSessionRequests:requests.filter(request=>request.sessionId&&sessionIds.has(request.sessionId))};
}
