import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { currentAccount } from "@/lib/auth";
import { getDb } from "@/db";
import { accounts, assignments, audit, lessons, localCredentials, loginAttempts, plans, rescheduleRequests, sessions, students, teachers } from "@/db/schema";
import { hashPassword, normalizeUsername, validPassword, validUsername } from "@/lib/password";
import { findLessonConflict, generateWeekly, hoursBetween, lessonConflictReason, malaysiaDate, mayCheckIn, type LessonSlot } from "@/lib/lesson-rules";
import { readRoster } from "@/lib/roster";
import { teacherMaySeeLesson } from "@/lib/access";
import { isOwnerAccount, OWNER_EMAIL } from "@/lib/owner";
import { studentNameKey } from "@/lib/student-names";
import { normalizeOnlineLink } from "@/lib/online-link";

type Body = Record<string, unknown>;
const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status });
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
  let data: Body;
  try { data = await request.json(); } catch { return bad("Invalid request"); }
  const action = str(data.action);
  if (actor.role === "teacher" && !["attendance", "proposeReschedule", "updateOnlineLink"].includes(action)) return bad("Administrator access required", 403);
  if (actor.role === "student" && action !== "respondReschedule") return bad("Student access only", 403);
  const db = getDb();
  const now = new Date().toISOString();
  try {
    const ownCredentials = await db.select({ mustChangePassword: localCredentials.mustChangePassword }).from(localCredentials).where(eq(localCredentials.accountId, actor.id)).get();
    if (ownCredentials?.mustChangePassword) return bad("请先修改初始密码", 403);
    if (action === "createLocalAccount") {
      if (actor.role !== "admin") return bad("Administrator access required", 403);
      const username = normalizeUsername(data.username);
      const password = data.password;
      const name = str(data.name);
      const role = str(data.role), teacherName = str(data.teacherName), studentName = str(data.studentName);
      if (!validUsername(username)) return bad("账号需为 3–40 位英文字母、数字、点、横线或底线，且以字母或数字开头");
      if (!validPassword(password)) return bad("初始密码需为 8–128 个字符");
      if (!name || name.length > 80 || !["admin", "teacher", "student"].includes(role)) return bad("请输入姓名并选择角色");
      if (await db.select({ accountId: localCredentials.accountId }).from(localCredentials).where(eq(localCredentials.username, username)).get()) return bad("此账号名已被使用");
      if (role === "teacher" && !(await readRoster()).teachers.includes(teacherName)) return bad("请选择启用的老师");
      if (role === "student" && !(await readRoster()).students.includes(studentName)) return bad("请选择已登记的学生");
      const id = `local:${crypto.randomUUID()}`;
      const passwordHash = await hashPassword(password);
      await db.insert(accounts).values({ id, email: "", name, role, teacherName: role === "teacher" ? teacherName : null, studentName: role === "student" ? studentName : null, createdAt: now });
      await db.insert(localCredentials).values({ accountId: id, username, passwordHash, mustChangePassword: true, updatedAt: now });
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: `account:${id}`, actorId: actor.id, action: "createLocalAccount", before: null, after: JSON.stringify({ username, name, role, teacherName: role === "teacher" ? teacherName : null, studentName: role === "student" ? studentName : null }), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "resetLocalPassword") {
      if (actor.role !== "admin") return bad("Administrator access required", 403);
      const userId = str(data.userId);
      if (!userId || userId === actor.id) return bad("请选择其他账号");
      const target = await db.select().from(accounts).where(eq(accounts.id, userId)).get();
      const credential = await db.select().from(localCredentials).where(eq(localCredentials.accountId, userId)).get();
      if (!target || !credential || target.email.toLowerCase() === OWNER_EMAIL) return bad("只能重置已创建的账号密码");
      if (!validPassword(data.password)) return bad("新初始密码需为 8–128 个字符");
      const passwordHash = await hashPassword(data.password);
      await db.update(localCredentials).set({ passwordHash, mustChangePassword: true, updatedAt: now }).where(eq(localCredentials.accountId, userId));
      await db.delete(sessions).where(eq(sessions.accountId, userId));
      await db.delete(loginAttempts).where(eq(loginAttempts.username, credential.username));
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: `account:${userId}`, actorId: actor.id, action: "resetLocalPassword", before: null, after: JSON.stringify({ username: credential.username }), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "deleteAccount") {
      const userId = str(data.userId);
      const target = userId ? await db.select().from(accounts).where(eq(accounts.id, userId)).get() : null;
      if (!target) return bad("Account not found", 404);
      if (target.id === actor.id || target.email.toLowerCase() === OWNER_EMAIL) return bad("Cannot delete the owner account", 403);
      if (target.role === "admin" && !isOwnerAccount(actor)) return bad("Only the owner can remove administrators", 403);
      const credential = await db.select().from(localCredentials).where(eq(localCredentials.accountId, userId)).get();
      await db.delete(sessions).where(eq(sessions.accountId, userId));
      await db.delete(assignments).where(eq(assignments.accountId, userId));
      await db.delete(localCredentials).where(eq(localCredentials.accountId, userId));
      if (credential) await db.delete(loginAttempts).where(eq(loginAttempts.username, credential.username));
      await db.delete(accounts).where(eq(accounts.id, userId));
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: `account:${userId}`, actorId: actor.id, action: "deleteAccount", before: JSON.stringify({ id: target.id, name: target.name, role: target.role, email: target.email, username: credential?.username || null }), after: null, at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "saveTeacher") {
      const name = str(data.name);
      if (!name || name.length > 80 || name.includes("|")) return bad("Enter a teacher name up to 80 characters without |");
      const active = data.active !== false;
      const before = await db.select().from(teachers).where(eq(teachers.name, name)).get();
      if (before) await db.update(teachers).set({ active }).where(eq(teachers.name, name));
      else await db.insert(teachers).values({ name, active, createdAt: now });
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: `teacher:${name}`, actorId: actor.id, action: "saveTeacher", before: before ? JSON.stringify(before) : null, after: JSON.stringify({ name, active }), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "saveStudent") {
      const name = str(data.name);
      if (!name || name.length > 80 || name.includes("|")) return bad("Enter a student name up to 80 characters without |");
      const nameKey = studentNameKey(name);
      const before = await db.select().from(students).where(eq(students.nameKey, nameKey)).get();
      if (before) return bad("学生姓名已存在，请从名单选择现有学生");
      await db.insert(students).values({ name, nameKey, active: true, createdAt: now });
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: `student:${name}`, actorId: actor.id, action: "saveStudent", before: null, after: JSON.stringify({ name }), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "setStudentActive") {
      const name = str(data.name);
      const before = name ? await db.select().from(students).where(eq(students.name, name)).get() : null;
      if (!before) return bad("Student not found", 404);
      const active = data.active === true;
      await db.update(students).set({ active }).where(eq(students.name, name));
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: `student:${name}`, actorId: actor.id, action: "setStudentActive", before: JSON.stringify(before), after: JSON.stringify({ name, active }), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "savePlan") {
      const student = str(data.student), subject = str(data.subject), teacherName = str(data.teacherName);
      const onlineLink = normalizeOnlineLink(data.onlineLink);
      const duration = Number(data.duration);
      if (!student || !subject || student.length > 80 || subject.length > 80 || student.includes("|") || subject.includes("|")) return bad("Enter a student and subject up to 80 characters without |");
      const registeredStudent = await db.select({ active: students.active }).from(students).where(eq(students.name, student)).get();
      if (!registeredStudent?.active) return bad("Choose an active student");
      if (!Number.isFinite(duration) || duration <= 0 || duration > 12) return bad("Duration must be between 0 and 12 hours");
      const teacher = await db.select().from(teachers).where(eq(teachers.name, teacherName)).get();
      if (!teacher?.active) return bad("Choose an active teacher");
      const key = `${student}|${subject}`;
      const active = data.active !== false;
      const before = await db.select().from(plans).where(eq(plans.key, key)).get();
      if (before && before.teacherName !== teacherName) {
        const all = await db.select().from(lessons).all();
        const moving = all.filter(l => l.student === student && l.subject === subject && l.teacherName === before.teacherName && l.status === "scheduled");
        const movingIds = new Set(moving.map(l => l.id));
        const other = all.filter(l => !movingIds.has(l.id));
        for (const lesson of moving) { const slot = { ...lesson, teacherName }; const conflict = findLessonConflict(slot, other); if (conflict) return conflictReply(slot, conflict, actor.role); }
        for (const lesson of moving) {
          await db.update(lessons).set({ teacherName, updatedAt: now }).where(eq(lessons.id, lesson.id));
          await db.update(rescheduleRequests).set({ status: "stale", respondedAt: now }).where(and(eq(rescheduleRequests.lessonId, lesson.id), eq(rescheduleRequests.status, "pending")));
          await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: lesson.id, actorId: actor.id, action: "reassignTeacher", before: JSON.stringify(lesson), after: JSON.stringify({ teacherName }), at: now });
        }
      }
      if (before) await db.update(plans).set({ teacherName, duration, active, onlineLink }).where(eq(plans.key, key));
      else await db.insert(plans).values({ key, student, subject, teacherName, duration, active, onlineLink, createdAt: now });
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: `plan:${key}`, actorId: actor.id, action: "savePlan", before: before ? JSON.stringify(before) : null, after: JSON.stringify({ key, teacherName, duration, active, onlineLink }), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "updateOnlineLink") {
      if (actor.role !== "teacher" || !actor.teacherName) return bad("只有负责老师可以修改网课链接", 403);
      const key = str(data.key);
      const plan = key ? await db.select().from(plans).where(eq(plans.key, key)).get() : null;
      if (!plan || !plan.active || plan.teacherName !== actor.teacherName) return bad("只能修改自己负责的启用学生科目", 403);
      const onlineLink = normalizeOnlineLink(data.onlineLink);
      await db.update(plans).set({ onlineLink }).where(eq(plans.key, key));
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: `plan:${key}`, actorId: actor.id, action: "updateOnlineLink", before: JSON.stringify({ onlineLink: plan.onlineLink }), after: JSON.stringify({ onlineLink }), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "bind") {
      const userId = str(data.userId), role = str(data.role), teacherName = str(data.teacherName), studentName = str(data.studentName);
      const target = await db.select().from(accounts).where(eq(accounts.id, userId)).get();
      if (!target || !["teacher", "admin", "student"].includes(role)) return bad("Choose an account and role");
      if (target.id === actor.id || target.email.toLowerCase() === OWNER_EMAIL) return bad("Cannot change this administrator account");
      if (target.role === "admin" && role !== "admin" && !isOwnerAccount(actor)) return bad("Only the owner can remove administrators", 403);
      if (role === "teacher") {
        const roster = await readRoster();
        if (!roster.teachers.includes(teacherName)) return bad("Choose an active teacher");
      }
      if (role === "student") {
        const roster = await readRoster();
        if (!roster.students.includes(studentName)) return bad("Choose a student from the roster");
      }
      const update = { role, teacherName: role === "teacher" ? teacherName : null, studentName: role === "student" ? studentName : null };
      await db.update(accounts).set(update).where(eq(accounts.id, userId));
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: `account:${userId}`, actorId: actor.id, action: "bind", before: JSON.stringify({ role: target.role, teacherName: target.teacherName, studentName: target.studentName }), after: JSON.stringify(update), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "create") {
      const roster = await readRoster();
      const student = str(data.student), subject = str(data.subject), teacherName = str(data.teacherName);
      if (!roster.plans.some(p => p.student === student && p.subject === subject && p.teacher === teacherName) || !roster.teachers.includes(teacherName)) return bad("Choose an active student subject and its assigned teacher");
      const start = malaysiaIso(data.start), end = malaysiaIso(data.end);
      hoursBetween(start, end);
      const kind = str(data.kind) || "regular";
      if (!["regular", "extra", "makeup"].includes(kind)) return bad("Invalid lesson type");
      const until = str(data.until);
      if (kind === "makeup" && until) return bad("A makeup lesson must be scheduled once");
      const replacementFor = kind === "makeup" ? str(data.replacementFor) || null : null;
      if (kind === "makeup") {
        const original = replacementFor ? await db.select().from(lessons).where(eq(lessons.id, replacementFor)).get() : null;
        if (!original || original.student !== student || original.subject !== subject || original.status === "completed" || original.status === "scheduled") return bad("Select an absent or cancelled original lesson");
        if (original.reviewedAt && original.chargeable) return bad("Original lesson is already billable; revise its review before adding makeup");
        const existing = await db.select().from(lessons).where(eq(lessons.replacementFor, replacementFor!)).all();
        if (existing.some(l => l.status !== "cancelled")) return bad("That lesson already has an active makeup");
      }
      const seriesId = until ? crypto.randomUUID() : null;
      const dates = until ? generateWeekly(start, end, malaysiaIso(`${until}T23:59`)) : [{ start, end }];
      const existingSlots = await db.select().from(lessons).all();
      const newSlots: LessonSlot[] = dates.map(d => ({ student, teacherName, plannedStart: d.start, plannedEnd: d.end }));
      for (const slot of newSlots) { const conflict = findLessonConflict(slot, existingSlots); if (conflict) return conflictReply(slot, conflict, actor.role); }
      const records = dates.map(date => ({ id: crypto.randomUUID(), student, subject, teacherName, plannedStart: date.start, plannedEnd: date.end, kind, seriesId, replacementFor, createdBy: actor.id, updatedAt: now }));
      await db.insert(lessons).values(records);
      await db.insert(audit).values(records.map(l => ({ id: crypto.randomUUID(), lessonId: l.id, actorId: actor.id, action: "create", before: null, after: JSON.stringify(l), at: now })));
      return NextResponse.json({ ok: true, count: records.length });
    }
    const id = str(data.id);
    const existing = id ? await db.select().from(lessons).where(eq(lessons.id, id)).get() : null;
    if (!existing) return bad("Lesson not found", 404);
    if (action === "proposeReschedule") {
      const roster = await readRoster();
      if (!teacherMaySeeLesson(actor, existing, new Set(roster.plans.filter(p => p.teacher === actor.teacherName).map(p => p.key)))) return bad("Student is no longer active or assigned", 403);
      if (existing.status !== "scheduled") return bad("Only scheduled lessons may be rescheduled");
      const proposedStart = malaysiaIso(data.start), proposedEnd = malaysiaIso(data.end);
      hoursBetween(proposedStart, proposedEnd);
      if (proposedStart <= now) return bad("Choose a future date and time");
      const other = (await db.select().from(lessons).all()).filter(l => l.id !== id);
      const proposedSlot = { ...existing, plannedStart: proposedStart, plannedEnd: proposedEnd };
      const proposedConflict = findLessonConflict(proposedSlot, other);
      if (proposedConflict) return conflictReply(proposedSlot, proposedConflict, actor.role);
      const pending = await db.select().from(rescheduleRequests).where(and(eq(rescheduleRequests.lessonId, id), eq(rescheduleRequests.status, "pending"))).all();
      if (pending.length) return bad("This lesson already has a pending reschedule request");
      const row = { id: crypto.randomUUID(), lessonId: id, originalStart: existing.plannedStart, originalEnd: existing.plannedEnd, proposedStart, proposedEnd, status: "pending", note: str(data.note).slice(0, 500) || null, requestedBy: actor.id, requestedAt: now };
      await db.insert(rescheduleRequests).values(row);
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: id, actorId: actor.id, action: "proposeReschedule", before: JSON.stringify({ start: existing.plannedStart, end: existing.plannedEnd }), after: JSON.stringify(row), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "respondReschedule") {
      if (actor.role !== "student" || actor.studentName !== existing.student) return bad("This lesson is not assigned to you", 403);
      const requestId = str(data.requestId);
      const proposal = await db.select().from(rescheduleRequests).where(eq(rescheduleRequests.id, requestId)).get();
      if (!proposal || proposal.lessonId !== id || proposal.status !== "pending") return bad("Request is no longer pending");
      const decision = str(data.decision);
      if (!["accept", "reject"].includes(decision)) return bad("Choose accept or reject");
      if (existing.status !== "scheduled" || existing.plannedStart !== proposal.originalStart || existing.plannedEnd !== proposal.originalEnd) return bad("Original schedule changed; ask the teacher to propose again");
      if (decision === "accept") {
        if (proposal.proposedStart <= now) return bad("Proposed time has passed; ask the teacher to propose again");
        const other = (await db.select().from(lessons).all()).filter(l => l.id !== id);
        const acceptedSlot = { ...existing, plannedStart: proposal.proposedStart, plannedEnd: proposal.proposedEnd };
        const acceptedConflict = findLessonConflict(acceptedSlot, other);
        if (acceptedConflict) return conflictReply(acceptedSlot, acceptedConflict, actor.role);
        await db.update(lessons).set({ plannedStart: proposal.proposedStart, plannedEnd: proposal.proposedEnd, updatedAt: now }).where(eq(lessons.id, id));
      }
      const update = { status: decision === "accept" ? "accepted" : "rejected", respondedBy: actor.id, respondedAt: now };
      await db.update(rescheduleRequests).set(update).where(eq(rescheduleRequests.id, requestId));
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: id, actorId: actor.id, action: decision === "accept" ? "acceptReschedule" : "rejectReschedule", before: JSON.stringify(proposal), after: JSON.stringify(update), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "attendance") {
      if (actor.role === "teacher") {
        const roster = await readRoster();
        if (!teacherMaySeeLesson(actor, existing, new Set(roster.plans.filter(p => p.teacher === actor.teacherName).map(p => p.key)))) return bad("Student is no longer active or assigned", 403);
      }
      if (existing.status === "cancelled" || (existing.status !== "scheduled" && actor.role !== "admin")) return bad("This lesson is closed");
      if (actor.role === "teacher" && !mayCheckIn(existing.plannedStart, now)) return bad("课程当天才可以打卡");
      const attendanceKind = str(data.status);
      if (!["completed", "early_dismissal", "student_absent", "teacher_absent"].includes(attendanceKind)) return bad("Invalid attendance status");
      const status = attendanceKind === "early_dismissal" ? "completed" : attendanceKind;
      const actualStart = status === "completed" ? malaysiaIso(data.actualStart) : null;
      const totalHours = actor.role === "admin" && data.totalHours === undefined && status === "completed"
        ? hoursBetween(actualStart!, malaysiaIso(data.actualEnd)) : Number(data.totalHours);
      if (status === "completed" && (!Number.isFinite(totalHours) || totalHours <= 0 || totalHours > 12)) return bad("Enter total taught hours between 0 and 12");
      const actualEnd = actualStart ? new Date(Date.parse(actualStart) + totalHours * 3600000).toISOString() : null;
      if (actualStart && actualEnd) {
        hoursBetween(actualStart, actualEnd);
        if (malaysiaDate(actualStart) > malaysiaDate(now)) return bad("Actual class date cannot be in the future");
      }
      const update = { status, attendanceKind, actualStart, actualEnd, note: str(data.note).slice(0, 500) || null, chargeable: status === "completed", reviewedAt: now, reviewedBy: actor.id, updatedAt: now };
      await db.update(lessons).set(update).where(eq(lessons.id, id));
      await db.update(rescheduleRequests).set({ status: "stale", respondedAt: now }).where(and(eq(rescheduleRequests.lessonId, id), eq(rescheduleRequests.status, "pending")));
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: id, actorId: actor.id, action: "attendance", before: JSON.stringify(existing), after: JSON.stringify(update), at: now });
      return NextResponse.json({ ok: true });
    }
    if (actor.role !== "admin") return bad("Administrator access required", 403);
    if (action === "review") {
      if (!["completed", "student_absent", "teacher_absent"].includes(existing.status)) return bad("Attendance must be recorded first");
      if (existing.status === "completed" && (!existing.actualStart || !existing.actualEnd)) return bad("Actual times are required");
      const chargeable = existing.status === "teacher_absent" ? false : data.chargeable === true;
      if (chargeable) {
        const makeup = await db.select().from(lessons).where(eq(lessons.replacementFor, id)).all();
        if (makeup.some(l => l.status !== "cancelled")) return bad("This lesson has an active makeup; it cannot also be billed");
      }
      const update = { chargeable, reviewedAt: now, reviewedBy: actor.id, updatedAt: now };
      await db.update(lessons).set(update).where(eq(lessons.id, id));
      await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: id, actorId: actor.id, action: "review", before: JSON.stringify(existing), after: JSON.stringify(update), at: now });
      return NextResponse.json({ ok: true });
    }
    if (action === "cancel" || action === "edit") {
      const future = data.scope === "future";
      if (future && !existing.seriesId) return bad("This lesson is not recurring");
      const candidates = future ? (await db.select().from(lessons).where(eq(lessons.seriesId, existing.seriesId!)).all()).filter(l => l.plannedStart >= existing.plannedStart && !l.reviewedAt) : [existing];
      if (!candidates.length) return bad("No editable lessons");
      const newStart = action === "edit" ? malaysiaIso(data.start) : "";
      const newEnd = action === "edit" ? malaysiaIso(data.end) : "";
      if (action === "edit") hoursBetween(newStart, newEnd);
      const shift = action === "edit" ? Date.parse(newStart) - Date.parse(existing.plannedStart) : 0;
      if (action === "edit") {
        const candidateIds = new Set(candidates.map(l => l.id));
        const slots = candidates.map(row => ({ ...row, plannedStart: new Date(Date.parse(row.plannedStart) + shift).toISOString(), plannedEnd: future ? new Date(Date.parse(row.plannedStart) + shift + Date.parse(newEnd) - Date.parse(newStart)).toISOString() : newEnd }));
        const other = (await db.select().from(lessons).all()).filter(l => !candidateIds.has(l.id));
        for (const [index, slot] of slots.entries()) { const conflict = findLessonConflict(slot, [...other, ...slots.filter((_, i) => i !== index)]); if (conflict) return conflictReply(slot, conflict, actor.role); }
      }
      for (const row of candidates) {
        const update = action === "cancel" ? { status: "cancelled", reviewedAt: null, reviewedBy: null, chargeable: null, updatedAt: now } : { plannedStart: new Date(Date.parse(row.plannedStart) + shift).toISOString(), plannedEnd: future ? new Date(Date.parse(row.plannedStart) + shift + Date.parse(newEnd) - Date.parse(newStart)).toISOString() : newEnd, reviewedAt: null, reviewedBy: null, chargeable: null, updatedAt: now };
        await db.update(lessons).set(update).where(eq(lessons.id, row.id));
        await db.update(rescheduleRequests).set({ status: "stale", respondedAt: now }).where(and(eq(rescheduleRequests.lessonId, row.id), eq(rescheduleRequests.status, "pending")));
        await db.insert(audit).values({ id: crypto.randomUUID(), lessonId: row.id, actorId: actor.id, action: action === "edit" ? "reschedule" : "cancel", before: JSON.stringify(row), after: JSON.stringify(update), at: now });
      }
      return NextResponse.json({ ok: true, count: candidates.length });
    }
    return bad("Unknown action");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/^(Lesson time must be|Enter a Malaysia date and time|Invalid date and time|Invalid recurring lesson time|Recurring range is too long|End date precedes first lesson|请输入有效的网课链接|网课链接不能超过|网课链接必须是完整的)/.test(message)) return bad(message);
    return bad("服务器未能确认结果，请刷新列表检查是否已保存，再决定是否重试", 503);
  }
}
