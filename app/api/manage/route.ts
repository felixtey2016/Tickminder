import { NextResponse } from "next/server";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import { first, learningDb, rows } from "@/lib/learning-server";
import { isOwnerAccount, OWNER_EMAIL } from "@/lib/owner";
import { classroomMayManage } from "@/lib/classrooms-server";
import { deleteUnreferencedFile } from "@/lib/pdf-storage";


class DeleteError extends Error { constructor(message: string, public status = 409) { super(message); } }
type Entry = { kind: string; id: string };
type Snapshot = {table: string; records: Record<string, unknown>[]};
async function planDeletion(actor: NonNullable<Awaited<ReturnType<typeof currentAccount>>>, kind: string, id: string) {
    if (!id || !["account", "teacher", "student", "plan", "lesson", "classroom", "homework"].includes(kind)) throw new DeleteError("请求格式无效", 400);
    if (actor.role !== "admin" && !(actor.role === "teacher" && ["classroom", "homework"].includes(kind))) throw new DeleteError("没有权限执行此操作", 403);
    const raw = learningDb();
    const operations: Array<{sql: string; params: unknown[]}> = [];
    const db = {prepare: (sql: string) => ({bind: (...params: unknown[]) => {operations.push({sql, params});return raw.prepare(sql).bind(...params);}})};
    const statements = [], files: string[] = [];
    if (kind === "account") {
      const target = await first<{ role: string; email: string }>("SELECT role,email FROM accounts WHERE id = ?", id);
      if (!target) throw new DeleteError("Account not found", 404);
      if (id === actor.id || target.email.toLowerCase() === OWNER_EMAIL || (target.role === "admin" && !isOwnerAccount(actor))) throw new DeleteError("只有最高管理员可以移除其他管理员，且不能删除本人", 403);
      if (await first("SELECT 1 AS found FROM teaching_materials WHERE owner_id = ? UNION SELECT 1 FROM homework WHERE owner_id = ? LIMIT 1", id, id)) throw new DeleteError("此账号仍拥有教学资料或功课，请先处理这些资料后再永久删除");
      const local = await first<{ username: string }>("SELECT username FROM local_credentials WHERE account_id = ?", id);
      statements.push(db.prepare("DELETE FROM notification_deliveries WHERE item_id IN (SELECT id FROM notification_items WHERE account_id=?) OR subscription_id IN (SELECT id FROM push_subscriptions WHERE account_id=?)").bind(id,id));
      for (const table of ["notification_items", "push_subscriptions", "sessions", "assignments", "study_blocks", "local_credentials", "google_identities"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE account_id = ?`).bind(id));
      if (local) statements.push(db.prepare("DELETE FROM login_attempts WHERE username = ?").bind(local.username));
      statements.push(db.prepare("DELETE FROM accounts WHERE id = ?").bind(id));
    } else if (kind === "teacher" || kind === "student") {
      const column = kind === "teacher" ? "teacher_name" : "student";
      const accountColumn = kind === "teacher" ? "teacher_name" : "student_name";
      const table = kind === "teacher" ? "teachers" : "students";
      if (!await first(`SELECT 1 AS found FROM ${table} WHERE name = ?`, id)) throw new DeleteError("记录不存在", 404);
      if (await first(`SELECT 1 AS found FROM accounts WHERE ${accountColumn} = ?`, id)) throw new DeleteError("此姓名仍关联登录账号，请先删除或重新绑定账号");
      if (await first(`SELECT 1 AS found FROM lessons WHERE ${column} = ? AND status = 'scheduled'`, id)) throw new DeleteError("仍有已安排的课程，请先取消或删除这些课程");
      const member = kind === "teacher" ? await first("SELECT 1 AS found FROM classrooms WHERE teacher_name = ?", id) : await first("SELECT 1 AS found FROM classroom_members WHERE student_name = ?", id);
      if (member) throw new DeleteError("此姓名仍在班级中，请先处理班级或移出名单");
      statements.push(db.prepare(`DELETE FROM assignments WHERE plan_key IN (SELECT key FROM plans WHERE ${column} = ?)`).bind(id));
      statements.push(db.prepare(`DELETE FROM plans WHERE ${column} = ?`).bind(id));
      statements.push(db.prepare(`DELETE FROM ${table} WHERE name = ?`).bind(id));
    } else if (kind === "plan") {
      const plan = await first<{ student: string; subject: string }>("SELECT student,subject FROM plans WHERE key = ?", id);
      if (!plan) throw new DeleteError("记录不存在", 404);
      if (await first("SELECT 1 AS found FROM lessons WHERE student = ? AND subject = ? AND status = 'scheduled'", plan.student, plan.subject)) throw new DeleteError("仍有已安排的课程，请先取消或删除这些课程");
      if (await first("SELECT 1 AS found FROM classroom_members m JOIN classrooms c ON c.id = m.classroom_id WHERE m.student_name = ? AND c.subject = ?", plan.student, plan.subject)) throw new DeleteError("此科目仍用于班级，请先移出班级");
      statements.push(db.prepare("DELETE FROM assignments WHERE plan_key = ?").bind(id));
      statements.push(db.prepare("DELETE FROM plans WHERE key = ?").bind(id));
    } else if (kind === "lesson") {
      if (!await first("SELECT 1 AS found FROM lessons WHERE id = ?", id)) throw new DeleteError("Lesson not found", 404);
      if (await first("SELECT 1 AS found FROM lessons WHERE replacement_for = ?", id)) throw new DeleteError("此课程有关联补课，请先处理补课记录");
      statements.push(db.prepare("DELETE FROM reschedule_requests WHERE lesson_id = ?").bind(id));
      statements.push(db.prepare("DELETE FROM notification_deliveries WHERE item_id IN (SELECT id FROM notification_items WHERE lesson_id=?)").bind(id));
      statements.push(db.prepare("DELETE FROM notification_items WHERE lesson_id=?").bind(id));
      statements.push(db.prepare("DELETE FROM lessons WHERE id = ?").bind(id));
    } else if (kind === "homework") {
      const item = await first<{ owner_id: string; attachment_file_id: string | null }>("SELECT owner_id,attachment_file_id FROM homework WHERE id = ?", id);
      if (!item || (actor.role !== "admin" && item.owner_id !== actor.id)) throw new DeleteError("没有权限执行此操作", 403);
      if (item.attachment_file_id) files.push(item.attachment_file_id);
      const submissions = await rows<{ fileId: string }>("SELECT file_id AS fileId FROM homework_submissions WHERE homework_id = ?", id);
      files.push(...submissions.map(s => s.fileId));
      statements.push(db.prepare("UPDATE study_blocks SET homework_id = NULL WHERE homework_id = ?").bind(id));
      for (const table of ["homework_submissions", "homework_recipients"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE homework_id = ?`).bind(id));
      statements.push(db.prepare("DELETE FROM homework WHERE id = ?").bind(id));
    } else {
      if (!await classroomMayManage(actor, id)) throw new DeleteError("班级不存在或无权修改", 404);
      const fileRows = await rows<{ fileId: string }>("SELECT file_id AS fileId FROM teaching_materials WHERE classroom_id = ? UNION SELECT attachment_file_id AS fileId FROM homework WHERE classroom_id = ? AND attachment_file_id IS NOT NULL UNION SELECT s.file_id AS fileId FROM homework_submissions s JOIN homework h ON h.id = s.homework_id WHERE h.classroom_id = ?", id, id, id);
      files.push(...fileRows.map(f => f.fileId));
      statements.push(db.prepare("UPDATE study_blocks SET homework_id = NULL WHERE homework_id IN (SELECT id FROM homework WHERE classroom_id = ?)").bind(id));
      for (const table of ["homework_submissions", "homework_recipients"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE homework_id IN (SELECT id FROM homework WHERE classroom_id = ?)`).bind(id));
      statements.push(db.prepare("DELETE FROM material_recipients WHERE material_id IN (SELECT id FROM teaching_materials WHERE classroom_id = ?)").bind(id));
      for (const table of ["homework", "teaching_materials", "classroom_announcements", "classroom_members"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE classroom_id = ?`).bind(id));
      statements.push(db.prepare("DELETE FROM classrooms WHERE id = ?").bind(id));
    }

    const snapshots: Snapshot[] = [];
    for (const op of operations) {
      const deleted = op.sql.match(/^DELETE FROM (\w+) WHERE ([\s\S]+)$/);
      const updated = op.sql.match(/^UPDATE (\w+) SET homework_id = NULL WHERE ([\s\S]+)$/);
      const match = deleted || updated;
      if (match) snapshots.push({table: match[1], records: await rows<Record<string, unknown>>('SELECT * FROM '+match[1]+' WHERE '+match[2]+' ORDER BY rowid', ...op.params)});
    }
    const primary = snapshots.find(s => s.table === ({account:'accounts',teacher:'teachers',student:'students',plan:'plans',lesson:'lessons',homework:'homework',classroom:'classrooms'} as Record<string,string>)[kind])?.records[0];
    const label = primary ? String(primary.title || primary.name || (primary.student ? String(primary.student)+' · '+String(primary.subject) : id)) : id;
    const effects = snapshots.map(s => ({table: s.table, count: s.records.length, retained: s.table === 'study_blocks' && kind !== 'account'})).filter(s=>s.count);
    const lessonRows = snapshots.filter(s => s.table === 'lessons').flatMap(s=>s.records);
    const hours = lessonRows.reduce((sum, l) => {
      const diff = l.actual_start && l.actual_end ? (Date.parse(String(l.actual_end))-Date.parse(String(l.actual_start)))/3600000 : 0;
      return sum + (l.status === 'completed' && l.reviewed_at && diff > 0 && diff <= 12 ? diff : 0);
    }, 0);
    return { statements, files, snapshots, summary: {kind,id,label,effects,hours:Number(hours.toFixed(2)),checkedIn:lessonRows.filter(l=>['completed','student_absent','teacher_absent'].includes(String(l.status))).length, date:kind==='lesson'?primary?.planned_start:undefined} };
}
async function proof(actorId: string, plans: Array<Awaited<ReturnType<typeof planDeletion>>>, at: string) {
  const payload = JSON.stringify({actorId, at, snapshots: plans.map(p=>p.snapshots)});
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"没有权限执行此操作"},{status:403});
  const actor = await currentAccount();
  if (!actor) return NextResponse.json({error:"登录已过期，请重新登录"},{status:401});
  try {
    const data = await request.json() as Record<string,unknown>;
    const preview = data.action === 'previewDelete';
    if (!preview && data.confirm !== true) throw new DeleteError("请确认永久删除",400);
    if (await first("SELECT 1 AS found FROM local_credentials WHERE account_id = ? AND must_change_password = 1",actor.id)) throw new DeleteError("请先修改初始密码",403);
    const entries = (Array.isArray(data.entries) ? data.entries : [{kind:data.kind,id:data.id}]) as Entry[];
    if (!entries.length || entries.length > 50 || entries.some(e=>!e || typeof e.kind !== 'string' || typeof e.id !== 'string') || new Set(entries.map(e=>e.kind+':'+e.id)).size !== entries.length || new Set(entries.map(e=>e.kind)).size !== 1) throw new DeleteError("请选择 1 至 50 条同类记录",400);
    const plans: Array<Awaited<ReturnType<typeof planDeletion>>> = [], blocked: Array<{kind:string;id:string;error:string}> = [];
    for (const entry of entries) {
      try { plans.push(await planDeletion(actor,entry.kind,entry.id)); }
      catch (e) { if (!preview) throw e; if (!(e instanceof DeleteError)) throw e; blocked.push({...entry,error:e.message}); }
    }
    const previewAt = preview ? new Date().toISOString() : String(data.previewAt || '');
    if (preview) return NextResponse.json({ok:true,items:plans.map(p=>p.summary),blocked,previewAt,fingerprint:await proof(actor.id,plans,previewAt)});
    if (Array.isArray(data.entries)) {
      const age = Date.now()-Date.parse(previewAt);
      if (!Number.isFinite(age) || age < 0 || age > 300000 || data.fingerprint !== await proof(actor.id,plans,previewAt)) throw new DeleteError("记录已更新或预览已过期，请重新预览后确认",409);
    }
    const db = learningDb();
    const statements = plans.flatMap(p=>p.statements);
    for (const entry of entries) statements.push(db.prepare("INSERT INTO audit (id,lesson_id,actor_id,action,after_json,at) VALUES (?,?,?,'permanentDelete',?,?)").bind(crypto.randomUUID(),entry.kind+':'+entry.id,actor.id,JSON.stringify(entry),new Date().toISOString()));
    await db.batch(statements);
    let cleanupPending=false;
    for (const file of new Set(plans.flatMap(p=>p.files))) {try {await deleteUnreferencedFile(file);} catch {cleanupPending=true;}}
    return NextResponse.json({ok:true,deletedCount:entries.length,warning:cleanupPending?"记录已删除，部分文件清理尚未完成，请联系管理员":undefined});
  } catch (e) {return NextResponse.json({error:e instanceof DeleteError?e.message:"删除未能确认，请刷新列表后再试"},{status:e instanceof DeleteError?e.status:503});}
}
