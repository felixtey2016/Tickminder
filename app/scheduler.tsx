"use client";
import type { Account, Lesson, State, StateScope } from "@/lib/workspace-client-types";
export type {Account} from "@/lib/workspace-client-types";
const Schedule=lazy(()=>import("./scheduler-course-pages").then(m=>({default:m.Schedule})));
const AdminDashboard=lazy(()=>import("./scheduler-course-pages").then(m=>({default:m.AdminDashboard})));
const RosterAdmin=lazy(()=>import("./scheduler-roster-pages").then(m=>({default:m.RosterAdmin})));
const LessonDialog=lazy(()=>import("./scheduler-lesson-dialog").then(m=>({default:m.LessonDialog})));

import {useWorkspaceData} from '@/lib/use-workspace-data';
import {workspacePageData,workspaceDataBlocksPage,workspaceIdentityKey} from '@/lib/workspace-page-data';
import { useDisplayPreferences } from '@/lib/use-display-preferences';

import { PasswordInput } from '@/components/password-input';
import { LoginForm } from './login-form';
import { workspaceViewFromPath, legacyWorkspaceView, workspaceUrl } from '@/lib/workspace-route';

import { ServiceBrandIcon } from '@/components/service-brand-icon';
import { MonthInput } from '@/components/month-input';
const SessionAttendanceLoaderDialog=lazy(()=>import("./session-attendance").then(m=>({default:m.SessionAttendanceLoaderDialog})));

import '@/lib/finance-round2-i18n';
import '@/lib/parents-i18n';

import { groupFetch, setClientGroup } from "@/lib/group-client";
import {readClientAuth,acceptClientAuth} from '@/lib/client-auth-read';
import {getPrivateReadSnapshot,installPrivateReadEvents,setPrivateReadIdentity,invalidatePrivateReads,subscribePrivateReadLifecycle} from '@/lib/private-read-lifecycle';
import {privateReadFlight,PrivateReadInvalidatedError} from '@/lib/private-read-flight';
import { FilterScope, useFilterPreference } from "@/lib/filter-preferences";
import { getLanguage, setLanguage, t, type Language } from "@/lib/i18n";
import { readBrowserLanguagePreference, rememberLanguagePreference } from '@/lib/language-preference';

import { alertActionFailure, readApiJson, showActionToast } from "@/lib/action-feedback";
import { clearDialogHistory, useDialogState } from "@/lib/use-dialog-state";

import "@/lib/compact-layout-i18n";

import { PageState } from "@/components/page-state";
import { actionFailureMessage } from "@/lib/action-feedback";
import { BarChart3, CalendarClock, ContactRound, LibraryBig, ListChecks, UserRound, UsersRound, SquarePen, ArrowLeftRight, Building2, NotebookPen } from "lucide-react";
import { BRAND_NAME } from "@/lib/brand";
import { LegalLinks } from "@/components/legal-links";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Bell, BookOpen, CalendarDays, CalendarPlus, Clock3, FileSpreadsheet, FileText, History, LayoutDashboard, List, LogOut, RefreshCw, Settings, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

import { FloatingBackButton } from "@/components/floating-back-button";
import { conflictDescription, type ConflictDetail } from "./conflict-preview";
import { useLessonWebMcp } from "./webmcp";

const StudentPortal=lazy(()=>import("./student-course-portal").then(m=>({default:m.StudentPortal})));
const StudentLearningDashboard=lazy(()=>import('./student-learning-dashboard').then(m=>({default:m.StudentLearningDashboard})));
const TeacherPortal=lazy(()=>import("./teacher-course-portal").then(m=>({default:m.TeacherPortal})));
const TeachingResources=lazy(()=>import("./teaching-resources").then(m=>({default:m.TeachingResources})));
import type { TeachingStatisticsDetailTarget } from "@/lib/teaching-statistics-types";
const TeachingStatistics=lazy(()=>import("./teaching-statistics").then(m=>({default:m.TeachingStatistics})));
const TeachingStatisticsDetails=lazy(()=>import("./teaching-statistics-details").then(m=>({default:m.TeachingStatisticsDetails})));
import { HomeDashboard } from "./home-dashboard";

import { GoogleLinkOnboarding } from './google-link-onboarding';
import { StudentContactOnboarding } from './student-contact-onboarding';

import { MobileBottomNavigation } from '@/components/mobile-bottom-navigation';
import { NavigationHub, type NavigationHubSection } from '@/components/navigation-hub';
import { primaryEntries, primaryArea, isPrimaryHub, hubGroups } from '@/lib/four-entry-navigation';
import { ShellPreferences } from '@/components/shell-preferences';
import './shell-wave1.css';
import { validQuizLinkId, quizLinkIdFromPath } from '@/lib/quiz-link';

const GroupConsole=lazy(()=>import("./group-console").then(m=>({default:m.GroupConsole})));
const ScopedLearningWorkspace=lazy(()=>import("./scoped-learning-workspace").then(module=>({default:module.ScopedLearningWorkspace})));

const HomeworkTasksWorkspace=lazy(()=>import('./homework-tasks-workspace').then(module=>({default:module.HomeworkTasksWorkspace})));
const QuizWorkspace=lazy(()=>import('./quiz-workspace'));
const ParentShell=lazy(()=>import('./parent-shell'));
const FinanceWorkspace=lazy(()=>import('./finance-workspace'));

const ClassroomsPage = lazy(() => import("./classrooms-page").then(module => ({default: module.ClassroomsPage})));
const Timetable=lazy(()=>import("./timetables").then(m=>({default:m.Timetable})));
const SubjectAdmin=lazy(()=>import("./roster-forms").then(m=>({default:m.SubjectAdmin})));
const TermManager = lazy(() => import("./term-manager").then(module => ({default: module.TermManager})));
const AccountSettings=lazy(()=>import("./account-settings").then(m=>({default:m.AccountSettings})));
import { NotificationsProvider, MenuBadge, detachPushOnLogout } from "./notifications";
const NotificationWorkspace=lazy(()=>import('./notification-workspace').then(module=>({default:module.NotificationWorkspace})));
import type { CourseTaskCounts } from "@/lib/course-query";
import type { HomeSummary } from "@/lib/home-summary-types";
import { monthCalendarRange, type CalendarRange } from "@/lib/course-calendar-range";
import { courseBadgeCount, defaultCourseView, isCourseView, normalizeCourseView } from "@/lib/course-navigation";
import { CourseNavigation } from "@/components/course-navigation";
import { ManagementNavigation } from "@/components/management-navigation";
import { defaultManagementView, managementArea, managementTitle, normalizeManagementView } from "@/lib/management-navigation";
import { AccountSetup } from "./account-setup";

import { AdminPermissionContext } from "./admin-permission-context";
import { canAdminAction, canAdminView, adminMutationGrant } from "@/lib/admin-permission-client";
type GoogleWindow = Window & {
    google?: {
        accounts: {
            id: {
                initialize: (x: object) => void;
                renderButton: (el: HTMLElement, x: object) => void;
            };
        };
    };
};
const dayFormatters = {
    zh: new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", weekday: "short" }),
    en: new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", month: "short", day: "numeric", weekday: "short" }),
};
const localFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const day = (iso: string) => dayFormatters[getLanguage()].format(new Date(iso));
const local = (iso: string) => localFormatter.format(new Date(iso)).replace(" ", "T");
function actionSuccessText(action: string) {
    const labels: Record<string, string> = {adminResetSessionAttendance:"已还原为未登记",saveSessionAttendance:"课次考勤已保存",reviewSessionAttendance:"课次考勤已复核", createClassSession:"整班课程已安排",editClassSession:"整班时间已更新",cancelClassSession:"整班课次已取消",proposeClassReschedule:"整班改期申请已发送",respondClassReschedule:"整班改期结果已保存",updateClassSessionLink:"课堂链接已保存",activateAccount: "账号已启用", createTerm: "学期已保存", saveTerm: "学期已保存", permanentDelete: "记录已永久删除", restoreAccount: "账号已恢复", attendance: "出席记录已保存", proposeReschedule: "改期申请已发送", respondReschedule: "改期处理结果已保存", edit: "课程时间已更新", cancel: "课程已取消", create: "课程已安排", saveMaterial: "教学资料已保存", deleteMaterial: "教学资料已删除", publishHomework: "功课已发布", submitHomework: "功课已提交", setHomeworkScore: "分数已保存", saveStudyBlock: "学习计划已保存", deleteStudyBlock: "学习计划已删除", saveClassroom: "班级已保存", archiveClassroom: "班级状态已更新", saveAnnouncement: "公告已发布", deleteAnnouncement: "公告已删除", savePlan: "科目配对已保存", saveStudent: "学生已保存", setStudentActive: "学生名单已更新", saveTeacher: "老师已保存", bind: "身份分配已保存", deleteAccount: "账号已停用", updateOnlineLink: "课堂链接已保存", review: "复核结果已保存", createLocalAccount: "账号已创建", resetLocalPassword: "密码已重置" };
    return t(labels[action] || "操作已完成");
}
async function request(url: string, options?: RequestInit): Promise<any> { if(url==='/api/auth'&&(!options?.method||options.method==='GET'))return readClientAuth(options?.signal||undefined);const r = await groupFetch(url, { ...options, cache: "no-store" }),responseEpoch=getPrivateReadSnapshot().authEpoch; const v = await readApiJson<{ error?: string; [key: string]: any }>(r); if (!r.ok)
    throw Object.assign(new Error(v.conflict ? conflictDescription(v.conflict as ConflictDetail) : t(r.status === 401 && url !== "/api/auth" ? "登录已过期，请重新登录" : v.error || "请求失败")), { status: r.status });if(url==='/api/auth'&&'account'in v&&'clientId'in v&&!acceptClientAuth(v as SchedulerAuth,responseEpoch))return readClientAuth(); return v; }
