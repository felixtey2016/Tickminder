import type { lessons, rescheduleRequests } from "@/db/schema";
import type { AttendanceSession } from "./attendance-types";
import type { SessionLesson } from "./class-session-display";

type LessonSource = typeof lessons.$inferSelect & SessionLesson & { onlineLink?: string | null; classroomId?: string | null };

// Student payloads are deliberately constructed from an allowlist. Adding an
// internal column to a lesson or an audit record must not publish it by default.
export function studentLessonResponse(lesson: LessonSource) {
  return {
    id: lesson.id, student: lesson.student, subject: lesson.subject, teacherName: lesson.teacherName,
    plannedStart: lesson.plannedStart, plannedEnd: lesson.plannedEnd,
    actualStart: lesson.actualStart, actualEnd: lesson.actualEnd, status: lesson.status,
    attendanceKind: lesson.attendanceKind, kind: lesson.kind, seriesId: lesson.seriesId,
    replacementFor: lesson.replacementFor, sessionId: lesson.sessionId,
    teachingStatus: lesson.teachingStatus, teachingStart: lesson.teachingStart, teachingEnd: lesson.teachingEnd,
    personalAttendance: lesson.personalAttendance, onlineLink: lesson.onlineLink,
    sessionType: lesson.sessionType, classroomId: lesson.classroomId, classroomTitle: lesson.classroomTitle,
    participantCount: lesson.participantCount, sessionRevision: lesson.sessionRevision, sessionStatus: lesson.sessionStatus,
  };
}

export function studentRescheduleResponse(request: typeof rescheduleRequests.$inferSelect) {
  return {
    id: request.id, lessonId: request.lessonId, sessionId: request.sessionId,
    originalStart: request.originalStart, originalEnd: request.originalEnd,
    proposedStart: request.proposedStart, proposedEnd: request.proposedEnd,
    status: request.status, requestedRole: request.requestedRole,
    // This is the explanation shared with the other rescheduling participant,
    // including a student's own reason. It is not an internal attendance note.
    note: request.note, requestedAt: request.requestedAt, respondedAt: request.respondedAt,
  };
}

type SessionSource = AttendanceSession & { onlineLink: string | null; seriesId: string | null };
export function studentSessionResponse(session: SessionSource, studentName: string | null) {
  return {
    id: session.id, sessionType: session.sessionType, classroomId: session.classroomId,
    classroomTitle: session.classroomTitle, subject: session.subject, teacherName: session.teacherName,
    plannedStart: session.plannedStart, plannedEnd: session.plannedEnd, onlineLink: session.onlineLink,
    status: session.status, seriesId: session.seriesId, revision: session.revision,
    teachingStatus: session.teachingStatus, actualStart: session.actualStart, actualEnd: session.actualEnd,
    canManage: false, participantCount: session.participantCount,
    participants: session.participants.filter(participant => participant.studentName === studentName).map(participant => ({
      sessionId: participant.sessionId, lessonId: participant.lessonId, studentName: participant.studentName,
      attendanceStatus: participant.attendanceStatus, arrivedAt: participant.arrivedAt, leftAt: participant.leftAt,
    })),
  };
}

export function studentAttendanceSnapshot(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const result: Record<string, string | null> = {};
  for (const field of ["status", "teachingStatus", "actualStart", "actualEnd", "arrivedAt", "leftAt"] as const) {
    if (typeof source[field] === "string" || source[field] === null) result[field] = source[field];
  }
  return result;
}
