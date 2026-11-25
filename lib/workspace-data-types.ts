import type {Account} from './auth';
import type {AdminPermissionContext} from './admin-permission-access';
import type {AttendanceSession} from './attendance-types';
import type {SessionLesson} from './class-session-display';
import type {GroupSession, GroupSessionRequest} from '@/app/class-session-schedule';
import type {RescheduleProposal} from '@/app/reschedule-panel';
import type {LearningState} from '@/app/learning-portal';

export type WorkspaceIdentity = Pick<Account, 'id' | 'name' | 'email' | 'role' | 'groupId' | 'teacherName' | 'studentName'> & {
  isOwner: boolean; isGroupChief: boolean; canManageAdministrators: boolean; adminPermissions?: AdminPermissionContext;
};
export type WorkspacePlan = {key: string; student: string; subject: string; subjectId?: string | null; teacher: string; duration: number; onlineLink?: string | null; syllabusId?: string; grade?: string | null; age?: number | null};
export type WorkspacePlanOption = Omit<WorkspacePlan, 'teacher'> & {teacherName: string; teacher?: string; active: boolean};
export type WorkspaceStudent = {name: string; nameKey: string; active: boolean; syllabusId?: string; grade?: string | null; age?: number | null};
export type WorkspaceStudentOption = Pick<WorkspaceStudent, 'name' | 'active' | 'syllabusId' | 'grade'>;
export type WorkspaceTeacher = {name: string; active: boolean};
export type WorkspaceTerm = {id: string; name: string; isCurrent: number};
export type WorkspaceLesson = SessionLesson & {id: string; student: string; subject: string; teacherName: string; plannedStart: string; plannedEnd: string; actualStart: string | null; actualEnd: string | null; status: string; attendanceKind?: string | null; note?: string | null; chargeable?: boolean | null; reviewedAt?: string | null; kind: string; seriesId: string | null; replacementFor: string | null; onlineLink?: string | null};
export type WorkspaceNames = {students: string[]; teachers: string[]};
export type WorkspacePlanData = WorkspaceNames & {plans: WorkspacePlan[]; planOptions: WorkspacePlanOption[]};
export type WorkspaceClassroomOptions = {plans: WorkspacePlan[]; allPlans: WorkspacePlanOption[]; planOptions: WorkspacePlanOption[]; teachers: string[]};

export type WorkspaceDataMap = {
  calendar: WorkspaceNames & {courseRange: {from: string; to: string}; lessons: WorkspaceLesson[]; attendanceSessions: AttendanceSession[]; classSessions: GroupSession[]; classSessionRequests: GroupSessionRequest[]; proposals: RescheduleProposal[]};
  schedule: WorkspacePlanData;
  'teacher-plans': {plans: WorkspacePlan[]};
  students: {allStudents: WorkspaceStudent[]};
  teachers: {allTeachers: WorkspaceTeacher[]};
  subjects: WorkspaceNames & {allPlans: WorkspacePlanOption[]; allStudents: WorkspaceStudent[]; studentOptions: WorkspaceStudentOption[]};
  'account-options': WorkspaceNames & {studentOptions: WorkspaceStudentOption[]; teacherOptions: WorkspaceTeacher[]};
  'course-options': WorkspaceNames & {teacherOptions: WorkspaceTeacher[]};
  'classroom-options': WorkspaceClassroomOptions;
  terms: {terms: WorkspaceTerm[]};
  materials: Pick<LearningState, 'materials' | 'eligible' | 'limits'>;
  homework: Pick<LearningState, 'homework' | 'submissions' | 'eligible' | 'limits'>;
  study: {studyBlocks: LearningState['studyBlocks']; homeworkSubjects: string[]; courseRange: {from: string; to: string}};
};
export type WorkspaceDataView = keyof WorkspaceDataMap;
export type WorkspaceDataResponse<V extends WorkspaceDataView = WorkspaceDataView> = V extends WorkspaceDataView ? {view: V; account: WorkspaceIdentity; revision: number; data: WorkspaceDataMap[V]} : never;
export const WORKSPACE_DATA_VIEWS = ['calendar', 'schedule', 'teacher-plans', 'students', 'teachers', 'subjects', 'account-options', 'course-options', 'classroom-options', 'terms', 'materials', 'homework', 'study'] as const satisfies readonly WorkspaceDataView[];
