import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const teachers = sqliteTable("teachers", {
  name: text("name").primaryKey(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const students = sqliteTable("students", {
  name: text("name").primaryKey(),
  nameKey: text("name_key").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("students_name_key_unique").on(t.nameKey)]);

export const plans = sqliteTable("plans", {
  key: text("key").primaryKey(),
  student: text("student").notNull(),
  subject: text("subject").notNull(),
  teacherName: text("teacher_name").notNull(),
  duration: real("duration").notNull().default(1),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("pending"),
  teacherName: text("teacher_name"),
  studentName: text("student_name"),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const localCredentials = sqliteTable("local_credentials", {
  accountId: text("account_id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
});

export const loginAttempts = sqliteTable("login_attempts", {
  username: text("username").primaryKey(),
  failures: integer("failures").notNull(),
  windowStart: text("window_start").notNull(),
  blockedUntil: text("blocked_until"),
});

export const assignments = sqliteTable("assignments", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  planKey: text("plan_key").notNull(),
}, (t) => [uniqueIndex("assignment_unique").on(t.accountId, t.planKey)]);

export const lessons = sqliteTable("lessons", {
  id: text("id").primaryKey(),
  student: text("student").notNull(),
  subject: text("subject").notNull(),
  teacherName: text("teacher_name").notNull(),
  plannedStart: text("planned_start").notNull(),
  plannedEnd: text("planned_end").notNull(),
  actualStart: text("actual_start"),
  actualEnd: text("actual_end"),
  status: text("status").notNull().default("scheduled"),
  attendanceKind: text("attendance_kind"),
  note: text("note"),
  chargeable: integer("chargeable", { mode: "boolean" }),
  reviewedAt: text("reviewed_at"),
  reviewedBy: text("reviewed_by"),
  kind: text("kind").notNull().default("regular"),
  seriesId: text("series_id"),
  replacementFor: text("replacement_for"),
  createdBy: text("created_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const rescheduleRequests = sqliteTable("reschedule_requests", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull(),
  originalStart: text("original_start").notNull(),
  originalEnd: text("original_end").notNull(),
  proposedStart: text("proposed_start").notNull(),
  proposedEnd: text("proposed_end").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  requestedBy: text("requested_by").notNull(),
  requestedAt: text("requested_at").notNull(),
  respondedBy: text("responded_by"),
  respondedAt: text("responded_at"),
});

export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  before: text("before_json"),
  after: text("after_json"),
  at: text("at").notNull(),
});

export const pdfFiles = sqliteTable("pdf_files", {
  id: text("id").primaryKey(),
  objectKey: text("object_key").notNull().unique(),
  ownerId: text("owner_id").notNull(),
  kind: text("kind").notNull(),
  contextId: text("context_id"),
  filename: text("filename").notNull(),
  bytes: integer("bytes").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const storageQuota = sqliteTable("storage_quota", {
  id: integer("id").primaryKey(),
  usedBytes: integer("used_bytes").notNull().default(0),
});

export const teachingMaterials = sqliteTable("teaching_materials", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  fileId: text("file_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const materialRecipients = sqliteTable("material_recipients", {
  id: text("id").primaryKey(),
  materialId: text("material_id").notNull(),
  studentName: text("student_name").notNull(),
  subject: text("subject").notNull(),
}, (t) => [uniqueIndex("material_recipient_unique").on(t.materialId, t.studentName, t.subject)]);

export const homework = sqliteTable("homework", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  startsAt: text("starts_at").notNull(),
  dueAt: text("due_at").notNull(),
  maxScore: real("max_score"),
  attachmentFileId: text("attachment_file_id"),
  createdAt: text("created_at").notNull(),
});

export const homeworkRecipients = sqliteTable("homework_recipients", {
  id: text("id").primaryKey(),
  homeworkId: text("homework_id").notNull(),
  studentName: text("student_name").notNull(),
  score: real("score"),
  scoredAt: text("scored_at"),
  scoredBy: text("scored_by"),
}, (t) => [uniqueIndex("homework_recipient_unique").on(t.homeworkId, t.studentName)]);

export const homeworkSubmissions = sqliteTable("homework_submissions", {
  id: text("id").primaryKey(),
  homeworkId: text("homework_id").notNull(),
  studentName: text("student_name").notNull(),
  fileId: text("file_id").notNull().unique(),
  submittedAt: text("submitted_at").notNull(),
  late: integer("late", { mode: "boolean" }).notNull(),
});

export const studyBlocks = sqliteTable("study_blocks", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  title: text("title").notNull(),
  subject: text("subject"),
  note: text("note"),
  startsAt: text("starts_at").notNull(),
  endsAt: text("ends_at").notNull(),
  homeworkId: text("homework_id"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
