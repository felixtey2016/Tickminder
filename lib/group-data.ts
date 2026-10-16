import { env } from "cloudflare:workers";
import { and, eq, type SQL } from "drizzle-orm";

export const DEFAULT_GROUP_ID = "next-genn-edu";
export const GROUP_TABLES = ["invoice_brand_assets","invoice_brand_settings","invoices","invoice_items","invoice_operations","invoice_sequences","invoice_source_locks","billing_students","billing_subjects","billing_policies","billing_policy_versions","billing_rates","billing_rate_versions","billing_operations","billing_adjustments","student_grade_promotions","class_sessions","class_session_participants","accounts","teachers","students","plans","assignments","lessons","reschedule_requests","audit","pdf_files","teaching_materials","material_recipients","homework","homework_recipients","homework_submissions","study_blocks","classrooms","classroom_folders","classroom_content_state","learning_versions","homework_score_history","homework_feedback","homework_resubmission_grants","learning_notifications","academic_terms","classroom_members","classroom_announcements","notification_items","site_notifications","storage_quota","quizzes","quiz_versions","quiz_answer_keys","quiz_images","quiz_version_images","quiz_practice_assignments","quiz_practice_recipients","quiz_practice_attempts","quiz_practice_operations","quiz_practice_events","quiz_assignment_notifications"] as const;

export function requireGroup(groupId: string | null | undefined): string {
  if (!groupId || !/^[a-z0-9-]{1,64}$/.test(groupId)) throw new Error("请选择补习集团");
  return groupId;
}
export function groupWhere(table: {groupId: any}, groupId: string | null | undefined, ...conditions: (SQL | undefined)[]) {
  return and(eq(table.groupId, requireGroup(groupId)), ...conditions);
}

// Each read gets statement-local SQLite views. Nested joins and subqueries see
// the same group; no connection-wide mutable state or SQL text substitution.
// Trusted SQL uses this helper for scoped subqueries. Mutations explicitly bind
// group_id at their call sites; global identity/background queries stay separate.
export function groupStatement(groupId: string | null | undefined, query: string) {
  const id = requireGroup(groupId);
  if (!env.DB) throw new Error("数据库暂时不可用");
  if (!/^\s*(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(query) || /;|\bmain\s*\.|\b(?:sqlite_master|pragma)\b/i.test(query)) throw new Error("Invalid group statement");
  const tables = GROUP_TABLES.filter(table => new RegExp(`\\b${table}\\b`, "i").test(query));
  if (!tables.length) return env.DB.prepare(query);
  const ctes = tables.map(table => `"${table}" AS (SELECT *${table === "audit" ? ", rowid AS rowid" : ""} FROM main."${table}" WHERE group_id = ?)`);
  const statement = env.DB.prepare(`WITH ${ctes.join(",")} ${query}`);
  return {
    bind: (...values: unknown[]) => statement.bind(...tables.map(() => id), ...values),
    all: <T>() => statement.bind(...tables.map(() => id)).all<T>(),
    first: <T>() => statement.bind(...tables.map(() => id)).first<T>(),
    run: () => statement.bind(...tables.map(() => id)).run(),
  };
}
export function groupRead(groupId: string | null | undefined,query: string) {
  if (!/^\s*SELECT\b/i.test(query)) throw new Error("Invalid group read");
  return groupStatement(groupId,query);
}
export async function groupRows<T extends Record<string, unknown> = Record<string, unknown>>(groupId: string | null | undefined, query: string, ...values: unknown[]): Promise<T[]> {
  return (await groupRead(groupId,query).bind(...values).all<T>()).results || [];
}
export function groupReader(groupId: string | null | undefined) {
  return {first:<T extends Record<string,unknown> = Record<string,unknown>>(query:string,...values:unknown[])=>groupFirst<T>(groupId,query,...values),rows:<T extends Record<string,unknown> = Record<string,unknown>>(query:string,...values:unknown[])=>groupRows<T>(groupId,query,...values)};
}
export async function groupFirst<T extends Record<string, unknown> = Record<string, unknown>>(groupId: string | null | undefined, query: string, ...values: unknown[]): Promise<T | null> {
  return groupRead(groupId,query).bind(...values).first<T>();
}
