import {readAcademicCatalogue} from "@/lib/academic-catalogue-server";
import {findCatalogueSubject,findCatalogueSyllabus} from "@/lib/academic-catalogue";
import {StudentAcademicError,studentProfileInput,allocationSubject,refreshStudentClassifications,studentSyllabusPlanUpdates,studentAcademicSnapshot,studentAcademicGuard} from "@/lib/student-academics";
import {attendanceAction,attendanceActions} from "@/lib/session-attendance";
import {ClassSessionError,classSessionAction,classSessionActions,legacyGroupAction} from "@/lib/class-sessions";
import {LearningEditError} from "@/lib/learning-versions";
import {groupReader,groupStatement,requireGroup} from "@/lib/group-data";
import { groupWhere } from "@/lib/group-data";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import { getDb } from "@/db";
import { accounts, assignments, audit, lessons, localCredentials, plans, rescheduleRequests, students, teachers } from "@/db/schema";
import { hashPassword, normalizeUsername, validPassword, validUsername } from "@/lib/password";
import { findLessonConflict, generateWeekly, hoursBetween, lessonConflictReason, malaysiaDate, mayCheckIn, type LessonSlot } from "@/lib/lesson-rules";
import { readRoster } from "@/lib/roster";
import { recordLessonChange,lessonChangeStatements } from "@/lib/inbox-server";
import { teacherMaySeeLesson, mayRequestReschedule, mayRespondReschedule } from "@/lib/access";
import { studentNameKey } from "@/lib/student-names";
import { first, learningDb } from "@/lib/learning-server";
import { normalizeOnlineLink } from "@/lib/online-link";
import {classPlanSubjectSql} from "@/lib/academic-subject-match";
import {ensurePlanClassroom,ensureStudentClassrooms,ensureTeacherClassrooms,planClassroomStatements,planSessionClassroomStatements} from "@/lib/student-classrooms";
import { adminAuthority, adminActorGuard, accountAuthorityGuard, assertAccountAuthority, AdminAuthorityError, isAdminAuthorityFailure } from "@/lib/admin-authority";

