import assert from "node:assert/strict";
import { approvedActualHours, approvedHoursInMonth, billedHours, checkinInMonth, findLessonConflict, generateWeekly, inMonth, mayCheckIn, monthlyAttendanceForPair } from "../lib/lesson-rules.ts";
import { teacherMaySeeLesson } from "../lib/access.ts";

const dates = generateWeekly("2026-09-02T12:00:00.000Z", "2026-09-02T13:00:00.000Z", "2026-09-16T15:59:00.000Z");
assert.equal(dates.length, 3);
assert.equal(dates[1].start, "2026-09-09T12:00:00.000Z");
assert.equal(new Set(dates.map(x => x.start)).size, 3);

const completed = { student: "A", subject: "Math", plannedStart: dates[0].start, plannedEnd: dates[0].end, actualStart: "2026-09-02T12:05:00.000Z", actualEnd: "2026-09-02T13:20:00.000Z", status: "completed", chargeable: true, reviewedAt: "2026-09-03T00:00:00.000Z" };
assert.equal(billedHours(completed), 1.25);
assert.equal(approvedActualHours(completed), 1.25);
assert.equal(approvedActualHours({ ...completed, chargeable: false }), 1.25);
assert.equal(billedHours({ ...completed, reviewedAt: null }), 0);
assert.equal(billedHours({ ...completed, status: "cancelled" }), 0);
assert.equal(billedHours({ ...completed, status: "student_absent", actualStart: null, actualEnd: null }), 1);
assert.equal(billedHours({ ...completed, status: "student_absent", chargeable: false }), 0);
assert.equal(inMonth("2026-08-31T16:30:00.000Z", "2026-09"), true);
assert.equal(inMonth("2026-08-31T15:30:00.000Z", "2026-09"), false);
const movedAcrossMonth = { ...completed, plannedStart: "2026-09-30T12:00:00.000Z", plannedEnd: "2026-09-30T13:00:00.000Z", actualStart: "2026-09-30T16:00:00.000Z", actualEnd: "2026-09-30T17:30:00.000Z" };
assert.equal(approvedHoursInMonth(movedAcrossMonth, "2026-09"), 0);
assert.equal(approvedHoursInMonth(movedAcrossMonth, "2026-10"), 1.5);
assert.equal(approvedHoursInMonth({ ...movedAcrossMonth, reviewedAt: null }, "2026-10"), 0);
const teacher = { role: "teacher", teacherName: "Sydney" };
const ownLesson = { teacherName: "Sydney", student: "Hebe", subject: "Mathematics" };
const active = new Set(["Hebe|Mathematics"]);
assert.equal(teacherMaySeeLesson(teacher, ownLesson, active), true);
assert.equal(teacherMaySeeLesson(teacher, { ...ownLesson, teacherName: "Huixuan" }, active), false);
assert.equal(teacherMaySeeLesson(teacher, ownLesson, new Set()), false);
assert.equal(teacherMaySeeLesson({ ...teacher, role: "pending" }, ownLesson, active), false);
assert.equal(checkinInMonth({ ...completed, reviewedAt: null }, "2026-09"), true);
assert.equal(checkinInMonth({ ...completed, status: "student_absent", actualStart: null }, "2026-09"), true);
const paired = monthlyAttendanceForPair([
  { ...completed, teacherName: "Sydney" },
  { ...completed, teacherName: "Lim", actualEnd: "2026-09-02T14:05:00.000Z" },
  { ...completed, teacherName: "Sydney", reviewedAt: null },
], "2026-09", "A", "Sydney");
assert.equal(paired.records.length, 2);
assert.equal(paired.submittedHours, 2.5);
assert.equal(paired.approvedHours, 1.25);
assert.equal(paired.approvedLessons, 1);
const slot = { id: "a", student: "Hebe", teacherName: "Sydney", plannedStart: dates[0].start, plannedEnd: dates[0].end, status: "scheduled" };
assert.equal(findLessonConflict({ ...slot, id: "b", student: "Other" }, [slot])?.id, "a");
assert.equal(findLessonConflict({ ...slot, id: "b", teacherName: "Other" }, [slot])?.id, "a");
assert.equal(findLessonConflict({ ...slot, id: "b", student: "He be", teacherName: "Other" }, [slot])?.id, "a");
assert.equal(findLessonConflict({ ...slot, id: "b", student: "Other", teacherName: "Other" }, [slot]), undefined);
assert.equal(findLessonConflict({ ...slot, id: "b", plannedStart: slot.plannedEnd, plannedEnd: dates[1].end }, [slot]), undefined);
assert.equal(findLessonConflict({ ...slot, id: "b" }, [{ ...slot, status: "cancelled" }]), undefined);
assert.equal(mayCheckIn("2026-09-25T16:00:00.000Z", "2026-09-25T15:59:00.000Z"), false);
assert.equal(mayCheckIn("2026-09-25T16:00:00.000Z", "2026-09-25T16:00:00.000Z"), true);
assert.equal(mayCheckIn("2026-09-26T12:00:00.000Z", "2026-09-26T02:00:00.000Z"), true);
console.log("lesson rules passed");
