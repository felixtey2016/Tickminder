import {classPlanSubjectSql,planSubjectLabelSql} from './academic-subject-match';
import {groupReader,groupStatement,requireGroup} from './group-data';
import {learningDb} from './learning-server';
import {readAcademicCatalogue} from './academic-catalogue-server';
import {findCatalogueSubject,findCatalogueSyllabus} from './academic-catalogue';
import {OWNER_EMAIL} from './owner';

type Guard={sql:string;args:unknown[]};
type Statement=ReturnType<ReturnType<typeof groupStatement>['bind']>;
export type PlanClassroom={id:string;title:string};
type LessonIdentity={student:string;subject:string;teacherName:string};
const allow:Guard={sql:'1',args:[]};
const activePlan=`p.active=1 AND s.active=1 AND t.active=1`;
const planJoins=`FROM plans p JOIN students s ON s.name=p.student AND s.group_id=p.group_id JOIN teachers t ON t.name=p.teacher_name AND t.group_id=p.group_id`;
const roomMatch=`c.group_id=p.group_id AND c.archived=0 AND c.teacher_name=p.teacher_name AND ${classPlanSubjectSql('p','c','s')} AND EXISTS(SELECT 1 FROM classroom_members cm WHERE cm.group_id=c.group_id AND cm.classroom_id=c.id AND cm.student_name=p.student)`;

// Append these statements after the plan/profile writes in their transaction.
// A class belongs to a real active student/subject/teacher pairing. A registered
// name without a subject or teacher never creates a guessed placeholder class.
export function planClassroomStatements(groupId:string,planKey:string,actorId:string,guard:Guard=allow){
 requireGroup(groupId);
 const classId=crypto.randomUUID(),memberId=crypto.randomUUID(),now=new Date().toISOString();
 return [
  groupStatement(groupId,`INSERT INTO classrooms(group_id,id,title,description,subject,teacher_name,created_by,archived,created_at,updated_at,term_id,syllabus_id,subject_id,grade)
   SELECT p.group_id,?,substr(p.student||' · '||p.subject||' · '||p.teacher_name,1,100),NULL,p.subject,p.teacher_name,?,0,?,?,NULL,s.syllabus_id,p.subject_id,s.grade ${planJoins}
   WHERE p.key=? AND ${activePlan} AND ${guard.sql} AND NOT EXISTS(SELECT 1 FROM classrooms c WHERE ${roomMatch})`).bind(classId,actorId,now,now,planKey,...guard.args),
  groupStatement(groupId,`INSERT INTO classroom_members(group_id,id,classroom_id,student_name,created_at)
   SELECT p.group_id,?,c.id,p.student,? ${planJoins} JOIN classrooms c ON c.id=? AND c.group_id=p.group_id
   WHERE p.key=? AND ${activePlan} AND ${guard.sql}
   AND c.teacher_name=p.teacher_name AND NOT EXISTS(SELECT 1 FROM classroom_members cm WHERE cm.classroom_id=c.id AND cm.student_name=p.student)`).bind(memberId,now,classId,planKey,...guard.args),
 ];
}

// Keep upcoming one-to-one sessions associated when an administrator changes a
// pairing's teacher. Historical participants, results and times remain intact.
export function planSessionClassroomStatements(groupId:string,planKey:string,guard:Guard=allow){
 const matched=`SELECT DISTINCT c.id ${planJoins} JOIN classrooms c ON ${roomMatch} WHERE p.key=? AND ${activePlan} AND p.teacher_name=class_sessions.teacher_name AND ${planSubjectLabelSql('p','s','class_sessions.subject')} AND EXISTS(SELECT 1 FROM class_session_participants cp WHERE cp.group_id=class_sessions.group_id AND cp.session_id=class_sessions.id AND cp.student_name=p.student) AND (SELECT count(*) FROM class_session_participants cp WHERE cp.group_id=class_sessions.group_id AND cp.session_id=class_sessions.id)=1`;
 return [groupStatement(groupId,`UPDATE class_sessions SET classroom_id=(${matched}),classroom_title=(SELECT title FROM classrooms WHERE id=(${matched})) WHERE group_id=? AND session_type='one_to_one' AND status='scheduled' AND ${guard.sql} AND (SELECT count(*) FROM (${matched}))=1`).bind(planKey,planKey,groupId,...guard.args,planKey)];
}

