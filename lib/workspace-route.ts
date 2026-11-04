import { quizLinkIdFromPath } from "./quiz-link";

export type WorkspaceRole = "admin" | "teacher" | "student" | "parent" | "pending";

// Paths express navigation intent only. The shell and server still enforce the
// current identity, group and per-action permissions before rendering/reading.
export const WORKSPACE_PATHS: Readonly<Record<string, string>> = {
  home: "/", teachingHub: "/teaching", learningHub: "/learning",
  manageHub: "/manage", myHub: "/account", billing: "/finance",
  myAccount: "/settings", notifications: "/notifications",
  calendar: "/courses/calendar", list: "/courses/list", lessons: "/courses/lessons",
  attendance: "/courses/attendance", reschedule: "/courses/reschedule",
  hours: "/courses/hours", schedule: "/courses/schedule", attention: "/courses/attention",
  overview: "/courses/statistics", students: "/courses/students", teachers: "/courses/teachers",
  classrooms: "/classrooms", homework: "/homework", materials: "/materials", quizzes: "/quizzes",
  subjects: "/teaching/subjects", studentRoster: "/manage/students", teacherRoster: "/manage/teachers",
  parentRoster: "/manage/parents", accounts: "/manage/accounts", groupInfo: "/manage/group",
  activity: "/manage/activity", groups: "/platform/groups",
};
const PARENT_PATHS: Readonly<Record<string, string>> = {
  home: "/", learnHub: "/learning", mineHub: "/account", finance: "/finance",
  account: "/settings", notifications: "/notifications", calendar: "/courses/calendar",
  lessons: "/courses/lessons", attendance: "/courses/attendance", homework: "/homework",
  materials: "/materials", recordings: "/recordings", learning: "/learning/progress", quizzes: "/quizzes",
};
const cleanPath = (pathname: string) => pathname === "/" ? "/" : pathname.replace(/\/$/, "");
const knownPaths = new Set([...Object.values(WORKSPACE_PATHS), ...Object.values(PARENT_PATHS), "/courses"]);
export function isWorkspacePath(pathname: string): boolean { return knownPaths.has(cleanPath(pathname)); }

export function workspaceViewFromPath(pathname: string, role: WorkspaceRole): string | null {
  const path = cleanPath(pathname);
  if (quizLinkIdFromPath(path)) return "quizzes";
  if (path === "/courses") return "calendar";
  const mapping = role === "parent" ? PARENT_PATHS : WORKSPACE_PATHS;
  const view = Object.keys(mapping).find(view => mapping[view] === path) || null;
  // Administrators reach personal settings from Manage, not a separate Account hub.
  return role === "admin" && view === "myHub" ? "myAccount" : view;
}
export function legacyWorkspaceView(search: string, role: WorkspaceRole): string | null {
  const view = new URLSearchParams(search).get("view");
  if (view === "notifications") return "notifications";
  if (view === "quizzes" || view === "quizBank") return "quizzes";
  return null;
}
export function workspacePath(view: string, role: WorkspaceRole): string | null {
  if (view === "courses") view = "calendar";
  if (view === "quizBank") view = "quizzes";
  if (view === "financeHub") view = "billing";
  return (role === "parent" ? PARENT_PATHS : WORKSPACE_PATHS)[view] || null;
}
export function workspaceUrl(view: string, role: WorkspaceRole, search = ""): string {
  const path = workspacePath(view, role) || "/", previous = new URLSearchParams(search), params = new URLSearchParams();
  const language = previous.get("lang");
  if (language === "en" || language === "zh") params.set("lang", language);
  return path + (params.size ? "?" + params : "");
}
export function workspaceNeedsCore(view: string): boolean {
  return !["home", "myAccount", "notifications", "quizzes", "groups", "teachingHub", "learningHub", "manageHub", "myHub", "financeHub"].includes(view);
}

// One same-origin allow-list for login/recovery return paths. Invalid assignment
// presence is retained so it cannot silently turn into unrelated self-practice.
export function safeWorkspaceReturnPath(pathname: string, search: string, language: "zh" | "en"): string {
  const quizId = quizLinkIdFromPath(pathname), params = new URLSearchParams();
  if (quizId) {
    const assignments = new URLSearchParams(search).getAll("assignment");
    if (assignments.length > 8 || assignments.some(value => value.length > 254)) params.append("assignment", "invalid");
    else for (const value of assignments) params.append("assignment", value);
  }
  params.set("lang", language);
  const path = quizId ? "/quiz/" + quizId : isWorkspacePath(pathname) ? cleanPath(pathname) : "/";
  return path + "?" + params;
}

