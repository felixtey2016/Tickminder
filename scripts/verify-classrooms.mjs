import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { validTestPdf } from "./valid-test-pdf.mjs";

// This test resets only .wrangler/classrooms-test. Never point it at a public URL.
const origin = "http://127.0.0.1:5176";
const root = path.resolve(import.meta.dirname, "..");
const stateDir = path.join(root, ".wrangler", "classrooms-test");
const people = {
  admin: { id: "class-admin", token: "class-admin-token", role: "admin", name: "Demo Admin" },
  teacherA: { id: "class-teacher-a", token: "class-teacher-a-token", role: "teacher", name: "Demo Teacher A", teacher: "Demo Teacher A" },
  teacherB: { id: "class-teacher-b", token: "class-teacher-b-token", role: "teacher", name: "Demo Teacher B", teacher: "Demo Teacher B" },
  studentA: { id: "class-student-a", token: "class-student-a-token", role: "student", name: "Demo Student A", student: "Demo Student A" },
  studentB: { id: "class-student-b", token: "class-student-b-token", role: "student", name: "Demo Student B", student: "Demo Student B" },
  studentC: { id: "class-student-c", token: "class-student-c-token", role: "student", name: "Demo Student C", student: "Demo Student C" },
};
const sql = value => `'${String(value).replaceAll("'", "''")}'`;
const time = minutes => new Date(Date.now() + minutes * 60000).toISOString();
const local = iso => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).replace(" ", "T");

