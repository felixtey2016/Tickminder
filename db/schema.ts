import { foreignKey, index, integer, real, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Financial identities are separate from legacy roster names and plan keys.
// Financial reads are served only by the guarded billing API, never shared state.
export const billingStudents=sqliteTable('billing_students',{id:text('id').primaryKey(),groupId:text('group_id').notNull(),studentName:text('student_name').notNull(),createdAt:text('created_at').notNull()},t=>[uniqueIndex('billing_students_identity_unique').on(t.groupId,t.studentName)]);
export const billingSubjects=sqliteTable('billing_subjects',{id:text('id').primaryKey(),groupId:text('group_id').notNull(),studentId:text('student_id').notNull(),subjectKey:text('subject_key').notNull(),subject:text('subject').notNull(),subjectId:text('subject_id'),syllabusId:text('syllabus_id'),createdAt:text('created_at').notNull()},t=>[uniqueIndex('billing_subject_identity_unique').on(t.groupId,t.studentId,t.subjectKey)]);
export const billingPolicies=sqliteTable('billing_policies',{groupId:text('group_id').primaryKey(),revision:integer('revision').notNull().default(0),currentVersionId:text('current_version_id'),updatedAt:text('updated_at').notNull()});
export const billingPolicyVersions=sqliteTable('billing_policy_versions',{id:text('id').primaryKey(),groupId:text('group_id').notNull(),revision:integer('revision').notNull(),currency:text('currency').notNull(),hourRounding:text('hour_rounding').notNull(),attendanceBasis:text('attendance_basis').notNull(),monthlyPartial:text('monthly_partial').notNull(),effectiveFrom:text('effective_from').notNull(),actorId:text('actor_id').notNull(),createdAt:text('created_at').notNull()});
export const billingRates=sqliteTable('billing_rates',{id:text('id').primaryKey(),groupId:text('group_id').notNull(),studentId:text('student_id').notNull(),subjectKey:text('subject_key').notNull(),revision:integer('revision').notNull().default(0),currentVersionId:text('current_version_id'),updatedAt:text('updated_at').notNull()});
export const billingRateVersions=sqliteTable('billing_rate_versions',{id:text('id').primaryKey(),groupId:text('group_id').notNull(),rateId:text('rate_id').notNull(),revision:integer('revision').notNull(),mode:text('mode').notNull(),amountCents:integer('amount_cents').notNull(),currency:text('currency').notNull(),effectiveFrom:text('effective_from').notNull(),subjectSnapshot:text('subject_snapshot').notNull(),actorId:text('actor_id').notNull(),createdAt:text('created_at').notNull()});
export const billingOperations=sqliteTable('billing_operations',{groupId:text('group_id').notNull(),operationId:text('operation_id').notNull(),actorId:text('actor_id').notNull(),action:text('action').notNull(),requestHash:text('request_hash').notNull(),resultJson:text('result_json').notNull(),createdAt:text('created_at').notNull()},t=>[primaryKey({columns:[t.groupId,t.operationId]})]);
export const billingAdjustments=sqliteTable('billing_adjustments',{id:text('id').primaryKey(),groupId:text('group_id').notNull(),studentId:text('student_id').notNull(),month:text('month').notNull(),lineId:text('line_id').notNull(),revision:integer('revision').notNull(),amountCents:integer('amount_cents'),basisHash:text('basis_hash').notNull(),reason:text('reason').notNull(),actorId:text('actor_id').notNull(),createdAt:text('created_at').notNull()});

export const invoices=sqliteTable('invoices',{id:text('id').primaryKey(),groupId:text('group_id').notNull(),studentId:text('student_id').notNull(),month:text('month').notNull(),status:text('status',{enum:['draft','issued']}).notNull(),revision:integer('revision').notNull(),number:text('number'),sequenceYear:text('sequence_year'),sequenceValue:integer('sequence_value'),issuedAt:text('issued_at'),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),createdBy:text('created_by').notNull(),issuedBy:text('issued_by'),dueDate:text('due_date').notNull(),notes:text('notes').notNull().default(''),currency:text('currency').notNull(),sourceHash:text('source_hash').notNull(),sourceBasisJson:text('source_basis_json').notNull(),adjustmentBasisJson:text('adjustment_basis_json').notNull(),documentJson:text('document_json').notNull(),totalCents:integer('total_cents').notNull(),extensionJson:text('extension_json').notNull().default('{}')},t=>[uniqueIndex('invoice_student_month_unique').on(t.groupId,t.studentId,t.month),uniqueIndex('invoice_number_unique').on(t.groupId,t.number)]);
export const invoiceItems=sqliteTable('invoice_items',{id:text('id').primaryKey(),groupId:text('group_id').notNull(),invoiceId:text('invoice_id').notNull(),position:integer('position').notNull(),kind:text('kind',{enum:['fee','charge','discount']}).notNull(),sourceId:text('source_id'),amountCents:integer('amount_cents').notNull(),snapshotJson:text('snapshot_json').notNull()},t=>[uniqueIndex('invoice_item_position_unique').on(t.groupId,t.invoiceId,t.position)]);
export const invoiceOperations=sqliteTable('invoice_operations',{groupId:text('group_id').notNull(),operationId:text('operation_id').notNull(),actorId:text('actor_id').notNull(),action:text('action').notNull(),requestHash:text('request_hash').notNull(),executionId:text('execution_id').notNull(),resultJson:text('result_json').notNull(),createdAt:text('created_at').notNull()},t=>[primaryKey({columns:[t.groupId,t.operationId]})]);
export const invoiceSequences=sqliteTable('invoice_sequences',{groupId:text('group_id').notNull(),year:text('year').notNull(),lastValue:integer('last_value').notNull().default(0)},t=>[primaryKey({columns:[t.groupId,t.year]})]);
export const invoiceSourceLocks=sqliteTable('invoice_source_locks',{groupId:text('group_id').notNull(),invoiceId:text('invoice_id').notNull(),sourceType:text('source_type',{enum:['lesson','session','rate','student_month']}).notNull(),sourceId:text('source_id').notNull(),studentId:text('student_id').notNull(),month:text('month').notNull(),createdAt:text('created_at').notNull()},t=>[primaryKey({columns:[t.groupId,t.invoiceId,t.sourceType,t.sourceId]})]);

