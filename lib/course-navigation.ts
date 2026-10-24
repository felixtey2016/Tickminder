export type NavigationRole = "admin" | "teacher" | "student" | "pending";

export type CourseView =
  | "calendar" | "list" | "schedule" | "attention" | "overview"
  | "students" | "teachers" | "lessons" | "attendance" | "reschedule" | "hours";

export type CourseSection = Exclude<CourseView, "students" | "teachers" | "lessons"> | "timetable";

export type CourseTab = {
  id: CourseSection;
  label: string;
  views: readonly CourseView[];
  defaultView: CourseView;
};

// Leaf IDs remain stable so history, shortcuts and data scopes keep their meaning.
const COURSE_VIEWS: Record<NavigationRole, readonly CourseView[]> = {
  admin: ["calendar", "list", "schedule", "attention", "overview", "students", "teachers"],
  teacher: ["calendar", "lessons", "attendance", "reschedule", "hours", "schedule"],
  student: ["calendar", "list", "reschedule"],
  pending: [],
};

const COURSE_TABS: Record<NavigationRole, readonly CourseTab[]> = {
  admin: [
    { id: "calendar", label: "course.nav.calendar", views: ["calendar"], defaultView: "calendar" },
    { id: "list", label: "列表", views: ["list"], defaultView: "list" },
    { id: "timetable", label: "时间表", views: ["students", "teachers"], defaultView: "students" },
    { id: "attention", label: "出席待处理", views: ["attention"], defaultView: "attention" },
    { id: "overview", label: "教学统计", views: ["overview"], defaultView: "overview" },
  ],
  teacher: [
    { id: "calendar", label: "course.nav.calendar", views: ["calendar"], defaultView: "calendar" },
    { id: "attendance", label: "课程与考勤", views: ["lessons", "attendance"], defaultView: "lessons" },
    { id: "reschedule", label: "改期申请", views: ["reschedule"], defaultView: "reschedule" },
    { id: "hours", label: "教学统计", views: ["hours"], defaultView: "hours" },
  ],
  student: [
    { id: "calendar", label: "course.nav.calendar", views: ["calendar"], defaultView: "calendar" },
    { id: "list", label: "列表", views: ["list"], defaultView: "list" },
    { id: "reschedule", label: "改期申请", views: ["reschedule"], defaultView: "reschedule" },
  ],
  pending: [],
};

export function isCourseView(role: NavigationRole, view: unknown): view is CourseView {
  return typeof view === "string" && COURSE_VIEWS[role].includes(view as CourseView);
}

export function defaultCourseView(role: NavigationRole): "calendar" | null {
  return role === "pending" ? null : "calendar";
}

export function getCourseTabs(role: NavigationRole): readonly CourseTab[] {
  return COURSE_TABS[role];
}

export function courseSection(role: NavigationRole, view: unknown): CourseSection | null {
  if (!isCourseView(role, view)) return null;
  if (view === "schedule") return "schedule";
  return COURSE_TABS[role].find(tab => tab.views.includes(view))?.id ?? null;
}

export function courseBadgeCount(role: NavigationRole, counts: Readonly<Partial<Record<string, number>>>): number {
  const count = (key: string) => {
    const value = counts[key];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
  };
  // Admin attention already includes overview; teacher attendance repeats lessons.
  if (role === "admin") return count("attention");
  if (role === "teacher") return count("lessons") + count("reschedule");
  return role === "student" ? count("reschedule") : 0;
}

// Resolve navigation aliases only. The caller must still validate the resulting
// leaf against the role's full menu; aliases never grant additional permissions.
export function normalizeCourseView(role: NavigationRole, view: string): string {
  if (view === "quizBank") return "quizzes";
  if (view === "courses" && role !== "pending") return "calendar";
  if (view === "timetable" && role === "admin") return "students";
  return view;
}
