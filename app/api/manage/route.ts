import { NextResponse } from "next/server";
import { currentAccount } from "@/lib/auth";
import { first, learningDb, rows } from "@/lib/learning-server";
import { isOwnerAccount, OWNER_EMAIL } from "@/lib/owner";
import { classroomMayManage } from "@/lib/classrooms-server";
import { deleteUnreferencedFile } from "@/lib/pdf-storage";

class DeleteError extends Error { constructor(message: string, public status = 409) { super(message); } }
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "没有权限执行此操作" }, { status: 403 });
  const actor = await currentAccount();
  if (!actor) return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
  try {
    const data = await request.json() as Record<string, unknown>;
    if (data.confirm !== true) throw new DeleteError("请确认永久删除", 400);
    const id = typeof data.id === "string" ? data.id : "";
    const kind = data.kind;
    if (!id || !["account", "teacher", "student", "plan", "lesson", "classroom", "homework"].includes(kind as string)) throw new DeleteError("请求格式无效", 400);
    if (actor.role !== "admin" && !(actor.role === "teacher" && ["classroom", "homework"].includes(kind as string))) throw new DeleteError("没有权限执行此操作", 403);
    if (await first("SELECT 1 AS found FROM local_credentials WHERE account_id = ? AND must_change_password = 1", actor.id)) throw new DeleteError("请先修改初始密码", 403);
    const db = learningDb(), statements = [], files: string[] = [];
    if (kind === "account") {
      const target = await first<{ role: string; email: string }>("SELECT role,email FROM accounts WHERE id = ?", id);
      if (!target) throw new DeleteError("Account not found", 404);
      if (id === actor.id || target.email.toLowerCase() === OWNER_EMAIL || (target.role === "admin" && !isOwnerAccount(actor))) throw new DeleteError("只有最高管理员可以移除其他管理员，且不能删除本人", 403);
      if (await first("SELECT 1 AS found FROM teaching_materials WHERE owner_id = ? UNION SELECT 1 FROM homework WHERE owner_id = ? LIMIT 1", id, id)) throw new DeleteError("此账号仍拥有教学资料或功课，请先处理这些资料后再永久删除");
      const local = await first<{ username: string }>("SELECT username FROM local_credentials WHERE account_id = ?", id);
      for (const table of ["sessions", "assignments", "study_blocks", "local_credentials", "google_identities"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE account_id = ?`).bind(id));
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
    statements.push(db.prepare("INSERT INTO audit (id,lesson_id,actor_id,action,after_json,at) VALUES (?,?,?,'permanentDelete',?,?)").bind(crypto.randomUUID(), `${kind}:${id}`, actor.id, JSON.stringify({ kind, id }), new Date().toISOString()));
    await db.batch(statements);
    let cleanupPending = false;
    for (const file of files) { try { await deleteUnreferencedFile(file); } catch { cleanupPending = true; } }
    return NextResponse.json({ ok: true, warning: cleanupPending ? "记录已删除，部分文件清理尚未完成，请联系管理员" : undefined });
  } catch (error) {
    return NextResponse.json({ error: error instanceof DeleteError ? error.message : "删除未能确认，请刷新列表后再试" }, { status: error instanceof DeleteError ? error.status : 503 });
  }
}