export const teachers = sqliteTable("teachers", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
}, t => [primaryKey({columns:[t.groupId,t.name]})]);

export const students = sqliteTable("students", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  syllabusId: text("syllabus_id").notNull().default("spm"),
  grade: text("grade"),
  age: integer("age"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
}, (t) => [primaryKey({columns:[t.groupId,t.name]}),uniqueIndex("students_name_key_unique").on(t.groupId,t.nameKey)]);

export const plans = sqliteTable("plans", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  key: text("key").notNull(),
  student: text("student").notNull(),
  subject: text("subject").notNull(),
  subjectId: text("subject_id"),
  teacherName: text("teacher_name").notNull(),
  duration: real("duration").notNull().default(1),
  onlineLink: text("online_link"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
}, t => [primaryKey({columns:[t.groupId,t.key]})]);

export const accounts = sqliteTable("accounts", {
  groupId: text("group_id").default("next-genn-edu"),
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  nameConfirmedAt: text("name_confirmed_at"),
  role: text("role").notNull().default("pending"),
  teacherName: text("teacher_name"),
  studentName: text("student_name"),
  createdAt: text("created_at").notNull(),
  disabledAt: text("disabled_at"),
  // NULL deadlines protect all accounts created before this feature.
  pendingExpiresAt: text("pending_expires_at"),
  activatedAt: text("activated_at"),
  activationReason: text("activation_reason"),
});