export async function readPlanClassroom(groupId:string,planKey:string):Promise<PlanClassroom|null>{
 const rooms=await groupReader(groupId).rows<PlanClassroom>(`SELECT DISTINCT c.id,c.title ${planJoins} JOIN classrooms c ON ${roomMatch} WHERE p.key=? AND ${activePlan} ORDER BY c.id`,planKey);
 return rooms.length===1?rooms[0]:null;
}
export async function readLessonClassroom(groupId:string,lesson:LessonIdentity):Promise<PlanClassroom|null>{
 const rooms=await groupReader(groupId).rows<PlanClassroom>(`SELECT DISTINCT c.id,c.title ${planJoins} CROSS JOIN (SELECT ? AS subject) requested JOIN classrooms c ON ${roomMatch} WHERE p.student=? AND p.teacher_name=? AND ${planSubjectLabelSql()} AND ${activePlan} ORDER BY c.id`,lesson.subject,lesson.student,lesson.teacherName);
 return rooms.length===1?rooms[0]:null;
}
export async function ensurePlanClassroom(groupId:string,planKey:string,actorId:string){
 await learningDb().batch(planClassroomStatements(groupId,planKey,actorId));
 return readPlanClassroom(groupId,planKey);
}
export async function ensureStudentClassrooms(groupId:string,studentName:string,actorId:string){
 const plans=await groupReader(groupId).rows<{key:string}>('SELECT key FROM plans WHERE student=? AND active=1 ORDER BY key',studentName);
 if(plans.length)await learningDb().batch(plans.flatMap(plan=>[...planClassroomStatements(groupId,plan.key,actorId),...planSessionClassroomStatements(groupId,plan.key)]));
}
export async function ensureTeacherClassrooms(groupId:string,teacherName:string,actorId:string){
 const plans=await groupReader(groupId).rows<{key:string}>('SELECT key FROM plans WHERE teacher_name=? AND active=1 ORDER BY key',teacherName);
 if(plans.length)await learningDb().batch(plans.flatMap(plan=>[...planClassroomStatements(groupId,plan.key,actorId),...planSessionClassroomStatements(groupId,plan.key)]));
}

export type ClassroomContentLink={kind:'material'|'homework';id:string;ownerId:string;ownerRole:string;revision:number;classroomId:string;student:string;subject:string;teacherName:string};
export type ClassroomSessionLink={id:string;classroomId:string;classroomTitle:string;student:string;subject:string;teacherName:string;status:string};
type HistoricalEvidence={kind:'material'|'homework'|'session';id:string;student:string;subject:string;teacherName:string;ownerId?:string;ownerRole?:string;revision?:number;status?:string};
export type HistoricalClassroom={id:string;title:string;student:string;subject:string;teacherName:string;syllabusId:string|null;subjectId:string|null;evidence:HistoricalEvidence};
export type ClassroomBackfillPlan={groupId:string;actorId:string;archivedClasses:HistoricalClassroom[];content:ClassroomContentLink[];sessions:ClassroomSessionLink[];unresolved:Array<{kind:string;id:string;reason:string}>};

