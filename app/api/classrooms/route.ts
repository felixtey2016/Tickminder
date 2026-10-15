import {planSubjectLabelSql} from "@/lib/academic-subject-match";
import {readAcademicCatalogue} from "@/lib/academic-catalogue-server";
import {resolveCatalogueSelection,catalogueGradeValid,findCatalogueGrade} from "@/lib/academic-catalogue";
import {groupReader,groupStatement,requireGroup} from "@/lib/group-data";
import { NextResponse } from "next/server";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import { classroomMayManage, classroomMemberNames } from "@/lib/classrooms-server";
import { change, first, learningDb, teacherMayAssign } from "@/lib/learning-server";

class RequestError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const str = (value: unknown) => typeof value === "string" ? value.trim() : "";
const fail = (error: RequestError) => NextResponse.json({ error: error.message }, { status: error.status });

function selectedStudents(value: unknown) {
  if (!Array.isArray(value)) throw new RequestError("请选择班级学生");
  const names = [...new Set(value.map(str))];
  if (!names.length || names.length > 100 || names.some(name => !name || name.length > 80)) throw new RequestError("班级须有 1 至 100 位学生");
  return names;
}

async function eligible(groupId:string,teacherName:string,subject:string,students:string[],classification:{syllabusId:string|null;subjectId:string|null;grade:string|null},existingMembers:string[]=[]) {
  const {first}=groupReader(groupId);
  for (const student of students) {
    const allowed=await first<{syllabusId:string;grade:string|null}>(`SELECT s.syllabus_id AS syllabusId,s.grade FROM plans p JOIN students s ON s.name=p.student JOIN teachers t ON t.name=p.teacher_name CROSS JOIN (SELECT ? AS subject) requested WHERE p.student=? AND p.teacher_name=? AND p.active=1 AND s.active=1 AND t.active=1 AND ((? IS NOT NULL AND p.subject_id=?) OR (? IS NULL AND ${planSubjectLabelSql()}))`,subject,student,teacherName,classification.subjectId,classification.subjectId,classification.subjectId);
    if(!allowed)throw new RequestError("班级只能加入该老师目前负责的学生科目",403);
    if(!existingMembers.includes(student)&&((classification.syllabusId&&allowed.syllabusId!==classification.syllabusId)||(classification.grade&&allowed.grade&&allowed.grade!==classification.grade)))throw new RequestError("班级成员的课程体系或年级与所选班级不一致");
  }
}

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return fail(new RequestError("Origin mismatch", 403));
  const actor = await currentAccount();
  if (!actor || !["admin", "teacher"].includes(actor.role)) return fail(new RequestError("没有班级管理权限", 403));
  const groupId=requireGroup(actor.groupId); const {first,rows}=groupReader(groupId);
  let data: Record<string, unknown>;
  try { data = await request.json() as Record<string, unknown>; } catch { return fail(new RequestError("请求格式无效")); }
  const action = str(data.action), id = str(data.id), now = new Date().toISOString();
  try {
    if (await first("SELECT 1 AS mustChange FROM local_credentials WHERE account_id = ? AND must_change_password = 1", actor.id)) throw new RequestError("请先修改初始密码", 403);
    const db = learningDb();
    if (action === "saveTerm" || action === "createTerm") {
      if (action === "saveTerm" && actor.role !== "admin") throw new RequestError("只有管理员可以管理学期", 403);
      if (action === "createTerm" && (id || data.isCurrent === true)) throw new RequestError("只有管理员可以管理学期", 403);
      if (actor.role === "teacher" && (!actor.teacherName || !await first("SELECT name FROM teachers WHERE name = ? AND active = 1", actor.teacherName))) throw new RequestError("没有班级管理权限", 403);
      const name = str(data.name);
      if (!name || name.length > 80) throw new RequestError("请输入学期名称（最多 80 字）");
      if (id && !await first("SELECT id FROM academic_terms WHERE id = ?", id)) throw new RequestError("学期不存在", 404);
      const duplicate = await first("SELECT id FROM academic_terms WHERE name = ? COLLATE NOCASE AND id <> ?", name, id);
      if (duplicate) throw new RequestError("学期名称已存在", 409);
      const termId = id || crypto.randomUUID();
      const statements = [];
      if (data.isCurrent === true) statements.push(groupStatement(groupId,"UPDATE academic_terms SET is_current = 0 WHERE (is_current = 1) AND group_id = ?").bind(groupId));
      statements.push(id ? groupStatement(groupId,"UPDATE academic_terms SET name = ?, is_current = ? WHERE (id = ?) AND group_id = ?").bind(name, data.isCurrent === true ? 1 : 0, termId,groupId) : groupStatement(groupId,"INSERT INTO academic_terms (group_id,id,name,is_current,created_at) VALUES (?,?,?,?,?)").bind(groupId,termId, name, data.isCurrent === true ? 1 : 0, now));
      await db.batch(statements);
      await change(groupId,"saveTerm", actor.id, termId, {name, isCurrent: data.isCurrent === true});
      return NextResponse.json({ok: true, id: termId});
    }
    if (action === "saveClassroom") {
      const title = str(data.title), description = str(data.description);
      if (!title || title.length > 100 || description.length > 1000) throw new RequestError("请输入班级名称（最多 100 字）及有效说明");
      const termId = str(data.termId) || null;
      if (termId && !await first("SELECT id FROM academic_terms WHERE id = ?", termId)) throw new RequestError("学期不存在", 404);
      const students = selectedStudents(data.students);
      const existing = id ? await classroomMayManage(actor, id) : null;
      if (id && !existing) throw new RequestError("班级不存在或无权修改", 404);
      const teacherName = existing?.teacherName || (actor.role === "teacher" ? actor.teacherName || "" : str(data.teacherName));
      const catalogue=await readAcademicCatalogue('student');
      const selected=resolveCatalogueSelection(catalogue,str(data.syllabusId),str(data.subjectId)||str(data.subject));
      if(!existing&&(!selected||!catalogueGradeValid(selected.syllabus,str(data.grade))||!str(data.grade)))throw new RequestError("请选择有效的课程体系、年级及科目");
      const classification=existing?{syllabusId:existing.syllabusId,subjectId:existing.subjectId,grade:existing.grade}:{syllabusId:selected!.syllabus.id,subjectId:selected!.subject.id,grade:findCatalogueGrade(selected!.syllabus,str(data.grade))!};
      const subject = existing?.subject || selected!.subject.name;
      if (!teacherName || !subject || subject.length > 100) throw new RequestError("请选择老师和科目");
      if (existing?.archived) throw new RequestError("已封存班级不能修改名单", 409);
      const previousMembers=existing?await classroomMemberNames(existing.id,groupId):[];
      await eligible(groupId,teacherName,subject,students,classification,previousMembers);
      if (!id) {
        const duplicate = await first("SELECT 1 AS found FROM classrooms WHERE teacher_name = ? AND subject = ? AND lower(title) = lower(?) AND archived = 0 AND term_id IS ?", teacherName, subject, title, termId);
        if (duplicate) throw new RequestError("这位老师已有同名同科目的班级", 409);
        const classId = crypto.randomUUID();
        await db.batch([
          groupStatement(groupId,"INSERT INTO classrooms (group_id,id,title,description,subject,teacher_name,created_by,archived,created_at,updated_at,term_id,syllabus_id,subject_id,grade) VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?)").bind(groupId,classId, title, description || null, subject, teacherName, actor.id, now, now, termId,classification.syllabusId,classification.subjectId,classification.grade),
          ...students.map(student => groupStatement(groupId,"INSERT INTO classroom_members (group_id,id,classroom_id,student_name,created_at) VALUES (?,?,?,?,?)").bind(groupId,crypto.randomUUID(), classId, student, now)),
        ]);
        await change(groupId,"createClassroom", actor.id, classId, { title, subject, teacherName, studentCount: students.length });
        return NextResponse.json({ ok: true, id: classId });
      }
      const previous = previousMembers;
      const added = students.filter(student => !previous.includes(student));
      const removed = previous.filter(student => !students.includes(student));
      await db.batch([
        groupStatement(groupId,"UPDATE classrooms SET title = ?, description = ?, updated_at = ?, term_id = ? WHERE (id = ?) AND group_id = ?").bind(title, description || null, now, termId, id,groupId),
        ...removed.map(student => groupStatement(groupId,"DELETE FROM classroom_members WHERE (classroom_id = ? AND student_name = ?) AND group_id = ?").bind(id, student,groupId)),
        ...added.map(student => groupStatement(groupId,"INSERT INTO classroom_members (group_id,id,classroom_id,student_name,created_at) VALUES (?,?,?,?,?)").bind(groupId,crypto.randomUUID(), id, student, now)),
      ]);
      // Grant new members the class's existing resources while preserving old submissions and scores.
      for (const student of added) {
        const materials = await groupStatement(groupId,"SELECT id FROM teaching_materials WHERE classroom_id = ?").bind(id).all<{ id: string }>();
        const homework = await groupStatement(groupId,"SELECT id FROM homework WHERE classroom_id = ?").bind(id).all<{ id: string }>();
        await db.batch([
          ...(materials.results || []).map(item => groupStatement(groupId,"INSERT OR IGNORE INTO material_recipients (group_id,id,material_id,student_name,subject) VALUES (?,?,?,?,?)").bind(groupId,crypto.randomUUID(), item.id, student, subject)),
          ...(homework.results || []).map(item => groupStatement(groupId,"INSERT OR IGNORE INTO homework_recipients (group_id,id,homework_id,student_name) VALUES (?,?,?,?)").bind(groupId,crypto.randomUUID(), item.id, student)),
        ]);
      }
      await change(groupId,"updateClassroom", actor.id, id, { title, termId, added, removed });
      return NextResponse.json({ ok: true, id });
    }
    if (action === "archiveClassroom") {
      const classroom = await classroomMayManage(actor, id);
      if (!classroom) throw new RequestError("班级不存在或无权修改", 404);
      const archived = data.archived === true ? 1 : 0;
      await groupStatement(groupId,"UPDATE classrooms SET archived = ?, updated_at = ? WHERE (id = ?) AND group_id = ?").bind(archived, now, id,groupId).run();
      await change(groupId,"archiveClassroom", actor.id, id, { archived: Boolean(archived) });
      return NextResponse.json({ ok: true });
    }
    if (action === "saveAnnouncement") {
      const classroomId = str(data.classroomId);
      const classroom = await classroomMayManage(actor, classroomId);
      if (!classroom) throw new RequestError("班级不存在或无权发布公告", 404);
      if (classroom.archived) throw new RequestError("已封存班级不能发布公告", 409);
      const title = str(data.title), body = str(data.body);
      if (!title || title.length > 120 || !body || body.length > 4000) throw new RequestError("公告需要标题和内容（最多 4000 字）");
      const pinned = data.pinned === true ? 1 : 0;
      if (id) {
        const row = await first("SELECT 1 AS found FROM classroom_announcements WHERE id = ? AND classroom_id = ?", id, classroomId);
        if (!row) throw new RequestError("公告不存在", 404);
        await groupStatement(groupId,"UPDATE classroom_announcements SET title = ?, body = ?, pinned = ?, updated_at = ? WHERE (id = ? AND classroom_id = ?) AND group_id = ?").bind(title, body, pinned, now, id, classroomId,groupId).run();
      } else {
        const announcementId = crypto.randomUUID();
        await groupStatement(groupId,"INSERT INTO classroom_announcements (group_id,id,classroom_id,author_id,title,body,pinned,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(groupId,announcementId, classroomId, actor.id, title, body, pinned, now, now).run();
      }
      await change(groupId,id ? "updateAnnouncement" : "postAnnouncement", actor.id, classroomId, { title, pinned: Boolean(pinned) });
      return NextResponse.json({ ok: true });
    }
    if (action === "deleteAnnouncement") {
      const classroomId = str(data.classroomId);
      if (!await classroomMayManage(actor, classroomId)) throw new RequestError("没有删除权限", 403);
      const deleted = await groupStatement(groupId,"DELETE FROM classroom_announcements WHERE (id = ? AND classroom_id = ?) AND group_id = ?").bind(id, classroomId,groupId).run();
      if (!deleted.meta.changes) throw new RequestError("公告不存在", 404);
      await change(groupId,"deleteAnnouncement", actor.id, classroomId);
      return NextResponse.json({ ok: true });
    }
    throw new RequestError("未知操作");
  } catch (error) {
    return fail(error instanceof RequestError ? error : new RequestError("服务器未能确认结果，请刷新班级列表检查后再重试", 503));
  }
}