export const googleIdentities = sqliteTable("google_identities", {
  subject: text("subject").primaryKey(),
  accountId: text("account_id").notNull().unique(),
  email: text("email").notNull(),
  linkedAt: text("linked_at").notNull(),
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
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  planKey: text("plan_key").notNull(),
}, (t) => [uniqueIndex("assignment_unique").on(t.accountId, t.planKey)]);

export const lessons = sqliteTable("lessons", {
  sessionId:text("session_id"),
  groupId: text("group_id").notNull().default("next-genn-edu"),
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
  sessionId:text("session_id"),
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull(),
  originalStart: text("original_start").notNull(),
  originalEnd: text("original_end").notNull(),
  proposedStart: text("proposed_start").notNull(),
  proposedEnd: text("proposed_end").notNull(),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  requestedBy: text("requested_by").notNull(),
  requestedRole: text("requested_role").notNull().default("teacher"),
  requestedAt: text("requested_at").notNull(),
  respondedBy: text("responded_by"),
  respondedAt: text("responded_at"),
});

export const audit = sqliteTable("audit", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  lessonId: text("lesson_id").notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  before: text("before_json"),
  after: text("after_json"),
  at: text("at").notNull(),
});

export const pdfFiles = sqliteTable("pdf_files", {
  uploadRequestId:text("upload_request_id"),sha256:text("sha256"),
  groupId: text("group_id").notNull().default("next-genn-edu"),
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
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: integer("id").notNull(),
  usedBytes: integer("used_bytes").notNull().default(0),
}, t => [primaryKey({columns:[t.groupId,t.id]})]);

export const teachingMaterials = sqliteTable("teaching_materials", {
  revision:integer("revision").notNull().default(1),updatedAt:text("updated_at"),editToken:text("edit_token"),
  folderId: text("folder_id"),
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  fileId: text("file_id").notNull(),
  createdAt: text("created_at").notNull(),
  classroomId: text("classroom_id"),
});

export const materialRecipients = sqliteTable("material_recipients", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  materialId: text("material_id").notNull(),
  studentName: text("student_name").notNull(),
  subject: text("subject").notNull(),
}, (t) => [uniqueIndex("material_recipient_unique").on(t.materialId, t.studentName, t.subject)]);

export const homework = sqliteTable("homework", {
  revision:integer("revision").notNull().default(1),updatedAt:text("updated_at"),editToken:text("edit_token"),
  folderId: text("folder_id"),
  groupId: text("group_id").notNull().default("next-genn-edu"),
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
  classroomId: text("classroom_id"),
});

export const classrooms = sqliteTable("classrooms", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  subject: text("subject").notNull(),
  syllabusId: text("syllabus_id"),
  subjectId: text("subject_id"),
  grade: text("grade"),
  teacherName: text("teacher_name").notNull(),
  createdBy: text("created_by").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  termId: text("term_id"),
});

// Platform configuration, intentionally global rather than group-scoped.
export const academicCatalogues = sqliteTable("academic_catalogues", {
  scope: text("scope", {enum:["student","quiz"]}).primaryKey(),
  revision: integer("revision").notNull().default(1),
  contentJson: text("content_json").notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export const studentGradePromotions = sqliteTable("student_grade_promotions", {
  groupId: text("group_id").notNull().references(()=>tuitionGroups.id),
  studentName: text("student_name").notNull(),
  cycle: integer("cycle").notNull(),
  syllabusId: text("syllabus_id").notNull(),
  fromGrade: text("from_grade").notNull(),
  toGrade: text("to_grade").notNull(),
  confirmedBy: text("confirmed_by").notNull(),
  confirmedAt: text("confirmed_at").notNull(),
},t=>[primaryKey({columns:[t.groupId,t.studentName,t.cycle]}),foreignKey({columns:[t.groupId,t.studentName],foreignColumns:[students.groupId,students.name]}).onDelete("cascade")]);

export const academicTerms = sqliteTable("academic_terms", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
},t=>[uniqueIndex("academic_terms_name_unique").on(t.groupId,t.name)]);

export const classroomFolders = sqliteTable("classroom_folders", {
  id:text("id").primaryKey(),groupId:text("group_id").notNull(),classroomId:text("classroom_id").notNull(),parentId:text("parent_id"),name:text("name").notNull(),nameKey:text("name_key").notNull(),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
});
export const classroomContentState = sqliteTable("classroom_content_state", {
  classroomId:text("classroom_id").primaryKey(),groupId:text("group_id").notNull(),revision:integer("revision").notNull().default(0),mutationId:text("mutation_id"),
});

export const classroomMembers = sqliteTable("classroom_members", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  classroomId: text("classroom_id").notNull(),
  studentName: text("student_name").notNull(),
  createdAt: text("created_at").notNull(),
}, (t) => [uniqueIndex("classroom_member_unique").on(t.classroomId, t.studentName)]);

