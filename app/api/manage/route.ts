import {isInvoiceLocked,invoiceLockedMessage} from '@/lib/invoice-locks';
import {appendAudit} from '@/lib/audit-log';
import {classroomCoverageGuard,classroomRequiredMessage,isClassroomCoverageFailure} from '@/lib/classroom-coverage';
import {groupReader,groupStatement,requireGroup} from "@/lib/group-data";
import { NextResponse } from "next/server";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import { first, learningDb, rows } from "@/lib/learning-server";
import { classroomMayManage } from "@/lib/classrooms-server";
import { deleteUnreferencedFile } from "@/lib/pdf-storage";
import { hasQuizAccountHistory } from "@/lib/account-merge";
import {classPlanSubjectSql,planSubjectLabelSql} from "@/lib/academic-subject-match";
import { authorityGuard,accountAuthorityGuard, assertAccountAuthority, AdminAuthorityError, isAdminAuthorityFailure } from "@/lib/admin-authority";
import {requireCorePermissions,guardedCoreDb} from '@/lib/admin-core-permissions';
import {adminPermissionFailure,AdminPermissionDenied,adminPermissionsEnforced} from '@/lib/admin-permission-access';
import {cancelledStudentDeletion,CancelledStudentDeletionError} from '@/lib/cancelled-student-deletion';


class DeleteError extends Error { constructor(message: string, public status = 409) { super(message); } }
type Entry = { kind: string; id: string };
type Snapshot = {table: string; records: Record<string, unknown>[];action?:'archive'};
const deletionPermission:Record<string,string>={account:'accounts.delete',teacher:'teachers.delete',student:'students.delete',plan:'plans.delete',lesson:'lessons.delete',classroom:'classrooms.delete',homework:'homework.delete'};
const financialHistoryMessage="此记录已有收费或费用调整历史，不能永久删除。请改为停用，以保留核算依据。";
const studentFinancialHistory=`SELECT 1 AS found FROM billing_students b WHERE b.group_id=? AND b.student_name=? AND (
 EXISTS(SELECT 1 FROM billing_rates r JOIN billing_rate_versions v ON v.group_id=r.group_id AND v.rate_id=r.id WHERE r.group_id=b.group_id AND r.student_id=b.id)
 OR EXISTS(SELECT 1 FROM billing_adjustments a WHERE a.group_id=b.group_id AND a.student_id=b.id) OR EXISTS(SELECT 1 FROM invoices i WHERE i.group_id=b.group_id AND i.student_id=b.id)
 OR EXISTS(SELECT 1 FROM prepayment_accounts p WHERE p.group_id=b.group_id AND p.student_id=b.id)
 OR EXISTS(SELECT 1 FROM prepayment_requests p WHERE p.group_id=b.group_id AND p.student_id=b.id)) LIMIT 1`;
const planFinancialHistory=`SELECT 1 AS found FROM plans p JOIN students s ON s.group_id=p.group_id AND s.name=p.student
 JOIN billing_students b ON b.group_id=p.group_id AND b.student_name=p.student
 JOIN billing_subjects bs ON bs.group_id=b.group_id AND bs.student_id=b.id AND bs.subject_key=CASE WHEN p.subject_id IS NOT NULL THEN 'id:'||s.syllabus_id||':'||p.subject_id ELSE 'label:'||lower(trim(p.subject)) END
 WHERE p.group_id=? AND p.key=? AND (
 EXISTS(SELECT 1 FROM billing_rates r JOIN billing_rate_versions v ON v.group_id=r.group_id AND v.rate_id=r.id WHERE r.group_id=b.group_id AND r.student_id=b.id AND r.subject_key=bs.subject_key)
 OR EXISTS(SELECT 1 FROM billing_adjustments a WHERE a.group_id=b.group_id AND a.student_id=b.id AND (
 substr(a.line_id,1,length('monthly:'||b.id||':'||bs.subject_key||':'))='monthly:'||b.id||':'||bs.subject_key||':'
 OR EXISTS(SELECT 1 FROM lessons l WHERE l.group_id=p.group_id AND l.student=p.student AND a.line_id='lesson:'||l.id AND ${planSubjectLabelSql('p','s','l.subject')})))) LIMIT 1`;