type Body = Record<string, unknown>;
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
async function restoreStudentClassrooms(groupId:string,actorId:string,studentName:string|null,teacherName:string|null=null){
  if(studentName){await ensureStudentClassrooms(groupId,studentName,actorId);return;}
  if(teacherName)await ensureTeacherClassrooms(groupId,teacherName,actorId);
}
async function accountClassroomStatements(groupId:string,actorId:string,studentName:string|null,teacherName:string|null){
  if(!studentName&&!teacherName)return [];
  const plans=await groupReader(groupId).rows<{key:string}>(`SELECT key FROM plans WHERE ${studentName?'student':'teacher_name'}=? AND active=1 ORDER BY key`,studentName||teacherName);
  return plans.flatMap(plan=>[...planClassroomStatements(groupId,plan.key,actorId),...planSessionClassroomStatements(groupId,plan.key)]);
}
const conflictReply = (slot: LessonSlot, conflict: LessonSlot, role: string) => NextResponse.json({
  error: "课程时间冲突", conflict: { start: conflict.plannedStart, end: conflict.plannedEnd,
    reason: lessonConflictReason(slot, conflict), ...(role === "admin" ? { student: conflict.student, teacherName: conflict.teacherName } : {}) },
}, { status: 409 });
const malaysiaIso = (input: unknown) => {
  const value = str(input);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value)) throw new Error("Enter a Malaysia date and time");
  const time = new Date(`${value}:00+08:00`);
  if (Number.isNaN(time.getTime())) throw new Error("Invalid date and time");
  return time.toISOString();
};

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return bad("Origin mismatch", 403);
  const actor = await currentAccount();
  if (!actor) return bad("Sign in required", 401);
  if (!["admin", "teacher", "student"].includes(actor.role)) return bad("Account is waiting for administrator binding", 403);
  const groupId=requireGroup(actor.groupId); const {first,rows}=groupReader(groupId);
  let data: Body;
  try { data = await request.json(); } catch { return bad("Invalid request"); }
  const action = str(data.action);
  if (actor.role === "teacher" && !["create", "attendance", "proposeReschedule", "respondReschedule", "updateOnlineLink",...classSessionActions,...attendanceActions].includes(action)) return bad("Administrator access required", 403);
  if (actor.role === "student" && !["respondReschedule", "proposeReschedule"].includes(action)) return bad("Student access only", 403);
  const db = getDb();
  const now = new Date().toISOString();
  try {
    if(attendanceActions.includes(action))return NextResponse.json(await attendanceAction(actor,data));
    if(classSessionActions.includes(action))return NextResponse.json(await classSessionAction(actor,data));
    if (action === "createLocalAccount") {
      if (actor.role !== "admin") return bad("Administrator access required", 403);
      const username = normalizeUsername(data.username);
      const password = data.password;
      const name = str(data.name);
      const role = str(data.role), teacherName = str(data.teacherName), studentName = str(data.studentName);
      if (!validUsername(username)) return bad("账号需为 3–40 位英文字母、数字、点、横线或底线，且以字母或数字开头");
      if (!validPassword(password)) return bad("初始密码需为 8–128 个字符");
      if (!name || name.length > 80 || !["admin", "teacher", "student"].includes(role)) return bad("请输入姓名并选择角色");
      if(role==='admin'&&!(await adminAuthority(actor)).canManageAdministrators)return bad('admin.administratorAccessRequired',403);
      if (await db.select({ accountId: localCredentials.accountId }).from(localCredentials).where(eq(localCredentials.username, username)).get()) return bad("此账号名已被使用");
      if (role === "teacher" && !(await readRoster(actor)).teachers.includes(teacherName)) return bad("请选择启用的老师");
      if (role === "student" && !(await readRoster(actor)).students.includes(studentName)) return bad("请选择已登记的学生");
      if (role !== "admin" && await first("SELECT 1 AS found FROM accounts WHERE role = ? AND " + (role === "teacher" ? "teacher_name" : "student_name") + " = ? AND disabled_at IS NULL", role, role === "teacher" ? teacherName : studentName)) return bad("此身份已有账号，请使用现有账号连接 Google，避免重复创建", 409);
      const id = `local:${crypto.randomUUID()}`;
      const passwordHash = await hashPassword(password);
      const raw=learningDb(),after={username,name,role,teacherName:role==='teacher'?teacherName:null,studentName:role==='student'?studentName:null};
      await raw.batch([
        adminActorGuard(actor,role==='admin'),
        raw.prepare("INSERT INTO accounts(group_id,id,email,name,role,teacher_name,student_name,created_at,activated_at,activation_reason) VALUES(?,?,'',?,?,?,?,?,?,'admin-created')").bind(groupId,id,name,role,after.teacherName,after.studentName,now,now),
        raw.prepare("INSERT INTO local_credentials(account_id,username,password_hash,must_change_password,updated_at) VALUES(?,?,?,1,?)").bind(id,username,passwordHash,now),
        raw.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,'createLocalAccount',NULL,?,?)").bind(groupId,crypto.randomUUID(),`account:${id}`,actor.id,JSON.stringify(after),now),
      ]);
      return NextResponse.json({ ok: true });
    }
    if (action === "resetLocalPassword") {
      if (actor.role !== "admin") return bad("Administrator access required", 403);
      const userId = str(data.userId);
      if (!userId || userId === actor.id) return bad("请选择其他账号");
      const target = await db.select().from(accounts).where(groupWhere(accounts,actor.groupId,eq(accounts.id, userId))).get();
      const credential = await db.select().from(localCredentials).where(eq(localCredentials.accountId, userId)).get();
      if (!target || !credential) return bad("只能重置已创建的账号密码");
      const authority={action:'resetLocalPassword' as const,expected:target};
      await assertAccountAuthority(actor,userId,authority);
      if (!validPassword(data.password)) return bad("新初始密码需为 8–128 个字符");
      const passwordHash = await hashPassword(data.password);
      const raw=learningDb();
      await raw.batch([
        accountAuthorityGuard(actor,userId,authority),
        raw.prepare("UPDATE local_credentials SET password_hash=?,must_change_password=1,updated_at=? WHERE account_id=?").bind(passwordHash,now,userId),
        raw.prepare("DELETE FROM sessions WHERE account_id=?").bind(userId),
        raw.prepare("DELETE FROM login_attempts WHERE username=?").bind(credential.username),
        raw.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) VALUES(?,?,?,?,'resetLocalPassword',?,?)").bind(groupId,crypto.randomUUID(),`account:${userId}`,actor.id,JSON.stringify({username:credential.username}),now),
      ]);
      return NextResponse.json({ ok: true });
    }
    if (action === "activateAccount") {
      if (actor.role !== "admin") return bad("Administrator access required",403);
      const userId = str(data.userId);
      const target = await db.select().from(accounts).where(groupWhere(accounts,actor.groupId,eq(accounts.id,userId))).get();
      if (!target || target.disabledAt) return bad("Account not found",404);
      const authority={action:'activateAccount' as const,expected:target};
      await assertAccountAuthority(actor,userId,authority);
      await learningDb().batch([
        accountAuthorityGuard(actor,userId,authority),
        groupStatement(groupId,"UPDATE accounts SET activated_at = coalesce(activated_at,?), activation_reason = coalesce(activation_reason,'admin-confirmed'), pending_expires_at = NULL WHERE (id = ? AND disabled_at IS NULL) AND group_id = ?").bind(now,userId,groupId),
        groupStatement(groupId,"INSERT INTO audit (group_id,id,lesson_id,actor_id,action,at) SELECT ?,?,?,?,'activateAccount',? WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ? AND activated_at IS NOT NULL AND disabled_at IS NULL)").bind(groupId,crypto.randomUUID(),`account:${userId}`,actor.id,now,userId),
      ]);
      if (!await first("SELECT 1 AS found FROM accounts WHERE id = ? AND activated_at IS NOT NULL",userId)) return bad("Account not found",404);
      return NextResponse.json({ok:true});
    }
    if (action === "deleteAccount" || action === "restoreAccount") {
      const userId = str(data.userId);
      const target = userId ? await db.select().from(accounts).where(groupWhere(accounts,actor.groupId,eq(accounts.id, userId))).get() : null;
      if (!target) return bad("Account not found", 404);
      const authority={action:action as 'deleteAccount'|'restoreAccount',expected:target};
      await assertAccountAuthority(actor,userId,authority);
      if (action === "restoreAccount" && ["teacher", "student"].includes(target.role) && await first("SELECT 1 AS found FROM accounts WHERE id <> ? AND role = ? AND " + (target.role === "teacher" ? "teacher_name" : "student_name") + " = ? AND disabled_at IS NULL", target.id, target.role, target.role === "teacher" ? target.teacherName : target.studentName)) return bad("此身份已有账号，请使用现有账号连接 Google，避免重复创建", 409);
      const raw=learningDb(),classroomStatements=action==='restoreAccount'?await accountClassroomStatements(groupId,actor.id,target.role==='student'?target.studentName:null,target.role==='teacher'?target.teacherName:null):[];
      await raw.batch([
        accountAuthorityGuard(actor,userId,authority),
        raw.prepare("UPDATE accounts SET disabled_at=? WHERE id=? AND group_id=?").bind(action==='deleteAccount'?now:null,userId,groupId),
        raw.prepare("DELETE FROM sessions WHERE account_id=?").bind(userId),
        raw.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,?,?,?,?)").bind(groupId,crypto.randomUUID(),`account:${userId}`,actor.id,action,JSON.stringify({disabledAt:target.disabledAt,role:target.role}),JSON.stringify({disabledAt:action==='deleteAccount'?now:null,role:target.role}),now),
        ...classroomStatements,
      ]);
      return NextResponse.json({ ok: true });
    }
    if (action === "saveTeacher") {
      const name = str(data.name);
      if (!name || name.length > 80 || name.includes("|")) return bad("Enter a teacher name up to 80 characters without |");
      const active = data.active !== false;
      const before = await db.select().from(teachers).where(groupWhere(teachers,actor.groupId,eq(teachers.name, name))).get();
      if (before) await db.update(teachers).set({ active }).where(groupWhere(teachers,actor.groupId,eq(teachers.name, name)));
      else await db.insert(teachers).values({groupId:actor.groupId!, name, active, createdAt: now });
      await db.insert(audit).values({groupId:actor.groupId!, id: crypto.randomUUID(), lessonId: `teacher:${name}`, actorId: actor.id, action: "saveTeacher", before: before ? JSON.stringify(before) : null, after: JSON.stringify({ name, active }), at: now });
      if(active)await restoreStudentClassrooms(groupId,actor.id,null,name);
      return NextResponse.json({ ok: true });
    }
    if (action === "updateStudentProfile") {
      const name = str(data.name);
      const before = await db.select().from(students).where(groupWhere(students,actor.groupId,eq(students.name,name))).get();
      if (!before) return bad("Student not found",404);
      const [catalogue,snapshot]=await Promise.all([readAcademicCatalogue('student'),studentAcademicSnapshot(groupId,name)]);
      const profile = await studentProfileInput(data,before,catalogue),guard=studentAcademicGuard(groupId,name,before,catalogue,snapshot),claimId='student-academic:'+crypto.randomUUID(),claim={sql:'EXISTS(SELECT 1 FROM audit WHERE id=? AND group_id=?)',args:[claimId,groupId]};
      const remappedPlans=await studentSyllabusPlanUpdates(groupId,name,before.syllabusId,profile.syllabusId,catalogue,snapshot,claim);
      const result=await learningDb().batch([
        groupStatement(groupId,'INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,?,?,?,? WHERE '+guard.sql).bind(groupId,claimId,`student:${name}`,actor.id,'updateStudentProfile',JSON.stringify(before),JSON.stringify(profile),now,...guard.args),
        ...remappedPlans,
        groupStatement(groupId,'UPDATE students SET syllabus_id=?,grade=?,age=? WHERE name=? AND group_id=? AND '+claim.sql).bind(profile.syllabusId,profile.grade,profile.age,name,groupId,...claim.args),
        ...snapshot.flatMap(plan=>[...planClassroomStatements(groupId,plan.key,actor.id,claim),...planSessionClassroomStatements(groupId,plan.key,claim)]),
      ]);
      if(!result[0].meta.changes)return bad('学生资料、科目配对或菜单已改变，请刷新后重试',409);
      if(before.syllabusId!==profile.syllabusId||before.grade!==profile.grade)await refreshStudentClassifications(groupId,name);
      return NextResponse.json({ok:true});
    }
    if (action === "saveStudent") {
      const name = str(data.name);
      if (!name || name.length > 80 || name.includes("|")) return bad("Enter a student name up to 80 characters without |");
      const nameKey = studentNameKey(name);
      const before = await db.select().from(students).where(groupWhere(students,actor.groupId,eq(students.nameKey, nameKey))).get();
      if (before) return bad("学生姓名已存在，请从名单选择现有学生");
      const profile = await studentProfileInput(data);
      await db.insert(students).values({groupId:actor.groupId!, name, nameKey, active: true, createdAt: now,...profile });
      await db.insert(audit).values({groupId:actor.groupId!, id: crypto.randomUUID(), lessonId: `student:${name}`, actorId: actor.id, action: "saveStudent", before: null, after: JSON.stringify({ name }), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "setStudentActive") {
      const name = str(data.name);
      const before = name ? await db.select().from(students).where(groupWhere(students,actor.groupId,eq(students.name, name))).get() : null;
      if (!before) return bad("Student not found", 404);
      const active = data.active === true;
      await db.update(students).set({ active }).where(groupWhere(students,actor.groupId,eq(students.name, name)));
      await db.insert(audit).values({groupId:actor.groupId!, id: crypto.randomUUID(), lessonId: `student:${name}`, actorId: actor.id, action: "setStudentActive", before: JSON.stringify(before), after: JSON.stringify({ name, active }), at: now });
      if(active)await restoreStudentClassrooms(groupId,actor.id,name);
      return NextResponse.json({ ok: true });
    }
    if (action === "savePlan") {
      const student = str(data.student), teacherName = str(data.teacherName), editingKey = str(data.editingKey);
      const onlineLink = normalizeOnlineLink(data.onlineLink), duration = Number(data.duration);
      if (!student || student.length > 80 || student.includes("|")) return bad("Choose an active student");
      const registeredStudent = await db.select().from(students).where(groupWhere(students,actor.groupId,eq(students.name, student))).get();
      if (!registeredStudent?.active) return bad("Choose an active student");
      if (!Number.isFinite(duration) || duration <= 0 || duration > 12) return bad("Duration must be between 0 and 12 hours");
      const teacher = await db.select().from(teachers).where(groupWhere(teachers,actor.groupId,eq(teachers.name, teacherName))).get();
      if (!teacher?.active) return bad("Choose an active teacher");
      const old = editingKey ? await db.select().from(plans).where(groupWhere(plans,actor.groupId,eq(plans.key,editingKey))).get() : null;
      if (editingKey && (!old || old.student !== student)) return bad("科目配对不存在，请刷新重试",404);
      const [catalogue,snapshot]=await Promise.all([readAcademicCatalogue('student'),studentAcademicSnapshot(groupId,student)]);
      const profile = await studentProfileInput(data,registeredStudent,catalogue),guard=studentAcademicGuard(groupId,student,registeredStudent,catalogue,snapshot),claimId='student-academic:'+crypto.randomUUID(),claim={sql:'EXISTS(SELECT 1 FROM audit WHERE id=? AND group_id=?)',args:[claimId,groupId]};
      const remappedPlans=await studentSyllabusPlanUpdates(groupId,student,registeredStudent.syllabusId,profile.syllabusId,catalogue,snapshot,claim);
      const selected = await allocationSubject(profile.syllabusId,str(data.subjectId)||old?.subjectId||str(data.subject)||old?.subject||"",old?.subjectId,catalogue);
      const priorSubject=old?findCatalogueSubject(findCatalogueSyllabus(catalogue,profile.syllabusId)!,old.subject):undefined;
      if(old&&old.subjectId&&old.subjectId!==selected.subject.id&&priorSubject?.id!==selected.subject.id)return bad("编辑时不能更换科目，请新增绑定");
      const subject = old?.subject || selected.subject.name, key = old?.key || `${student}|${subject}`, active=data.active!==false;
      const before = old || await db.select().from(plans).where(groupWhere(plans,actor.groupId,eq(plans.key,key))).get();
      if(!old&&before)return bad("此学生已有相同科目的配对，请编辑现有记录",409);
      if(old){guard.sql+=' AND EXISTS(SELECT 1 FROM plans WHERE key=? AND group_id=? AND student=? AND subject=? AND subject_id IS ? AND teacher_name=? AND duration=? AND active=? AND online_link IS ?)';guard.args.push(old.key,groupId,old.student,old.subject,old.subjectId,old.teacherName,old.duration,old.active?1:0,old.onlineLink);}
      const duplicate = await first<{key:string}>("SELECT key FROM plans WHERE student=? AND key<>? AND (subject_id=? OR lower(trim(subject))=lower(trim(?)))",student,key,selected.subject.id,selected.subject.name);
      if (duplicate) return bad("此学生已有相同科目的配对，请编辑现有记录",409);
      const reassignmentStatements=[];
      if (before && before.teacherName !== teacherName) {
        const all = await db.select().from(lessons).where(groupWhere(lessons,actor.groupId)).all();
        const groupSessions=new Set((await rows<{id:string}>("SELECT id FROM class_sessions WHERE session_type='group'")).map(s=>s.id));
        const moving = all.filter(l => !groupSessions.has(l.sessionId||"") && l.student === student && l.subject === subject && l.teacherName === before.teacherName && l.status === "scheduled");
        const movingIds = new Set(moving.map(l => l.id));
        const other = all.filter(l => !movingIds.has(l.id));
        for (const lesson of moving) { const slot = { ...lesson, teacherName }; const conflict = findLessonConflict(slot, other); if (conflict) return conflictReply(slot, conflict, actor.role); }
        if(moving.length){guard.sql+=" AND NOT EXISTS(SELECT 1 FROM json_each(?) expected LEFT JOIN lessons l ON l.id=json_extract(expected.value,'$[0]') AND l.group_id=? WHERE l.id IS NULL OR l.teacher_name<>json_extract(expected.value,'$[1]') OR l.planned_start<>json_extract(expected.value,'$[2]') OR l.planned_end<>json_extract(expected.value,'$[3]') OR l.status<>json_extract(expected.value,'$[4]'))";guard.args.push(JSON.stringify(moving.map(lesson=>[lesson.id,lesson.teacherName,lesson.plannedStart,lesson.plannedEnd,lesson.status])),groupId);}
        for (const lesson of moving) {
          reassignmentStatements.push(groupStatement(groupId,'UPDATE lessons SET teacher_name=?,updated_at=? WHERE id=? AND group_id=? AND '+claim.sql).bind(teacherName,now,lesson.id,groupId,...claim.args));
          reassignmentStatements.push(groupStatement(groupId,"UPDATE reschedule_requests SET status='stale',responded_at=? WHERE lesson_id=? AND group_id=? AND status='pending' AND "+claim.sql).bind(now,lesson.id,groupId,...claim.args));
          reassignmentStatements.push(groupStatement(groupId,"INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,'reassignTeacher',?,?,? WHERE "+claim.sql).bind(groupId,crypto.randomUUID(),lesson.id,actor.id,JSON.stringify(lesson),JSON.stringify({teacherName}),now,...claim.args));
        }
      }
      const result=await learningDb().batch([
        groupStatement(groupId,'INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,?,?,?,? WHERE '+guard.sql).bind(groupId,claimId,`plan:${key}`,actor.id,'savePlan',before?JSON.stringify(before):null,JSON.stringify({key,teacherName,duration,active,onlineLink,subjectId:selected.subject.id,...profile}),now,...guard.args),
        ...remappedPlans,
        ...reassignmentStatements,
        before?groupStatement(groupId,'UPDATE plans SET teacher_name=?,duration=?,active=?,online_link=?,subject_id=? WHERE key=? AND group_id=? AND '+claim.sql).bind(teacherName,duration,active?1:0,onlineLink,selected.subject.id,key,groupId,...claim.args):groupStatement(groupId,'INSERT INTO plans(group_id,key,student,subject,teacher_name,duration,active,online_link,subject_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE '+claim.sql).bind(groupId,key,student,subject,teacherName,duration,active?1:0,onlineLink,selected.subject.id,now,...claim.args),
        groupStatement(groupId,'UPDATE students SET syllabus_id=?,grade=?,age=? WHERE name=? AND group_id=? AND '+claim.sql).bind(profile.syllabusId,profile.grade,profile.age,student,groupId,...claim.args),
        ...[...new Set([...snapshot.map(plan=>plan.key),key])].flatMap(planKey=>[...planClassroomStatements(groupId,planKey,actor.id,claim),...planSessionClassroomStatements(groupId,planKey,claim)]),
      ]);
      if(!result[0].meta.changes)return bad('学生资料、科目配对或菜单已改变，请刷新后重试',409);
      if(!before||before.subjectId!==selected.subject.id||before.teacherName!==teacherName||before.active!==active||registeredStudent.syllabusId!==profile.syllabusId||registeredStudent.grade!==profile.grade)await refreshStudentClassifications(groupId,student);
      return NextResponse.json({ ok: true });
    }
    if (action === "updateOnlineLink") {
      if (actor.role !== "teacher" || !actor.teacherName) return bad("只有负责老师可以修改网课链接", 403);
      const key = str(data.key);
      const plan = key ? await db.select().from(plans).where(groupWhere(plans,actor.groupId,eq(plans.key, key))).get() : null;
      if (!plan || !plan.active || plan.teacherName !== actor.teacherName) return bad("只能修改自己负责的启用学生科目", 403);
      const onlineLink = normalizeOnlineLink(data.onlineLink);
      await db.update(plans).set({ onlineLink }).where(groupWhere(plans,actor.groupId,eq(plans.key, key)));
      await db.insert(audit).values({groupId:actor.groupId!, id: crypto.randomUUID(), lessonId: `plan:${key}`, actorId: actor.id, action: "updateOnlineLink", before: JSON.stringify({ onlineLink: plan.onlineLink }), after: JSON.stringify({ onlineLink }), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "bind") {
      const userId = str(data.userId), role = str(data.role), teacherName = str(data.teacherName), studentName = str(data.studentName);
      const target = await db.select().from(accounts).where(groupWhere(accounts,actor.groupId,eq(accounts.id, userId))).get();
      if (!target || !["teacher", "admin", "student"].includes(role)) return bad("Choose an account and role");
      const authority={action:'bind' as const,nextRole:role,expected:target};
      await assertAccountAuthority(actor,userId,authority);
      if (role === "teacher") {
        const roster = await readRoster(actor);
        if (!roster.teachers.includes(teacherName)) return bad("Choose an active teacher");
      }
      if (role === "student") {
        const roster = await readRoster(actor);
        if (!roster.students.includes(studentName)) return bad("Choose a student from the roster");
      }
      if (target.disabledAt) return bad("请先恢复账号", 409);
      if (role !== "admin" && await first("SELECT 1 AS found FROM accounts WHERE role = ? AND " + (role === "teacher" ? "teacher_name" : "student_name") + " = ? AND id <> ? AND disabled_at IS NULL", role, role === "teacher" ? teacherName : studentName, userId)) return bad("此身份已有账号，请使用现有账号连接 Google，避免重复创建", 409);
      const update = { role, teacherName: role === "teacher" ? teacherName : null, studentName: role === "student" ? studentName : null, activatedAt: target.activatedAt || now, activationReason: target.activationReason || "identity-bound", pendingExpiresAt: null };
      const raw=learningDb(),classroomStatements=await accountClassroomStatements(groupId,actor.id,role==='student'?studentName:null,role==='teacher'?teacherName:null);
      await raw.batch([
        accountAuthorityGuard(actor,userId,authority),
        raw.prepare("UPDATE accounts SET role=?,teacher_name=?,student_name=?,activated_at=?,activation_reason=?,pending_expires_at=NULL WHERE id=? AND group_id=?").bind(role,update.teacherName,update.studentName,update.activatedAt,update.activationReason,userId,groupId),
        raw.prepare("DELETE FROM sessions WHERE account_id=?").bind(userId),
        raw.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES(?,?,?,?,'bind',?,?,?)").bind(groupId,crypto.randomUUID(),`account:${userId}`,actor.id,JSON.stringify({role:target.role,teacherName:target.teacherName,studentName:target.studentName}),JSON.stringify(update),now),
        ...classroomStatements,
      ]);
      return NextResponse.json({ ok: true });
    }
    if (action === "create") {
      const roster = await readRoster(actor);
      const student = str(data.student), subject = str(data.subject), teacherName = str(data.teacherName);
      const selectedPlan=roster.plans.find(p => p.student === student && p.subject === subject && p.teacher === teacherName);
      if (!selectedPlan || !roster.teachers.includes(teacherName)) return bad("Choose an active student subject and its assigned teacher");
      const activeKeys = new Set(roster.plans.filter(p => p.teacher === actor.teacherName).map(p => p.key));
      if (actor.role === "teacher" && !teacherMaySeeLesson(actor, { student, subject, teacherName }, activeKeys)) return bad("Student is no longer active or assigned", 403);
      const start = malaysiaIso(data.start), end = malaysiaIso(data.end);
      hoursBetween(start, end);
      const kind = str(data.kind) || "regular";
      if (!["regular", "extra", "makeup"].includes(kind)) return bad("Invalid lesson type");
      const until = str(data.until);
      if (kind === "makeup" && until) return bad("A makeup lesson must be scheduled once");
      const replacementFor = kind === "makeup" ? str(data.replacementFor) || null : null;
      if (kind === "makeup") {
        const original = replacementFor ? await db.select().from(lessons).where(groupWhere(lessons,actor.groupId,eq(lessons.id, replacementFor))).get() : null;
        if (!original || original.student !== student || original.subject !== subject || original.status === "completed" || original.status === "scheduled") return bad("Select an absent or cancelled original lesson");
        if (actor.role === "teacher" && !teacherMaySeeLesson(actor, original, activeKeys)) return bad("Student is no longer active or assigned", 403);
        if (original.reviewedAt && original.chargeable) return bad("Original lesson is already billable; revise its review before adding makeup");
        const existing = await db.select().from(lessons).where(groupWhere(lessons,actor.groupId,eq(lessons.replacementFor, replacementFor!))).all();
        if (existing.some(l => l.status !== "cancelled")) return bad("That lesson already has an active makeup");
      }
      const seriesId = until ? crypto.randomUUID() : null;
      const dates = until ? generateWeekly(start, end, malaysiaIso(`${until}T23:59`)) : [{ start, end }];
      const existingSlots = await db.select().from(lessons).where(groupWhere(lessons,actor.groupId)).all();
      const newSlots: LessonSlot[] = dates.map(d => ({ student, teacherName, plannedStart: d.start, plannedEnd: d.end }));
      for (const slot of newSlots) { const conflict = findLessonConflict(slot, existingSlots); if (conflict) return conflictReply(slot, conflict, actor.role); }
      const chosenClass=str(data.classroomId)?await first<{id:string;title:string}>(`SELECT c.id,c.title FROM classrooms c JOIN plans p ON p.key=? JOIN students st ON st.name=p.student AND st.active=1 WHERE c.id=? AND c.archived=0 AND c.teacher_name=p.teacher_name AND ${classPlanSubjectSql('p','c','st')} AND EXISTS(SELECT 1 FROM classroom_members m WHERE m.classroom_id=c.id AND m.student_name=p.student)`,selectedPlan.key,str(data.classroomId)):await ensurePlanClassroom(groupId,selectedPlan.key,actor.id);
      if(!chosenClass)return bad("请选择此学生、科目及老师对应的有效班级",409);
      const records = dates.map(date => ({ groupId:actor.groupId!, id: crypto.randomUUID(), student, subject, teacherName, plannedStart: date.start, plannedEnd: date.end, kind, seriesId, replacementFor, createdBy: actor.id, updatedAt: now }));
      // Preserve the original one-to-one lesson/session/participant IDs. Link the
      // generated session in the same transaction, never copy a lesson into a
      // second timetable or infer that a classroom link makes it a group lesson.
      const rawDb=learningDb(),mutations=[];
      for(const record of records){
        mutations.push(rawDb.prepare(`INSERT INTO lessons(group_id,id,student,subject,teacher_name,planned_start,planned_end,kind,series_id,replacement_for,created_by,updated_at)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,? FROM classrooms c WHERE c.id=? AND c.group_id=? AND c.archived=0 AND c.teacher_name=? AND c.title=?
          AND EXISTS(SELECT 1 FROM classroom_members m WHERE m.classroom_id=c.id AND m.group_id=c.group_id AND m.student_name=?)
          AND EXISTS(SELECT 1 FROM plans p JOIN students st ON st.name=p.student AND st.group_id=p.group_id JOIN teachers t ON t.name=p.teacher_name AND t.group_id=p.group_id WHERE p.group_id=c.group_id AND p.key=? AND p.student=? AND p.subject=? AND p.teacher_name=c.teacher_name AND p.active=1 AND st.active=1 AND t.active=1 AND ${classPlanSubjectSql('p','c','st')})`).bind(groupId,record.id,student,subject,teacherName,record.plannedStart,record.plannedEnd,kind,seriesId,replacementFor,actor.id,now,chosenClass.id,groupId,teacherName,chosenClass.title,student,selectedPlan.key,student,subject));
        mutations.push(rawDb.prepare("UPDATE class_sessions SET classroom_id=?,classroom_title=? WHERE id=? AND group_id=? AND session_type='one_to_one' AND EXISTS(SELECT 1 FROM lessons l WHERE l.id=? AND l.group_id=? AND l.session_id=class_sessions.id)").bind(chosenClass.id,chosenClass.title,'one:'+record.id,groupId,record.id,groupId));
        mutations.push(rawDb.prepare("INSERT INTO audit(group_id,id,lesson_id,actor_id,action,before_json,after_json,at) SELECT ?,?,?,?,'create',NULL,?,? WHERE EXISTS(SELECT 1 FROM lessons l WHERE l.id=? AND l.group_id=?)").bind(groupId,crypto.randomUUID(),record.id,actor.id,JSON.stringify({...record,classroomId:chosenClass.id}),now,record.id,groupId));
      }
      const created=await rawDb.batch(mutations);
      if(created.some((result,index)=>index%3===0&&!result.meta.changes))return bad("班级或学生科目配对已改变，请刷新后重试",409);
      return NextResponse.json({ ok: true, count: records.length });
    }
    const id = str(data.id);
    const existing = id ? await db.select().from(lessons).where(groupWhere(lessons,actor.groupId,eq(lessons.id, id))).get() : null;
    if (!existing) return bad("Lesson not found", 404);
    if(existing.sessionId&&["edit","cancel","proposeReschedule","respondReschedule"].includes(action)&&await first("SELECT 1 FROM class_sessions WHERE id=? AND session_type='group'",existing.sessionId))return NextResponse.json(await legacyGroupAction(actor,data,existing.sessionId));
    if (action === "proposeReschedule") {
      const roster = await readRoster(actor);
      if (!mayRequestReschedule(actor, existing, roster.plans)) return bad("This lesson is not assigned to you", 403);
      if (existing.status !== "scheduled") return bad("Only scheduled lessons may be rescheduled");
      const proposedStart = malaysiaIso(data.start), proposedEnd = malaysiaIso(data.end);
      hoursBetween(proposedStart, proposedEnd);
      if (proposedStart <= now) return bad("Choose a future date and time");
      const other = (await db.select().from(lessons).where(groupWhere(lessons,actor.groupId)).all()).filter(l => l.id !== id);
      const proposedSlot = { ...existing, plannedStart: proposedStart, plannedEnd: proposedEnd };
      const proposedConflict = findLessonConflict(proposedSlot, other);
      if (proposedConflict) return conflictReply(proposedSlot, proposedConflict, actor.role);
      const pending = await db.select().from(rescheduleRequests).where(groupWhere(rescheduleRequests,actor.groupId,and(eq(rescheduleRequests.lessonId, id), eq(rescheduleRequests.status, "pending")))).all();
      if (pending.length) return bad("This lesson already has a pending reschedule request");
      const row = { groupId:actor.groupId!, id: crypto.randomUUID(), lessonId: id, originalStart: existing.plannedStart, originalEnd: existing.plannedEnd, proposedStart, proposedEnd, status: "pending", note: str(data.note).slice(0, 500) || null, requestedBy: actor.id, requestedRole: actor.role, requestedAt: now };
      await db.insert(rescheduleRequests).values(row);
      await db.insert(audit).values({groupId:actor.groupId!, id: crypto.randomUUID(), lessonId: id, actorId: actor.id, action: "proposeReschedule", before: JSON.stringify({ start: existing.plannedStart, end: existing.plannedEnd }), after: JSON.stringify(row), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "respondReschedule") {
      const requestId = str(data.requestId);
      const proposal = await db.select().from(rescheduleRequests).where(groupWhere(rescheduleRequests,actor.groupId,eq(rescheduleRequests.id, requestId))).get();
      if (!proposal || proposal.lessonId !== id || proposal.status !== "pending") return bad("Request is no longer pending");
      const roster = await readRoster(actor);
      if (!mayRespondReschedule(actor, existing, proposal, roster.plans)) return bad("Only the other participant can respond to this request", 403);
      const decision = str(data.decision);
      if (!["accept", "reject"].includes(decision)) return bad("Choose accept or reject");
      if (existing.status !== "scheduled" || existing.plannedStart !== proposal.originalStart || existing.plannedEnd !== proposal.originalEnd) return bad("Original schedule changed; submit a new reschedule request");
      if (decision === "accept") {
        if (proposal.proposedStart <= now) return bad("Proposed time has passed; submit a new reschedule request");
        const other = (await db.select().from(lessons).where(groupWhere(lessons,actor.groupId)).all()).filter(l => l.id !== id);
        const acceptedSlot = { ...existing, plannedStart: proposal.proposedStart, plannedEnd: proposal.proposedEnd };
        const acceptedConflict = findLessonConflict(acceptedSlot, other);
        if (acceptedConflict) return conflictReply(acceptedSlot, acceptedConflict, actor.role);
        await db.update(lessons).set({ plannedStart: proposal.proposedStart, plannedEnd: proposal.proposedEnd, updatedAt: now }).where(groupWhere(lessons,actor.groupId,eq(lessons.id, id)));
      }
      const update = { status: decision === "accept" ? "accepted" : "rejected", respondedBy: actor.id, respondedAt: now };
      await db.update(rescheduleRequests).set(update).where(groupWhere(rescheduleRequests,actor.groupId,eq(rescheduleRequests.id, requestId)));
      await recordLessonChange({ groupId:actor.groupId!, lessonId: id, actorId: actor.id, action: decision === "accept" ? "acceptReschedule" : "rejectReschedule", before: proposal, after: update, at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "attendance" || action === "review") {
      if(!existing.sessionId)return bad("课次不存在或无权访问",409);
      const current=(await import("@/lib/class-sessions")).classSessionState;
      const session=(await current(actor)).allSessions.find(s=>s.id===existing.sessionId);
      if(!session)return bad("课次不存在或无权访问",404);
      if(session.sessionType==="group")return bad("整班考勤请在班级课次中统一登记",409);
      const legacyStatus=str(data.status),completed=["completed","early_dismissal"].includes(legacyStatus);
      const start=completed?malaysiaIso(data.actualStart):null;
      const end=completed?(data.actualEnd?malaysiaIso(data.actualEnd):new Date(Date.parse(start!)+Number(data.totalHours)*3600000).toISOString()):null;
      const local=(value:string|null)=>value?new Date(Date.parse(value)+8*3600_000).toISOString().slice(0,16):"";
      return NextResponse.json(await attendanceAction(actor,{action:action==="review"?"reviewSessionAttendance":"saveSessionAttendance",sessionId:session.id,revision:data.sessionRevision,operationId:data.operationId,teachingStatus:completed?"taught":legacyStatus==="teacher_absent"?"teacher_absent":"not_taught",actualStart:local(start),actualEnd:local(end),note:data.note,participants:[{lessonId:existing.id,status:completed?"present":"absent",note:data.note,chargeable:action==="review"?data.chargeable:completed}]}));
    }
    if (actor.role !== "admin") return bad("Administrator access required", 403);
    if (action === "cancel" || action === "edit") {
      const future = data.scope === "future";
      if (future && !existing.seriesId) return bad("This lesson is not recurring");
      const candidates = future ? (await db.select().from(lessons).where(groupWhere(lessons,actor.groupId,eq(lessons.seriesId, existing.seriesId!))).all()).filter(l => l.plannedStart >= existing.plannedStart && !l.reviewedAt) : [existing];
      if (!candidates.length) return bad("No editable lessons");
      const newStart = action === "edit" ? malaysiaIso(data.start) : "";
      const newEnd = action === "edit" ? malaysiaIso(data.end) : "";
      if (action === "edit") hoursBetween(newStart, newEnd);
      const shift = action === "edit" ? Date.parse(newStart) - Date.parse(existing.plannedStart) : 0;
      if (action === "edit") {
        const candidateIds = new Set(candidates.map(l => l.id));
        const slots = candidates.map(row => ({ ...row, plannedStart: new Date(Date.parse(row.plannedStart) + shift).toISOString(), plannedEnd: future ? new Date(Date.parse(row.plannedStart) + shift + Date.parse(newEnd) - Date.parse(newStart)).toISOString() : newEnd }));
        const other = (await db.select().from(lessons).where(groupWhere(lessons,actor.groupId)).all()).filter(l => !candidateIds.has(l.id));
        for (const [index, slot] of slots.entries()) { const conflict = findLessonConflict(slot, [...other, ...slots.filter((_, i) => i !== index)]); if (conflict) return conflictReply(slot, conflict, actor.role); }
      }
      const mutations=[],rawDb=learningDb();
      if(future)mutations.push(rawDb.prepare("UPDATE lessons SET status='cancelled' WHERE group_id=? AND id IN(SELECT value FROM json_each(?))").bind(groupId,JSON.stringify(candidates.map(l=>l.id))));
      for (const row of candidates) {
        const update = action === "cancel" ? { status: "cancelled", reviewedAt: null, reviewedBy: null, chargeable: null, updatedAt: now } : { plannedStart: new Date(Date.parse(row.plannedStart) + shift).toISOString(), plannedEnd: future ? new Date(Date.parse(row.plannedStart) + shift + Date.parse(newEnd) - Date.parse(newStart)).toISOString() : newEnd, reviewedAt: null, reviewedBy: null, chargeable: null, updatedAt: now };
        mutations.push(rawDb.prepare("UPDATE lessons SET planned_start=?,planned_end=?,status=?,reviewed_at=NULL,reviewed_by=NULL,chargeable=NULL,updated_at=? WHERE id=? AND group_id=?").bind(update.plannedStart||row.plannedStart,update.plannedEnd||row.plannedEnd,action==="cancel"?"cancelled":row.status,now,row.id,groupId));
        mutations.push(rawDb.prepare("UPDATE reschedule_requests SET status='stale',responded_at=? WHERE lesson_id=? AND group_id=? AND status='pending'").bind(now,row.id,groupId));
        mutations.push(...lessonChangeStatements({ groupId:actor.groupId!, lessonId: row.id, actorId: actor.id, action: action === "edit" ? "reschedule" : "cancel", before: row, after: update, at: now }));
      }
      await rawDb.batch(mutations);
      return NextResponse.json({ ok: true, count: candidates.length });
    }
    return bad("Unknown action");
  } catch (error) {
    if(error instanceof AdminAuthorityError)return bad(error.message,error.status);
    if(isAdminAuthorityFailure(error))return bad('admin.authorityChanged',409);
    if(error instanceof StudentAcademicError)return bad(error.message,error.status);
    if(error instanceof ClassSessionError)return NextResponse.json({error:error.message,...(error.conflict?{conflict:error.conflict}:{})},{status:error.status});
    if(error instanceof LearningEditError)return bad(error.message,error.status);
    if(/lesson slot conflict/.test(String(error)))return bad("课程时间冲突，请刷新后重新选择时间",409);
    if(/group session must change together|invalid class session link/.test(String(error)))return bad("整班课次必须一起修改，请重新载入",409);
    if(/UNIQUE constraint/.test(String(error))&&classSessionActions.includes(action))return bad("操作正在处理或已完成，请重新载入检查",409);
    const message = error instanceof Error ? error.message : "";
    if (/^(Lesson time must be|Enter a Malaysia date and time|Invalid date and time|Invalid recurring lesson time|Recurring range is too long|End date precedes first lesson|请输入有效的网课链接|网课链接不能超过|网课链接必须是完整的)/.test(message)) return bad(message);
    return bad("服务器未能确认结果，请刷新列表检查是否已保存，再决定是否重试", 503);
  }
}