export const classroomAnnouncements = sqliteTable("classroom_announcements", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  classroomId: text("classroom_id").notNull(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const homeworkRecipients = sqliteTable("homework_recipients", {
  resubmitRevision:integer("resubmit_revision").notNull().default(0),activeGrantId:text("active_grant_id"),
  scoreRevision:integer("score_revision").notNull().default(0),scoreToken:text("score_token"),
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  homeworkId: text("homework_id").notNull(),
  studentName: text("student_name").notNull(),
  score: real("score"),
  scoredAt: text("scored_at"),
  scoredBy: text("scored_by"),
}, (t) => [uniqueIndex("homework_recipient_unique").on(t.homeworkId, t.studentName)]);

export const homeworkSubmissions = sqliteTable("homework_submissions", {
  authorizedGrantId:text("authorized_grant_id"),attempt:integer("attempt").notNull().default(0),
  homeworkRevision:integer("homework_revision"),startsAtSubmission:text("starts_at_submission"),dueAtSubmission:text("due_at_submission"),maxScoreSubmission:real("max_score_submission"),
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(),
  homeworkId: text("homework_id").notNull(),
  studentName: text("student_name").notNull(),
  fileId: text("file_id").notNull().unique(),
  submittedAt: text("submitted_at").notNull(),
  late: integer("late", { mode: "boolean" }).notNull(),
});

export const studyBlocks = sqliteTable("study_blocks", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
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

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(),
  endpoint: text("endpoint").notNull().unique(), p256dh: text("p256dh").notNull(), auth: text("auth").notNull(),
  language: text("language").notNull().default("zh"), createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(), lastTestAt: text("last_test_at"),
}, t => [index("push_account_idx").on(t.accountId)]);

export const notificationItems = sqliteTable("notification_items", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), lessonId: text("lesson_id").notNull(),
  plannedStart: text("planned_start").notNull(), offsetMinutes: integer("offset_minutes").notNull(),
  dueAt: text("due_at").notNull(), createdAt: text("created_at").notNull(), readAt: text("read_at"),
}, t => [uniqueIndex("notification_item_unique").on(t.accountId,t.lessonId,t.plannedStart,t.offsetMinutes), index("notification_account_idx").on(t.accountId,t.createdAt)]);

export const notificationDeliveries = sqliteTable("notification_deliveries", {
  id: text("id").primaryKey(), itemId: text("item_id").notNull(), subscriptionId: text("subscription_id").notNull(),
  status: text("status").notNull().default("pending"), attempts: integer("attempts").notNull().default(0),
  lockUntil: text("lock_until"), nextAttemptAt: text("next_attempt_at").notNull(), sentAt: text("sent_at"),
}, t => [uniqueIndex("notification_delivery_unique").on(t.itemId,t.subscriptionId), index("notification_delivery_due_idx").on(t.status,t.nextAttemptAt)]);