export type SchedulerAuth = {account: Account | null; clientId: string | null};
export function Scheduler({initialQuizId,initialAuth,onAuthChange}:{initialQuizId?:string;initialAuth?:SchedulerAuth;onAuthChange?:(auth:SchedulerAuth)=>void}={}) {
 useDisplayPreferences();
    const [linkedQuizId,setLinkedQuizId]=useState<string|undefined>(()=>validQuizLinkId(initialQuizId)?initialQuizId:undefined);
    useEffect(()=>{setLinkedQuizId(validQuizLinkId(initialQuizId)?initialQuizId:undefined);},[initialQuizId]);
    useEffect(()=>{const restore=()=>queueMicrotask(()=>setLinkedQuizId(quizLinkIdFromPath(window.location.pathname)||undefined));window.addEventListener("popstate",restore);return()=>window.removeEventListener("popstate",restore);},[]);
    const exitLinkedQuiz=useCallback(()=>{
        setLinkedQuizId(undefined);
        // Only replace our strict internal route; never accept a return URL.
        if(quizLinkIdFromPath(window.location.pathname)){
            const url=new URL(window.location.href);url.pathname='/quizzes';url.searchParams.delete('assignment');
            window.history.replaceState(window.history.state,'',url);
        }
    },[]);
    const [language, setLanguageState] = useState<Language>("zh");
    const [languageReady,setLanguageReady]=useState(false);
    useEffect(() => {
        const next=readBrowserLanguagePreference();
        setLanguage(next);setLanguageState(next);setLanguageReady(true);
    }, []);
    function changeLanguage(next: Language) { setLanguage(next);setLanguageState(next);rememberLanguagePreference(next); }
    const [auth, setAuth] = useState<SchedulerAuth | null>(initialAuth || null);
    const authChange=useRef(onAuthChange);authChange.current=onAuthChange;
    useEffect(()=>{if(auth)authChange.current?.(auth);},[auth]);
    const [invitedGroup,setInvitedGroup]=useState("");
    useEffect(()=>{const code=new URLSearchParams(location.search).get("group");if(code)void request(`/api/groups?code=${encodeURIComponent(code)}`).then(r=>setInvitedGroup(r.group.name)).catch(e=>setMessage(e.message));},[]);
    const [state, setState] = useState<State | null>(null);
    const [selectedMonth, setSelectedMonth] = useFilterPreference<string>("reporting-month", local(new Date().toISOString()).slice(0, 7), auth?.account?.id?`${auth.account.id}:${auth.account.groupId}`:undefined);
    const [calendarDate,setCalendarDate]=useState(()=>local(new Date().toISOString()).slice(0,10));
    const [calendarRange,setCalendarRange]=useState<CalendarRange>(()=>monthCalendarRange(local(new Date().toISOString()).slice(0,10)));
    const coreQueryRef=useRef({month:selectedMonth,...calendarRange});
    coreQueryRef.current={month:selectedMonth,...calendarRange};
    const onCalendarRangeChange=useCallback((next:CalendarRange)=>setCalendarRange(previous=>previous.from===next.from&&previous.to===next.to?previous:next),[]);
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const mutationInFlight = useRef(false);
    const [modal, setModal] = useDialogState<{
        type: "attendance" | "review" | "edit" | "cancel";
        lesson: Lesson;
    } | null>("admin-lesson", null);
    const googleButton = useRef<HTMLDivElement>(null);
    const latestStateRequest = useRef(0);
    const revisionRef = useRef<number | null>(null);
    const coreFailureMessage=useRef('');
    const coreLoaded=useRef(false),coreIdentity=useRef(''),coreVersion=useRef(0);
    const corePending=useRef<{key:string;promise:Promise<void>}|null>(null);
    const coreLessons=useRef<{identity:string;lessons:Lesson[]}>({identity:'',lessons:[]});
    const identityKey=auth?.account?workspaceIdentityKey(auth.account):'anonymous';
    useLayoutEffect(()=>{setClientGroup(auth?.account?.groupId);setPrivateReadIdentity(identityKey,auth?.account?.groupId);},[identityKey]);
    useEffect(installPrivateReadEvents,[]);
    const activeIdentity=useRef(identityKey);activeIdentity.current=identityKey;
    const channelRef = useRef<BroadcastChannel | null>(null);
    const loadedScopes = useRef(new Set<StateScope>());
    const wantedScopes = useRef(new Set<StateScope>());
    const setActiveScopes = useCallback((scopes: StateScope[]) => { wantedScopes.current = new Set(scopes); }, []);
    const scopeRequests = useRef(new Map<StateScope, Promise<void>>());
    const activeAccountId = useRef(auth?.account?.id);
    activeAccountId.current = auth?.account?.id;
    const ensureScope = useCallback(async (scope: StateScope, force = false) => {
        const accountId = auth?.account?.id;
        const requestIdentity=activeIdentity.current;
        if (!accountId || auth?.account?.role==='parent') return;
        if (!force && loadedScopes.current.has(scope)) return;
        const pending = scopeRequests.current.get(scope);
        if (pending) return pending;
        const epoch = latestStateRequest.current;
        const promise = (async () => {
            try {
                const next = await request(`/api/state?scope=${scope}`) as State;
                if (epoch !== latestStateRequest.current || accountId !== activeAccountId.current || requestIdentity!==activeIdentity.current) return;
                if (next.account.id !== accountId) return;
                if (workspaceIdentityKey(next.account)!==workspaceIdentityKey(auth!.account!)) {
                    // A lazy scope can observe revocation before the next poll.
                    // Drop prior private datasets and reject other older responses.
                    latestStateRequest.current++;
                    scopeRequests.current.clear();wantedScopes.current.clear();
                    loadedScopes.current=new Set([scope]);setModal(null);
                    setState({...next,loadedScopes:next.loadedScopes||[scope],scopeErrors:{}});
                    setAuth(previous=>previous?.account?.id===accountId?{...previous,account:{...previous.account,...next.account}}:previous);
                    return;
                }
                loadedScopes.current.add(scope);
                setState(previous => {
                    if (!previous) return {...next,loadedScopes:next.loadedScopes||[scope],scopeErrors:{}};
                    if (previous.account.id !== accountId || previous.account.groupId !== next.account.groupId || previous.account.role !== next.account.role || previous.account.teacherName !== next.account.teacherName || previous.account.studentName !== next.account.studentName) return previous;
                    if(JSON.stringify(previous.account.adminPermissions)!==JSON.stringify(next.account.adminPermissions)) {
                        loadedScopes.current=new Set([scope]);
                        return {...next,loadedScopes:next.loadedScopes||[scope],scopeErrors:{}};
                    }
                    return {...previous, ...next, account: next.account, revision: previous.revision,
                        loadedScopes: [...new Set([...(previous.loadedScopes || []), ...(next.loadedScopes || [scope])])],
                        scopeErrors: {...previous.scopeErrors, [scope]: undefined}};
                });
            } catch (error) {
                if (epoch === latestStateRequest.current && accountId === activeAccountId.current && requestIdentity===activeIdentity.current) {
                    const status=(error as Error&{status?:number}).status;
                    if(status===401||status===403){latestStateRequest.current++;scopeRequests.current.clear();setState({account:auth!.account!,loadedScopes:[],scopeErrors:{[scope]:actionFailureMessage(error)}});loadedScopes.current.clear();window.dispatchEvent(new Event('timelyo:auth-refresh'));}
                    else setState(previous=>({...previous,account:auth!.account!,scopeErrors:{...previous?.scopeErrors,[scope]:actionFailureMessage(error)}}));
                }
            }
        })();
        scopeRequests.current.set(scope, promise);
        try { await promise; } finally { if (scopeRequests.current.get(scope) === promise) scopeRequests.current.delete(scope); }
    }, [identityKey]);
    const refreshState = useCallback(async (silent: boolean, forceCore=false) => {
        if(auth?.account?.role==='parent'){setState(null);return;}
        if(!forceCore){
            latestStateRequest.current++;coreVersion.current++;scopeRequests.current.clear();
            coreLoaded.current=false;
            loadedScopes.current.clear();
            setState(previous=>previous?{...previous,loadedScopes:(previous.loadedScopes||[]).filter(scope=>wantedScopes.current.has(scope as StateScope)),scopeErrors:{}}:previous);
            window.dispatchEvent(new Event("tickminder:data-changed"));
            await Promise.all([...wantedScopes.current].map(scope=>ensureScope(scope,true)));
            return;
        }
        const requestIdentity=activeIdentity.current;
        coreLoaded.current=false;
        const requestId = ++latestStateRequest.current;
        setState(previous=>previous?{...previous,coreError:undefined}:previous);
        scopeRequests.current.clear();
        try {
            // A completed mutation can hold an older reload callback while the
            // user has already selected another reporting/calendar range.
            const next = await request(`/api/state?scope=core&${new URLSearchParams(coreQueryRef.current)}`) as State;
            if (requestId !== latestStateRequest.current || requestIdentity!==activeIdentity.current) return;
            if (next.account?.id && next.account.id !== auth?.account?.id) {
                setAuth(await request("/api/auth"));
                setState(null);
                revisionRef.current = null;
                return;
            }
            if(coreFailureMessage.current){const prior=coreFailureMessage.current;setMessage(current=>current===prior?"":current);coreFailureMessage.current="";}
            revisionRef.current = typeof next.revision === "number" ? next.revision : null;
            coreIdentity.current=requestIdentity;coreLoaded.current=true;
            coreLessons.current={identity:requestIdentity,lessons:next.lessons||[]};
            // Non-visible scopes become stale, rather than being reread after
            // every mutation for the rest of this signed-in session.
            const retainedScopes = [...wantedScopes.current].filter(scope => loadedScopes.current.has(scope));
            loadedScopes.current = new Set(retainedScopes);
            setState(previous => {
                const sameIdentity = JSON.stringify(previous?.account.adminPermissions)===JSON.stringify(next.account.adminPermissions) && previous?.account.id === next.account.id && previous?.account.groupId === next.account.groupId && previous?.account.role === next.account.role && previous?.account.teacherName === next.account.teacherName && previous?.account.studentName === next.account.studentName;
                if (!sameIdentity) loadedScopes.current.clear();
                return sameIdentity ? {...previous, ...next, coreError:undefined,loadedScopes: [...new Set([...(next.loadedScopes || ["core"]), ...retainedScopes])]} : next;
            });
            setAuth(previous => {
                if (!previous?.account || !next.account || previous.account.id !== next.account.id) return previous;
                const updated = { ...previous.account, name: next.account.name, role: next.account.role, teacherName: next.account.teacherName || null, studentName: next.account.studentName || null, isOwner: Boolean(next.account.isOwner), isGroupChief: Boolean(next.account.isGroupChief), canManageAdministrators: next.account.canManageAdministrators === true, adminPermissions: next.account.adminPermissions };
                return JSON.stringify(previous.account) === JSON.stringify(updated) ? previous : { ...previous, account: updated };
            });
            await Promise.all([...wantedScopes.current].map(scope => ensureScope(scope, true)));
            window.dispatchEvent(new Event("tickminder:data-changed"));
        } catch (error) {
            if (requestId !== latestStateRequest.current || requestIdentity!==activeIdentity.current) return;
            const status = (error as Error & { status?: number }).status;
            if (status === 401 || status === 403) {
                try { setAuth(await request("/api/auth")); setState(null); revisionRef.current = null; }
                catch { /* Retry on the next foreground check. */ }
            } else {setState(previous=>previous?{...previous,coreError:actionFailureMessage(error)}:previous);if(!silent){coreFailureMessage.current=(error as Error).message;setMessage(coreFailureMessage.current);}}
        }
    }, [selectedMonth, calendarRange.from,calendarRange.to,identityKey, ensureScope]);
    useEffect(() => { let active=true;const refreshAuth = () => { void request("/api/auth").then(value=>{if(active)setAuth(value);}).catch(error=>{if(active&&!(error instanceof PrivateReadInvalidatedError))alertActionFailure(error);}); }; window.addEventListener("timelyo:auth-refresh", refreshAuth); return () => {active=false;window.removeEventListener("timelyo:auth-refresh", refreshAuth);}; }, []);
    const reload = useCallback(() => refreshState(false), [refreshState]);
    const ensureCore=useCallback(async(force=false)=>{
        const key=activeIdentity.current+":"+JSON.stringify(coreQueryRef.current)+":"+coreVersion.current;
        if(!force&&coreLoaded.current&&coreIdentity.current===activeIdentity.current)return;
        if(corePending.current?.key===key)return corePending.current.promise;
        const promise=refreshState(false,force);corePending.current={key,promise};
        try{await promise;}finally{if(corePending.current?.promise===promise)corePending.current=null;}
    },[refreshState]);
    const getToolLessons=useCallback(async()=>{
        const identity=activeIdentity.current;
        await ensureCore(true);
        if(identity!==activeIdentity.current||!coreLoaded.current||coreLessons.current.identity!==identity)throw new Error(t('页面加载失败'));
        return coreLessons.current.lessons;
    },[ensureCore]);
    useEffect(() => { const refresh = () => { void refreshState(true); }; window.addEventListener('tickminder-roster-updated', refresh); return () => window.removeEventListener('tickminder-roster-updated', refresh); }, [refreshState]);
    useEffect(() => {
        if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
        let active = true;
        void navigator.serviceWorker.register("/notifications-sw.js", {scope:"/"}).then(registration => {
            const warm = () => {
                if (!active) return;
                const urls = [...new Set(performance.getEntriesByType("resource").map(entry => entry.name))];
                (registration.active || registration.waiting)?.postMessage({type:"cache-public-assets", urls});
            };
            if (registration.active) warm();
            else registration.installing?.addEventListener("statechange", warm);
        }).catch(() => { /* Normal loading works when browser storage is unavailable. */ });
        return () => { active = false; };
    }, []);
    useLayoutEffect(() => {
        // Clear the previous binding before the new Workspace's passive effects
        // declare their data needs. Account id alone does not identify a role.
        latestStateRequest.current++;coreVersion.current++;
        coreLoaded.current=false;coreIdentity.current="";
        corePending.current=null;coreLessons.current={identity:"",lessons:[]};
        loadedScopes.current.clear();wantedScopes.current.clear();scopeRequests.current.clear();
        revisionRef.current=null;setState(null);setModal(null);
    }, [identityKey,setModal]);
    useEffect(() => { if(initialAuth)return;let active = true; request("/api/auth").then(a => { if (active) setAuth(a); }).catch(e => { if (active&&!(e instanceof PrivateReadInvalidatedError)) setMessage(e.message); }); return () => { active = false; }; }, [initialAuth]);
    useEffect(() => {
        // UI pages own their reads; only the next explicit tool call needs a new core.
        coreLoaded.current=false;
    },[selectedMonth,calendarRange.from,calendarRange.to,identityKey]);
    useEffect(() => {
        const account = auth?.account;
        if (!account || account.mustChangePassword || account.requiresAccountSetup || account.requiresStudentPhone || !account.nameConfirmedAt) return;
        let active = true;
        let checking = false;
        let lastForegroundCheck = 0;
        const check = async () => {
            if (!active || checking || busy || document.visibilityState === "hidden") return;
            checking = true;
            try {
                if (account.role === "pending" || account.role === "parent") {
                    const next = await request("/api/auth");
                    if (active && JSON.stringify(next.account) !== JSON.stringify(account)) setAuth(next);
                } else {
                    const { revision, accountId, adminPermissions } = await request("/api/revision") as { revision: number; accountId: string; adminPermissions?: Account["adminPermissions"] };
                    if (active && accountId !== account.id) {
                        setAuth(await request("/api/auth"));
                        setState(null);
                        revisionRef.current = null;
                    } else if (active && JSON.stringify(adminPermissions)!==JSON.stringify(account.adminPermissions)) {
                        loadedScopes.current.clear();wantedScopes.current.clear();scopeRequests.current.clear();setModal(null);setState(null);
                        setAuth(previous=>previous?.account?{...previous,account:{...previous.account,adminPermissions}}:previous);
                        await refreshState(true);
                    } else if (active && (revisionRef.current === null || revision !== revisionRef.current)) {revisionRef.current=revision;await refreshState(true);}
                }
            } catch (error) {
                const status = (error as Error & { status?: number }).status;
                if (active && (status === 401 || status === 403)) {
                    try { const next = await request("/api/auth"); if (active) { setAuth(next); setState(null); revisionRef.current = null; } }
                    catch { /* Retry automatically. */ }
                }
            } finally { checking = false; }
        };
        const foregroundCheck = () => { if (document.visibilityState === "visible" && Date.now() - lastForegroundCheck > 1000) { lastForegroundCheck = Date.now(); void check(); } };
        const timer = window.setInterval(() => void check(), 10_000);
        const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("timelyo-data-updates");
        channelRef.current = channel;
        channel?.addEventListener("message", foregroundCheck);
        document.addEventListener("visibilitychange", foregroundCheck);
        window.addEventListener("focus", foregroundCheck);
        return () => { active = false; window.clearInterval(timer); channel?.close(); if (channelRef.current === channel) channelRef.current = null; document.removeEventListener("visibilitychange", foregroundCheck); window.removeEventListener("focus", foregroundCheck); };
    }, [auth?.account?.id, auth?.account?.role, auth?.account?.requiresAccountSetup, auth?.account?.requiresStudentPhone, auth?.account?.mustChangePassword, auth?.account?.nameConfirmedAt, auth?.account?.adminPermissions, busy, refreshState]);
    useEffect(() => {
        if (!auth || auth.account || !auth.clientId || !googleButton.current)
            return;
        const setup = () => {
            const g = (window as GoogleWindow).google;
            if (!g || !googleButton.current)
                return;
            g.accounts.id.initialize({ client_id: auth.clientId, callback: async (x: {
                    credential: string;
                }) => { try {
                    setBusy(true);
                    const signedIn = await request("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({...x,groupCode:new URLSearchParams(location.search).get("group") || undefined}) });
                    setAuth(signedIn.account ? signedIn : await request("/api/auth"));
                     showActionToast("success", "登录成功");
                }
                catch (e) {
                    setMessage(alertActionFailure(e));
                }
                finally {
                    setBusy(false);
                } } });
            googleButton.current.innerHTML = "";
            g.accounts.id.renderButton(googleButton.current, { theme: "outline", size: "large", width: Math.max(200, Math.min(300, googleButton.current.clientWidth)), text: "signin_with", locale: language === "zh" ? "zh_CN" : "en" });
        };
        if ((window as GoogleWindow).google) {
            setup();
            return;
        }
        let script = document.querySelector<HTMLScriptElement>("#timelyo-google-script");
        if (!script) {
            script = document.createElement("script");
            script.id = "timelyo-google-script";
            script.src = `https://accounts.google.com/gsi/client?hl=${language === "zh" ? "zh-CN" : "en"}`;
            script.async = true;
            document.head.appendChild(script);
        }
        script.addEventListener("load", setup);
        return () => { script?.removeEventListener("load", setup); };
    }, [auth, reload, language]);
    async function mutate(body: Record<string, unknown>) { const grant=adminMutationGrant(body);if(grant&&!canAdminAction(auth?.account,grant)){showActionToast("error","没有权限执行此操作");return false;} if (mutationInFlight.current) return false; mutationInFlight.current = true; try {
        setBusy(true);
        setMessage("");
        const result = await request(body.action === "permanentDelete" ? "/api/manage" : "/api/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        channelRef.current?.postMessage({ type: "changed" });
        showActionToast("success", result.deletedCount ? t("记录已永久删除") + ` · ${result.deletedCount}` : result.count ? (language === "zh" ? `已更新 ${result.count} 堂课` : `Updated ${result.count} lessons`) : actionSuccessText(String(body.action || "")));
        setModal(null);
        await reload();
        if (result.warning) showActionToast(body.action==='permanentDelete'?"success":"error", result.warning);
        return true;
    }
    catch (e) {
        alertActionFailure(e);
        return false;
    }
    finally {
        mutationInFlight.current = false;
        setBusy(false);
    } }
    async function learningMutate(body: Record<string, unknown>) {
        if (mutationInFlight.current) return false;
        mutationInFlight.current = true;
        try {
            setBusy(true);
            setMessage("");
            const send = async (payload: Record<string, unknown>) => {
                const response = await groupFetch(payload.action === "permanentDelete" ? "/api/manage" : "/api/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
                const result = await readApiJson<{ error?: string; warning?: string; overlaps?: string[] }>(response);
                return { response, result };
            };
            let { response, result } = await send(body);
            if (response.status === 409 && body.action === "saveStudyBlock" && result.overlaps?.length) {
                if (!window.confirm(`${result.error || t("时间重叠")}\n${result.overlaps.join("\n")}`)) return false;
                ({ response, result } = await send({ ...body, keepOverlap: true }));
            }
            if (!response.ok) throw new Error(t(result.error || "保存失败，请重试"));
            channelRef.current?.postMessage({ type: "changed" });
            showActionToast("success", actionSuccessText(String(body.action || "")));
            await reload();
            if (result.warning) alertActionFailure(new Error(t(result.warning)));
            return true;
        } catch (error) {
            alertActionFailure(error);
            return false;
        } finally { mutationInFlight.current = false; setBusy(false); }
    }
    async function classroomMutate(body: Record<string, unknown>) {
        const grant=adminMutationGrant(body);if(grant&&!canAdminAction(auth?.account,grant)){showActionToast("error","没有权限执行此操作");return {ok:false};}
        if (mutationInFlight.current) return { ok: false };
        mutationInFlight.current = true;
        try {
            setBusy(true); setMessage("");
            const response = await groupFetch(body.action === "permanentDelete" ? "/api/manage" : "/api/classrooms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
            const result = await readApiJson<{ error?: string; id?: string; warning?: string }>(response);
            if (!response.ok) throw new Error(t(result.error || "保存失败，请重试"));
            channelRef.current?.postMessage({ type: "changed" });
            showActionToast("success", actionSuccessText(String(body.action || ""))); await reload();
            if (result.warning) showActionToast("error", result.warning);
            return { ok: true, id: result.id };
        } catch (error) { alertActionFailure(error); return { ok: false }; }
        finally { mutationInFlight.current = false; setBusy(false); }
    }
    async function logout() { invalidatePrivateReads('logout',{auth:true,clear:true});try { if(!auth?.account?.groupUnavailable) await detachPushOnLogout(); await request("/api/auth", { method: "DELETE" }); clearDialogHistory(); setModal(null); showActionToast("success", "已退出登录"); latestStateRequest.current++; revisionRef.current = null;const next={account:null,clientId:auth?.clientId||null};acceptClientAuth(next);setAuth(next); setState(null); loadedScopes.current.clear(); wantedScopes.current.clear(); scopeRequests.current.clear(); } catch (error) { setMessage(alertActionFailure(error));window.dispatchEvent(new Event('timelyo:auth-refresh')); } }
    async function localLogin(username: string, password: string) { if (busy) return; try {
        setBusy(true);
        setMessage("");
        const signedIn = await request("/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
        const next = signedIn.account ? signedIn : await request("/api/auth");
        setAuth(next);
        showActionToast("success", "登录成功");
    }
    catch (e) {
        setMessage(alertActionFailure(e));
    }
    finally {
        setBusy(false);
    } }
    async function changePassword(currentPassword: string, newPassword: string) { try {
        setBusy(true);
        setMessage("");
        await request("/api/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
        showActionToast("success", "密码已更新");
        const next = await request("/api/auth");
        setAuth(next);
    }
    catch (e) {
        setMessage(alertActionFailure(e));
    }
    finally {
        setBusy(false);
    } }
    async function confirmName(name: string) { try {
        setBusy(true);
        setMessage("");
        await request("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
        showActionToast("success", "姓名已保存");
        setAuth(await request("/api/auth"));
    } catch (error) {
        setMessage(alertActionFailure(error));
    } finally {
        setBusy(false);
    } }
    const lessons = useMemo(() => [...(state?.lessons || [])].sort((a, b) => a.plannedStart.localeCompare(b.plannedStart)), [state?.lessons]);
    const toolAccount=auth?.account;
    const toolRole=toolAccount&&!toolAccount.mustChangePassword&&!toolAccount.requiresAccountSetup&&toolAccount.nameConfirmedAt&&!toolAccount.requiresStudentPhone&&!toolAccount.groupUnavailable&&!toolAccount.showGoogleLinkOnboarding?toolAccount.role:undefined;
    useLessonWebMcp(toolRole, lessons, reload,getToolLessons,identityKey);
    if (!languageReady)return <main className="auth-loading" data-testid="device-language-loading"><p role="status">正在加载… / Loading…</p></main>;
    if (!auth)
        return <main className="auth-loading"><LanguageSwitcher language={language} change={changeLanguage}/><PageState kind={message ? "error" : "loading"} title={message ? "页面加载失败" : "正在加载…"} description={message ? actionFailureMessage(new Error(message)) : undefined} action={message ? "重试" : undefined} onAction={() => { setMessage(""); void request("/api/auth").then(setAuth).catch(error => setMessage(actionFailureMessage(error))); }}/></main>;
    if (!auth.account)
        return <LoginForm invitedGroup={invitedGroup} googleButton={googleButton} clientId={auth.clientId} login={localLogin} busy={busy} message={message} language={language} changeLanguage={changeLanguage}/>;
    const account = auth.account;
    if (account.mustChangePassword)
        return <PasswordChange name={account.name} change={changePassword} logout={logout} busy={busy} message={message} language={language} changeLanguage={changeLanguage}/>;
    if (!account.nameConfirmedAt)
        return <NameSetup initialName={account.name} save={confirmName} logout={logout} busy={busy} message={message} language={language} changeLanguage={changeLanguage}/>;
    if (account.requiresAccountSetup)
        return <AccountSetup email={account.email} onSaved={async()=>setAuth(await request("/api/auth"))} logout={logout} language={language} changeLanguage={changeLanguage}/>;
    if(account.role==='pending')return <main className="auth-shell"><div className="auth-card"><LanguageSwitcher language={language} change={changeLanguage}/><h1>{language==='zh'?'等待管理员分配身份':'Waiting for account approval'}</h1><SignedInIdentity account={account}/><p>{language==='zh'?'请联系所属集团管理员填写资料并分配身份，完成后即可使用。':'Ask your centre administrator to complete your profile and assign a role.'}</p><div className="directory-form-actions"><Button onClick={async()=>{try{setAuth(await request('/api/auth'));}catch(error){alertActionFailure(error);}}}>{t('刷新')}</Button><Button variant="outline" onClick={logout}>{t('退出登录')}</Button></div></div></main>;
    if(account.groupUnavailable)return <main className="auth-shell"><div className="auth-card"><LanguageSwitcher language={language} change={changeLanguage}/><h1>{t("补习集团暂不可用")}</h1><p>{t("请联系所属集团的管理员，或稍后重试。")}</p><Button onClick={()=>window.location.reload()}>{t("刷新")}</Button><Button variant="outline" onClick={logout}>{t("退出登录")}</Button></div></main>;
    if(account.role==='student'&&account.requiresStudentPhone)return <StudentContactOnboarding name={account.studentName||account.name} language={language} changeLanguage={changeLanguage} onCompleted={async()=>setAuth(await request('/api/auth'))} logout={logout}/>;
    if(account.showGoogleLinkOnboarding)return <GoogleLinkOnboarding name={account.name} clientId={auth.clientId} language={language} changeLanguage={changeLanguage} onCompleted={async()=>setAuth(await request('/api/auth'))} logout={logout}/>;
    if(account.role==='parent')return <Suspense fallback={<p role="status">{t('正在加载…')}</p>}><ParentShell account={account} initialQuizId={linkedQuizId} onLinkedQuizExit={exitLinkedQuiz} language={language} changeLanguage={changeLanguage} logout={logout} refreshIdentity={async()=>setAuth(await request('/api/auth'))}/></Suspense>;
    const admin = account.role === "admin";
    return <AdminPermissionContext.Provider value={account}><Workspace key={identityKey} initialQuizId={linkedQuizId} onLinkedQuizExit={exitLinkedQuiz} account={account} state={state} ensureScope={ensureScope} setActiveScopes={setActiveScopes} message={message} setMessage={setMessage} reload={reload} logout={logout} modal={modal} setModal={setModal} mutate={mutate} learningMutate={learningMutate} classroomMutate={classroomMutate} busy={busy} calendarDate={calendarDate} setCalendarDate={setCalendarDate} calendarRange={calendarRange} onCalendarRangeChange={onCalendarRangeChange} selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth} language={language} changeLanguage={changeLanguage}/></AdminPermissionContext.Provider>;
}
function BrandLogo({ small = false }: { small?: boolean }) { return <span className={`brand-logo ${small ? "small" : ""}`}><img src="/tickminder-logo.svg" width={small ? 40 : 80} height={small ? 40 : 80} alt={BRAND_NAME} /></span>; }
function LanguageSwitcher({ language, change }: { language: Language; change: (next: Language) => void }) { return <div className="language-switch" role="group" aria-label={t("语言")}><button type="button" aria-pressed={language === "zh"} onClick={() => change("zh")}>中文</button><span className="language-separator" aria-hidden="true">|</span><button type="button" aria-pressed={language === "en"} onClick={() => change("en")}>EN</button></div>; }
function SignedInIdentity({ account }: { account: Account }) {
    return <div className="signed-in-identity"><span>{t("当前登录账号")}</span><strong>{account.name}</strong><span className="signed-in-method">{account.username ? `${t("用户名")} · ${account.username}${account.email ? ` · Google: ${account.email}` : ""}` : `Google · ${account.email || "—"}`}</span></div>;
}
function PasswordChange({ name, change, logout, busy, message, language, changeLanguage }: {
    name: string;
    change: (current: string, next: string) => Promise<void>;
    logout: () => Promise<void>;
    busy: boolean;
    message: string;
    language: Language;
    changeLanguage: (next: Language) => void;
}) {
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    return <main className="auth-shell"><div className="auth-card auth-onboarding-card"><LanguageSwitcher language={language} change={changeLanguage}/><BrandLogo/><h1>{t("设置新密码")}</h1><p>{name}{t("，请更换管理员设置的临时密码，再进入网站。")}</p><form onSubmit={e => { e.preventDefault(); if (next !== confirm) {
        setError(alertActionFailure(new Error("两次输入的新密码不一致")));
        return;
    } setError(""); change(current, next); }}><label>{t("当前临时密码")}<PasswordInput required type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)}/></label><label>{t("\u65B0\u5BC6\u7801\uFF08\u81F3\u5C11 8 \u4E2A\u5B57\u7B26\uFF09")}<PasswordInput required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)}/></label><label>{t("\u786E\u8BA4\u65B0\u5BC6\u7801")}<PasswordInput required type="password" minLength={8} maxLength={128} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}/></label><Button className="primary-full" disabled={busy}>{t("更新密码")}</Button></form>{(error || message) && <div className="error" role="alert">{t(error || message)}</div>}<Button type="button" className="auth-secondary-action" variant="outline" onClick={logout}>{t("\u9000\u51FA\u767B\u5F55")}</Button><LegalLinks language={language} className="auth-legal"/></div></main>;
}
function NameSetup({ initialName, save, logout, busy, message, language, changeLanguage }: {
    initialName: string;
    save: (name: string) => Promise<void>;
    logout: () => Promise<void>;
    busy: boolean;
    message: string;
    language: Language;
    changeLanguage: (next: Language) => void;
}) {
    const [name, setName] = useState(initialName);
    return <main className="auth-shell"><div className="auth-card auth-onboarding-card"><LanguageSwitcher language={language} change={changeLanguage}/><BrandLogo/><h1>{t("请确认你的姓名")}</h1><p>{t("姓名将显示在账号菜单中。课程访问权限由管理员核实并分配。")}</p><form onSubmit={event => { event.preventDefault(); void save(name); }}><label>{t("显示姓名")}<input required autoComplete="name" maxLength={80} value={name} onChange={event => setName(event.target.value)}/></label><Button className="primary-full" disabled={busy || !name.trim()}>{t("保存并继续")}</Button></form>{message && <div className="error" role="alert">{message}</div>}<Button type="button" className="auth-secondary-action" variant="outline" onClick={logout}>{t("退出登录")}</Button><LegalLinks language={language} className="auth-legal"/></div></main>;
}
type NavigationRole = "admin" | "teacher" | "student" | "pending";
type NavigationItem = { id: string; label: string; Icon: LucideIcon };
const NAV_ITEMS: Record<NavigationRole, NavigationItem[]> = {
    pending: [{id:"home",label:"主页",Icon:LayoutDashboard},{id:"myAccount",label:"我的账号",Icon:ShieldCheck}],
    admin: [
        { id: "home", label: "主页", Icon: LayoutDashboard },
        { id: "myAccount", label: "我的账号", Icon: ShieldCheck },
        { id: "classrooms", label: "班级", Icon: LibraryBig },
        { id: "homework", label: "功课总览", Icon: BookOpen },
        { id: "quizzes", label: "quiz.hubTitle", Icon: NotebookPen },
        { id: "materials", label: "教学资料", Icon: FileText },
        { id: "overview", label: "教学统计", Icon: BarChart3 },
        { id: "attention", label: "出席待处理", Icon: AlertCircle },
        { id: "schedule", label: "安排课程", Icon: SquarePen },
        { id: "calendar", label: "课程日历", Icon: CalendarDays },
        { id: "list", label: "课程列表", Icon: List },
        { id: "students", label: "学生时间表", Icon: ContactRound },
        { id: "teachers", label: "老师时间表", Icon: CalendarClock },
        { id: "subjects", label: "学生课程设置", Icon: BookOpen },
        { id: "teacherRoster", label: "老师名单", Icon: UserRound },
        { id: "studentRoster", label: "学生名单", Icon: UsersRound },
        { id: "parentRoster", label: "parents.parentRoster", Icon: UsersRound },
        { id: "accounts", label: "账号管理", Icon: Users },        { id: "activity", label: "操作日志", Icon: History },
    ],
    teacher: [
        { id: "home", label: "主页", Icon: LayoutDashboard },
        { id: "myAccount", label: "我的账号", Icon: ShieldCheck },
        { id: "classrooms", label: "班级", Icon: LibraryBig },
        { id: "schedule", label: "安排课程", Icon: SquarePen },
        { id: "calendar", label: "课程日历", Icon: CalendarClock },
        { id: "lessons", label: "课程与出席", Icon: CalendarDays },
        { id: "attendance", label: "出席记录", Icon: ListChecks },
        { id: "reschedule", label: "改期申请", Icon: ArrowLeftRight },
        { id: "hours", label: "教学统计", Icon: Clock3 },
        { id: "students", label: "负责的学生与科目", Icon: ContactRound },
        { id: "materials", label: "教学资料", Icon: FileText },
        { id: "homework", label: "布置功课", Icon: BookOpen },
        { id: "quizzes", label: "quiz.hubTitle", Icon: NotebookPen },
    ],
    student: [
        { id: "home", label: "主页", Icon: LayoutDashboard },
        { id: "myAccount", label: "我的账号", Icon: ShieldCheck },
        { id: "classrooms", label: "我的班级", Icon: LibraryBig },
        { id: "calendar", label: "学习日历", Icon: CalendarDays },
        { id: "list", label: "课程列表", Icon: List },
        { id: "homework", label: "我的功课", Icon: BookOpen },
        { id: "quizzes", label: "quiz.hubTitle", Icon: NotebookPen },
        { id: "materials", label: "我的教学资料", Icon: FileText },
        { id: "reschedule", label: "改期申请", Icon: ArrowLeftRight },
    ],
};

function Workspace({ initialQuizId,onLinkedQuizExit,account, state:legacyState, ensureScope, setActiveScopes, message, setMessage, reload, logout, modal, setModal, mutate, learningMutate, classroomMutate, busy, selectedMonth, setSelectedMonth, language, changeLanguage,calendarDate,setCalendarDate,calendarRange,onCalendarRangeChange }: {
    initialQuizId?:string;onLinkedQuizExit?:()=>void;
    calendarDate:string;setCalendarDate:(date:string)=>void;calendarRange:CalendarRange;onCalendarRangeChange:(range:CalendarRange)=>void;
    account: Account;
    state: State | null;

    ensureScope: (scope: StateScope, force?: boolean) => Promise<void>;
    setActiveScopes: (scopes: StateScope[]) => void;
    message: string;
    setMessage: (x: string) => void;
    reload: () => Promise<void>;
    logout: () => Promise<void>;
    modal: { type: "attendance" | "review" | "edit" | "cancel"; lesson: Lesson } | null;
    setModal: (x: { type: "attendance" | "review" | "edit" | "cancel"; lesson: Lesson } | null) => void;
    mutate: (x: Record<string, unknown>) => Promise<boolean>;
    learningMutate: (x: Record<string, unknown>) => Promise<boolean>;
    classroomMutate: (x: Record<string, unknown>) => Promise<{ ok: boolean; id?: string }>;
    busy: boolean;
    selectedMonth: string;
    setSelectedMonth: (x: string) => void;
    language: Language;
    changeLanguage: (next: Language) => void;
}) {
    const role = account.role as NavigationRole;
    const items = [...(account.isOwner?[{id:"groups",label:"平台总控制台",Icon:Building2}]:[]),...(role==="admin"?[{id:'billing',label:'财务',Icon:FileText}]:[]),...NAV_ITEMS[role],...(role!=="pending"?[{id:"courses",label:"course.nav.title",Icon:CalendarDays}]:[]),...(role==="admin"?[{id:"groupInfo",label:"集团信息",Icon:Building2},{id:"people",label:"人员与账号",Icon:UsersRound},{id:"settings",label:"设置",Icon:Settings}]:[]), { id: "notifications", label: "通知中心", Icon: Bell }].filter(item=>canAdminView(account,item.id));
    const entryIcons={home:LayoutDashboard,courses:CalendarDays,teaching:BookOpen,finance:FileText,manage:Settings,mine:UserRound};
    const entries=primaryEntries(role);
    // Hubs only organize already-authorized leaves; they grant no extra data access.
    const available=(view:string)=>items.some(item=>item.id===view)||isPrimaryHub(role,view);
    const permissionSignature=JSON.stringify(account.adminPermissions);
    const canView=(view:string)=>items.some(item=>item.id===view);
    const [badgeNow,setBadgeNow]=useState(()=>Date.now());
    useEffect(()=>{const timer=window.setInterval(()=>setBadgeNow(Date.now()),30_000);return()=>window.clearInterval(timer);},[]);
    const badgeIdentity=JSON.stringify([account.id,account.groupId,role,account.adminPermissions]);
    const [navigationSummary,setNavigationSummary]=useState<{identity:string;counts:CourseTaskCounts|null;error:boolean}>({identity:badgeIdentity,counts:null,error:false});
    const acceptHomeSummary=useCallback((summary:HomeSummary|null)=>{
        if(!summary||summary.accountId!==account.id||summary.groupId!==account.groupId)return;
        setNavigationSummary({identity:badgeIdentity,counts:summary.navigationCounts,error:false});
    },[account.id,account.groupId,badgeIdentity]);
    const knownBadgeCounts=navigationSummary.identity===badgeIdentity?navigationSummary.counts:null;
    const rawBadgeCounts=knownBadgeCounts||{lessons:0,reschedule:0,overview:0,attention:0,pendingAttendance:0,pendingReview:0,makeupNeeded:0};
    const courseBadge=(count:number)=>knownBadgeCounts?<MenuBadge count={count}/>:<span className="menu-count" role="status" aria-label={navigationSummary.error?(language==="zh"?"待办数量暂不可用":"Pending counts unavailable"):(language==="zh"?"正在加载待办数量":"Loading pending counts")}>{navigationSummary.error?"?":"…"}</span>;

    const badgeCounts=role==="admin"&&!canAdminAction(account,"attendance.view")?{...rawBadgeCounts,attention:0,overview:0}:rawBadgeCounts;
    const [selectedView, setSelectedView] = useState(() => initialQuizId ? "quizzes" : typeof window !== "undefined" ? legacyWorkspaceView(window.location.search, role) || workspaceViewFromPath(window.location.pathname, role) || "home" : "home");
    const [openInvoiceList,setOpenInvoiceList]=useState(false);
    const [classroomTaskTarget,setClassroomTaskTarget]=useState<{classroomId:string;taskId:string}|null>(null);
    const clearClassroomTaskTarget=useCallback(()=>setClassroomTaskTarget(null),[]);
    const [statisticsDetail,setStatisticsDetail]=useDialogState<TeachingStatisticsDetailTarget|null>("teaching-statistics-detail",null);
    const lastCourseView = useRef<string>(defaultCourseView(role) || "calendar");
    const lastManagementViews = useRef({ people: defaultManagementView('people'), settings: defaultManagementView('settings') });
    const currentViewRef=useRef(selectedView);currentViewRef.current=selectedView;
    const currentUrlRef=useRef(typeof window!=="undefined"?window.location.pathname+window.location.search:"/");
    useLayoutEffect(() => {
        const normalizedView=(view:unknown):string=>view==='financeHub'&&canView('billing')?'billing':view==='billing'&&role==='admin'&&!canView('billing')?'financeHub':typeof view==='string'?normalizeManagementView(role,normalizeCourseView(role,view)):"home";
        const valid = (view: unknown) => typeof view === "string" && available(normalizedView(view));
        const saved = window.history.state || {}, url = new URL(window.location.href);
        const legacy = legacyWorkspaceView(url.search,role), route = workspaceViewFromPath(url.pathname,role);
        let target:string;
        if(initialQuizId){target="quizzes";sessionStorage.removeItem("tickminder-group-view");}
        else if(sessionStorage.getItem("tickminder-group-view")==="home"){sessionStorage.removeItem("tickminder-group-view");target="home";}
        else if(legacy)target=legacy;
        else if(url.pathname==="/"&&saved.timelyoRoute!==1&&saved.timelyoGroup===account.groupId&&saved.timelyoRole===role&&valid(saved.timelyoView))target=normalizedView(saved.timelyoView);
        else target=route||"home";
        target=initialQuizId?"quizzes":valid(target)?normalizedView(target):"home";
        setSelectedView(target);
        if(initialQuizId)url.searchParams.delete("view");
        const destination=initialQuizId?url.pathname+url.search:workspaceUrl(target,role,url.search);
        window.history.replaceState({...saved,timelyoRole:role,timelyoGroup:account.groupId,timelyoView:target,timelyoRoute:1,timelyoMenu:false,...(initialQuizId||legacy==="quizzes"||saved.timelyoView==="quizBank"?{timelyoQuizTab:"bank"}:{})},"",destination);
        currentUrlRef.current=destination;
        const onPopState = () => {
            const raw=window.history.state||{};
            const sameContext=raw.timelyoRole===role&&raw.timelyoGroup===account.groupId;
            const pathView=workspaceViewFromPath(window.location.pathname,role);
            const requested=pathView||raw.timelyoView;
            const target=sameContext&&valid(requested)?normalizedView(requested):"home";
            if(target!==currentViewRef.current&&!window.dispatchEvent(new Event("tickminder-navigate",{cancelable:true}))){
                window.history.pushState({...raw,timelyoRole:role,timelyoGroup:account.groupId,timelyoView:currentViewRef.current,timelyoRoute:1,timelyoMenu:false},"",currentUrlRef.current);return;
            }
            if(initialQuizId&&target!=="quizzes")onLinkedQuizExit?.();
            if(!sameContext||!valid(requested))window.history.replaceState({...raw,timelyoRole:role,timelyoGroup:account.groupId,timelyoView:target,timelyoRoute:1,timelyoMenu:false},"",workspaceUrl(target,role,window.location.search));
            currentUrlRef.current=window.location.pathname+window.location.search;
            setSelectedView(target);
        };
        window.addEventListener("popstate",onPopState);
        return()=>window.removeEventListener("popstate",onPopState);
    },[role,account.id,account.groupId,permissionSignature,initialQuizId,onLinkedQuizExit]);
    const activeView = initialQuizId&&selectedView==='quizzes'?'quizzes':available(selectedView) ? selectedView : 'home';
    const activeHub=isPrimaryHub(role,activeView);
    const primaryLabel=entries.find(entry=>entry.id===activeView)?.label[language];
    const courseView = isCourseView(role, activeView);
    const managementView = managementArea(role, activeView);
    if (courseView) lastCourseView.current = activeView;
    if (managementView) lastManagementViews.current[managementView] = activeView as typeof lastManagementViews.current.people;
    const title = primaryLabel || (activeView==='homework'?(language==='zh'?'功课与任务':'Homework & tasks'):courseView ? activeView === 'schedule' ? '安排课程' : "course.nav.title" : managementView ? managementTitle(managementView) : items.find(item => item.id === activeView)?.label || items[0].label);
    const requiredScope: StateScope | null = activeView === "classrooms" ? "classrooms" : activeView === "accounts" || activeView === "parentRoster" ? "accounts" : null;
    const scopeLoaded = !requiredScope || Boolean(legacyState?.loadedScopes?.includes(requiredScope));
    const scopeError = requiredScope ? legacyState?.scopeErrors?.[requiredScope] : undefined;
    const projectionView=workspacePageData(role,activeView,canAdminAction(account,'terms.view'));
    const projection=useWorkspaceData(projectionView,account,projectionView==='calendar'?{from:calendarRange.from,to:calendarRange.to}:{});
    const identityKey=workspaceIdentityKey(account);
    // Never spread an old core into a new page: only its declared projection and live explicit scope.
    const state:State={account,month:selectedMonth,revision:projection.revision,...projection.data as Partial<State>,
        ...(requiredScope==='accounts'&&scopeLoaded?{users:legacyState?.users}:{}),
        ...(requiredScope==='classrooms'&&scopeLoaded?{classrooms:legacyState?.classrooms,terms:legacyState?.terms}:{}),
    };
    const lessons=useMemo(()=>[...(state.lessons||[])].sort((a,b)=>a.plannedStart.localeCompare(b.plannedStart)),[state.lessons]);
    const calendarReady=projectionView==='calendar'&&Boolean(projection.data)&&state.courseRange?.from===calendarRange.from&&state.courseRange?.to===calendarRange.to;
    const calendarLessons=calendarReady?lessons:[];
    const homeSummaryActive=activeView==='home';
    useEffect(()=>{
        // Home owns its richer summary request; only shell counts are needed elsewhere.
        if(homeSummaryActive)return;
        let active=true,pending=false,queued=false,clearEpoch=getPrivateReadSnapshot().clearEpoch;
        const controller=new AbortController();
        const load=async()=>{
            if(!active||document.visibilityState==="hidden")return;
            const context=getPrivateReadSnapshot();
            if(pending||context.blocked||context.identity!==identityKey){queued=true;return;}
            queued=false;
            pending=true;
            try{
                const value=await privateReadFlight.read({kind:'navigation',identity:identityKey,url:'/api/home-summary?scope=navigation',signal:controller.signal,load:async signal=>{
                    const response=await groupFetch('/api/home-summary?scope=navigation',{cache:'no-store',signal});
                    const data=await readApiJson<{accountId:string;groupId:string;navigationCounts:CourseTaskCounts;error?:string}>(response);
                    if(!response.ok)throw new Error(data.error||'Navigation summary unavailable');return data;
                },validate:(data:unknown)=>{
                    const result=data as {accountId:string;groupId:string;navigationCounts:CourseTaskCounts};
                    if(result.accountId!==account.id||result.groupId!==account.groupId){invalidatePrivateReads('navigation-identity',{auth:true,clear:true});window.dispatchEvent(new Event('timelyo:auth-refresh'));throw new PrivateReadInvalidatedError(true);}
                    if(!result.navigationCounts||Object.values(result.navigationCounts).some(count=>!Number.isSafeInteger(count)||count<0))throw new Error('Invalid navigation summary');return result;
                }});
                if(active&&getPrivateReadSnapshot().epoch===context.epoch)setNavigationSummary({identity:badgeIdentity,counts:value.navigationCounts,error:false});
            }catch(error){if(active&&!controller.signal.aborted&&!(error instanceof PrivateReadInvalidatedError))setNavigationSummary(previous=>({...previous,error:true}));}
            finally{pending=false;if(queued&&active)void load();}
        };
        const invalidated=()=>{const next=getPrivateReadSnapshot();if(next.clearEpoch!==clearEpoch){clearEpoch=next.clearEpoch;setNavigationSummary({identity:badgeIdentity,counts:null,error:false});}if(next.authError)setNavigationSummary(previous=>({...previous,error:true}));void load();};
        const unsubscribe=subscribePrivateReadLifecycle(invalidated);
        const refresh=()=>{void load();};void load();
        const timer=window.setInterval(refresh,60_000);
        window.addEventListener("focus",refresh);document.addEventListener("visibilitychange",refresh);
        return()=>{active=false;unsubscribe();controller.abort();window.clearInterval(timer);window.removeEventListener("focus",refresh);document.removeEventListener("visibilitychange",refresh);};
    },[homeSummaryActive,badgeIdentity,account.id,account.groupId,identityKey]);

    useEffect(() => {
        setActiveScopes(requiredScope ? [requiredScope] : []);
        return () => setActiveScopes([]);
    }, [requiredScope,setActiveScopes,identityKey]);
    useEffect(() => {
        if (!account.id || role === 'pending') return;
        if (requiredScope && !scopeLoaded && !scopeError) void ensureScope(requiredScope);
    }, [account.id,requiredScope,scopeLoaded,scopeError,ensureScope]);
    const showMonth = (role === "student" && activeView === "list") || (role === "teacher" && ["lessons","attendance"].includes(activeView)) || (role === "admin" && activeView === "list");
    const choose = (requested: string) => {
        const area=role==='admin'&&(requested==='people'||requested==='settings')?requested:null;
        const managementTarget = area ? (canView(lastManagementViews.current[area])?lastManagementViews.current[area]:items.find(item=>managementArea(role,item.id)===area)?.id||"home") : requested;
        const courseTarget=canView(lastCourseView.current)?lastCourseView.current:items.find(item=>isCourseView(role,item.id))?.id;
        const id = requested === "financeHub"&&canView("billing") ? "billing" : requested === "courses" ? courseTarget : normalizeManagementView(role,normalizeCourseView(role,managementTarget));
        if (!id || !available(id)) return;
        if(id!==activeView&&!window.dispatchEvent(new Event('tickminder-navigate',{cancelable:true})))return;
        if (id !== activeView) {
            const next = { ...(window.history.state || {}), timelyoRole: role, timelyoGroup: account.groupId, timelyoView: id,timelyoRoute:1, timelyoMenu: false };
            const url=workspaceUrl(id,role,window.location.search);
            window.history.pushState(next,"",url);currentUrlRef.current=url;
            setSelectedView(id);
        }
        // Keep the Quiz URL (including malformed assignment intent) on its old
        // entry. Exit only after the destination has its own history entry.
        if(initialQuizId&&id!=='quizzes')onLinkedQuizExit?.();
        window.scrollTo(0, 0);
    };
    const openAttendanceFinance=canAdminAction(account,"invoices.view")?()=>{const next={...(window.history.state||{})};delete next.timelyoOverlay;window.history.replaceState(next,"");setModal(null);setOpenInvoiceList(true);choose("billing");}:undefined;
    const bottomItems=entries.map(entry=>({value:entry.id,label:entry.label[language],Icon:entryIcons[entry.icon],badge:entry.id===(role==='admin'?'teachingHub':'courses')?courseBadge(courseBadgeCount(role,badgeCounts)):entry.id==='myHub'||entry.id==='manageHub'?<MenuBadge includeUnread/>:undefined}));
    const bottomActive=primaryArea(role,activeView);
    const sections:NavigationHubSection[]=hubGroups(role,activeView).map(group=>({id:group.id,title:group.title[language],layout:group.layout,items:group.ids.map(id=>items.find(item=>item.id===id)).filter((item):item is typeof items[number]=>Boolean(item)).map(item=>({id:item.id,label:item.id==='homework'?(language==='zh'?'功课与任务':'Homework & tasks'):t(item.label),Icon:item.Icon,badge:item.id==="courses"?courseBadge(courseBadgeCount(role,badgeCounts)):<MenuBadge count={badgeCounts[item.id as keyof typeof badgeCounts]||0} includeUnread={item.id==='notifications'} quizOnly={item.id==='quizzes'}/>}))})).filter(section=>section.items.length>0);
    let pageContent: React.ReactNode = null;
    if(activeHub){pageContent=<NavigationHub sections={sections} onChoose={choose}>
        {(activeView==='manageHub'||activeView==='myHub')&&<><div className="navigation-hub-actions" data-testid="hub-utility-actions">
            {account.groupId==='next-genn-edu'&&<a href="/whatsapp" data-testid="hub-whatsapp"><ServiceBrandIcon service="whatsapp"/><span>{language==='zh'?'连接 WhatsApp':'Connect WhatsApp'}</span></a>}
            <Button type="button" variant="outline" data-testid="hub-refresh" onClick={()=>void reload()}><RefreshCw size={18} aria-hidden="true"/><span>{t('刷新')}</span></Button>
            <Button type="button" variant="outline" data-testid="hub-signout" onClick={()=>void logout()}><LogOut size={18} aria-hidden="true"/><span>{t('退出登录')}</span></Button>
        </div><LegalLinks language={language} className="navigation-hub-legal"/></>}
        {activeView==='financeHub'&&<PageState kind="empty" title={language==='zh'?'暂无财务权限':'Finance access unavailable'} description={language==='zh'?'请联系集团管理员开通。':'Contact your group administrator for access.'}/>}
        {activeView!=='financeHub'&&!sections.length&&<PageState kind="empty" title={language==='zh'?'暂无可用功能':'No available features'}/>}
    </NavigationHub>;}
    else if((activeView==="groups"&&account.isOwner)||(activeView==="groupInfo"&&role==="admin")){pageContent=<div className="settings-compact"><GroupConsole isOwner={Boolean(account.isOwner)} mode={activeView==="groupInfo"?"information":"platform"} currentGroupId={account.groupId}/>{activeView==="groupInfo"&&canAdminAction(account,"terms.view")&&<div className="settings-tools">{projection.loading&&!projection.data?<PageState kind="loading" title="正在加载…"/>:projection.data&&<TermManager terms={state.terms||[]} mutate={classroomMutate} busy={busy}/>}</div>}</div>;}
    else if (activeView==='quizzes'&&(role==='teacher'||role==='admin'||role==='student')) {
        pageContent=<QuizWorkspace key={`${account.groupId}:${activeView}`} view={activeView} language={language} role={role} initialQuizId={initialQuizId} onLinkedQuizExit={onLinkedQuizExit}/>;
    }
    else if (activeView === "home" && role === "pending") {
        pageContent = <section className="panel pending-home"><h2>{t(account.assignmentStatus === "ACTIVE" ? "账号已启用" : "等待分配")}</h2><p>{t("管理员分配身份后，课程、功课及班级会显示在这里。")}</p>{account.pendingExpiresAt && <p className="notice">{t("待分配期限")} · {new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-GB",{timeZone:"Asia/Kuala_Lumpur",dateStyle:"medium",timeStyle:"short"}).format(new Date(account.pendingExpiresAt))}<br/>{t("新注册账号在 7 天内未启用或绑定，会到期清理。请联系管理员。")}</p>}<Button variant="outline" onClick={()=>choose("myAccount")}>{t("我的账号")}</Button></section>;
    } else if (activeView === "home" && role !== "pending") {
        pageContent = <HomeDashboard role={role} name={account.name} accountId={account.id || ""} groupId={account.groupId || null} onSummary={acceptHomeSummary} onNavigate={destination=>{if(destination==='quizHistory'){if(!canView('quizzes')||!window.dispatchEvent(new Event('tickminder-navigate',{cancelable:true})))return;window.history.replaceState({...window.history.state,timelyoQuizTab:'history'},'');choose('quizzes');}else choose(destination);}} onOpenTask={(classroomId,taskId)=>{if(!canView('classrooms')||!window.dispatchEvent(new Event('tickminder-navigate',{cancelable:true})))return;setClassroomTaskTarget({classroomId,taskId});choose('classrooms');}}/>;
    } else if (activeView === "notifications") {
        pageContent = <NotificationWorkspace key={`${account.groupId}:${role}`} role={role} language={language} learningMutate={learningMutate} courseMutate={mutate} onLesson={lesson=>setModal({type:'edit',lesson})} busy={busy}/>;
    } else if (activeView === "myAccount") {
        pageContent = <AccountSettings/>;
    } else if (activeView === "classrooms" && role !== "pending") {
        pageContent = <ClassroomsPage account={account} role={role} classes={state?.classrooms || []} terms={state?.terms || state?.termOptions || []} teacherName={account.teacherName} mutate={classroomMutate} learningMutate={learningMutate} busy={busy} onCalendar={() => choose("calendar")} taskTarget={classroomTaskTarget} onTaskTargetOpened={clearClassroomTaskTarget}/>;
    } else if (role === "admin") {
        if (activeView === "homework" || activeView === "materials") {
            pageContent = <ScopedLearningWorkspace key={activeView} role={role} account={account} identityKey={identityKey} view={activeView} mutate={learningMutate} busy={busy}/>;
        } else if (activeView === "overview") {
            pageContent=<TeachingStatistics lang={language} onOpenDetail={setStatisticsDetail}/>;
        } else if (["attention", "activity"].includes(activeView)) {
            pageContent = <AdminDashboard onOpenFinance={openAttendanceFinance} mutate={mutate} busy={busy} state={state} lessons={lessons} open={setModal} view={activeView as "overview" | "attention" | "activity"}/>;
        } else if (["schedule", "calendar", "list"].includes(activeView)) {
            pageContent = <Schedule onOpenFinance={openAttendanceFinance} calendarDate={calendarDate} onCalendarDateChange={setCalendarDate} onCalendarRangeChange={onCalendarRangeChange} calendarLoading={!calendarReady} state={state?{...state,month:selectedMonth}:state} lessons={activeView==="calendar"?calendarLessons:lessons} mutate={mutate} open={setModal} busy={busy} view={activeView === "schedule" ? "create" : activeView as "calendar" | "list"}/>;
        } else if (activeView === "students") {
            pageContent = <Timetable type="student" lessons={lessons} students={state?.students || []} teachers={state?.teachers || []} month={selectedMonth} setMonth={setSelectedMonth}/>;
        } else if (activeView === "teachers") {
            pageContent = <Timetable type="teacher" lessons={lessons} students={state?.students || []} teachers={(state.teacherOptions||[]).map(row=>row.name).sort()} month={selectedMonth} setMonth={setSelectedMonth}/>;
        } else if (activeView === "subjects") {
            pageContent = <SubjectAdmin studentProfiles={(canAdminAction(account,"students.view")?state?.allStudents:state?.studentOptions)||[]} students={state?.students || []} teachers={state?.teachers || []} plans={state?.allPlans || []} mutate={mutate} busy={busy} canFinance={Boolean(account.isOwner||account.isGroupChief)} onPreview={()=>choose('billing')}/>;
        } else if (activeView==='billing'&&role==='admin'&&canAdminView(account,'billing')) {
            pageContent=<FinanceWorkspace openInvoiceList={openInvoiceList} onInvoiceListOpened={()=>setOpenInvoiceList(false)} account={account} key={identityKey} onCourses={()=>choose('subjects')}/>;
        } else if (["teacherRoster", "studentRoster", "parentRoster", "accounts"].includes(activeView)) {
            const view = activeView === "teacherRoster" ? "teachers" : activeView === "studentRoster" ? "students" : activeView === "parentRoster" ? "parents" : activeView as "binding" | "accounts";
            pageContent = <RosterAdmin account={account} state={state} mutate={mutate} busy={busy} view={view} onOpenAccounts={()=>choose("accounts")} onAccountsChanged={()=>void ensureScope("accounts",true)}/>;

        }
    } else if (role === "student") {
        if(activeView==="homework"||activeView==="materials")pageContent=<StudentLearningDashboard account={account} identityKey={identityKey} calendarRange={calendarRange} lessons={[]} proposals={[]} mutate={learningMutate} busy={busy} view={activeView} onCalendar={()=>choose("calendar")}/>;
        else pageContent = <StudentPortal account={account} identityKey={identityKey} calendarRange={calendarRange} month={selectedMonth} calendarDate={calendarDate} onCalendarDateChange={setCalendarDate} onCalendarRangeChange={onCalendarRangeChange} calendarLoading={!calendarReady} onCalendar={() => choose("calendar")} lessons={activeView==="calendar"?calendarLessons:lessons} proposals={state?.proposals || []} mutate={mutate} learningMutate={learningMutate} busy={busy} view={activeView as "calendar" | "list" | "reschedule"}/>;
    } else if (role === "teacher") {
        if (activeView === "schedule") {
            const ownedPlans = (state?.plans || []).filter(plan => plan.teacher === account.teacherName);
            const schedulingState = state ? { ...state, plans: ownedPlans, students: [...new Set(ownedPlans.map(plan => plan.student))].sort(), teachers: account.teacherName ? [account.teacherName] : [] } : null;
            pageContent = <Schedule state={schedulingState} lessons={lessons} mutate={mutate} open={setModal} busy={busy} view="create"/>;
        } else if (["calendar", "lessons", "attendance", "students", "reschedule"].includes(activeView)) {
            pageContent = <TeacherPortal pendingAttendance={knownBadgeCounts?.pendingAttendance} month={selectedMonth} calendarDate={calendarDate} onCalendarDateChange={setCalendarDate} onCalendarRangeChange={onCalendarRangeChange} calendarLoading={!calendarReady} attendanceSessions={calendarReady?state?.attendanceSessions:[]} onReschedule={() => choose("reschedule")} lessons={activeView==="calendar"?calendarLessons:lessons} plans={state?.plans || []} proposals={state?.proposals || []} classSessions={state?.classSessions||[]} classSessionRequests={state?.classSessionRequests||[]} mutate={mutate} busy={busy} view={activeView as "calendar" | "lessons" | "attendance" | "students" | "reschedule"}/>;
        } else if (activeView === "hours") {
            pageContent = <TeachingStatistics lang={language} onOpenDetail={setStatisticsDetail}/>;
        } else {
            pageContent = <ScopedLearningWorkspace role={role} account={account} identityKey={identityKey} mutate={learningMutate} busy={busy} view={activeView as "materials" | "homework"}/>;
        }
    }

    if(activeView==='homework'&&role!=='pending')pageContent=<HomeworkTasksWorkspace key={`${account.id}:${account.groupId}`} role={role} canHomework={canAdminAction(account,'homework.view')} canTasks={canAdminAction(account,'tasks.view')&&canView('classrooms')} canReview={canAdminAction(account,'tasks.review')} onClasses={()=>choose('classrooms')} onOpenTask={(classroomId,taskId)=>{if(!canView('classrooms')||!window.dispatchEvent(new Event('tickminder-navigate',{cancelable:true})))return;setClassroomTaskTarget({classroomId,taskId});choose('classrooms');}}>{canAdminAction(account,'homework.view')?pageContent:null}</HomeworkTasksWorkspace>;

    if(activeView === "materials" && role !== "pending") pageContent=<TeachingResources key={account.groupId} ready={true} load={async()=>{}} setActiveScopes={()=>{}}>{pageContent}</TeachingResources>;
    return <NotificationsProvider inboxOpen={activeView==="notifications"} groupId={account.groupId || ""} key={`${account.id}:${role}:${account.groupId}`} accountId={account.id || ""} language={language}><div className="app-shell shell-wave1 four-entry-shell" data-home-view={activeView==='home'?'true':undefined}>{statisticsDetail&&(role==="admin"||role==="teacher")&&<Suspense fallback={<PageState kind="loading" title="正在加载…"/>}><TeachingStatisticsDetails key={account.groupId+permissionSignature} target={statisticsDetail} role={role} lang={language} mutate={mutate} busy={busy} close={()=>setStatisticsDetail(null)} onOpenFinance={openAttendanceFinance}/></Suspense>}
        <header className="topbar">
            <button type="button" className="brand brand-home" data-testid="brand-home" aria-label={`${BRAND_NAME} · ${t("主页")}`} onClick={()=>choose('home')}><BrandLogo small/><div><strong>{BRAND_NAME}</strong><span>{account.groupName || t("学习与协作平台")} · GMT+8</span></div></button>
            <div className="top-actions">
                <ShellPreferences language={language} onLanguageChange={changeLanguage}/>
                <Button type="button" variant="ghost" className="shell-notifications" aria-label={t("通知中心")} onClick={()=>choose("notifications")}><Bell size={20} aria-hidden="true"/><MenuBadge includeUnread header/></Button>

            </div>
        </header>
        <div className="app-body">
            <main className={"workspace workspace-compact"+(courseView?" workspace-course-view":"")}><FloatingBackButton context={`${account.id}:${role}:${account.groupId}`} isHome={activeView==="home"} onHome={()=>choose("home")} title={t(title)} subtitle={account.groupName||undefined} actions={courseView&&activeView!=='schedule'&&(role==='admin'||role==='teacher')&&canView('schedule')?<Button className="workspace-arrange" data-testid="course-arrange" aria-label={t('安排课程')} onClick={()=>choose('schedule')}><CalendarPlus size={18} aria-hidden="true"/><span className="workspace-arrange-full">{t('安排课程')}</span><span className="workspace-arrange-compact">{getLanguage()==='zh'?'安排':'Schedule'}</span></Button>:undefined}/>
                {showMonth && <div className="workspace-period"><label className="month-select"><span>{t("月份")}</span><MonthInput aria-label={t("统计月份")} type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}/></label></div>}
                {courseView && <CourseNavigation showArrange={false} role={role} activeView={activeView} onChoose={choose} badges={badgeCounts} canView={canView}/>}
                {managementView && <ManagementNavigation area={managementView} activeView={activeView} onChoose={choose} canView={canView}/>}
                {message && state && !state.error && <div className="notice" role="status">{message}<button onClick={() => setMessage("")} aria-label={t("关闭")}>×</button></div>}

                {role === "teacher" && ["schedule","students"].includes(activeView) && !projection.loading && !projection.error && !(state.plans || []).length && <div className="notice">{t("暂无负责的学生科目。请联系管理员完成课程分配。")}</div>}
                {projectionView==='course-options'&&projection.loading&&!projection.data&&<PageState kind="loading" title={language==='zh'?'正在加载筛选选项…':'Loading filter options…'}/>}
                {scopeLoaded&&scopeError&&<PageState kind="error" title="页面加载失败" description={scopeError} action="重试" onAction={()=>{if(requiredScope)void ensureScope(requiredScope,true);}}/>}
                {projection.error&&(!workspaceDataBlocksPage(projectionView)||Boolean(projection.data))&&<PageState kind="error" title="页面加载失败" description={projection.error} action="重试" onAction={projection.reload}/>}
                <FilterScope.Provider value={`${account.id || "anonymous"}:${account.groupId || "none"}`}>{!scopeLoaded ? <PageState kind={scopeError ? 'error' : 'loading'} title={scopeError ? '页面加载失败' : '正在加载…'} description={scopeError} action={scopeError ? '重试' : undefined} onAction={()=>{if(requiredScope)void ensureScope(requiredScope,true);}}/> : workspaceDataBlocksPage(projectionView)&&!projection.data&&(projection.loading||projection.error) ? <PageState kind={projection.error?'error':'loading'} title={projection.error?'页面加载失败':'正在加载…'} description={projection.error} action={projection.error?'重试':undefined} onAction={projection.reload}/> : <Suspense fallback={<PageState kind="loading" title="正在加载…"/>}>{courseView ? <div id="course-view-content" data-testid="course-view-content" data-course-leaf={activeView}>{pageContent}</div> : managementView ? <div id="management-view-content" data-testid="management-view-content" data-management-leaf={activeView}>{pageContent}</div> : pageContent}</Suspense>}</FilterScope.Provider>
            </main>
        </div>
        <MobileBottomNavigation primary items={bottomItems} active={bottomActive} onNavigate={choose} ariaLabel={language==='zh'?'主要功能':'Primary navigation'} hidden={busy}/>
        <Suspense fallback={<PageState kind="loading" title="正在加载…"/>}>{modal && ["attendance","review"].includes(modal.type)&&modal.lesson.sessionId?<SessionAttendanceLoaderDialog onOpenFinance={openAttendanceFinance} key={modal.lesson.sessionId} sessionId={modal.lesson.sessionId} review={modal.type==="review"} role="admin" close={()=>setModal(null)} mutate={mutate} busy={busy}/>:modal&&<LessonDialog modal={modal} close={() => setModal(null)} mutate={mutate} busy={busy}/>}</Suspense>
    </div></NotificationsProvider>;
}