// Read-only planning: keep existing IDs, recipient rows, grades, submissions,
// file objects and historical version JSON. Ambiguous legacy work stays intact.
export async function planStudentClassroomBackfill(groupId:string,actorId?:string):Promise<ClassroomBackfillPlan>{
 const {rows}=groupReader(groupId),administrator=(await learningDb().prepare("SELECT id FROM accounts WHERE role='admin' AND disabled_at IS NULL AND lower(trim(email))=? AND substr(id,1,6)<>'local:' AND (group_id IS NULL OR group_id=?)"+(actorId?' AND id=?':'')+' ORDER BY id LIMIT 1').bind(OWNER_EMAIL,groupId,...(actorId?[actorId]:[])).first<{id:string}>())?.id;
 if(!administrator)throw new Error('需要管理员确认班级资料整理');
 const plan:ClassroomBackfillPlan={groupId,actorId:administrator,archivedClasses:[],content:[],sessions:[],unresolved:[]};
 const [catalogue,profiles,classrooms,members]=await Promise.all([readAcademicCatalogue('student'),rows<{name:string;syllabusId:string|null}>('SELECT name,syllabus_id AS syllabusId FROM students'),rows<{id:string;title:string;subject:string;teacherName:string;syllabusId:string|null;subjectId:string|null}>('SELECT id,title,subject,teacher_name AS teacherName,syllabus_id AS syllabusId,subject_id AS subjectId FROM classrooms'),rows<{classroomId:string;student:string}>('SELECT classroom_id AS classroomId,student_name AS student FROM classroom_members')]);
 const normalized=(value:string)=>value.normalize('NFKC').trim().toLowerCase(),historical=new Map<string,PlanClassroom>();
 async function roomFor(evidence:HistoricalEvidence){
  const current=await readLessonClassroom(groupId,evidence);if(current)return current;
  const profile=profiles.find(profile=>profile.name===evidence.student),syllabus=profile?.syllabusId?findCatalogueSyllabus(catalogue,profile.syllabusId):undefined,subject=syllabus&&findCatalogueSubject(syllabus,evidence.subject);
  const matching=classrooms.filter(room=>room.teacherName===evidence.teacherName&&members.some(member=>member.classroomId===room.id&&member.student===evidence.student)&&(normalized(room.subject)===normalized(evidence.subject)||Boolean(subject&&room.subjectId===subject.id&&(!room.syllabusId||room.syllabusId===syllabus?.id))));
  if(matching.length===1)return {id:matching[0].id,title:matching[0].title};
  // Multiple old classes are never selected arbitrarily. A separate archive is
  // built from the actual saved triple, without activating a student or plan.
  const identity=JSON.stringify([evidence.student,syllabus?.id||'',subject?.id||normalized(evidence.subject),evidence.teacherName]),known=historical.get(identity);if(known)return known;
  const room={id:crypto.randomUUID(),title:`${evidence.student} · ${evidence.subject} · ${evidence.teacherName}（历史）`.slice(0,100)};
  plan.archivedClasses.push({...room,student:evidence.student,subject:evidence.subject,teacherName:evidence.teacherName,syllabusId:syllabus?.id||null,subjectId:subject?.id||null,evidence});historical.set(identity,room);return room;
 }
 for(const kind of ['material','homework'] as const){
  const table=kind==='material'?'teaching_materials':'homework';
  const items=await rows<{id:string;ownerId:string;ownerRole:string;revision:number;teacherName:string|null;subject?:string}>(`SELECT item.id,item.owner_id AS ownerId,item.revision,owner.role AS ownerRole,owner.teacher_name AS teacherName${kind==='homework'?',item.subject':''} FROM ${table} item LEFT JOIN accounts owner ON owner.id=item.owner_id AND owner.group_id=item.group_id WHERE item.classroom_id IS NULL ORDER BY item.id`);
  for(const item of items){
   const recipients=kind==='material'?await rows<{student:string;subject:string}>('SELECT student_name AS student,subject FROM material_recipients WHERE material_id=? ORDER BY student_name,subject',item.id):await rows<{student:string;subject:string}>('SELECT student_name AS student,? AS subject FROM homework_recipients WHERE homework_id=? ORDER BY student_name',item.subject,item.id);
   if(recipients.length!==1){plan.unresolved.push({kind,id:item.id,reason:'recipient_not_unique'});continue;}
   const recipient=recipients[0];let teacherName=item.ownerRole==='teacher'?item.teacherName:null;
   if(item.ownerRole==='admin'){const assigned=await rows<{teacherName:string}>(`SELECT DISTINCT p.teacher_name AS teacherName ${planJoins} CROSS JOIN (SELECT ? AS subject) requested WHERE p.student=? AND ${planSubjectLabelSql()} AND ${activePlan}`,recipient.subject,recipient.student);if(assigned.length===1)teacherName=assigned[0].teacherName;}
   if(!teacherName){plan.unresolved.push({kind,id:item.id,reason:'owner_teacher_not_resolvable'});continue;}
   const evidence:HistoricalEvidence={kind,id:item.id,ownerId:item.ownerId,ownerRole:item.ownerRole,revision:item.revision,...recipient,teacherName},room=await roomFor(evidence);
   plan.content.push({kind,id:item.id,ownerId:item.ownerId,ownerRole:item.ownerRole,revision:item.revision,classroomId:room.id,...recipient,teacherName});
  }
 }
 const sessions=await rows<{id:string;student:string;subject:string;teacherName:string;status:string}>(`SELECT cs.id,cp.student_name AS student,cs.subject,cs.teacher_name AS teacherName,cs.status FROM class_sessions cs JOIN class_session_participants cp ON cp.session_id=cs.id AND cp.group_id=cs.group_id WHERE cs.session_type='one_to_one' AND cs.classroom_id IS NULL AND (SELECT count(*) FROM class_session_participants counted WHERE counted.session_id=cs.id AND counted.group_id=cs.group_id)=1 ORDER BY cs.id`);
 for(const session of sessions){const room=await roomFor({kind:'session',...session});plan.sessions.push({...session,classroomId:room.id,classroomTitle:room.title});}
 return plan;
}