export const notificationRuntime = sqliteTable("notification_runtime", {
  id: integer("id").primaryKey(), lastDispatchAt: text("last_dispatch_at").notNull(),
});

export const siteNotifications = sqliteTable("site_notifications", {
  groupId: text("group_id").notNull().default("next-genn-edu"),
  id: text("id").primaryKey(), accountId: text("account_id").notNull(),
  eventId: text("event_id").notNull(), lessonId: text("lesson_id").notNull(), kind: text("kind").notNull(),
  createdAt: text("created_at").notNull(), readAt: text("read_at"),
}, table => [uniqueIndex("site_notification_event_unique").on(table.accountId,table.eventId),index("site_notification_account_idx").on(table.accountId,table.createdAt)]);

export const tuitionGroups = sqliteTable("tuition_groups", {
 chiefAdminId:text("chief_admin_id"),id:text("id").primaryKey(),name:text("name").notNull(),joinCode:text("join_code").notNull().unique(),active:integer("active",{mode:"boolean"}).notNull().default(true),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
});

export const adminPermissionProfiles=sqliteTable('admin_permission_profiles',{
 groupId:text('group_id').notNull().references(()=>tuitionGroups.id,{onDelete:'cascade'}),
 accountId:text('account_id').notNull().references(()=>accounts.id,{onDelete:'cascade'}),
 revision:integer('revision').notNull().default(1),
 grantsJson:text('grants_json').notNull().default('[]'),
 draftGrantsJson:text('draft_grants_json'),
 origin:text('origin').notNull(),
 updatedBy:text('updated_by'),
 updatedAt:text('updated_at').notNull(),
},table=>[primaryKey({columns:[table.groupId,table.accountId]}),index('admin_permission_profiles_account_idx').on(table.accountId)]);

export const learningVersions=sqliteTable("learning_versions",{id:text("id").primaryKey(),groupId:text("group_id").notNull(),kind:text("kind").notNull(),recordId:text("record_id").notNull(),revision:integer("revision").notNull(),fileId:text("file_id"),snapshotJson:text("snapshot_json").notNull(),actorId:text("actor_id").notNull(),changedAt:text("changed_at").notNull(),reason:text("reason").notNull()});
export const homeworkScoreHistory=sqliteTable("homework_score_history",{id:text("id").primaryKey(),groupId:text("group_id").notNull(),homeworkId:text("homework_id").notNull(),studentName:text("student_name").notNull(),submissionId:text("submission_id"),homeworkRevision:integer("homework_revision"),score:real("score"),previousScore:real("previous_score"),maxScore:real("max_score"),actorId:text("actor_id"),changedAt:text("changed_at").notNull(),reason:text("reason").notNull()});

export const homeworkResubmissionGrants=sqliteTable("homework_resubmission_grants",{id:text("id").primaryKey(),groupId:text("group_id").notNull(),homeworkId:text("homework_id").notNull(),recipientId:text("recipient_id").notNull(),studentName:text("student_name").notNull(),baseSubmissionId:text("base_submission_id").notNull(),grantedBy:text("granted_by").notNull(),grantedAt:text("granted_at").notNull(),requestHash:text("request_hash").notNull(),usedAt:text("used_at"),usedSubmissionId:text("used_submission_id"),revokedAt:text("revoked_at"),revokedBy:text("revoked_by")});
export const homeworkFeedback=sqliteTable("homework_feedback",{id:text("id").primaryKey(),groupId:text("group_id").notNull(),homeworkId:text("homework_id").notNull(),submissionId:text("submission_id").notNull(),teacherId:text("teacher_id").notNull(),comment:text("comment").notNull(),fileId:text("file_id"),createdAt:text("created_at").notNull(),requestHash:text("request_hash").notNull()});
export const learningNotifications=sqliteTable("learning_notifications",{id:text("id").primaryKey(),groupId:text("group_id").notNull(),accountId:text("account_id").notNull(),eventId:text("event_id").notNull(),contentKind:text("content_kind").notNull(),recordId:text("record_id").notNull(),contentRevision:integer("content_revision").notNull(),kind:text("kind").notNull(),title:text("title").notNull(),subject:text("subject").notNull(),createdAt:text("created_at").notNull(),readAt:text("read_at")},t=>[uniqueIndex("learning_notification_event_unique").on(t.accountId,t.eventId)]);
export const learningNotificationDeliveries=sqliteTable("learning_notification_deliveries",{id:text("id").primaryKey(),notificationId:text("notification_id").notNull(),subscriptionId:text("subscription_id").notNull(),status:text("status").notNull().default("pending"),attempts:integer("attempts").notNull().default(0),nextAttemptAt:text("next_attempt_at").notNull(),lockUntil:text("lock_until"),sentAt:text("sent_at")},t=>[uniqueIndex("learning_notification_delivery_unique").on(t.notificationId,t.subscriptionId)]);

