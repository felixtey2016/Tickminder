import type { Account } from "@/lib/auth";
import { first, rows } from "@/lib/learning-server";

export type ClassroomRow = {
  id: string; title: string; description: string | null; subject: string;
  teacherName: string; archived: number; createdAt: string; updatedAt: string;
};

export async function classroomMayRead(account: Account, id: string) {
  if (account.role === "admin") return first<ClassroomRow>(`SELECT id,title,description,subject,teacher_name AS teacherName,archived,created_at AS createdAt,updated_at AS updatedAt FROM classrooms WHERE id = ?`, id);
  if (account.role === "teacher" && account.teacherName) return first<ClassroomRow>(`SELECT c.id,c.title,c.description,c.subject,c.teacher_name AS teacherName,c.archived,c.created_at AS createdAt,c.updated_at AS updatedAt FROM classrooms c JOIN teachers t ON t.name = c.teacher_name AND t.active = 1 WHERE c.id = ? AND c.teacher_name = ?`, id, account.teacherName);
  if (account.role === "student" && account.studentName) return first<ClassroomRow>(`SELECT c.id,c.title,c.description,c.subject,c.teacher_name AS teacherName,c.archived,c.created_at AS createdAt,c.updated_at AS updatedAt FROM classrooms c JOIN classroom_members m ON m.classroom_id = c.id JOIN plans p ON p.student = m.student_name AND p.subject = c.subject AND p.teacher_name = c.teacher_name AND p.active = 1 JOIN students s ON s.name = m.student_name AND s.active = 1 JOIN teachers t ON t.name = c.teacher_name AND t.active = 1 WHERE c.id = ? AND m.student_name = ?`, id, account.studentName);
  return null;
}

export async function classroomMayManage(account: Account, id: string) {
  if (account.role !== "teacher" && account.role !== "admin") return null;
  return classroomMayRead(account, id);
}

export async function classroomMemberNames(id: string) {
  const members = await rows<{ studentName: string }>("SELECT student_name AS studentName FROM classroom_members WHERE classroom_id = ? ORDER BY student_name", id);
  return members.map(member => member.studentName);
}

export async function activeClassroomMemberNames(id: string) {
  const members = await rows<{ studentName: string }>(`SELECT m.student_name AS studentName FROM classroom_members m JOIN classrooms c ON c.id = m.classroom_id
    JOIN plans p ON p.student = m.student_name AND p.subject = c.subject AND p.teacher_name = c.teacher_name AND p.active = 1
    JOIN students s ON s.name = m.student_name AND s.active = 1 WHERE m.classroom_id = ? ORDER BY m.student_name`, id);
  return members.map(member => member.studentName);
}

export async function classroomsState(account: Account) {
  let classes: ClassroomRow[] = [];
  if (account.role === "admin") classes = await rows<ClassroomRow>(`SELECT id,title,description,subject,teacher_name AS teacherName,archived,created_at AS createdAt,updated_at AS updatedAt FROM classrooms ORDER BY archived,updated_at DESC`);
  else if (account.role === "teacher" && account.teacherName) classes = await rows<ClassroomRow>(`SELECT c.id,c.title,c.description,c.subject,c.teacher_name AS teacherName,c.archived,c.created_at AS createdAt,c.updated_at AS updatedAt FROM classrooms c JOIN teachers t ON t.name = c.teacher_name AND t.active = 1 WHERE c.teacher_name = ? ORDER BY c.archived,c.updated_at DESC`, account.teacherName);
  else if (account.role === "student" && account.studentName) classes = await rows<ClassroomRow>(`SELECT c.id,c.title,c.description,c.subject,c.teacher_name AS teacherName,c.archived,c.created_at AS createdAt,c.updated_at AS updatedAt FROM classrooms c JOIN classroom_members m ON m.classroom_id = c.id JOIN plans p ON p.student = m.student_name AND p.subject = c.subject AND p.teacher_name = c.teacher_name AND p.active = 1 JOIN students s ON s.name = m.student_name AND s.active = 1 JOIN teachers t ON t.name = c.teacher_name AND t.active = 1 WHERE m.student_name = ? ORDER BY c.archived,c.updated_at DESC`, account.studentName);
  return Promise.all(classes.map(async classroom => {
    const announcements = await rows(`SELECT a.id,a.title,a.body,a.pinned,a.created_at AS createdAt,a.updated_at AS updatedAt,coalesce(u.name,'老师') AS authorName FROM classroom_announcements a LEFT JOIN accounts u ON u.id = a.author_id WHERE a.classroom_id = ? ORDER BY a.pinned DESC,a.created_at DESC`, classroom.id);
    const members = account.role === "student" ? undefined : account.role === "teacher" ? await activeClassroomMemberNames(classroom.id) : await classroomMemberNames(classroom.id);
    return { ...classroom, announcements, ...(members ? { members } : {}) };
  }));
}
