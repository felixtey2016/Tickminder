import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { validTestPdf } from "./valid-test-pdf.mjs";

// Run only against an isolated local Wrangler D1/R2 state, never a public URL.
const origin = "http://127.0.0.1:5174";
const root = path.resolve(import.meta.dirname, "..");
const state = path.join(root, ".wrangler", "learning-test");
const actors = {
  teacherA: { id: "test-teacher-a", token: "test-token-teacher-a", role: "teacher", name: "Test Teacher A", teacher: "Test Teacher A" },
  teacherB: { id: "test-teacher-b", token: "test-token-teacher-b", role: "teacher", name: "Test Teacher B", teacher: "Test Teacher B" },
  studentA: { id: "test-student-a", token: "test-token-student-a", role: "student", name: "Test Student A", student: "Test Student A" },
  studentB: { id: "test-student-b", token: "test-token-student-b", role: "student", name: "Test Student B", student: "Test Student B" },
  studentC: { id: "test-student-c", token: "test-token-student-c", role: "student", name: "Test Student C", student: "Test Student C" },
};
const sql = value => `'${String(value).replaceAll("'", "''")}'`;
const cookie = actor => `tuition_session=${actor.token}`;
const tomorrow = offset => new Date(Date.now() + offset * 60_000).toISOString();
const inputTime = iso => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(" ", "T");