export const classSessions=sqliteTable("class_sessions",{teachingStatus:text("teaching_status").notNull().default("pending"),actualStart:text("actual_start"),actualEnd:text("actual_end"),attendanceNote:text("attendance_note"),attendanceRecordedAt:text("attendance_recorded_at"),attendanceRecordedBy:text("attendance_recorded_by"),attendanceReviewedAt:text("attendance_reviewed_at"),attendanceReviewedBy:text("attendance_reviewed_by"),attendanceWrittenAt:text("attendance_written_at"),id:text("id").primaryKey(),groupId:text("group_id").notNull(),sessionType:text("session_type").notNull(),classroomId:text("classroom_id"),classroomTitle:text("classroom_title"),teacherName:text("teacher_name").notNull(),subject:text("subject").notNull(),plannedStart:text("planned_start").notNull(),plannedEnd:text("planned_end").notNull(),onlineLink:text("online_link"),status:text("status").notNull().default("scheduled"),seriesId:text("series_id"),revision:integer("revision").notNull().default(1),createdBy:text("created_by").notNull(),createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),mutationId:text("mutation_id"),createRequestId:text("create_request_id"),occurrence:integer("occurrence").notNull().default(0),createHash:text("create_hash")});
export const classSessionParticipants=sqliteTable("class_session_participants",{attendanceStatus:text("attendance_status").notNull().default("pending"),arrivedAt:text("arrived_at"),leftAt:text("left_at"),attendanceNote:text("attendance_note"),attendanceUpdatedAt:text("attendance_updated_at"),id:text("id").primaryKey(),groupId:text("group_id").notNull(),sessionId:text("session_id").notNull(),lessonId:text("lesson_id").notNull().unique(),studentName:text("student_name").notNull()});

export const quizzes = sqliteTable("quizzes", {
 deletedAt:text("deleted_at"),deletedBy:text("deleted_by"),
 id:text("id").primaryKey(), groupId:text("group_id").notNull().references(()=>tuitionGroups.id),
 ownerId:text("owner_id").notNull().references(()=>accounts.id),title:text("title").notNull(),
 subject:text("subject").notNull().default(""),exam:text("exam").notNull().default(""),year:integer("year"),
 difficulty:text("difficulty",{enum:["easy","medium","hard","mixed"]}).notNull().default("mixed"),
 visibility:text("visibility",{enum:["private","organisation","public"]}).notNull().default("private"),
 revision:integer("revision").notNull().default(0),sharedRevision:integer("shared_revision"),
 questionCount:integer("question_count").notNull().default(0),totalScore:real("total_score").notNull().default(0),
 timeLimitSeconds:integer("time_limit_seconds"),sourceKey:text("source_key"),sourceVersionId:text("source_version_id"),
 createdAt:text("created_at").notNull(),updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("quiz_source_unique").on(t.groupId,t.ownerId,t.sourceKey),index("quiz_owner_idx").on(t.groupId,t.ownerId,t.updatedAt),index("quiz_bank_idx").on(t.visibility,t.subject,t.year,t.updatedAt)]);
