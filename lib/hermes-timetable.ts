/** Narrow server-to-server timetable API. It cannot change accounts or attendance. */
import { env } from "cloudflare:workers";
import { first, rows, learningDb } from "@/lib/learning-server";
import { findLessonConflict, hoursBetween, type LessonSlot } from "@/lib/lesson-rules";

type Binding = { student: string; subject: string; teacherName: string };
type Lesson = LessonSlot & { id: string; subject: string; status: string; updatedAt: string; kind: string };
type Change = { localId: string; websiteId?: string; start: string; end: string; expected?: {start:string;end:string;updatedAt:string} };
type Confirmation = { teacher: string; student: string };
export class TimetableError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}
function fail(code: string, status = 409): never { throw new TimetableError(code, status); }
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const sqlLesson = "SELECT id,student,subject,teacher_name AS teacherName,planned_start AS plannedStart,planned_end AS plannedEnd,status,updated_at AS updatedAt,kind FROM lessons";
const digest = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))), b => b.toString(16).padStart(2, "0")).join("");

export async function timetableAuthorized(request: Request) {
  const configured = env.HERMES_TIMETABLE_TOKEN;
  const supplied = request.headers.get("Authorization") || "";
  if (!configured || configured.length < 32 || !supplied.startsWith("Bearer ")) return false;
  const [a, b] = await Promise.all([digest(configured), digest(supplied.slice(7))]);
  let different = 0;
  for (let i = 0; i < a.length; i++) different |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return different === 0;
}

async function bindingFor(id: unknown): Promise<Binding> {
  const key = text(id);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) fail("course_not_bound", 403);
  let bindings: Record<string, Binding>;
  try { bindings = JSON.parse(env.HERMES_TIMETABLE_BINDINGS || "{}"); } catch { fail("integration_not_configured", 503); }
  const binding = Object.hasOwn(bindings!, key) ? bindings![key] : undefined;
  if (!binding || !text(binding.student) || !text(binding.subject) || !text(binding.teacherName)) fail("course_not_bound", 403);
  const active = await first(`SELECT 1 AS ok FROM plans p JOIN teachers t ON t.name=p.teacher_name JOIN students s ON s.name=p.student
    WHERE p.student=? AND p.subject=? AND p.teacher_name=? AND p.active=1 AND t.active=1 AND s.active=1`, binding.student, binding.subject, binding.teacherName);
  if (!active) fail("course_not_active", 403);
  return { student: binding.student, subject: binding.subject, teacherName: binding.teacherName };
}

async function readSnapshot(binding: Binding) {
  const related = await rows<Lesson>(`${sqlLesson} WHERE student=? OR teacher_name=? ORDER BY id`, binding.student, binding.teacherName);
  const own = related.filter(l => l.student === binding.student && l.subject === binding.subject && l.teacherName === binding.teacherName);
  const pending = await rows<{ lessonId: string; start: string; end: string; student: string; teacherName: string }>(`SELECT r.lesson_id AS lessonId,r.proposed_start AS start,r.proposed_end AS end,l.student,l.teacher_name AS teacherName
    FROM reschedule_requests r JOIN lessons l ON l.id=r.lesson_id WHERE r.status='pending' AND l.status='scheduled' AND (l.student=? OR l.teacher_name=?)`, binding.student, binding.teacherName);
  const revision = Number((await first<{ revision: number }>("SELECT coalesce(max(rowid),0) AS revision FROM audit"))?.revision || 0);
  const busy = related.filter(l => !own.some(o => o.id === l.id) && l.status !== "cancelled").map(l => ({ start: l.plannedStart, end: l.plannedEnd, participant: l.student === binding.student ? "student" : "teacher", status: "confirmed" }));
  busy.push(...pending.map(p => ({ start: p.start, end: p.end, participant: p.student === binding.student ? "student" : "teacher", status: "tentative" })));
  return { binding, lessons: own, busy, revision, related, pending };
}
const project = (s: Awaited<ReturnType<typeof readSnapshot>>) => ({ binding: s.binding, lessons: s.lessons, busy: s.busy, revision: s.revision });