async function request(actor, endpoint, body, multipart = false) {
  const headers = { origin, cookie: cookie(actor) };
  if (!multipart && body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${origin}${endpoint}`, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
  const content = response.headers.get("content-type") || "";
  return { status: response.status, data: content.includes("application/json") ? await response.json() : await response.arrayBuffer() };
}

function pdfForm(kind, fileBytes, homeworkId) {
  const form = new FormData();
  form.set("kind", kind);
  if (homeworkId) form.set("homeworkId", homeworkId);
  form.set("file", new File([fileBytes], "worksheet.pdf", { type: "application/pdf" }));
  return form;
}

async function main() {
  const live = await fetch(`${origin}/api/state`);
  assert.equal(live.status, 401, "Run the isolated local test server on port 5174");
  mkdirSync(state, { recursive: true });
  const now = new Date().toISOString();
  const values = [
    "DELETE FROM homework_submissions;", "DELETE FROM homework_recipients;", "DELETE FROM homework;",
    "DELETE FROM material_recipients;", "DELETE FROM teaching_materials;", "DELETE FROM study_blocks;",
    "DELETE FROM pdf_files;", "DELETE FROM storage_quota;", "DELETE FROM audit;", "DELETE FROM lessons;",
    "DELETE FROM plans;", "DELETE FROM sessions;", "DELETE FROM accounts;", "DELETE FROM teachers;", "DELETE FROM students;",
  ];
  for (const a of Object.values(actors)) {
    values.push(`INSERT INTO accounts (id,email,name,role,teacher_name,student_name,created_at) VALUES (${sql(a.id)},${sql(`${a.id}@example.test`)},${sql(a.name)},${sql(a.role)},${a.teacher ? sql(a.teacher) : "NULL"},${a.student ? sql(a.student) : "NULL"},${sql(now)});`);
    const hash = createHash("sha256").update(a.token).digest("base64url");
    values.push(`INSERT INTO sessions (token_hash,account_id,expires_at) VALUES (${sql(hash)},${sql(a.id)},${sql(tomorrow(60))});`);
    if (a.teacher) values.push(`INSERT INTO teachers (name,active,created_at) VALUES (${sql(a.teacher)},1,${sql(now)});`);
    if (a.student) values.push(`INSERT INTO students (name,name_key,active,created_at) VALUES (${sql(a.student)},${sql(a.student.toLowerCase().replaceAll(" ", ""))},1,${sql(now)});`);
  }
  values.push(`INSERT INTO plans (key,student,subject,teacher_name,duration,active,created_at) VALUES ('test-a-science','Test Student A','Science','Test Teacher A',1,1,${sql(now)});`);
  values.push(`INSERT INTO plans (key,student,subject,teacher_name,duration,active,created_at) VALUES ('test-b-science','Test Student B','Science','Test Teacher B',1,1,${sql(now)});`);
  values.push(`INSERT INTO plans (key,student,subject,teacher_name,duration,active,created_at) VALUES ('test-c-science','Test Student C','Science','Test Teacher A',1,1,${sql(now)});`);
  values.push(`INSERT INTO lessons (id,student,subject,teacher_name,planned_start,planned_end,status,kind,created_by,updated_at) VALUES ('test-lesson-a','Test Student A','Science','Test Teacher A',${sql(tomorrow(120))},${sql(tomorrow(180))},'scheduled','regular','test-teacher-a',${sql(now)});`);
  const fixture = path.join(state, "fixtures.sql");
  writeFileSync(fixture, values.join("\n"));
  execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/learning-test", "--file", fixture], { cwd: root, stdio: "pipe" });

  const a = actors.teacherA, b = actors.teacherB, sa = actors.studentA, sb = actors.studentB, sc = actors.studentC;
  const teacherState = await request(a, "/api/state");
  assert.equal(teacherState.status, 200);
  assert.deepEqual(teacherState.data.learning.eligible, [{ student: "Test Student A", subject: "Science" }, { student: "Test Student C", subject: "Science" }]);
  assert.equal((await request(a, "/api/learning", { action: "saveMaterial", title: "Test", subject: "Science", students: ["Test Student B"], fileId: "x" })).status, 403);
  const validPdf = validTestPdf();
  assert.equal((await request(a, "/api/files", pdfForm("material", new TextEncoder().encode("not a PDF")), true)).status, 400);
  assert.equal((await request(a, "/api/files", pdfForm("material", new TextEncoder().encode("%PDF-1.4\n%%EOF\n")), true)).status, 400);
  assert.equal((await request(a, "/api/files", pdfForm("material", new Uint8Array(10 * 1024 * 1024 + 1).fill(65)), true)).status, 413);
  const uploaded = await request(a, "/api/files", pdfForm("material", validPdf), true);
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.data));
  const fileId = uploaded.data.id;
  assert.equal((await request(sb, `/api/files/${fileId}`)).status, 404);
  assert.equal((await request(b, `/api/files/${fileId}`)).status, 404);
  assert.equal((await request(a, "/api/learning", { action: "saveMaterial", title: "Test worksheet", subject: "Science", students: ["Test Student B"], fileId })).status, 403);
  const material = await request(a, "/api/learning", { action: "saveMaterial", title: "Test worksheet", description: "Page 1", subject: "Science", students: ["Test Student A", "Test Student C"], fileId });
  assert.equal(material.status, 200, JSON.stringify(material.data));
  const downloaded = await request(sa, `/api/files/${fileId}`);
  assert.equal(downloaded.status, 200);
  assert.deepEqual(new Uint8Array(downloaded.data), validPdf);
  assert.equal((await request(sc, `/api/files/${fileId}`)).status, 200);
  assert.equal((await request(sc, "/api/state")).data.learning.materials[0].fileId, fileId, "One PDF is shared with two assigned students");
  assert.equal((await request(sb, `/api/files/${fileId}`)).status, 404);
  assert.equal((await request(b, "/api/learning", { action: "deleteMaterial", id: material.data.id })).status, 404);
  assert.equal((await request(sb, "/api/state")).data.learning.materials.length, 0);

  const future = await request(a, "/api/learning", { action: "publishHomework", title: "Future", subject: "Science", description: "Page 1", students: ["Test Student A"], startsAt: inputTime(tomorrow(240)), dueAt: inputTime(tomorrow(300)), materialId: material.data.id });
  assert.equal(future.status, 200, JSON.stringify(future.data));
  assert.equal((await request(sa, "/api/files", pdfForm("submission", validPdf, future.data.id), true)).status, 403);
  assert.equal((await request(sb, "/api/learning", { action: "submitHomework", homeworkId: future.data.id, fileId })).status, 404);

  const open = await request(a, "/api/learning", { action: "publishHomework", title: "Past-year paper", subject: "Science", description: "Complete page 2", students: ["Test Student A"], startsAt: inputTime(tomorrow(-60)), dueAt: inputTime(tomorrow(120)), materialId: material.data.id, scoreEnabled: true, maxScore: 100 });
  assert.equal(open.status, 200, JSON.stringify(open.data));
  assert.equal((await request(a, "/api/learning", { action: "setHomeworkScore", homeworkId: open.data.id, studentName: "Test Student A", score: 88 })).status, 409);
  const staged = await request(sa, "/api/files", pdfForm("submission", validPdf, open.data.id), true);
  assert.equal(staged.status, 200, JSON.stringify(staged.data));
  assert.equal((await request(sa, "/api/state")).data.learning.submissions.length, 0, "Upload is not submission");
  assert.equal((await request(sb, `/api/files/${staged.data.id}`)).status, 404);
  assert.equal((await request(b, `/api/files/${staged.data.id}`)).status, 404);
  assert.equal((await request(sa, "/api/learning", { action: "submitHomework", homeworkId: future.data.id, fileId: staged.data.id })).status, 403);
  const submitted = await request(sa, "/api/learning", { action: "submitHomework", homeworkId: open.data.id, fileId: staged.data.id });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
  assert.equal((await request(a, `/api/files/${staged.data.id}`)).status, 200);
  assert.equal((await request(b, `/api/files/${staged.data.id}`)).status, 404);
  assert.equal((await request(sb, `/api/files/${staged.data.id}`)).status, 404);
  assert.equal((await request(sa, "/api/state")).data.learning.submissions.length, 1);
  assert.equal((await request(b, "/api/learning", { action: "setHomeworkScore", homeworkId: open.data.id, studentName: "Test Student A", score: 88 })).status, 404);
  assert.equal((await request(sa, "/api/learning", { action: "setHomeworkScore", homeworkId: open.data.id, studentName: "Test Student A", score: 88 })).status, 403);
  assert.equal((await request(a, "/api/learning", { action: "setHomeworkScore", homeworkId: open.data.id, studentName: "Test Student A", score: 101 })).status, 400);
  assert.equal((await request(a, "/api/learning", { action: "setHomeworkScore", homeworkId: open.data.id, studentName: "Test Student A", score: 88 })).status, 200);
  assert.equal((await request(sa, "/api/state")).data.learning.homework.find(x => x.id === open.data.id).score, 88);
  assert.equal((await request(sb, "/api/state")).data.learning.homework.length, 0);
  const replacement = await request(sa, "/api/files", pdfForm("submission", validPdf, open.data.id), true);
  assert.equal(replacement.status, 200);
  assert.equal((await request(sa, "/api/learning", { action: "submitHomework", homeworkId: open.data.id, fileId: replacement.data.id })).status, 200);
  assert.equal((await request(sa, "/api/state")).data.learning.submissions.length, 2);
  assert.equal((await request(sa, "/api/state")).data.learning.homework.find(x => x.id === open.data.id).score, null, "Replacement clears an old mark");

  const late = await request(a, "/api/learning", { action: "publishHomework", title: "Late", subject: "Science", description: "Page 3", students: ["Test Student A"], startsAt: inputTime(tomorrow(-180)), dueAt: inputTime(tomorrow(-60)) });
  assert.equal(late.status, 200, JSON.stringify(late.data));
  const lateFile = await request(sa, "/api/files", pdfForm("submission", validPdf, late.data.id), true);
  assert.equal(lateFile.status, 200);
  const lateSubmit = await request(sa, "/api/learning", { action: "submitHomework", homeworkId: late.data.id, fileId: lateFile.data.id });
  assert.equal(lateSubmit.status, 200);
  assert.equal(lateSubmit.data.submission.late, true);
  assert.equal((await request(sa, "/api/files", pdfForm("submission", validPdf, late.data.id), true)).status, 403);

  const shared = await request(a, "/api/learning", { action: "publishHomework", title: "Shared", subject: "Science", description: "Independent submissions", students: ["Test Student A", "Test Student C"], startsAt: inputTime(tomorrow(-60)), dueAt: inputTime(tomorrow(120)) });
  assert.equal(shared.status, 200, JSON.stringify(shared.data));
  const sharedA = await request(sa, "/api/files", pdfForm("submission", validPdf, shared.data.id), true);
  assert.equal(sharedA.status, 200);
  assert.equal((await request(sa, "/api/learning", { action: "submitHomework", homeworkId: shared.data.id, fileId: sharedA.data.id })).status, 200);
  assert.equal((await request(sc, "/api/state")).data.learning.submissions.length, 0);
  assert.equal((await request(sc, `/api/files/${sharedA.data.id}`)).status, 404);
  const sharedC = await request(sc, "/api/files", pdfForm("submission", validPdf, shared.data.id), true);
  assert.equal(sharedC.status, 200);
  assert.equal((await request(sc, "/api/learning", { action: "submitHomework", homeworkId: shared.data.id, fileId: sharedC.data.id })).status, 200);
  assert.equal((await request(sa, `/api/files/${sharedC.data.id}`)).status, 404);
  assert.equal((await request(sc, "/api/state")).data.learning.submissions.length, 1);
  assert.equal((await request(a, "/api/state")).data.learning.submissions.filter(x => x.homeworkId === shared.data.id).length, 2);

  const study = { action: "saveStudyBlock", title: "Science review", startsAt: inputTime(tomorrow(130)), endsAt: inputTime(tomorrow(150)), homeworkId: open.data.id };
  const clash = await request(sa, "/api/learning", study);
  assert.equal(clash.status, 409, JSON.stringify(clash.data));
  assert.ok(clash.data.overlaps.length);
  const saved = await request(sa, "/api/learning", { ...study, keepOverlap: true });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await request(sb, "/api/learning", { ...study, homeworkId: "", id: saved.data.id, keepOverlap: true })).status, 404);
  assert.equal((await request(sb, "/api/learning", { action: "deleteStudyBlock", id: saved.data.id })).status, 404);
  assert.equal((await request(sb, "/api/state")).data.learning.studyBlocks.length, 0);
  assert.equal((await request(sa, "/api/state")).data.learning.studyBlocks.length, 1);
  assert.equal((await request(sa, "/api/learning", { action: "deleteStudyBlock", id: saved.data.id })).status, 200);
  assert.equal((await request(a, "/api/learning", { action: "deleteMaterial", id: material.data.id })).status, 200);
  assert.equal((await request(sa, `/api/files/${fileId}`)).status, 200, "Deleting a shared material must retain homework attachments");
  assert.equal((await request(sa, "/api/state")).data.lessons.length, 1, "Study plans and homework do not change lessons");
  console.log("Learning integration verified: private PDF access, assignment scope, upload/submit separation, timing, replacement, late submission, optional manual scores, and private study plans.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