function historicalEvidenceSql(groupId:string,evidence:HistoricalEvidence):Guard{
 if(evidence.kind==='session')return {sql:"EXISTS(SELECT 1 FROM class_sessions cs JOIN class_session_participants cp ON cp.group_id=cs.group_id AND cp.session_id=cs.id WHERE cs.id=? AND cs.group_id=? AND cs.session_type='one_to_one' AND cs.classroom_id IS NULL AND cs.teacher_name=? AND cs.subject=? AND cs.status=? AND cp.student_name=? AND (SELECT count(*) FROM class_session_participants counted WHERE counted.session_id=cs.id AND counted.group_id=cs.group_id)=1)",args:[evidence.id,groupId,evidence.teacherName,evidence.subject,evidence.status,evidence.student]};
 const table=evidence.kind==='material'?'teaching_materials':'homework',recipientTable=evidence.kind==='material'?'material_recipients':'homework_recipients',recipientKey=evidence.kind==='material'?'material_id':'homework_id';
 return {sql:`EXISTS(SELECT 1 FROM ${table} item JOIN accounts owner ON owner.id=item.owner_id AND owner.group_id=item.group_id JOIN ${recipientTable} r ON r.${recipientKey}=item.id AND r.group_id=item.group_id WHERE item.id=? AND item.group_id=? AND item.owner_id=? AND item.revision=? AND item.classroom_id IS NULL AND owner.role=? AND ${evidence.ownerRole==='teacher'?'owner.teacher_name=?':'owner.role=\'admin\''} AND r.student_name=? AND ${evidence.kind==='material'?'r.subject':'item.subject'}=? AND (SELECT count(*) FROM ${recipientTable} counted WHERE counted.${recipientKey}=item.id AND counted.group_id=item.group_id)=1)`,args:[evidence.id,groupId,evidence.ownerId,evidence.revision,evidence.ownerRole,...(evidence.ownerRole==='teacher'?[evidence.teacherName]:[]),evidence.student,evidence.subject]};
}

