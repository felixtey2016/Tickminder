import assert from "node:assert/strict";
import {
  courseBadgeCount, courseSection, defaultCourseView, getCourseTabs,
  isCourseView, normalizeCourseView,
} from "../lib/course-navigation.ts";

const roleLeaves = {
  admin: ["calendar", "list", "schedule", "attention", "overview", "students", "teachers"],
  teacher: ["calendar", "lessons", "attendance", "reschedule", "hours", "schedule"],
  student: ["calendar", "list", "reschedule"],
  pending: [],
};
const everyLeaf = [...new Set(Object.values(roleLeaves).flat())];

for (const [role, leaves] of Object.entries(roleLeaves)) {
  assert.equal(defaultCourseView(role), role === "pending" ? null : "calendar");
  for (const leaf of everyLeaf) {
    assert.equal(isCourseView(role, leaf), leaves.includes(leaf), `${role}: ${leaf}`);
    assert.equal(normalizeCourseView(role, leaf), leaf, "Existing history leaf IDs remain stable");
    assert.equal(courseSection(role, leaf) !== null, leaves.includes(leaf), "Foreign-role leaves have no section");
  }
  for (const invalid of [undefined, null, {}, "", "teacherRoster", "studentRoster", "subjects", "accounts", "madeUpView"]) {
    assert.equal(isCourseView(role, invalid), false);
    assert.equal(courseSection(role, invalid), null);
  }
  const tabs = getCourseTabs(role);
  assert.equal(new Set(tabs.map(tab => tab.id)).size, tabs.length, "Sections are unique");
  assert.deepEqual(
    tabs.flatMap(tab => tab.views).sort(),
    leaves.filter(leaf => leaf !== "schedule").sort(),
    "All course destinations are reachable exactly once; scheduling is a separate primary action",
  );
  for (const tab of tabs) {
    assert.ok(tab.views.includes(tab.defaultView));
    for (const leaf of tab.views) assert.equal(courseSection(role, leaf), tab.id);
  }
}

assert.equal(courseSection("admin", "students"), "timetable");
assert.equal(courseSection("admin", "teachers"), "timetable");
assert.equal(courseSection("teacher", "lessons"), "attendance");
assert.equal(courseSection("teacher", "attendance"), "attendance");
assert.equal(courseSection("teacher", "students"), null, "Teacher student assignments stay outside Courses");
assert.equal(courseSection("admin", "attendance"), null, "Teacher attendance leaf does not become an admin shortcut");
assert.equal(courseSection("student", "schedule"), null, "Students receive no scheduling action");

for (const role of Object.keys(roleLeaves)) {
  assert.equal(normalizeCourseView(role, "quizBank"), "quizzes");
  assert.equal(normalizeCourseView(role, "courses"), role === "pending" ? "courses" : "calendar");
  assert.equal(normalizeCourseView(role, "timetable"), role === "admin" ? "students" : "timetable");
  assert.equal(normalizeCourseView(role, "home"), "home");
  assert.equal(normalizeCourseView(role, "unknown"), "unknown", "Full-menu validation remains the caller's responsibility");
}
assert.equal(isCourseView("teacher", normalizeCourseView("teacher", "timetable")), false);
assert.equal(isCourseView("student", normalizeCourseView("student", "timetable")), false);
assert.equal(isCourseView("pending", normalizeCourseView("pending", "courses")), false);

const counts = { attention: 9, overview: 4, lessons: 3, attendance: 3, reschedule: 2, calendar: 90, list: 90 };
assert.equal(courseBadgeCount("admin", counts), 9, "Admin overview must not be counted twice");
assert.equal(courseBadgeCount("teacher", counts), 5, "Teacher attendance must not repeat the lessons count");
assert.equal(courseBadgeCount("student", counts), 2);
assert.equal(courseBadgeCount("pending", counts), 0);
assert.equal(courseBadgeCount("admin", {}), 0);
assert.equal(courseBadgeCount("teacher", { lessons: -1, reschedule: Number.NaN }), 0);
assert.equal(courseBadgeCount("student", { reschedule: Number.POSITIVE_INFINITY }), 0);

console.log("PASS: course leaf/history compatibility, role-specific sections and tabs, alias validation, separate teacher assignments, scheduling restrictions and deduplicated badges");