export const quizVersions=sqliteTable("quiz_versions",{
 id:text("id").primaryKey(),groupId:text("group_id").notNull().references(()=>tuitionGroups.id),
 quizId:text("quiz_id").notNull().references(()=>quizzes.id),revision:integer("revision").notNull(),
 contentJson:text("content_json").notNull(),actorId:text("actor_id").notNull().references(()=>accounts.id),
 operationId:text("operation_id").notNull().unique(),requestHash:text("request_hash").notNull(),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("quiz_revision_unique").on(t.quizId,t.revision)]);
export const quizAnswerKeys=sqliteTable("quiz_answer_keys",{
 versionId:text("version_id").primaryKey().references(()=>quizVersions.id),
 groupId:text("group_id").notNull().references(()=>tuitionGroups.id),answersJson:text("answers_json").notNull(),
});
export const quizImages=sqliteTable("quiz_images",{
 id:text("id").primaryKey(),groupId:text("group_id").notNull().references(()=>tuitionGroups.id),
 ownerId:text("owner_id").notNull().references(()=>accounts.id),objectKey:text("object_key").notNull().unique(),
 filename:text("filename").notNull(),mime:text("mime",{enum:["image/png","image/jpeg","image/webp"]}).notNull(),
 bytes:integer("bytes").notNull(),sha256:text("sha256").notNull(),
 status:text("status",{enum:["uploading","ready"]}).notNull(),createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("quiz_image_hash_unique").on(t.groupId,t.ownerId,t.sha256),index("quiz_image_owner_idx").on(t.groupId,t.ownerId,t.createdAt)]);
export const quizVersionImages=sqliteTable("quiz_version_images",{
 versionId:text("version_id").notNull().references(()=>quizVersions.id),
 imageId:text("image_id").notNull().references(()=>quizImages.id),groupId:text("group_id").notNull().references(()=>tuitionGroups.id),
},t=>[primaryKey({columns:[t.versionId,t.imageId]})]);