// Caller applies a reviewed plan in one D1 batch after taking a full backup.
// The guards recheck the exact live owner/recipient/pairing before each link.
export function studentClassroomBackfillStatements(plan:ClassroomBackfillPlan){
 const groupId=requireGroup(plan.groupId),statements:Statement[]=[];
 const now=new Date().toISOString(),auditId=crypto.randomUUID(),pending=[...plan.content.map(item=>({kind:item.kind,id:item.id})),...plan.sessions.map(item=>({kind:'session',id:item.id}))];
 if(!pending.length)return statements;
 const summary={archivedClasses:plan.archivedClasses.length,materials:plan.content.filter(item=>item.kind==='material').length,homework:plan.content.filter(item=>item.kind==='homework').length,sessions:plan.sessions.length,unresolved:plan.unresolved.length};
 // This privileged background migration may be attributed to the verified
 // platform owner with no home group. Every business table stays explicitly scoped.
 statements.push(learningDb().prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at) SELECT ?,?,'student-classroom-backfill',?,'migrateStudentClassrooms',?,? WHERE EXISTS(SELECT 1 FROM accounts WHERE id=? AND role='admin' AND disabled_at IS NULL AND lower(trim(email))=? AND substr(id,1,6)<>'local:' AND (group_id IS NULL OR group_id=?))
  AND EXISTS(SELECT 1 FROM json_each(?) pending WHERE (json_extract(pending.value,'$.kind')='material' AND EXISTS(SELECT 1 FROM teaching_materials item WHERE item.id=json_extract(pending.value,'$.id') AND item.group_id=? AND item.classroom_id IS NULL)) OR (json_extract(pending.value,'$.kind')='homework' AND EXISTS(SELECT 1 FROM homework item WHERE item.id=json_extract(pending.value,'$.id') AND item.group_id=? AND item.classroom_id IS NULL)) OR (json_extract(pending.value,'$.kind')='session' AND EXISTS(SELECT 1 FROM class_sessions item WHERE item.id=json_extract(pending.value,'$.id') AND item.group_id=? AND item.classroom_id IS NULL)))`).bind(groupId,auditId,plan.actorId,JSON.stringify(summary),now,plan.actorId,OWNER_EMAIL,groupId,JSON.stringify(pending),groupId,groupId,groupId));
 const claim=`EXISTS(SELECT 1 FROM audit WHERE id=? AND group_id=?)`;
 for(const room of plan.archivedClasses){const evidence=historicalEvidenceSql(groupId,room.evidence);statements.push(groupStatement(groupId,`INSERT INTO classrooms(group_id,id,title,description,subject,teacher_name,created_by,archived,created_at,updated_at,term_id,syllabus_id,subject_id,grade) SELECT ?,?,?,NULL,?,?,?,1,?,?,NULL,?,?,NULL WHERE ${claim} AND ${evidence.sql}`).bind(groupId,room.id,room.title,room.subject,room.teacherName,plan.actorId,now,now,room.syllabusId,room.subjectId,auditId,groupId,...evidence.args),groupStatement(groupId,`INSERT INTO classroom_members(group_id,id,classroom_id,student_name,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM classrooms WHERE id=? AND archived=1) AND ${claim} AND NOT EXISTS(SELECT 1 FROM classroom_members WHERE classroom_id=? AND student_name=?)`).bind(groupId,crypto.randomUUID(),room.id,room.student,now,room.id,auditId,groupId,room.id,room.student));}
 for(const item of plan.content){
  const table=item.kind==='material'?'teaching_materials':'homework',recipientTable=item.kind==='material'?'material_recipients':'homework_recipients',recipientKey=item.kind==='material'?'material_id':'homework_id';
  statements.push(groupStatement(groupId,`UPDATE ${table} SET classroom_id=? WHERE id=? AND group_id=? AND owner_id=? AND revision=? AND classroom_id IS NULL AND folder_id IS NULL
   AND ${claim} AND EXISTS(SELECT 1 FROM accounts owner WHERE owner.id=? AND owner.group_id=? AND owner.role=? ${item.ownerRole==='teacher'?'AND owner.teacher_name=?':''})
   AND (SELECT count(*) FROM ${recipientTable} r WHERE r.${recipientKey}=?)=1
   AND EXISTS(SELECT 1 FROM ${recipientTable} r WHERE r.${recipientKey}=? AND r.student_name=? ${item.kind==='material'?'AND r.subject=?':''})
   AND EXISTS(SELECT 1 FROM classrooms c JOIN classroom_members cm ON cm.classroom_id=c.id AND cm.group_id=c.group_id WHERE c.id=? AND c.group_id=? AND c.teacher_name=? AND cm.student_name=?)`).bind(item.classroomId,item.id,groupId,item.ownerId,item.revision,auditId,groupId,item.ownerId,groupId,item.ownerRole,...(item.ownerRole==='teacher'?[item.teacherName]:[]),item.id,item.id,item.student,...(item.kind==='material'?[item.subject]:[]),item.classroomId,groupId,item.teacherName,item.student));
 }
 for(const item of plan.sessions)statements.push(groupStatement(groupId,`UPDATE class_sessions SET classroom_id=?,classroom_title=? WHERE id=? AND group_id=? AND session_type='one_to_one' AND classroom_id IS NULL AND teacher_name=? AND subject=? AND status=?
  AND (SELECT count(*) FROM class_session_participants cp WHERE cp.session_id=class_sessions.id AND cp.group_id=class_sessions.group_id)=1
  AND EXISTS(SELECT 1 FROM class_session_participants cp WHERE cp.session_id=class_sessions.id AND cp.group_id=class_sessions.group_id AND cp.student_name=?)
  AND ${claim} AND EXISTS(SELECT 1 FROM classrooms c JOIN classroom_members cm ON cm.classroom_id=c.id AND cm.group_id=c.group_id WHERE c.id=? AND c.group_id=? AND c.teacher_name=? AND cm.student_name=?)`).bind(item.classroomId,item.classroomTitle,item.id,groupId,item.teacherName,item.subject,item.status,item.student,auditId,groupId,item.classroomId,groupId,item.teacherName,item.student));
 // An optimistic guard that lost a race must roll back every association and
 // audit/archive row in this batch. Replaying the already-applied plan passes.
 const expected=[...plan.content.map(item=>({kind:item.kind,id:item.id,classroomId:item.classroomId})),...plan.sessions.map(item=>({kind:'session',id:item.id,classroomId:item.classroomId}))];
 statements.push(groupStatement(groupId,`SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(?) expected WHERE
  (json_extract(expected.value,'$.kind')='material' AND NOT EXISTS(SELECT 1 FROM teaching_materials item WHERE item.id=json_extract(expected.value,'$.id') AND item.classroom_id=json_extract(expected.value,'$.classroomId')))
  OR (json_extract(expected.value,'$.kind')='homework' AND NOT EXISTS(SELECT 1 FROM homework item WHERE item.id=json_extract(expected.value,'$.id') AND item.classroom_id=json_extract(expected.value,'$.classroomId')))
  OR (json_extract(expected.value,'$.kind')='session' AND NOT EXISTS(SELECT 1 FROM class_sessions item WHERE item.id=json_extract(expected.value,'$.id') AND item.classroom_id=json_extract(expected.value,'$.classroomId'))))
  THEN json('classroom_backfill_stale') ELSE 1 END AS verified`).bind(JSON.stringify(expected)));
 return statements;
}