async function call(person, endpoint, body, multipart = false) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const headers = { origin, cookie: `tuition_session=${person.token}` };
    if (body !== undefined && !multipart) headers["content-type"] = "application/json";
    const response = await fetch(origin + endpoint, { method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : await response.arrayBuffer();
    const restart = response.status === 503 && data instanceof ArrayBuffer && new TextDecoder().decode(data).includes("Your worker restarted mid-request");
    if (!restart || attempt === 3) return { status: response.status, data };
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error("Unreachable");
}

function pdfForm(kind, homeworkId) {
  const form = new FormData();
  form.set("kind", kind);
  if (homeworkId) form.set("homeworkId", homeworkId);
  form.set("file", new File([validTestPdf()], "class-handout.pdf", { type: "application/pdf" }));
  return form;
}

async function main() {
  if (!process.argv.includes("--run")) {
  mkdirSync(stateDir, { recursive: true });
  const now = new Date().toISOString();
  const statements = ["DELETE FROM classroom_announcements;", "DELETE FROM classroom_members;", "DELETE FROM classrooms;", "DELETE FROM homework_submissions;", "DELETE FROM homework_recipients;", "DELETE FROM homework;", "DELETE FROM material_recipients;", "DELETE FROM teaching_materials;", "DELETE FROM pdf_files;", "DELETE FROM storage_quota;", "DELETE FROM audit;", "DELETE FROM lessons;", "DELETE FROM plans;", "DELETE FROM sessions;", "DELETE FROM accounts;", "DELETE FROM teachers;", "DELETE FROM students;"];
  for (const person of Object.values(people)) {
    statements.push(`INSERT INTO accounts (id,email,name,name_confirmed_at,role,teacher_name,student_name,created_at) VALUES (${sql(person.id)},'',${sql(person.name)},${sql(now)},${sql(person.role)},${person.teacher ? sql(person.teacher) : "NULL"},${person.student ? sql(person.student) : "NULL"},${sql(now)});`);
    statements.push(`INSERT INTO sessions (token_hash,account_id,expires_at) VALUES (${sql(createHash("sha256").update(person.token).digest("base64url"))},${sql(person.id)},${sql(time(60))});`);
    if (person.teacher) statements.push(`INSERT INTO teachers (name,active,created_at) VALUES (${sql(person.teacher)},1,${sql(now)});`);
    if (person.student) statements.push(`INSERT INTO students (name,name_key,active,created_at) VALUES (${sql(person.student)},${sql(person.student.toLowerCase().replaceAll(" ", ""))},1,${sql(now)});`);
  }
  for (const [student, teacher] of [["Demo Student A", "Demo Teacher A"], ["Demo Student B", "Demo Teacher B"], ["Demo Student C", "Demo Teacher A"]]) {
    statements.push(`INSERT INTO plans (key,student,subject,teacher_name,duration,active,created_at) VALUES (${sql(`${student}|Science`)},${sql(student)},'Science',${sql(teacher)},1,1,${sql(now)});`);
  }
  const fixture = path.join(stateDir, "classroom-fixtures.sql");
  writeFileSync(fixture, statements.join("\n"));
  execFileSync(process.execPath, ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", "dist/server/wrangler.json", "--persist-to", ".wrangler/classrooms-test", "--file", fixture], { cwd: root, stdio: "pipe" });
  if (process.argv.includes("--seed")) { console.log("Seeded isolated classroom database"); return; }
  }
  assert.equal((await fetch(origin + "/api/state")).status, 401, "Start the isolated local server on port 5176");

  const { admin, teacherA, teacherB, studentA, studentB, studentC } = people;
  const classBody = { action: "saveClassroom", title: "Science Group", subject: "Science", students: ["Demo Student A", "Demo Student C"] };
  // Local Wrangler can restart once while lazily loading the route. Warm it with a denied, side-effect-free request.
  for (let attempt = 0; attempt < 4; attempt++) {
    const warm = await call(teacherB, "/api/classrooms", { ...classBody, students: ["Demo Student A"] });
    if (warm.status === 403) break;
    if (warm.status !== 503 || attempt === 3) throw new Error(`Cannot warm local route: ${warm.status}`);
  }
  assert.equal((await call(studentA, "/api/classrooms", classBody)).status, 403);
  const deniedCreate = await call(teacherB, "/api/classrooms", { ...classBody, students: ["Demo Student A"] });
  assert.equal(deniedCreate.status, 403, deniedCreate.data instanceof ArrayBuffer ? new TextDecoder().decode(deniedCreate.data).slice(0, 500) : JSON.stringify(deniedCreate.data));
  const created = await call(teacherA, "/api/classrooms", classBody);
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const classroomId = created.data.id;
  assert.ok(classroomId);
  const stateA = await call(studentA, "/api/state");
  assert.equal(stateA.status, 200, JSON.stringify(stateA.data));
  assert.equal(stateA.data.classrooms.length, 1);
  assert.equal("members" in stateA.data.classrooms[0], false, "Student must not see the class roster");
  assert.deepEqual((await call(teacherA, "/api/state")).data.classrooms[0].members, ["Demo Student A", "Demo Student C"]);
  assert.equal((await call(studentB, "/api/state")).data.classrooms.length, 0);
  assert.equal((await call(teacherB, "/api/state")).data.classrooms.length, 0);
  assert.equal((await call(teacherB, "/api/classrooms", { action: "saveAnnouncement", classroomId, title: "Intrusion", body: "No" })).status, 404);
  assert.equal((await call(studentA, "/api/classrooms", { action: "saveAnnouncement", classroomId, title: "Intrusion", body: "No" })).status, 403);
  assert.equal((await call(teacherA, "/api/classrooms", { action: "saveAnnouncement", classroomId, title: "Bring notes", body: "Chapter 3", pinned: true })).status, 200);
  assert.equal((await call(studentA, "/api/state")).data.classrooms[0].announcements[0].title, "Bring notes");
  assert.equal((await call(studentB, "/api/state")).data.classrooms.length, 0);

  const upload = await call(teacherA, "/api/files", pdfForm("material"), true);
  assert.equal(upload.status, 200, JSON.stringify(upload.data));
  const fileId = upload.data.id;
  const material = await call(teacherA, "/api/learning", { action: "saveMaterial", classroomId, title: "Group worksheet", subject: "Science", students: ["Demo Student B"], fileId });
  assert.equal(material.status, 200, JSON.stringify(material.data));
  assert.equal((await call(studentA, `/api/files/${fileId}`)).status, 200);
  assert.equal((await call(studentC, `/api/files/${fileId}`)).status, 200);
  assert.equal((await call(studentB, `/api/files/${fileId}`)).status, 404);
  assert.equal((await call(teacherB, "/api/learning", { action: "saveMaterial", classroomId, title: "Bad", subject: "Science", students: ["Demo Student B"], fileId })).status, 403);
  assert.equal((await call(teacherA, "/api/learning", { action: "publishHomework", title: "Wrong scope", subject: "Science", description: "No", students: ["Demo Student A"], startsAt: local(time(-60)), dueAt: local(time(120)), materialId: material.data.id })).status, 403);

  const assigned = await call(teacherA, "/api/learning", { action: "publishHomework", classroomId, title: "Past year", subject: "Science", description: "Complete all questions", students: ["Demo Student B"], startsAt: local(time(-60)), dueAt: local(time(120)), materialId: material.data.id, scoreEnabled: true, maxScore: 100 });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.data));
  const homeworkId = assigned.data.id;
  assert.equal((await call(studentA, "/api/state")).data.learning.homework.some(item => item.id === homeworkId), true);
  assert.equal((await call(studentC, "/api/state")).data.learning.homework.some(item => item.id === homeworkId), true);
  assert.equal((await call(studentB, "/api/state")).data.learning.homework.length, 0);
  const submittedFile = await call(studentA, "/api/files", pdfForm("submission", homeworkId), true);
  assert.equal(submittedFile.status, 200);
  assert.equal((await call(studentA, "/api/learning", { action: "submitHomework", homeworkId, fileId: submittedFile.data.id })).status, 200);
  assert.equal((await call(studentC, "/api/state")).data.learning.submissions.length, 0);
  assert.equal((await call(teacherA, "/api/learning", { action: "setHomeworkScore", homeworkId, studentName: "Demo Student A", score: 91 })).status, 200);
  assert.equal((await call(studentA, "/api/state")).data.learning.homework.find(item => item.id === homeworkId).score, 91);

  assert.equal((await call(teacherB, "/api/classrooms", { ...classBody, id: classroomId })).status, 404);
  assert.equal((await call(teacherA, "/api/classrooms", { ...classBody, id: classroomId, students: ["Demo Student A"] })).status, 200);
  assert.equal((await call(studentC, "/api/state")).data.classrooms.length, 0);
  assert.equal((await call(studentC, "/api/state")).data.learning.materials.length, 0);
  assert.equal((await call(studentC, `/api/files/${fileId}`)).status, 404, "Old direct URL must not bypass removed membership");
  assert.equal((await call(studentC, "/api/files", pdfForm("submission", homeworkId), true)).status, 403);
  assert.equal((await call(teacherA, "/api/classrooms", { ...classBody, id: classroomId })).status, 200);
  assert.equal((await call(studentC, `/api/files/${fileId}`)).status, 200);
  assert.equal((await call(studentC, "/api/state")).data.learning.homework.some(item => item.id === homeworkId), true);

  const studentCPlan = { action: "savePlan", student: "Demo Student C", subject: "Science", teacherName: "Demo Teacher A", duration: 1 };
  assert.equal((await call(admin, "/api/action", { ...studentCPlan, active: false })).status, 200);
  assert.equal((await call(studentC, "/api/state")).data.classrooms.length, 0);
  assert.equal((await call(studentC, "/api/state")).data.learning.homework.some(item => item.id === homeworkId), false);
  assert.equal((await call(studentC, `/api/files/${fileId}`)).status, 404, "An inactive subject must revoke the old PDF URL");
  const secondUpload = await call(teacherA, "/api/files", pdfForm("material"), true);
  assert.equal(secondUpload.status, 200);
  assert.equal((await call(teacherA, "/api/learning", { action: "saveMaterial", classroomId, title: "While inactive", subject: "Science", fileId: secondUpload.data.id })).status, 200);
  assert.equal((await call(studentC, "/api/state")).data.learning.materials.some(item => item.title === "While inactive"), false);
  assert.equal((await call(admin, "/api/action", { ...studentCPlan, active: true })).status, 200);
  assert.equal((await call(studentC, "/api/state")).data.classrooms.length, 1);

  const adminClass = await call(admin, "/api/classrooms", { action: "saveClassroom", title: "Other group", teacherName: "Demo Teacher B", subject: "Science", students: ["Demo Student B"] });
  assert.equal(adminClass.status, 200, JSON.stringify(adminClass.data));
  assert.equal((await call(teacherB, "/api/state")).data.classrooms.some(item => item.id === adminClass.data.id), true);
  assert.equal((await call(studentA, "/api/state")).data.classrooms.some(item => item.id === adminClass.data.id), false);
  assert.equal((await call(teacherA, "/api/classrooms", { action: "archiveClassroom", id: classroomId, archived: true })).status, 200);
  assert.equal((await call(teacherA, "/api/classrooms", { action: "saveAnnouncement", classroomId, title: "Late post", body: "No" })).status, 409);
  assert.equal((await call(studentA, "/api/state")).data.classrooms[0].announcements.length, 1, "Students retain published announcements after archive");
  console.log("PASS: classroom roster privacy, announcement permissions, one-PDF distribution, independent homework submissions, scores, removal, inactive-plan access, rejoin, archive, and admin-created classes");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