function changesFrom(value: unknown, previouslyApplied = false): Change[] {
  if (!Array.isArray(value) || !value.length || value.length > 200) fail("invalid_changes", 400);
  const seenLocal = new Set<string>(), seenWebsite = new Set<string>();
  return value.map(v => {
    const localId = text(v?.localId), websiteId = text(v?.websiteId);
    if (!localId || localId.length > 160 || seenLocal.has(localId) || (websiteId && (websiteId.length > 160 || seenWebsite.has(websiteId)))) fail("invalid_lesson_id", 400);
    seenLocal.add(localId); if (websiteId) seenWebsite.add(websiteId);
    const time = (input: unknown) => {
      const raw = text(input);
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(raw) || !Number.isFinite(Date.parse(raw))) fail("explicit_timezone_required", 400);
      const date = new Date(raw).toISOString();
      // Reject normalized invalid calendar dates (e.g. February 31).
      const offset = raw.endsWith("Z") ? 0 : (raw.at(-6) === "-" ? -1 : 1) * (Number(raw.slice(-5,-3))*60+Number(raw.slice(-2)));
      if (new Date(Date.parse(date)+offset*60000).toISOString().slice(0,16) !== raw.slice(0,16)) fail("invalid_date",400);
      return date;
    };
    const start = time(v?.start), end = time(v?.end);
    try { hoursBetween(start, end); } catch { fail("invalid_duration", 400); }
    if (!previouslyApplied && start <= new Date().toISOString()) fail("future_time_required", 400);
    let expected: Change['expected'];
    if (websiteId) {
      if (!text(v?.expected?.start) || !text(v?.expected?.end) || !text(v?.expected?.updatedAt)) fail("original_website_version_required",400);
      expected={start:text(v.expected.start),end:text(v.expected.end),updatedAt:text(v.expected.updatedAt)};
    }
    return { localId, ...(websiteId ? { websiteId, expected } : {}), start, end };
  });
}

