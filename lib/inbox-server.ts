import { learningDb, rows } from "@/lib/learning-server";
import {learningInbox} from "./learning-notices";
import {quizAssignmentInbox} from "./quiz-assignment-notices";
import { participantSql } from "@/lib/notification-access";
import type { Account } from "@/lib/auth";
import { adminPermissionPredicate } from "@/lib/admin-permission-access";

type LessonChange = { groupId:string; lessonId: string; actorId: string; action: "reschedule" | "acceptReschedule" | "rejectReschedule" | "cancel"; before: unknown; after: unknown; at: string };
const inboxAccess = `a.disabled_at IS NULL AND ((a.role='admin' AND (a.group_id=l.group_id OR (a.group_id IS NULL AND a.id NOT LIKE 'local:%' AND lower(trim(a.email))='felixtey2016@gmail.com'))) OR (${participantSql}))`;

// Commit the audit record and its inbox entries together. Only subsequent
// changes produce messages; this does not backfill historical audit entries.
export function lessonChangeStatements(event: LessonChange) {
  const db = learningDb(), eventId = crypto.randomUUID();
  return [
    db.prepare("INSERT INTO audit (group_id,id,lesson_id,actor_id,action,before_json,after_json,at) VALUES (?,?,?,?,?,?,?,?)")
      .bind(event.groupId,eventId,event.lessonId,event.actorId,event.action,JSON.stringify(event.before),JSON.stringify(event.after),event.at),
    db.prepare(`INSERT INTO site_notifications (group_id,id,account_id,event_id,lesson_id,kind,created_at)
      SELECT l.group_id,lower(hex(randomblob(16))),a.id,?,l.id,?,? FROM lessons l JOIN accounts a ON ${inboxAccess}
      WHERE l.id=? AND a.id<>? AND l.group_id=?`).bind(eventId,event.action,event.at,event.lessonId,event.actorId,event.groupId),
  ];
}
export async function recordLessonChange(event:LessonChange){await learningDb().batch(lessonChangeStatements(event));}

const snapshot = (value: string | null) => {
  try { return JSON.parse(value || "{}") as Record<string, unknown>; } catch { return {}; }
};
const date = (value: unknown, fallback: string) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : fallback;

export async function inboxState(account: Account) {
  const permission=adminPermissionPredicate(account,"lessons.view");
  const messages = await rows<{ id: string; kind: string; createdAt: string; readAt: string | null; subject: string; teacherName: string; plannedStart: string; plannedEnd: string; beforeJson: string | null; afterJson: string | null; unreadTotal: number }>(`SELECT n.id,n.kind,n.created_at AS createdAt,n.read_at AS readAt,
    l.subject,l.teacher_name AS teacherName,l.planned_start AS plannedStart,l.planned_end AS plannedEnd,
    e.before_json AS beforeJson,e.after_json AS afterJson,sum(n.read_at IS NULL) OVER () AS unreadTotal
    FROM site_notifications n JOIN audit e ON e.id=n.event_id JOIN lessons l ON l.id=n.lesson_id JOIN accounts a ON a.id=n.account_id
    WHERE n.account_id=? AND n.group_id=? AND e.group_id=n.group_id AND l.group_id=n.group_id AND ${inboxAccess} AND ${permission.sql}
    ORDER BY (n.read_at IS NULL) DESC,n.created_at DESC,n.id DESC LIMIT 100`, account.id,account.groupId,...permission.args);
  const [learning,quiz]=await Promise.all([learningInbox(account),quizAssignmentInbox(account)]);
  return { unreadCount: Number(messages[0]?.unreadTotal || 0)+learning.unreadCount+quiz.unreadCount, unreadQuizCount:quiz.unreadCount, items: [...quiz.items,...learning.items,...messages.map(message => {
    const before = snapshot(message.beforeJson), after = snapshot(message.afterJson);
    return { id: "change:" + message.id, kind: message.kind, dueAt: message.createdAt, readAt: message.readAt, subject: message.subject, teacherName: message.teacherName,
      previousStart: date(before.originalStart ?? before.plannedStart, message.plannedStart),
      plannedStart: date(message.kind === "acceptReschedule" ? before.proposedStart : after.plannedStart ?? before.originalStart ?? before.plannedStart, message.plannedStart),
      plannedEnd: date(message.kind === "acceptReschedule" ? before.proposedEnd : after.plannedEnd ?? before.originalEnd ?? before.plannedEnd, message.plannedEnd) };
  })] };
}
