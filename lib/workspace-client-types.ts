import type {AdminPermissionAccount} from './admin-permission-client';
import type {AttendanceSession} from './attendance-types';
import type {GroupSession,GroupSessionRequest} from '@/app/class-session-schedule';
import type {SessionLesson} from './class-session-display';
import type {LearningState} from '@/app/learning-portal';
import type {Classroom} from '@/app/classrooms-page';
import type {CourseTaskCounts,CourseTeachingSummary} from './course-query';
import type {CalendarRange} from './course-calendar-range';

export type Account = AdminPermissionAccount & {
    id?: string;
    name: string;
    email?: string;
    nameConfirmedAt?: string | null;
    disabledAt?: string | null;
    username?: string | null;
    mustChangePassword?: boolean;
    requiresAccountSetup?: boolean;
    showGoogleLinkOnboarding?: boolean;
    requiresStudentPhone?: boolean;
    contactPhone?: string | null;
    contactPhoneKind?: "student" | "parent" | null;
    assignmentStatus?: string;
    pendingExpiresAt?: string | null;
    activatedAt?: string | null;
    role: "admin" | "teacher" | "student" | "parent" | "pending";
    isOwner?: boolean;
    isGroupChief?: boolean;
    canManageAdministrators?: boolean;
    groupId?:string|null;groupName?:string|null;groupUnavailable?:boolean;
    teacherName?: string | null;
    studentName?: string | null;
};

export type Plan = {
    subjectId?:string|null;syllabusId?:string;grade?:string|null;age?:number|null;
    key: string;
    student: string;
    subject: string;
    teacher: string;
    duration: number;
    onlineLink?: string | null;
};

export type ScheduleClassOption = {id:string;title:string;teacherName:string;subject:string;members:string[];planKeys:string[]};

export type Lesson = SessionLesson & {
    id: string;
    student: string;
    subject: string;
    teacherName: string;
    plannedStart: string;
    plannedEnd: string;
    actualStart: string | null;
    actualEnd: string | null;
    status: string;
    attendanceKind?: string | null;
    // Staff-only fields are absent from student responses.
    note?: string | null;
    chargeable?: boolean | null;
    reviewedAt?: string | null;
    kind: string;
    seriesId: string | null;
    replacementFor: string | null;
    onlineLink?: string | null;
};

export type StateScope = "learning" | "classrooms" | "accounts";

export type State = {
    coreError?:string;courseRange?:CalendarRange;taskCounts?:CourseTaskCounts;teachingSummary?:CourseTeachingSummary;
    attendanceSessions?:AttendanceSession[];
    classSessions?:GroupSession[];classSessionRequests?:GroupSessionRequest[];
    loadedScopes?: string[];
    scopeErrors?: Partial<Record<StateScope, string>>;
    account: Account;
    learning?: LearningState;
    classrooms?: Classroom[];
    terms?: Array<{id: string; name: string; isCurrent: number}>;
    revision?: number;
    plans?: Plan[];
    studentOptions?: Array<{name:string;active:boolean;syllabusId?:string;grade?:string|null}>;
    teacherOptions?: Array<{name:string;active:boolean}>;
    planOptions?: Array<Omit<Plan,"teacher"> & {teacher?:string;teacherName:string;active:boolean}>;
    classroomOptions?: Classroom[];
    termOptions?: Array<{id:string;name:string;isCurrent:number}>;
    allPlans?: Array<Omit<Plan, "teacher"> & {
        teacherName: string;
        active: boolean;
    }>;
    teachers?: string[];
    students?: string[];
    allStudents?: Array<{ name: string; nameKey: string; active: boolean;syllabusId?:string;grade?:string|null;age?:number|null }>;
    allTeachers?: Array<{
        name: string;
        active: boolean;
    }>;
    lessons?: Lesson[];
    proposals?: Array<{
        id: string;
        lessonId: string;
        originalStart: string;
        originalEnd: string;
        requestedRole: string;
        proposedStart: string;
        proposedEnd: string;
        status: string;
        note: string | null;
    }>;
    records?: Lesson[];
    checkins?: Lesson[];
    month?: string;
    summary?: Array<{
        key: string;
        completed: number;
        lessons: number;
        upcoming: number;
        pending: number;
        makeupNeeded: number;
    }>;
    users?: Array<Account & {
        id: string;
    }>;
    activity?: Array<{
        id: string;
        lessonId: string;
        lessonName: string;
        actorName: string;
        action: string;
        before: string | null;
        after: string | null;
        at: string;
    }>;
    error?: string;
};

export type Open = (x: {
    type: "attendance" | "review" | "edit" | "cancel";
    lesson: Lesson;
}) => void;
