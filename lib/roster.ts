import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { plans, students, teachers } from "@/db/schema";

export async function readRoster(account?: { role: string; teacherName: string | null; studentName: string | null }) {
  const db = getDb();
  const planFilter = account?.role === "teacher" ? eq(plans.teacherName, account.teacherName || "") : account?.role === "student" ? eq(plans.student, account.studentName || "") : undefined;
  const [teacherRows, studentRows, planRows] = await Promise.all([
    db.select().from(teachers).where(planFilter ? inArray(teachers.name, db.select({name: plans.teacherName}).from(plans).where(planFilter)) : undefined).all(),
    db.select().from(students).where(planFilter ? inArray(students.name, db.select({name: plans.student}).from(plans).where(planFilter)) : undefined).all(),
    db.select().from(plans).where(planFilter).all(),
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
      onlineLink: p.onlineLink,
    })),
    allTeachers: teacherRows,
    students: [...activeStudents].sort(),
    allStudents: studentRows.sort((a, b) => a.name.localeCompare(b.name)),
    allPlans: planRows,
  };
}
