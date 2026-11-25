import {classPlanSubjectSql} from "./academic-subject-match";
import type {Account} from "./auth";
import {learningDb,rows} from "./learning-server";

// Trusted aliases only. Raw notification queries explicitly scope every join.
export function learningRecipientSql(kind:"material"|"homework",record="h",account="a") {
  const recipients=kind==="homework"?"homework_recipients":"material_recipients",key=kind==="homework"?"homework_id":"material_id";
  return `${account}.role='student' AND ${account}.disabled_at IS NULL AND ${account}.group_id=${record}.group_id
    AND EXISTS(SELECT 1 FROM tuition_groups g WHERE g.id=${record}.group_id AND g.active=1)
    AND EXISTS(SELECT 1 FROM students st WHERE st.name=${account}.student_name AND st.group_id=${record}.group_id AND st.active=1)
    AND EXISTS(SELECT 1 FROM ${recipients} r WHERE r.${key}=${record}.id AND r.group_id=${record}.group_id AND r.student_name=${account}.student_name)
    AND (${record}.classroom_id IS NULL OR EXISTS(SELECT 1 FROM classroom_members cm JOIN classrooms c ON c.id=cm.classroom_id AND c.group_id=cm.group_id
      JOIN students class_student ON class_student.group_id=cm.group_id AND class_student.name=cm.student_name AND class_student.active=1
      JOIN plans p ON p.group_id=c.group_id AND p.student=cm.student_name AND ${classPlanSubjectSql("p","c","class_student")} AND p.teacher_name=c.teacher_name AND p.active=1
      JOIN teachers teacher ON teacher.group_id=c.group_id AND teacher.name=c.teacher_name AND teacher.active=1
      WHERE cm.classroom_id=${record}.classroom_id AND cm.group_id=${record}.group_id AND cm.student_name=${account}.student_name))`;
}
export const learningNoticeAccess=`((n.content_kind='homework' AND EXISTS(SELECT 1 FROM homework h WHERE h.id=n.record_id AND h.group_id=n.group_id AND ${learningRecipientSql("homework")}))
  OR (n.content_kind='material' AND EXISTS(SELECT 1 FROM teaching_materials h WHERE h.id=n.record_id AND h.group_id=n.group_id AND ${learningRecipientSql("material")})))`;
export function learningNoticeStatement(event:{groupId:string;kind:"material"|"homework";recordId:string;eventId:string;type:string;at:string;guard:string;guardArgs:unknown[];student?:string}) {
  const table=event.kind==="homework"?"homework":"teaching_materials";
  const subject=event.kind==="homework"?"h.subject":"coalesce((SELECT subject FROM material_recipients WHERE material_id=h.id AND group_id=h.group_id LIMIT 1),'')";
  return learningDb().prepare(`INSERT OR IGNORE INTO learning_notifications(id,group_id,account_id,event_id,content_kind,record_id,content_revision,kind,title,subject,created_at)
    SELECT lower(hex(randomblob(16))),h.group_id,a.id,?,?,h.id,h.revision,?,h.title,${subject},? FROM ${table} h JOIN accounts a ON ${learningRecipientSql(event.kind)}
    WHERE h.id=? AND h.group_id=? ${event.student?"AND a.student_name=?":""} AND ${event.guard}`)
    .bind(event.eventId,event.kind,event.type,event.at,event.recordId,event.groupId,...(event.student?[event.student]:[]),...event.guardArgs);
}
export async function learningInbox(account:Account,countsOnly=false) {
  if(account.role!=="student" || !account.studentName)return {items:[],unreadCount:0};
  const scope=`FROM learning_notifications n JOIN accounts a ON a.id=n.account_id WHERE n.account_id=? AND n.group_id=? AND ${learningNoticeAccess}`;
  if(countsOnly){const result=await rows<{total:number}>(`SELECT count(*) AS total ${scope} AND n.read_at IS NULL`,account.id,account.groupId);return{items:[],unreadCount:Number(result[0]?.total||0)};}
  const messages=await rows<{id:string;kind:string;contentKind:string;recordId:string;title:string;subject:string;createdAt:string;readAt:string|null;unreadTotal:number}>(`SELECT n.id,n.kind,n.content_kind AS contentKind,n.record_id AS recordId,n.title,n.subject,n.created_at AS createdAt,n.read_at AS readAt,sum(n.read_at IS NULL) OVER() AS unreadTotal
    ${scope}
    ORDER BY (n.read_at IS NULL) DESC,n.created_at DESC,n.id DESC LIMIT 100`,account.id,account.groupId);
  return {unreadCount:Number(messages[0]?.unreadTotal || 0),items:messages.map(n=>({id:"learning:"+n.id,kind:n.kind,contentKind:n.contentKind,recordId:n.recordId,title:n.title,subject:n.subject,dueAt:n.createdAt,readAt:n.readAt}))};
}