async function planDeletion(actor: NonNullable<Awaited<ReturnType<typeof currentAccount>>>, kind: string, id: string) {
    const groupId=requireGroup(actor.groupId); const {first,rows}=groupReader(groupId);
    if (!id || !["account", "teacher", "student", "plan", "lesson", "classroom", "homework"].includes(kind)) throw new DeleteError("请求格式无效", 400);
    if (actor.role !== "admin" && !(actor.role === "teacher" && ["classroom", "homework"].includes(kind))) throw new DeleteError("没有权限执行此操作", 403);
    await requireCorePermissions(actor,[deletionPermission[kind]]);
    const raw = learningDb();
    const operations: Array<{sql: string; params: unknown[]}> = [];
    const db = {prepare: (sql: string) => ({bind: (...params: unknown[]) => {operations.push({sql, params});return groupStatement(groupId,sql).bind(...params);}})};
    const statements = [], checks:D1PreparedStatement[]=[], files: string[] = [], watches:Array<{name:string;value:string}>=[],extraSnapshots:Snapshot[]=[];
    if (kind === "account") {
      const target = await first<{ role: string; email: string; disabledAt: string|null; teacherName: string|null; studentName: string|null }>("SELECT role,email,disabled_at AS disabledAt,teacher_name AS teacherName,student_name AS studentName FROM accounts WHERE id = ?", id);
      if (!target) throw new DeleteError("Account not found", 404);
      const authority={action:'permanentDelete' as const,expected:target};
      await assertAccountAuthority(actor,id,authority);
      statements.push(accountAuthorityGuard(actor,id,authority));
      const linksSql="SELECT coalesce(json_group_array(json(item)),'[]') AS snapshot FROM(SELECT json_object('id',id,'studentId',student_id,'active',active,'revision',revision,'updatedBy',updated_by,'updatedAt',updated_at,'operationId',operation_id,'reason',reason) item FROM parent_child_links WHERE group_id=? AND parent_account_id=? ORDER BY id)",linkState=await raw.prepare(linksSql).bind(groupId,id).first<{snapshot:string}>();
      statements.push(authorityGuard({sql:'('+linksSql+')=?',args:[groupId,id,linkState?.snapshot||'[]']}));
      const financialSql="SELECT coalesce(json_group_array(json(item)),'[]') AS snapshot FROM(SELECT json_object('id',id,'linkId',link_id,'active',active,'revision',revision,'linkRevision',link_revision,'updatedBy',updated_by,'updatedAt',updated_at,'operationId',operation_id,'reason',reason) item FROM parent_financial_access WHERE group_id=? AND parent_account_id=? ORDER BY id)",financialState=await raw.prepare(financialSql).bind(groupId,id).first<{snapshot:string}>();
      statements.push(authorityGuard({sql:'('+financialSql+')=?',args:[groupId,id,financialState?.snapshot||'[]']}));
      if (await hasQuizAccountHistory(id)) throw new DeleteError("account.quizHistoryDeleteBlocked");
      if(await first("SELECT 1 FROM class_recordings WHERE created_by=? LIMIT 1",id))throw new DeleteError("此账号仍拥有课堂录影，请先处理这些录影后再永久删除");
      if (await first("SELECT 1 AS found FROM teaching_materials WHERE owner_id = ? UNION SELECT 1 FROM homework WHERE owner_id = ? LIMIT 1", id, id)) throw new DeleteError("此账号仍拥有教学资料或功课，请先处理这些资料后再永久删除");
      const local = await first<{ username: string }>("SELECT username FROM local_credentials WHERE account_id = ?", id);
      statements.push(db.prepare("DELETE FROM notification_deliveries WHERE item_id IN (SELECT id FROM notification_items WHERE account_id=?) OR subscription_id IN (SELECT id FROM push_subscriptions WHERE account_id=?)").bind(id,id));
      for (const table of ["push_subscriptions", "sessions", "local_credentials", "google_identities"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE account_id = ?`).bind(id));
      for (const table of ["site_notifications","notification_items","assignments","study_blocks"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE account_id = ? AND group_id = ?`).bind(id,groupId));
      if (local) statements.push(db.prepare("DELETE FROM login_attempts WHERE username = ?").bind(local.username));
      statements.push(db.prepare("DELETE FROM parent_financial_access WHERE parent_account_id=? AND group_id=?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM parent_child_links WHERE parent_account_id=? AND group_id=?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM accounts WHERE (id = ?) AND group_id = ?").bind(id,groupId));
    } else if (kind === "teacher" || kind === "student") {
      const column = kind === "teacher" ? "teacher_name" : "student";
      const accountColumn = kind === "teacher" ? "teacher_name" : "student_name";
      const table = kind === "teacher" ? "teachers" : "students";
      if (!await first(`SELECT 1 AS found FROM ${table} WHERE name = ?`, id)) throw new DeleteError("记录不存在", 404);
      if(kind==="student"&&await raw.prepare(studentFinancialHistory).bind(groupId,id).first())throw new DeleteError(financialHistoryMessage);
      if(kind==="teacher"&&await raw.prepare("SELECT 1 FROM payroll_teachers WHERE group_id=? AND teacher_name=?").bind(groupId,id).first())throw new DeleteError("此老师已有时薪设置或薪资历史，不能永久删除。请改为停用，以保留薪资核算记录。");
      if (await first(`SELECT 1 AS found FROM accounts WHERE ${accountColumn} = ?`, id)) throw new DeleteError("此姓名仍关联登录账号，请先删除或重新绑定账号");
      if (await first(`SELECT 1 AS found FROM lessons WHERE ${column} = ? AND status = 'scheduled'`, id)) throw new DeleteError("仍有已安排的课程，请先取消或删除这些课程");
      const member = kind === "teacher" ? await first("SELECT 1 AS found FROM classrooms WHERE teacher_name = ?", id) : await first("SELECT 1 AS found FROM classroom_members WHERE student_name = ?", id);
      if (kind==='teacher'&&member) throw new DeleteError("此姓名仍在班级中，请先处理班级或移出名单");
      if(kind==='student'){
        const cancelled=await cancelledStudentDeletion(groupId,id,(sql,...params)=>db.prepare(sql).bind(...params));
        statements.push(...cancelled.statements);checks.push(...cancelled.guards);watches.push(...cancelled.watches);
        if(cancelled.archivedRooms.length)extraSnapshots.push({table:'classrooms',records:cancelled.archivedRooms,action:'archive'});
      }
      if(kind==="student")statements.push(db.prepare("DELETE FROM billing_rates WHERE group_id=? AND student_id IN(SELECT id FROM billing_students WHERE group_id=? AND student_name=?) AND NOT EXISTS(SELECT 1 FROM billing_rate_versions v WHERE v.group_id=billing_rates.group_id AND v.rate_id=billing_rates.id)").bind(groupId,groupId,id));
      statements.push(db.prepare(`DELETE FROM assignments WHERE (plan_key IN (SELECT key FROM plans WHERE ${column} = ?)) AND group_id = ?`).bind(id,groupId));
      statements.push(db.prepare(`DELETE FROM plans WHERE (${column} = ?) AND group_id = ?`).bind(id,groupId));
      if(kind==="student")statements.push(db.prepare("DELETE FROM recording_recipients WHERE student_name=? AND group_id=?").bind(id,groupId));
      statements.push(db.prepare(`DELETE FROM ${table} WHERE (name = ?) AND group_id = ?`).bind(id,groupId));
    } else if (kind === "plan") {
      const plan = await first<{ student: string; subject: string }>("SELECT student,subject FROM plans WHERE key = ?", id);
      if (!plan) throw new DeleteError("记录不存在", 404);
      if(await raw.prepare(planFinancialHistory).bind(groupId,id).first())throw new DeleteError(financialHistoryMessage);
      if (await first(`SELECT 1 AS found FROM lessons l JOIN plans p ON p.student=l.student JOIN students s ON s.name=p.student WHERE p.key=? AND l.status='scheduled' AND ${planSubjectLabelSql('p','s','l.subject')}`,id)) throw new DeleteError("仍有已安排的课程，请先取消或删除这些课程");
      if (await first(`SELECT 1 AS found FROM classroom_members m JOIN classrooms c ON c.id=m.classroom_id JOIN plans p ON p.student=m.student_name JOIN students s ON s.name=p.student WHERE p.key=? AND ${classPlanSubjectSql()}`,id)) throw new DeleteError("此科目仍用于班级，请先移出班级");
      statements.push(db.prepare("DELETE FROM assignments WHERE (plan_key = ?) AND group_id = ?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM plans WHERE (key = ?) AND group_id = ?").bind(id,groupId));
    } else if (kind === "lesson") {
      if(await first("SELECT 1 FROM lessons l JOIN class_sessions s ON s.id=l.session_id WHERE l.id=? AND s.session_type='group'",id))throw new DeleteError("整班课次不能逐个删除学生记录，请取消整班课次");
      if (!await first("SELECT 1 AS found FROM lessons WHERE id = ?", id)) throw new DeleteError("Lesson not found", 404);
      if (await first("SELECT 1 AS found FROM lessons WHERE replacement_for = ?", id)) throw new DeleteError("此课程有关联补课，请先处理补课记录");
      statements.push(db.prepare("DELETE FROM reschedule_requests WHERE (lesson_id = ?) AND group_id = ?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM notification_deliveries WHERE item_id IN (SELECT id FROM notification_items WHERE lesson_id=?)").bind(id));
      statements.push(db.prepare("DELETE FROM notification_items WHERE (lesson_id=?) AND group_id = ?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM site_notifications WHERE (lesson_id=?) AND group_id = ?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM lessons WHERE (id = ?) AND group_id = ?").bind(id,groupId));
    } else if (kind === "homework") {
      const item = await first<{ owner_id: string; attachment_file_id: string | null }>("SELECT owner_id,attachment_file_id FROM homework WHERE id = ?", id);
      if (!item || (actor.role !== "admin" && item.owner_id !== actor.id)) throw new DeleteError("没有权限执行此操作", 403);
      if (item.attachment_file_id) files.push(item.attachment_file_id);
      files.push(...(await rows<{fileId:string}>("SELECT file_id AS fileId FROM learning_versions WHERE kind='homework' AND record_id=? AND file_id IS NOT NULL",id)).map(f=>f.fileId));
      files.push(...(await rows<{fileId:string}>("SELECT file_id AS fileId FROM homework_feedback WHERE homework_id=? AND file_id IS NOT NULL",id)).map(f=>f.fileId));
      for(const table of ["homework_feedback","homework_resubmission_grants"])statements.push(db.prepare(`DELETE FROM ${table} WHERE (homework_id=?) AND group_id=?`).bind(id,groupId));
      statements.push(db.prepare("DELETE FROM learning_notifications WHERE (content_kind='homework' AND record_id=?) AND group_id=?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM homework_score_history WHERE (homework_id=?) AND group_id=?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM learning_versions WHERE (kind='homework' AND record_id=?) AND group_id=?").bind(id,groupId));
      const submissions = await rows<{ fileId: string }>("SELECT file_id AS fileId FROM homework_submissions WHERE homework_id = ?", id);
      files.push(...submissions.map(s => s.fileId));
      statements.push(db.prepare("UPDATE study_blocks SET homework_id = NULL WHERE (homework_id = ?) AND group_id = ?").bind(id,groupId));
      for (const table of ["homework_submissions", "homework_recipients"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE (homework_id = ?) AND group_id = ?`).bind(id,groupId));
      statements.push(db.prepare("DELETE FROM homework WHERE (id = ?) AND group_id = ?").bind(id,groupId));
    } else {
      if (!await classroomMayManage(actor, id)) throw new DeleteError("班级不存在或无权修改", 404);
      if(await raw.prepare("SELECT 1 FROM payroll_rate_scopes WHERE group_id=? AND classroom_id=? LIMIT 1").bind(groupId,id).first())throw new DeleteError("此班级已有老师时薪设置，不能永久删除。请改为封存，以保留薪资核算记录。");
      if(await first("SELECT 1 FROM class_sessions WHERE classroom_id=? LIMIT 1",id))throw new DeleteError("班级已有课程记录，不能永久删除。请保留历史课次并封存班级。");
      statements.push(groupStatement(groupId,"SELECT CASE WHEN EXISTS(SELECT 1 FROM class_sessions WHERE classroom_id=?) THEN json('classroom_has_sessions') ELSE 1 END AS history_clear").bind(id));
      const fileRows = await rows<{ fileId: string }>("SELECT file_id AS fileId FROM teaching_materials WHERE classroom_id = ? UNION SELECT attachment_file_id AS fileId FROM homework WHERE classroom_id = ? AND attachment_file_id IS NOT NULL UNION SELECT s.file_id AS fileId FROM homework_submissions s JOIN homework h ON h.id = s.homework_id WHERE h.classroom_id = ?", id, id, id);
      files.push(...fileRows.map(f => f.fileId));
      files.push(...(await rows<{fileId:string}>("SELECT file_id AS fileId FROM learning_versions WHERE file_id IS NOT NULL AND ((kind='homework' AND record_id IN(SELECT id FROM homework WHERE classroom_id=?)) OR (kind='material' AND record_id IN(SELECT id FROM teaching_materials WHERE classroom_id=?)))",id,id)).map(f=>f.fileId));
      files.push(...(await rows<{fileId:string}>("SELECT f.file_id AS fileId FROM homework_feedback f JOIN homework h ON h.id=f.homework_id WHERE h.classroom_id=? AND f.file_id IS NOT NULL",id)).map(f=>f.fileId));
      for(const table of ["homework_feedback","homework_resubmission_grants"])statements.push(db.prepare(`DELETE FROM ${table} WHERE (homework_id IN(SELECT id FROM homework WHERE classroom_id=?)) AND group_id=?`).bind(id,groupId));
      statements.push(db.prepare("DELETE FROM learning_notifications WHERE ((content_kind='homework' AND record_id IN(SELECT id FROM homework WHERE classroom_id=?)) OR (content_kind='material' AND record_id IN(SELECT id FROM teaching_materials WHERE classroom_id=?))) AND group_id=?").bind(id,id,groupId));
      statements.push(db.prepare("DELETE FROM homework_score_history WHERE (homework_id IN(SELECT id FROM homework WHERE classroom_id=?)) AND group_id=?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM learning_versions WHERE ((kind='homework' AND record_id IN(SELECT id FROM homework WHERE classroom_id=?)) OR (kind='material' AND record_id IN(SELECT id FROM teaching_materials WHERE classroom_id=?))) AND group_id=?").bind(id,id,groupId));
      statements.push(db.prepare("UPDATE study_blocks SET homework_id = NULL WHERE (homework_id IN (SELECT id FROM homework WHERE classroom_id = ?)) AND group_id = ?").bind(id,groupId));
      for (const table of ["homework_submissions", "homework_recipients"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE (homework_id IN (SELECT id FROM homework WHERE classroom_id = ?)) AND group_id = ?`).bind(id,groupId));
      statements.push(db.prepare("DELETE FROM material_recipients WHERE (material_id IN (SELECT id FROM teaching_materials WHERE classroom_id = ?)) AND group_id = ?").bind(id,groupId));
      for (const table of ["homework", "teaching_materials", "classroom_announcements", "classroom_members", "classroom_folders"]) statements.push(db.prepare(`DELETE FROM ${table} WHERE (classroom_id = ?) AND group_id = ?`).bind(id,groupId));
      statements.push(db.prepare("DELETE FROM recording_recipients WHERE recording_id IN(SELECT id FROM class_recordings WHERE classroom_id=?) AND group_id=?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM class_recordings WHERE classroom_id=? AND group_id=?").bind(id,groupId));
      statements.push(db.prepare("DELETE FROM classrooms WHERE (id = ?) AND group_id = ?").bind(id,groupId));
      statements.push(classroomCoverageGuard(groupId));
    }

    const snapshots: Snapshot[] = [...extraSnapshots];
    for (const op of operations) {
      const deleted = op.sql.match(/^DELETE FROM (\w+) WHERE ([\s\S]+)$/);
      const updated = op.sql.match(/^UPDATE (\w+) SET homework_id = NULL WHERE ([\s\S]+)$/);
      const match = deleted || updated;
      if (match) snapshots.push({table: match[1], records: await rows<Record<string, unknown>>('SELECT * FROM '+match[1]+' WHERE '+match[2]+'', ...op.params)});
    }
    const primary = snapshots.find(s => s.table === ({account:'accounts',teacher:'teachers',student:'students',plan:'plans',lesson:'lessons',homework:'homework',classroom:'classrooms'} as Record<string,string>)[kind])?.records[0];
    const label = primary ? String(primary.title || primary.name || (primary.student ? String(primary.student)+' · '+String(primary.subject) : id)) : id;
    const effects = snapshots.map(s => ({table: s.table, count: s.records.length, retained: s.table === 'study_blocks' && kind !== 'account',action:s.action})).filter(s=>s.count);
    const lessonRows = snapshots.filter(s => s.table === 'lessons').flatMap(s=>s.records);
    const hours = lessonRows.reduce((sum, l) => {
      const diff = l.actual_start && l.actual_end ? (Date.parse(String(l.actual_end))-Date.parse(String(l.actual_start)))/3600000 : 0;
      return sum + (l.status === 'completed' && l.reviewed_at && diff > 0 && diff <= 12 ? diff : 0);
    }, 0);
    return { statements,checks, files, snapshots,watches, summary: {kind,id,label,effects,hours,checkedIn:lessonRows.filter(l=>['completed','student_absent','teacher_absent'].includes(String(l.status))).length, date:kind==='lesson'?primary?.planned_start:undefined} };
}
async function proof(actorId: string, plans: Array<Awaited<ReturnType<typeof planDeletion>>>, at: string) {
  const payload = JSON.stringify({actorId, at, snapshots: plans.map(p=>({snapshots:p.snapshots,watches:p.watches}))});
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({error:"没有权限执行此操作"},{status:403});
  const actor = await currentAccount();
  if (!actor) return NextResponse.json({error:"登录已过期，请重新登录"},{status:401});
  const groupId=requireGroup(actor.groupId); const {first,rows}=groupReader(groupId);
  try {
    const data = await request.json() as Record<string,unknown>;
    if(actor.role==='admin'&&adminPermissionsEnforced()&&data.action!==undefined&&(typeof data.action!=='string'||!['previewDelete','permanentDelete'].includes(data.action)))throw new AdminPermissionDenied();
    const preview = data.action === 'previewDelete';
    if (!preview && data.confirm !== true) throw new DeleteError("请确认永久删除",400);
    if (await first("SELECT 1 AS found FROM local_credentials WHERE account_id = ? AND must_change_password = 1",actor.id)) throw new DeleteError("请先修改初始密码",403);
    const entries = (Array.isArray(data.entries) ? data.entries : [{kind:data.kind,id:data.id}]) as Entry[];
    if (!entries.length || entries.length > 50 || entries.some(e=>!e || typeof e.kind !== 'string' || typeof e.id !== 'string') || new Set(entries.map(e=>e.kind+':'+e.id)).size !== entries.length || new Set(entries.map(e=>e.kind)).size !== 1) throw new DeleteError("请选择 1 至 50 条同类记录",400);
    const plans: Array<Awaited<ReturnType<typeof planDeletion>>> = [], blocked: Array<{kind:string;id:string;error:string}> = [];
    for (const entry of entries) {
      try { plans.push(await planDeletion(actor,entry.kind,entry.id)); }
      catch (e) { if (!preview) throw e; if (!(e instanceof DeleteError) && !(e instanceof CancelledStudentDeletionError) && !(e instanceof AdminAuthorityError) && !(e instanceof AdminPermissionDenied)) throw e; blocked.push({...entry,error:e.message}); }
    }
    const previewAt = preview ? new Date().toISOString() : String(data.previewAt || '');
    if (preview) return NextResponse.json({ok:true,items:plans.map(p=>p.summary),blocked,previewAt,fingerprint:await proof(actor.id,plans,previewAt)});
    if (Array.isArray(data.entries)) {
      const age = Date.now()-Date.parse(previewAt);
      if (!Number.isFinite(age) || age < 0 || age > 300000 || data.fingerprint !== await proof(actor.id,plans,previewAt)) throw new DeleteError("记录已更新或预览已过期，请重新预览后确认",409);
    }
    const db = guardedCoreDb(actor,entries.map(entry=>deletionPermission[entry.kind]));
    const statements = [...plans.flatMap(p=>p.checks),...plans.flatMap(p=>p.statements)];
    for (const entry of entries) {
      const account=entry.kind==='account'?plans.find(p=>p.summary.id===entry.id)?.snapshots.find(s=>s.table==='accounts')?.records[0]:null;
      const label=plans.find(p=>p.summary.id===entry.id&&p.summary.kind===entry.kind)?.summary.label;
      statements.push(appendAudit(db,{groupId,lessonId:entry.kind+':'+entry.id,actorId:actor.id,actorName:actor.name,objectName:label,action:'permanentDelete',before:account?{id:account.id,name:account.name,role:account.role,disabledAt:account.disabled_at}:null,after:entry}));
    }
    await db.batch(statements);
    let cleanupPending=false;
    for (const file of new Set(plans.flatMap(p=>p.files))) {try {await deleteUnreferencedFile(file);} catch {cleanupPending=true;}}
    return NextResponse.json({ok:true,deletedCount:entries.length,warning:cleanupPending?"记录已删除，部分文件清理尚未完成，请联系管理员":undefined});
  } catch (e) {if(e instanceof CancelledStudentDeletionError)return NextResponse.json({error:e.message},{status:e.status});if(e instanceof Error&&/student_delete_changed/.test(e.message))return NextResponse.json({error:'记录已更新，请重新预览后确认删除',status:409},{status:409});if(isInvoiceLocked(e))return NextResponse.json({error:invoiceLockedMessage},{status:409});const permissionFailure=adminPermissionFailure(e);if(permissionFailure)return NextResponse.json({error:permissionFailure.error},{status:permissionFailure.status});if(e instanceof AdminAuthorityError)return NextResponse.json({error:e.message},{status:e.status});if(isAdminAuthorityFailure(e))return NextResponse.json({error:'admin.authorityChanged'},{status:409});if(isClassroomCoverageFailure(e))return NextResponse.json({error:classroomRequiredMessage},{status:409});if(e instanceof Error&&/financial history/i.test(e.message))return NextResponse.json({error:financialHistoryMessage},{status:409});return NextResponse.json({error:e instanceof DeleteError?e.message:"删除未能确认，请刷新列表后再试"},{status:e instanceof DeleteError?e.status:503});}
}
