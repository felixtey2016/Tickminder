import type { CourseTaskCounts } from './course-query';

export type HomeLesson = {
  id: string; student: string; subject: string; teacherName: string;
  plannedStart: string; plannedEnd: string; status: string;
  sessionId: string | null; sessionType: string; classroomTitle: string | null;
  onlineLink: string | null;
};
export type HomeStudyBlock = { id: string; title: string; startsAt: string; endsAt: string };
export type HomeNavigationSummary = { accountId: string; groupId: string; navigationCounts: CourseTaskCounts };
export type HomeSummary = {
  accountId: string; groupId: string; today: { date: string; total: number; items: HomeLesson[] };
  nextLesson: HomeLesson | null;
  taskCounts: { todayLessons: number; todayPendingAttendance: number; attention: number };
  navigationCounts: CourseTaskCounts;
  learning: { homeworkCount: number; pendingHomeworkCount: number; nextStudy: HomeStudyBlock | null };
};
