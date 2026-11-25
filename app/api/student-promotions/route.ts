import {NextResponse} from 'next/server';
import {currentBusinessAccount} from '@/lib/auth';
import {learningDb} from '@/lib/learning-server';
import {readAcademicCatalogue} from '@/lib/academic-catalogue-server';
import {findCatalogueSyllabus} from '@/lib/academic-catalogue';
import {refreshClassroomAcademicMetadata} from '@/lib/student-academics';
import {OWNER_EMAIL} from '@/lib/owner';
import {requireCorePermissions,guardedCoreDb,guardedCoreReader} from '@/lib/admin-core-permissions';
import {adminPermissionFailure} from '@/lib/admin-permission-access';
import type {Account} from '@/lib/auth';

const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
function cycleOf(value:unknown){const cycle=Number(value);return Number.isInteger(cycle)&&cycle>=2000&&cycle<=2200?cycle:null;}
async function preview(actor:Account,cycle:number){
 const {rows}=guardedCoreReader(actor,['students.promote']),[catalogue,studentRows,promotionRows]=await Promise.all([
  readAcademicCatalogue('student'),
  rows<{name:string;syllabusId:string|null;grade:string|null}>('SELECT name,syllabus_id AS syllabusId,grade FROM students WHERE active=1 ORDER BY name'),
  rows<{name:string;lastCycle:number}>('SELECT student_name AS name,max(cycle) AS lastCycle FROM student_grade_promotions GROUP BY student_name'),
 ]);
 const already=new Map(promotionRows.map(p=>[p.name,p.lastCycle]));
 const items=studentRows.map(s=>{
  const syllabus=findCatalogueSyllabus(catalogue,s.syllabusId||''),index=syllabus?.grades.indexOf(s.grade||'')??-1;
  const toGrade=index>=0&&syllabus?.id!=='stpm'?syllabus?.grades[index+1]||null:null;
  const reason=(already.get(s.name)||0)>=cycle?'此学年已晋级':!syllabus?.active?'课程体系已停用或待补充':syllabus.id==='stpm'?'STPM 按学期管理，请手动更新 Semester':!s.grade||index<0?'年级待补充':!toGrade?'已到最后年级，请手动处理':'';
  return {student:s.name,syllabusId:s.syllabusId,syllabus:syllabus?.name||'',fromGrade:s.grade,toGrade,eligible:!reason,reason};
 });
 return {items,catalogueRevision:catalogue.revision};
}
export async function GET(request:Request){
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);if(actor.role!=='admin'||!actor.groupId)return json({error:'只有管理员可以确认年度晋级'},403);
 const cycle=cycleOf(new URL(request.url).searchParams.get('cycle'));if(!cycle)return json({error:'请输入有效学年'},400);
 try{await requireCorePermissions(actor,['students.promote']);return json({cycle,...await preview(actor,cycle)});}catch(error){const permission=adminPermissionFailure(error);return json({error:permission?.error||'晋级名单暂时无法加载，请重试'},permission?.status||503);}
}
export async function POST(request:Request){
 if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'没有权限执行此操作'},403);
 const actor=await currentBusinessAccount();if(!actor)return json({error:'请先登录'},401);if(actor.role!=='admin'||!actor.groupId)return json({error:'只有管理员可以确认年度晋级'},403);
 try{
  await requireCorePermissions(actor,['students.promote']);
  let raw:unknown;try{raw=await request.json();}catch{return json({error:'晋级名单无效'},400);}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return json({error:'晋级名单无效'},400);
  const data=raw as {cycle?:unknown;students?:unknown},cycle=cycleOf(data.cycle);
  if(!cycle||!Array.isArray(data.students)||!data.students.length||data.students.length>1000)return json({error:'请选择需要晋级的学生'},400);
  const {items:current,catalogueRevision}=await preview(actor,cycle),names=new Set<string>();
  const selected=[];
  for(const raw of data.students){
   if(!raw||typeof raw!=='object')return json({error:'晋级名单无效'},400);
   const row=raw as {student?:unknown;syllabusId?:unknown;fromGrade?:unknown;toGrade?:unknown};
   if(typeof row.student!=='string'||names.has(row.student))return json({error:'晋级名单无效'},400);names.add(row.student);
   const match=current.find(x=>x.student===row.student);
   if(!match?.eligible||match.syllabusId!==row.syllabusId||match.fromGrade!==row.fromGrade||match.toGrade!==row.toGrade)return json({error:'学生资料已改变，请刷新晋级名单'},409);
   selected.push(match);
  }
  const db=guardedCoreDb(actor,['students.promote']),operation=crypto.randomUUID(),now=new Date().toISOString(),payload=JSON.stringify(selected),groupId=actor.groupId;
  // One guarded transaction: no student is changed if any selected profile is
  // stale or a concurrent administrator already promoted them for this cycle.
  const guard=`EXISTS(SELECT 1 FROM audit WHERE id=? AND group_id=?)`;
  const statements=[db.prepare(`INSERT INTO audit(group_id,id,lesson_id,actor_id,action,after_json,at)
   SELECT ?,?,'student-grade-promotion',?,'promoteStudents',?,?
   WHERE EXISTS(SELECT 1 FROM accounts a JOIN tuition_groups g ON g.id=? AND g.active=1 WHERE a.id=? AND a.role='admin' AND a.disabled_at IS NULL
    AND (a.group_id=g.id OR (lower(trim(a.email))=? AND substr(a.id,1,6)<>'local:'))
    AND NOT EXISTS(SELECT 1 FROM local_credentials lc WHERE lc.account_id=a.id AND lc.must_change_password=1))
   AND EXISTS(SELECT 1 FROM academic_catalogues WHERE scope='student' AND revision=?)
   AND NOT EXISTS(SELECT 1 FROM json_each(?) j LEFT JOIN students s ON s.group_id=? AND s.name=json_extract(j.value,'$.student')
    WHERE s.name IS NULL OR s.active<>1 OR s.syllabus_id IS NOT json_extract(j.value,'$.syllabusId') OR s.grade IS NOT json_extract(j.value,'$.fromGrade')
    OR EXISTS(SELECT 1 FROM student_grade_promotions p WHERE p.group_id=? AND p.student_name=s.name AND p.cycle>=?))`).bind(groupId,operation,actor.id,JSON.stringify({cycle,students:selected}),now,groupId,actor.id,OWNER_EMAIL,catalogueRevision,payload,groupId,groupId,cycle)];
  statements.push(db.prepare(`INSERT INTO student_grade_promotions(group_id,student_name,cycle,syllabus_id,from_grade,to_grade,confirmed_by,confirmed_at)
   SELECT ?,json_extract(j.value,'$.student'),?,json_extract(j.value,'$.syllabusId'),json_extract(j.value,'$.fromGrade'),json_extract(j.value,'$.toGrade'),?,?
   FROM json_each(?) j WHERE ${guard}`).bind(groupId,cycle,actor.id,now,payload,operation,groupId));
  statements.push(db.prepare(`UPDATE students SET grade=(SELECT json_extract(j.value,'$.toGrade') FROM json_each(?) j WHERE json_extract(j.value,'$.student')=students.name)
   WHERE group_id=? AND name IN(SELECT json_extract(value,'$.student') FROM json_each(?)) AND ${guard}`).bind(payload,groupId,payload,operation,groupId));
  const result=await db.batch(statements);
  if(!result[0].meta.changes)return json({error:'学生资料已改变，请刷新晋级名单'},409);
  // Historical lessons, marks and ages are deliberately not updated.
  await refreshClassroomAcademicMetadata(groupId,db);
  return json({ok:true,promoted:selected.length,cycle});
 }catch(error){const permission=adminPermissionFailure(error);return json({error:permission?.error||'请刷新名单确认晋级结果后再重试'},permission?.status||503);}
}
