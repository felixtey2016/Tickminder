import type {Account} from './auth';
import {configuredAdminGrantPredicate} from './admin-permissions-server';
import {accountSessionPredicate} from './account-session';
import {learningDb} from './learning-server';
export type MaterialContext={classroomId:string;folderId?:string|null;subject?:string};
export class MaterialImportError extends Error{constructor(message:string,readonly status=403){super(message);}}
/** New write capabilities always require explicit grants, including preparation mode. */
export function adminMaterialCreateAuthority(actor:Account,context:MaterialContext){
 if(actor.role!=='admin'||!actor.groupId)return{sql:'0',values:[] as unknown[]};
 const create=configuredAdminGrantPredicate(actor,'materials.create'),folder=context.folderId?configuredAdminGrantPredicate(actor,'folders.placeContent'):null;
 const values:unknown[]=[...create.args,actor.groupId,context.classroomId];
 let sql='('+create.sql+') AND EXISTS(SELECT 1 FROM classrooms material_class JOIN tuition_groups material_group ON material_group.id=material_class.group_id AND material_group.active=1 JOIN teachers material_teacher ON material_teacher.group_id=material_class.group_id AND material_teacher.name=material_class.teacher_name AND material_teacher.active=1 WHERE material_class.group_id=? AND material_class.id=? AND material_class.archived=0';
 if(context.subject!==undefined){sql+=' AND material_class.subject=?';values.push(context.subject);}sql+=')';
 if(folder){sql+=' AND ('+folder.sql+') AND EXISTS(SELECT 1 FROM classroom_folders material_folder WHERE material_folder.group_id=? AND material_folder.classroom_id=? AND material_folder.id=?)';values.push(...folder.args,actor.groupId,context.classroomId,context.folderId);}
 return{sql,values};
}
export function materialContextGuard(actor:Account,context:MaterialContext){
 const session=accountSessionPredicate(actor),values:unknown[]=[actor.id,actor.groupId,actor.role,actor.teacherName??null,actor.studentName??null,...session.args,actor.groupId,context.classroomId];
 let sql='EXISTS(SELECT 1 FROM accounts material_actor JOIN tuition_groups material_group ON material_group.id=material_actor.group_id AND material_group.active=1 WHERE material_actor.id=? AND material_actor.group_id=? AND material_actor.role=? AND material_actor.teacher_name IS ? AND material_actor.student_name IS ? AND material_actor.disabled_at IS NULL AND NOT EXISTS(SELECT 1 FROM local_credentials credential WHERE credential.account_id=material_actor.id AND credential.must_change_password=1) AND ('+session.sql+')) AND EXISTS(SELECT 1 FROM classrooms material_class JOIN teachers material_teacher ON material_teacher.group_id=material_class.group_id AND material_teacher.name=material_class.teacher_name AND material_teacher.active=1 WHERE material_class.group_id=? AND material_class.id=? AND material_class.archived=0';
 if(actor.role==='teacher'){sql+=' AND material_class.teacher_name=?';values.push(actor.teacherName);}
 if(context.subject!==undefined){sql+=' AND material_class.subject=?';values.push(context.subject);}sql+=')';
 if(context.folderId){sql+=' AND EXISTS(SELECT 1 FROM classroom_folders material_folder WHERE material_folder.group_id=? AND material_folder.classroom_id=? AND material_folder.id=?)';values.push(actor.groupId,context.classroomId,context.folderId);}
 return{sql,values};
}
export async function requireMaterialCreateAuthority(actor:Account,context:MaterialContext){
 const predicate=actor.role==='admin'?adminMaterialCreateAuthority(actor,context):actor.role==='teacher'?materialContextGuard(actor,context):{sql:'0',values:[]};
 if(!await learningDb().prepare('SELECT 1 WHERE '+predicate.sql).bind(...predicate.values).first())throw new MaterialImportError('没有此班级的教学资料上传权限，或账号、班级与文件夹已改变');
 return predicate;
}

/** Class teachers may read administrator-published materials, without adopting ownership. */
export function teacherAdminMaterialRead(actor:Account,alias='m'){
 if(!/^[a-z_]+$/.test(alias)||actor.role!=='teacher'||!actor.teacherName)return{sql:'0',values:[] as unknown[]};
 const session=accountSessionPredicate(actor,false),identity="EXISTS(SELECT 1 FROM accounts reading_teacher JOIN tuition_groups reading_group ON reading_group.id=reading_teacher.group_id AND reading_group.active=1 WHERE reading_teacher.id=? AND reading_teacher.group_id=? AND reading_teacher.role=\'teacher\' AND reading_teacher.teacher_name=? AND reading_teacher.disabled_at IS NULL AND NOT EXISTS(SELECT 1 FROM local_credentials credential WHERE credential.account_id=reading_teacher.id AND credential.must_change_password=1) AND ("+session.sql+"))";
 return{sql:"("+identity+") AND EXISTS(SELECT 1 FROM accounts material_publisher JOIN classrooms shared_class ON shared_class.id="+alias+".classroom_id AND shared_class.group_id="+alias+".group_id JOIN teachers shared_teacher ON shared_teacher.group_id=shared_class.group_id AND shared_teacher.name=shared_class.teacher_name AND shared_teacher.active=1 WHERE material_publisher.id="+alias+".owner_id AND material_publisher.role='admin' AND shared_class.teacher_name=? AND shared_class.archived=0)",values:[actor.id,actor.groupId,actor.teacherName,...session.args,actor.teacherName]};
}
