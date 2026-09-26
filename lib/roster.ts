import { getDb } from "@/db";
import { plans, students, teachers } from "@/db/schema";

export async function readRoster() {
  const db = getDb();
  const [teacherRows, studentRows, planRows] = await Promise.all([
    db.select().from(teachers).all(),
    db.select().from(students).all(),
    db.select().from(plans).all(),
  ]);
  const activeTeachers = new Set(teacherRows.filter(t => t.active).map(t => t.name));
  const activeStudents = new Set(studentRows.filter(s => s.active).map(s => s.name));
  return {
    teachers: [...activeTeachers].sort(),
    plans: planRows.filter(p => p.active && activeStudents.has(p.student) && activeTeachers.has(p.teacherName)).map(p => ({
      key: p.key,
      student: p.student,
      subject: p.subject,
      teacher: p.teacherName,
      duration: p.duration,
    })),
    allTeachers: teacherRows,
    students: [...activeStudents].sort(),
    allStudents: studentRows.sort((a, b) => a.name.localeCompare(b.name)),
    allPlans: planRows,
  };
}
