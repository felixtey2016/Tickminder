import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../lib/student-calendar.ts", import.meta.url), "utf8");
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { malaysiaDay, monthDays, shiftMonth, activeLessonsOnDay, nextScheduledLesson } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);

assert.equal(malaysiaDay("2026-09-25T16:30:00.000Z"), "2026-09-26");
assert.equal(shiftMonth("2026-12", 1), "2027-01");
assert.equal(shiftMonth("2027-01", -1), "2026-12");
assert.equal(monthDays("2026-09")[0], "2026-08-31");
assert.equal(monthDays("2026-09").at(-1), "2026-10-04");
const lessons = [
  { id: "b", plannedStart: "2026-09-25T16:30:00.000Z", plannedEnd: "2026-09-25T17:30:00.000Z", status: "scheduled" },
  { id: "a", plannedStart: "2026-09-25T16:00:00.000Z", plannedEnd: "2026-09-25T16:15:00.000Z", status: "completed" },
  { id: "c", plannedStart: "2026-09-25T17:00:00.000Z", plannedEnd: "2026-09-25T18:00:00.000Z", status: "cancelled" },
];
assert.deepEqual(activeLessonsOnDay(lessons, "2026-09-26").map(x => x.id), ["a", "b"]);
assert.equal(nextScheduledLesson(lessons, "2026-09-25T15:30:00.000Z")?.id, "b");
const crossing=[{id:"crossing",plannedStart:"2026-10-31T15:30:00Z",plannedEnd:"2026-10-31T16:30:00Z",status:"scheduled"},{id:"ends-midnight",plannedStart:"2026-10-31T15:00:00Z",plannedEnd:"2026-10-31T16:00:00Z",status:"scheduled"}];
assert.deepEqual(activeLessonsOnDay(crossing,"2026-11-01").map(l=>l.id),["crossing"]);
console.log("student calendar dates and lesson selection passed");