export async function handleTimetable(data: Record<string, unknown>) {
  const binding = await bindingFor(data.classroomId);
  const action = text(data.action);
  const snapshot = await readSnapshot(binding);
  if (action === "snapshot") return { ok: true, ...project(snapshot) };
  if (action !== "commit") fail("unsupported_action", 400);
  const operation = text(data.operationId);
  if (!/^[a-zA-Z0-9:_-]{1,160}$/.test(operation)) fail("invalid_operation_id", 400);
  const confirmations = data.confirmations as Confirmation | undefined;
  if (!confirmations || !text(confirmations.teacher) || !text(confirmations.student) || confirmations.teacher === confirmations.student || confirmations.teacher.length > 200 || confirmations.student.length > 200) fail("both_participants_must_agree", 403);
  const operationId = "hermes:" + await digest(`${text(data.classroomId)}:${operation}`);
  const previous = await first<{ after: string }>("SELECT after_json AS after FROM audit WHERE id=? AND action='hermesTimetable'", operationId);
  const changes = changesFrom(data.changes, Boolean(previous));
  const payloadHash = await digest(JSON.stringify({ binding, operation, confirmations, changes }));
  if (previous) {
    const stored = JSON.parse(previous.after);
    if (stored.payloadHash !== payloadHash) fail("operation_payload_changed");
    return { ok: true, alreadyApplied: true, applied: stored.applied, ...project(snapshot) };
  }
  if (!Number.isSafeInteger(data.expectedRevision) || data.expectedRevision !== snapshot.revision) fail("website_changed_refresh_first");
  const existingById = new Map(snapshot.lessons.map(l => [l.id,l]));
  const changedIds = changes.flatMap(c => c.websiteId ? [c.websiteId] : []);
  const changedSet = new Set(changedIds);
  for (const c of changes) {
    if (c.websiteId && (!existingById.has(c.websiteId) || existingById.get(c.websiteId)!.status !== "scheduled")) fail("lesson_not_editable", 403);
    if (c.websiteId) {
      const old=existingById.get(c.websiteId)!;
      if (c.expected!.start!==old.plannedStart || c.expected!.end!==old.plannedEnd || c.expected!.updatedAt!==old.updatedAt) fail("original_website_lesson_changed");
    }
    if (c.websiteId && snapshot.pending.some(p => p.lessonId === c.websiteId)) fail("website_reschedule_pending");
  }
  const candidates = changes.map(c => ({ ...binding, id: c.websiteId, plannedStart: c.start, plannedEnd: c.end }));
  const other = snapshot.related.filter(l => !changedSet.has(l.id));
  for (let i=0;i<candidates.length;i++) {
    if (findLessonConflict(candidates[i], [...other,...candidates.slice(i+1)]) || snapshot.pending.some(p => changes[i].start < p.end && p.start < changes[i].end)) fail("schedule_conflict");
  }
  const db = learningDb(), now = new Date().toISOString();
  // D1 batch is a transaction. This read guard executes INSIDE that transaction:
  // failure aborts every write, rather than committing a partially changed month.
  const guard = (condition: string, values: unknown[]) => db.prepare(`SELECT json(CASE WHEN ${condition} THEN '1' ELSE 'hermes_snapshot_conflict' END)`).bind(...values);
  const statements = [guard("(SELECT coalesce(max(rowid),0) FROM audit)=?", [snapshot.revision]),
    guard("EXISTS (SELECT 1 FROM plans p JOIN students s ON s.name=p.student JOIN teachers t ON t.name=p.teacher_name WHERE p.student=? AND p.subject=? AND p.teacher_name=? AND p.active=1 AND s.active=1 AND t.active=1)", [binding.student,binding.subject,binding.teacherName])];
  const applied: Array<{ localId: string; websiteId: string }> = [];
  for (const c of changes) {
    const id = c.websiteId || "hermes-" + (await digest(`${operationId}:${c.localId}`)).slice(0,40);
    applied.push({localId:c.localId,websiteId:id});
    if (c.websiteId) {
      const old = existingById.get(c.websiteId)!;
      statements.push(guard("EXISTS (SELECT 1 FROM lessons WHERE id=? AND student=? AND subject=? AND teacher_name=? AND status='scheduled' AND planned_start=? AND planned_end=? AND updated_at=?)", [id,binding.student,binding.subject,binding.teacherName,old.plannedStart,old.plannedEnd,old.updatedAt]));
    }
    const except = changedIds.length ? `AND id NOT IN (${changedIds.map(()=>"?").join(",")})` : "";
    statements.push(guard(`NOT EXISTS (SELECT 1 FROM lessons WHERE status<>'cancelled' AND (student=? OR teacher_name=?) AND planned_start<? AND planned_end>? ${except})`, [binding.student,binding.teacherName,c.end,c.start,...changedIds]));
    statements.push(guard("NOT EXISTS (SELECT 1 FROM reschedule_requests r JOIN lessons l ON l.id=r.lesson_id WHERE r.status='pending' AND l.status='scheduled' AND (l.student=? OR l.teacher_name=?) AND (r.lesson_id=? OR (r.proposed_start<? AND r.proposed_end>?)))", [binding.student,binding.teacherName,c.websiteId || "",c.end,c.start]));
  }
  for (const [i,c] of changes.entries()) {
    const id = applied[i].websiteId;
    statements.push(c.websiteId
      ? db.prepare("UPDATE lessons SET planned_start=?,planned_end=?,updated_at=? WHERE id=?").bind(c.start,c.end,now,id)
      : db.prepare("INSERT INTO lessons (id,student,subject,teacher_name,planned_start,planned_end,status,kind,created_by,updated_at) VALUES (?,?,?,?,?,?,'scheduled','regular','integration:hermes',?)").bind(id,binding.student,binding.subject,binding.teacherName,c.start,c.end,now));
    statements.push(db.prepare("INSERT INTO audit (id,lesson_id,actor_id,action,before_json,after_json,at) VALUES (?,?,'integration:hermes',?,?,?,?)").bind(
      `${operationId}:${i}`, id, c.websiteId ? 'reschedule' : 'create', c.websiteId ? JSON.stringify(existingById.get(c.websiteId)) : null,
      JSON.stringify({plannedStart:c.start,plannedEnd:c.end,source:'whatsapp',agreedBy:['teacher','student']}), now));
  }
  const after = { payloadHash, applied, changes, confirmations, classroomId:data.classroomId };
  statements.push(db.prepare("INSERT INTO audit (id,lesson_id,actor_id,action,before_json,after_json,at) VALUES (?,?,'integration:hermes','hermesTimetable',?,?,?)").bind(operationId,`hermes-course:${data.classroomId}`,JSON.stringify(snapshot.lessons.filter(l=>changedSet.has(l.id))),JSON.stringify(after),now));
  try { await db.batch(statements); } catch { fail("website_changed_or_conflict_refresh_first"); }
  return { ok:true, applied, ...project(await readSnapshot(binding)) };
}
