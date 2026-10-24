import type {Account} from './auth';
import {learningDb} from './learning-server';
import {groupReader,requireGroup} from './group-data';
import {authorityGuard} from './admin-authority';
import {appendAudit} from './audit-log';
import {readAcademicCatalogue} from './academic-catalogue-server';
import {studentProfileInput} from './student-academics';
import {studentNameKey} from './student-names';

export class AccountProvisioningError extends Error {
  constructor(message:string,readonly status=400){super(message);}
}
const str=(value:unknown)=>typeof value==='string'?value.trim():'';
export const isAccountProvisioningFailure=(error:unknown)=>/account_provisioning_changed/.test(String(error));

// The caller executes these checks, profile creation and account writes in one
// permission-guarded D1 batch. No implicit name match ever links an old identity.
export async function prepareAccountPerson(actor:Account,data:Record<string,unknown>,role:string,now:string,targetId=''){
  const groupId=requireGroup(actor.groupId),raw=learningDb(),{first,rows}=groupReader(groupId);
  const mode=str(data.identityMode)||'existing';
  if(!['new','existing'].includes(mode))throw new AccountProvisioningError('请选择新增人员或关联现有人员');
  const result={teacherName:null as string|null,studentName:null as string|null,identityMode:mode,permissions:[] as string[],statements:[] as D1PreparedStatement[]};
  if(role!=='teacher'&&role!=='student')return result;
  const creating=mode==='new',name=creating?str(data.name):str(role==='teacher'?data.teacherName:data.studentName);
  if(!name||name.length>80||name.includes('|'))throw new AccountProvisioningError(creating?'请输入不超过 80 个字符且不含 | 的姓名':'请选择启用的现有人员');
  const table=role==='teacher'?'teachers':'students',column=role==='teacher'?'teacher_name':'student_name';
  const duplicate=await first<{disabledAt:string|null}>(`SELECT disabled_at AS disabledAt FROM accounts WHERE role=? AND ${column}=? AND id<>? LIMIT 1`,role,name,targetId);
  if(duplicate)throw new AccountProvisioningError(duplicate.disabledAt?'此身份已有停用账号，请恢复原账号后使用':'此身份已有账号，请使用现有账号连接 Google，避免重复创建',409);
  const check={sql:`NOT EXISTS(SELECT 1 FROM accounts WHERE group_id=? AND role=? AND ${column}=? AND id<>?)`,args:[groupId,role,name,targetId] as unknown[]};
  if(role==='student')result.studentName=name;else result.teacherName=name;
  if(!creating){
    if(!await first(`SELECT 1 FROM ${table} WHERE name=? AND active=1`,name))throw new AccountProvisioningError(role==='teacher'?'请选择启用的老师':'请选择启用的现有学生');
    check.sql+=` AND EXISTS(SELECT 1 FROM ${table} WHERE group_id=? AND name=? AND active=1)`;check.args.push(groupId,name);
    result.statements.push(authorityGuard(check,'account_provisioning_changed'));
    return result;
  }
  result.permissions.push(role==='student'?'students.create':'teachers.create');
  if(role==='student'){
    const key=studentNameKey(name),prior=await first<{active:number}>('SELECT active FROM students WHERE name_key=?',key);
    if(prior)throw new AccountProvisioningError(prior.active?'学生姓名已存在，请选择「关联现有学生」':'此学生已停用，请先恢复原学生资料',409);
    const catalogue=await readAcademicCatalogue('student'),profile=await studentProfileInput(data,undefined,catalogue);
    check.sql+=' AND NOT EXISTS(SELECT 1 FROM students WHERE group_id=? AND name_key=?) AND EXISTS(SELECT 1 FROM academic_catalogues WHERE scope=\'student\' AND revision=?)';
    check.args.push(groupId,key,catalogue.revision);
    result.statements.push(authorityGuard(check,'account_provisioning_changed'),raw.prepare('INSERT INTO students(group_id,name,name_key,active,created_at,syllabus_id,grade,age) VALUES(?,?,?,1,?,?,?,?)').bind(groupId,name,key,now,profile.syllabusId,profile.grade,profile.age),appendAudit(raw,{groupId,lessonId:`student:${name}`,actorId:actor.id,actorName:actor.name,objectName:name,action:'saveStudent',after:{name,active:true,...profile,source:'account-onboarding'},at:now}));
  }else{
    const roster=await rows<{name:string;active:number}>('SELECT name,active FROM teachers ORDER BY name'),prior=roster.find(item=>studentNameKey(item.name)===studentNameKey(name));
    if(prior)throw new AccountProvisioningError(prior.active?'老师姓名已存在，请选择「关联现有老师」':'此老师已停用，请先恢复原老师资料',409);
    // Compare the small teacher roster snapshot to catch normalised-name races.
    check.sql+=" AND coalesce((SELECT json_group_array(json_array(name,active)) FROM (SELECT name,active FROM teachers WHERE group_id=? ORDER BY name)),'[]')=?";
    check.args.push(groupId,JSON.stringify(roster.map(item=>[item.name,Number(item.active)])));
    result.statements.push(authorityGuard(check,'account_provisioning_changed'),raw.prepare('INSERT INTO teachers(group_id,name,active,created_at) VALUES(?,?,1,?)').bind(groupId,name,now),appendAudit(raw,{groupId,lessonId:`teacher:${name}`,actorId:actor.id,actorName:actor.name,objectName:name,action:'saveTeacher',after:{name,active:true,source:'account-onboarding'},at:now}));
  }
  return result;
}
