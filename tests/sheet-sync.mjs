import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { monthlySheetPairs } from "../lib/sheet-sync.ts";

const plans = [{ student: "Sample Student", subject: "Math" }, { student: "Sample Student", subject: "Science" }];
const lesson = (subject, start, end, chargeable = true) => ({
  student: "Sample Student", subject, status: "completed", actualStart: start, actualEnd: end,
  reviewedAt: "2026-09-30T12:00:00.000Z", chargeable,
});
const rows = [
  lesson("Math", "2026-08-31T16:30:00.000Z", "2026-08-31T17:30:00.000Z"),
  lesson("Math", "2026-09-02T12:00:00.000Z", "2026-09-02T12:30:00.000Z", false),
  { ...lesson("Math", "2026-09-03T12:00:00.000Z", "2026-09-03T13:00:00.000Z"), reviewedAt: null },
  { ...lesson("Math", "2026-09-04T12:00:00.000Z", "2026-09-04T13:00:00.000Z"), status: "student_absent" },
];
assert.deepEqual(monthlySheetPairs(plans, rows, "2026-09", "billable"), [
  { student: "Sample Student", subject: "Math", hours: 1 },
  { student: "Sample Student", subject: "Science", hours: 0 },
]);
assert.equal(monthlySheetPairs(plans, rows, "2026-09", "all_completed")[0].hours, 1.5);
assert.equal(monthlySheetPairs(plans, rows, "2026-08", "billable")[0].hours, 0);

const cells = new Map([
  ["A1", "Month"], ["A2", "9月 2026"], ["B2", "old month JSON"],
  ["A5", "Sample Student"], ["B5", "Math"], ["H5", 9],
  ["A6", "Sample Student"], ["B6", "Science"], ["H6", 7],
  ["A7", "SampleStudent"], ["B7", "Math"], ["H7", 6],
]);
const sheet = {
  getLastRow: () => 7,
  getRange: (a, b, count, columns) => {
    const address = typeof a === "string" ? a : `${String.fromCharCode(64 + b)}${a}`;
    return {
      getValue: () => cells.get(address) ?? "",
      getDisplayValue: () => String(cells.get(address) ?? ""),
      setValue: value => { cells.set(address, value); },
      getValues: () => Array.from({ length: count }, (_, i) =>
        Array.from({ length: columns }, (_, j) => cells.get(`${String.fromCharCode(64 + b + j)}${a + i}`) ?? "")),
      getDisplayValues: () => Array.from({ length: count }, (_, i) => [String(cells.get(`A${a + i}`) ?? "")]),
    };
  },
};
const storage = { ...sheet };
const context = vm.createContext({
  console, Date, JSON, Array, Object,
  Utilities: { DigestAlgorithm: { SHA_256: "sha256" }, computeDigest: (_, data) => [...createHash("sha256").update(data).digest()] },
});
vm.runInContext(readFileSync(new URL("../integrations/GoogleSheetLessonSync.gs", import.meta.url), "utf8"), context);
const month = { month: "2026-09", displayMonth: "9月 2026" };
const pair = [{ student: "Sample Student", subject: "Math", hours: 1.5 }];
const preview = context.sheetSyncPreview(sheet, storage, month, pair);
assert.equal(preview.changes.length, 1);
assert.equal(preview.changes[0].row, 5);
assert.equal(preview.skipped.find(item => item.student === "SampleStudent").reason, "not_in_website");
assert.equal(cells.get("H5"), 9, "preview never writes");
assert.equal(context.sheetSyncPreview(sheet, storage, month, [{ student: "SampleStudent", subject: "Math", hours: 2 }]).changes[0].row, 7);
assert.equal(context.sheetSyncPreview(sheet, storage, month, [{ student: "sample student", subject: "Math", hours: 2 }]).changes.length, 0);
cells.set("H5", 4);
assert.notEqual(context.sheetSyncPreview(sheet, storage, month, pair).previewToken, preview.previewToken, "edits invalidate confirmation");
cells.set("H5", 9);
cells.set("A7", "Sample Student");
assert.equal(context.sheetSyncPreview(sheet, storage, month, pair).changes.length, 0, "duplicate sheet pairs are skipped");
cells.set("A7", "SampleStudent");
context.sheetSyncMonth = () => month;
context.getManualInputs = () => [{ rowIndex: 0, 0: "Sample Student", 1: "Math", 7: cells.get("H5") }];
context.SpreadsheetApp = { flush: () => {} };
const first = context.sheetSyncPreview(sheet, storage, month, pair);
assert.equal(context.sheetSyncCommit({}, sheet, storage, month, first).written, 1);
assert.equal(cells.get("H5"), 1.5);
assert.match(cells.get("B2"), /"7":1\.5/);
const second = context.sheetSyncPreview(sheet, storage, month, pair);
context.sheetSyncCommit({}, sheet, storage, month, second);
assert.equal(cells.get("H5"), 1.5, "repeat import replaces rather than adds");
console.log("sheet sync summary and exact-match preview passed");