export const quizPracticeAssignments=sqliteTable("quiz_practice_assignments",{
 id:text("id").primaryKey(),groupId:text("group_id").notNull().references(()=>tuitionGroups.id),quizId:text("quiz_id").notNull().references(()=>quizzes.id),versionId:text("version_id").notNull().references(()=>quizVersions.id),createdBy:text("created_by").notNull().references(()=>accounts.id),title:text("title").notNull(),subject:text("subject").notNull(),classroomId:text("classroom_id"),immediate:integer("immediate",{mode:"boolean"}).notNull().default(false),createdAt:text("created_at").notNull(),withdrawnAt:text("withdrawn_at"),settingsJson:text("settings_json").notNull().default("{}"),revision:integer("revision").notNull().default(1),scoresReleasedAt:text("scores_released_at"),answersReleasedAt:text("answers_released_at"),operationId:text("operation_id").notNull().unique(),requestHash:text("request_hash").notNull(),
},t=>[index("quiz_practice_assignment_group_idx").on(t.groupId,t.createdBy,t.createdAt)]);
export const quizPracticeRecipients=sqliteTable("quiz_practice_recipients",{assignmentId:text("assignment_id").notNull().references(()=>quizPracticeAssignments.id),groupId:text("group_id").notNull().references(()=>tuitionGroups.id),studentName:text("student_name").notNull(),dueAt:text("due_at"),extraAttempts:integer("extra_attempts").notNull().default(0)},t=>[primaryKey({columns:[t.assignmentId,t.studentName]})]);
export const quizPracticeAttempts=sqliteTable("quiz_practice_attempts",{
 discardedAt:text("discarded_at"),
 id:text("id").primaryKey(),groupId:text("group_id").notNull().references(()=>tuitionGroups.id),accountId:text("account_id").notNull().references(()=>accounts.id),studentName:text("student_name"),quizId:text("quiz_id").notNull().references(()=>quizzes.id),versionId:text("version_id").notNull().references(()=>quizVersions.id),assignmentId:text("assignment_id").references(()=>quizPracticeAssignments.id),immediate:integer("immediate",{mode:"boolean"}).notNull(),revision:integer("revision").notNull().default(1),attemptNumber:integer("attempt_number").notNull().default(0),status:text("status",{enum:["in_progress","submitted"]}).notNull().default("in_progress"),orderJson:text("order_json").notNull(),answersJson:text("answers_json").notNull().default("{}"),checkedJson:text("checked_json").notNull().default("[]"),resultsJson:text("results_json").notNull().default("[]"),flaggedJson:text("flagged_json").notNull().default("[]"),submissionReason:text("submission_reason",{enum:["student","timer","deadline"]}),submissionDueAt:text("submission_due_at"),late:integer("late",{mode:"boolean"}).notNull().default(false),startedAt:text("started_at").notNull(),deadlineAt:text("deadline_at"),submittedAt:text("submitted_at"),updatedAt:text("updated_at").notNull(),score:real("score").notNull().default(0),totalScore:real("total_score").notNull(),pendingManual:integer("pending_manual").notNull().default(0),operationId:text("operation_id").notNull().unique(),requestHash:text("request_hash").notNull(),
},t=>[index("quiz_practice_attempt_account_idx").on(t.groupId,t.accountId,t.startedAt),index("quiz_practice_attempt_assignment_idx").on(t.groupId,t.assignmentId,t.studentName)]);
export const quizPracticeOperations=sqliteTable("quiz_practice_operations",{id:text("id").primaryKey(),groupId:text("group_id").notNull().references(()=>tuitionGroups.id),actorId:text("actor_id").notNull().references(()=>accounts.id),recordId:text("record_id").notNull(),kind:text("kind").notNull(),requestHash:text("request_hash").notNull(),createdAt:text("created_at").notNull()});
export const quizPracticeEvents=sqliteTable("quiz_practice_events",{
 id:text("id").primaryKey(),groupId:text("group_id").notNull().references(()=>tuitionGroups.id),
 assignmentId:text("assignment_id").references(()=>quizPracticeAssignments.id),attemptId:text("attempt_id").references(()=>quizPracticeAttempts.id),
 actorId:text("actor_id").references(()=>accounts.id),action:text("action").notNull(),beforeJson:text("before_json"),afterJson:text("after_json"),createdAt:text("created_at").notNull(),
},t=>[index("quiz_practice_event_assignment_idx").on(t.groupId,t.assignmentId,t.createdAt),index("quiz_practice_event_attempt_idx").on(t.groupId,t.attemptId,t.createdAt)]);
export const quizAssignmentNotifications=sqliteTable("quiz_assignment_notifications",{
 id:text("id").primaryKey(),groupId:text("group_id").notNull().references(()=>tuitionGroups.id),accountId:text("account_id").notNull().references(()=>accounts.id,{onDelete:"cascade"}),
 eventId:text("event_id").notNull(),assignmentId:text("assignment_id").notNull().references(()=>quizPracticeAssignments.id),attemptId:text("attempt_id").references(()=>quizPracticeAttempts.id),
 kind:text("kind",{enum:["assigned","updated","retake_granted","pending_marking"]}).notNull(),title:text("title").notNull(),subject:text("subject").notNull(),createdAt:text("created_at").notNull(),readAt:text("read_at"),
},t=>[uniqueIndex("quiz_assignment_notice_event_unique").on(t.accountId,t.eventId),index("quiz_assignment_notice_account").on(t.groupId,t.accountId,t.createdAt),index("quiz_assignment_notice_attempt").on(t.attemptId,t.kind)]);
