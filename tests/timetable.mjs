import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/timetable.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { timetableLessons, timetableHours, malaysiaMonth } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

const lesson = (id, student, teacherName, plannedStart, status = "scheduled") => ({
  id, student, subject: "Science", teacherName, plannedStart,
  plannedEnd: new Date(Date.parse(plannedStart) + 3_600_000).toISOString(),
  actualStart: status === "completed" ? plannedStart : null,
  actualEnd: status === "completed" ? new Date(Date.parse(plannedStart) + 5_400_000).toISOString() : null,
  status,
});
const rows = [
  lesson("a", "Sample Student", "Teacher A", "2026-09-30T16:00:00.000Z", "completed"), // October in Malaysia
  lesson("b", "Sample Student", "Teacher A", "2026-10-02T08:00:00.000Z"),
  lesson("c", "Another Student", "Teacher A", "2026-10-03T08:00:00.000Z"),
  lesson("d", "Sample Student", "Teacher B", "2026-10-04T08:00:00.000Z"),
  lesson("e", "Sample Student", "Teacher A", "2026-10-05T08:00:00.000Z", "cancelled"),
];
assert.equal(malaysiaMonth(rows[0].plannedStart), "2026-10");
assert.deepEqual(timetableLessons(rows, "2026-10", "student", "Sample Student").map(l => l.id), ["a", "b", "d"]);
assert.deepEqual(timetableLessons(rows, "2026-10", "teacher", "Teacher A", "Sample Student").map(l => l.id), ["a", "b"]);
assert.deepEqual(timetableLessons(rows, "2026-10", "teacher", "Teacher A").map(l => l.id), ["a", "b", "c"]);
assert.equal(timetableHours(timetableLessons(rows, "2026-10", "teacher", "Teacher A", "Sample Student")), 2.5);
console.log("timetable filters and Malaysia month passed");
