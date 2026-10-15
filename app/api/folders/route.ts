import { NextResponse } from "next/server";
import { currentBusinessAccount } from "@/lib/auth";
import { requireGroup,groupReader } from "@/lib/group-data";
import { classroomMayRead,classroomMayManage,activeClassroomMemberNames } from "@/lib/classrooms-server";
import { learningDb,change } from "@/lib/learning-server";
import { deleteUnreferencedFile } from "@/lib/pdf-storage";
import { FolderError,folderTree,folderRevision,folderDescendants,validateFolderPosition,folderName,validateContentFolder } from "@/lib/folders-server";
import {readAcademicCatalogue} from "@/lib/academic-catalogue-server";
import {findCatalogueSubject,findCatalogueSyllabus} from "@/lib/academic-catalogue";

const str=(value:unknown)=>typeof value==="string"?value.trim():"";
function failure(error:unknown) {
  if(error instanceof FolderError) return NextResponse.json({error:error.message},{status:error.status});
  if(/UNIQUE constraint/.test(String(error))) return NextResponse.json({error:"同一位置已有这个名称的文件夹"},{status:409});
  if(/folder cycle|invalid .*folder/.test(String(error))) return NextResponse.json({error:"文件夹结构已改变，请刷新后重试"},{status:409});
  return NextResponse.json({error:"文件夹操作失败，请稍后重试"},{status:500});
}
export async function GET(request:Request) {
  try {
    const actor=await currentBusinessAccount();
    if(!actor) throw new FolderError("请先登录",401);
    const groupId=requireGroup(actor.groupId),classroomId=new URL(request.url).searchParams.get("classroomId") || "";
    if(!await classroomMayRead(actor,classroomId)) throw new FolderError("班级不存在或无权访问",403);
    const [folders,revision]=await Promise.all([folderTree(groupId,classroomId),folderRevision(groupId,classroomId)]);
    return NextResponse.json({folders,revision},{headers:{"cache-control":"no-store"}});
  } catch(error) { return failure(error); }
}
export async function POST(request:Request) {
  if(new URL(request.url).origin!==request.headers.get("origin")) return NextResponse.json({error:"Origin mismatch"},{status:403});
  try {
    const actor=await currentBusinessAccount();
    if(!actor || !["teacher","admin"].includes(actor.role)) throw new FolderError("没有操作权限",403);
    const groupId=requireGroup(actor.groupId),{first,rows}=groupReader(groupId);
    if(await first("SELECT 1 FROM local_credentials WHERE account_id=? AND must_change_password=1",actor.id)) throw new FolderError("请先修改初始密码",403);
    let data:Record<string,unknown>; try {data=await request.json();if(!data || typeof data!=="object" || Array.isArray(data))throw new Error();} catch {throw new FolderError("请求格式无效");}
    const classroomId=str(data.classroomId),action=str(data.action),id=str(data.id),db=learningDb();
    const classroom=await classroomMayManage(actor,classroomId);
    if(!classroom || classroom.archived) throw new FolderError("班级不存在、已封存或无权管理",403);
    const tree=await folderTree(groupId,classroomId),revision=await folderRevision(groupId,classroomId);
    const now=new Date().toISOString();
    const ensureRevision=()=>{if(data.revision!==revision) throw new FolderError("内容已改变，请刷新后重试",409);};
    const stateGuard="EXISTS(SELECT 1 FROM classroom_content_state WHERE classroom_id=? AND group_id=? AND revision=?) AND EXISTS(SELECT 1 FROM classrooms WHERE id=? AND group_id=? AND archived=0)";
    const guardArgs=[classroomId,groupId,revision,classroomId,groupId];
    if(action==="create" || action==="rename" || action==="move") {
      ensureRevision();
      const old=tree.find(f=>f.id===id);
      if(action!=="create" && !old) throw new FolderError("文件夹不存在或不属于这个班级",404);
      if(action==="create" && tree.length>=500) throw new FolderError("每个班级最多支持 500 个文件夹",409);
      const {name,key}=folderName(action==="move"?old!.name:data.name);
      const parentId=action==="rename"?old!.parentId:str(data.parentId)||null;
      validateFolderPosition(tree,action==="create"?"":id,parentId);
      const recordId=action==="create"?crypto.randomUUID():id;
      const result=action==="create" ? await db.prepare(`INSERT INTO classroom_folders(id,group_id,classroom_id,parent_id,name,name_key,created_by,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${stateGuard}`).bind(recordId,groupId,classroomId,parentId,name,key,actor.id,now,now,...guardArgs).run()
        : await db.prepare(`UPDATE classroom_folders SET parent_id=?,name=?,name_key=?,updated_at=? WHERE id=? AND group_id=? AND classroom_id=? AND ${stateGuard}`).bind(parentId,name,key,now,id,groupId,classroomId,...guardArgs).run();
      if(!result.meta.changes) throw new FolderError("内容已改变，请刷新后重试",409);
      await change(groupId,`folder:${action}`,actor.id,recordId,{classroomId,parentId,name});
      return NextResponse.json({ok:true,id:recordId});
    }
    if(action==="placeContent") {
      ensureRevision();
      const folderId=await validateContentFolder(groupId,classroomId,str(data.folderId));
      const kind=str(data.kind); if(!["material","homework"].includes(kind)) throw new FolderError("资料类型无效");
      const table=kind==="material"?"teaching_materials":"homework";
      const item=await first<{ownerId:string;classroomId:string|null;subject?:string}>(`SELECT owner_id AS ownerId,classroom_id AS classroomId${kind==="homework"?",subject":""} FROM ${table} WHERE id=?`,id);
      if(!item || (actor.role==="teacher" && item.ownerId!==actor.id)) throw new FolderError("内容不存在或无权修改",403);
      if(item.classroomId && item.classroomId!==classroomId) throw new FolderError("不能把资料或功课移到其他班级",403);
      if(!item.classroomId) {
        const owner=await first<{teacherName:string}>("SELECT teacher_name AS teacherName FROM accounts WHERE id=? AND role='teacher'",item.ownerId);
        const recipients=kind==="material"?await rows<{studentName:string;subject:string}>("SELECT student_name AS studentName,subject FROM material_recipients WHERE material_id=?",id):await rows<{studentName:string;subject:string}>("SELECT student_name AS studentName,? AS subject FROM homework_recipients WHERE homework_id=?",item.subject,id);
        const members=await activeClassroomMemberNames(classroomId,groupId);
        const catalogue=await readAcademicCatalogue('student'),profiles=await rows<{name:string;syllabusId:string}>('SELECT name,syllabus_id AS syllabusId FROM students');
        const sameSubject=(recipient:typeof recipients[number])=>{if(recipient.subject===classroom.subject)return true;const syllabus=findCatalogueSyllabus(catalogue,classroom.syllabusId||profiles.find(item=>item.name===recipient.studentName)?.syllabusId||'');const subjectId=syllabus&&findCatalogueSubject(syllabus,recipient.subject)?.id;return Boolean(subjectId&&subjectId===(classroom.subjectId||(syllabus&&findCatalogueSubject(syllabus,classroom.subject)?.id)));};
        if(owner?.teacherName!==classroom.teacherName || !recipients.length || recipients.some(r=>!sameSubject(r) || !members.includes(r.studentName))) throw new FolderError("班级老师、科目及有效成员必须匹配原分配对象；原提交和分数会保留",409);
      }
      // Keep the same record and recipient rows; moving does not republish or reset scores.
      const result=await db.prepare(`UPDATE ${table} SET classroom_id=?,folder_id=? WHERE id=? AND group_id=? AND ${stateGuard}`).bind(classroomId,folderId,id,groupId,...guardArgs).run();
      if(!result.meta.changes) throw new FolderError("内容已改变，请刷新后重试",409);
      await change(groupId,"folder:placeContent",actor.id,id,{classroomId,folderId,kind});
      return NextResponse.json({ok:true});
    }
    if(action==="previewDelete" || action==="delete") {
      const folder=tree.find(f=>f.id===id); if(!folder) throw new FolderError("文件夹不存在或不属于这个班级",404);
      const ids=folderDescendants(tree,id),marks="SELECT value FROM json_each(?)",folderList=JSON.stringify(ids);
      const materials=await rows<{id:string;fileId:string}>(`SELECT id,file_id AS fileId FROM teaching_materials WHERE classroom_id=? AND folder_id IN (${marks}) ORDER BY id`,classroomId,folderList);
      const homework=await rows<{id:string;fileId:string|null}>(`SELECT id,attachment_file_id AS fileId FROM homework WHERE classroom_id=? AND folder_id IN (${marks}) ORDER BY id`,classroomId,folderList);
      const hwIds=homework.map(h=>h.id),hwMarks="SELECT value FROM json_each(?)",hwList=JSON.stringify(hwIds);
      const submissions=await rows<{id:string;fileId:string}>(`SELECT id,file_id AS fileId FROM homework_submissions WHERE homework_id IN (${hwMarks}) ORDER BY id`,hwList);
      const scores=await rows<{id:string}>(`SELECT id FROM homework_recipients WHERE homework_id IN (${hwMarks}) AND score IS NOT NULL ORDER BY id`,hwList);
      const versionFiles=await rows<{id:string;fileId:string|null}>(`SELECT id,file_id AS fileId FROM learning_versions WHERE (kind='homework' AND record_id IN (${hwMarks})) OR (kind='material' AND record_id IN (SELECT value FROM json_each(?))) ORDER BY id`,hwList,JSON.stringify(materials.map(m=>m.id)));
      const scoreHistory=await rows<{id:string}>(`SELECT id FROM homework_score_history WHERE homework_id IN (${hwMarks}) ORDER BY id`,hwList);
      const feedback=await rows<{id:string;fileId:string|null}>(`SELECT id,file_id AS fileId FROM homework_feedback WHERE homework_id IN (${hwMarks}) ORDER BY id`,hwList);
      const grants=await rows<{id:string}>(`SELECT id FROM homework_resubmission_grants WHERE homework_id IN (${hwMarks}) ORDER BY id`,hwList);
      // Include current record IDs as well as revision, so legacy recipient edits cannot hide impact.
      const signature=JSON.stringify([actor.id,groupId,classroomId,id,revision,ids,materials,homework,submissions,scores,versionFiles,scoreHistory,feedback,grants]);
      const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(signature));
      const token=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
      const preview={name:folder.name,folders:ids.length-1,materials:materials.length,homework:homework.length,submissions:submissions.length,scores:scores.length,versions:versionFiles.length,scoreHistory:scoreHistory.length,feedback:feedback.length,grants:grants.length,revision,token};
      if(action==="previewDelete") return NextResponse.json({preview});
      ensureRevision();
      if(data.confirmed!==true || data.token!==token) throw new FolderError("删除范围已改变，请重新确认",409);
      const mutationId=crypto.randomUUID();
      const claim=db.prepare(`UPDATE classroom_content_state SET revision=revision+1,mutation_id=? WHERE classroom_id=? AND group_id=? AND revision=? AND EXISTS(SELECT 1 FROM classrooms WHERE id=? AND group_id=? AND archived=0)`).bind(mutationId,...guardArgs);
      const guard="EXISTS(SELECT 1 FROM classroom_content_state WHERE classroom_id=? AND group_id=? AND mutation_id=?)";
      const claimed=[classroomId,groupId,mutationId];
      const results=await db.batch([
        claim,
        db.prepare(`UPDATE study_blocks SET homework_id=NULL WHERE group_id=? AND homework_id IN (${hwMarks}) AND ${guard}`).bind(groupId,hwList,...claimed),
        db.prepare(`DELETE FROM homework_submissions WHERE group_id=? AND homework_id IN (${hwMarks}) AND ${guard}`).bind(groupId,hwList,...claimed),
        db.prepare(`DELETE FROM homework_recipients WHERE group_id=? AND homework_id IN (${hwMarks}) AND ${guard}`).bind(groupId,hwList,...claimed),
        db.prepare(`DELETE FROM homework WHERE group_id=? AND id IN (${hwMarks}) AND ${guard}`).bind(groupId,hwList,...claimed),
        db.prepare(`DELETE FROM material_recipients WHERE group_id=? AND material_id IN (SELECT id FROM teaching_materials WHERE group_id=? AND classroom_id=? AND folder_id IN (${marks})) AND ${guard}`).bind(groupId,groupId,classroomId,folderList,...claimed),
        db.prepare(`DELETE FROM teaching_materials WHERE group_id=? AND classroom_id=? AND folder_id IN (${marks}) AND ${guard}`).bind(groupId,classroomId,folderList,...claimed),
        db.prepare(`DELETE FROM classroom_folders WHERE group_id=? AND classroom_id=? AND id=? AND ${guard}`).bind(groupId,classroomId,id,...claimed),
      ]);
      if(!results[0].meta.changes) throw new FolderError("删除范围已改变，请重新确认",409);
      await change(groupId,"folder:delete",actor.id,id,{classroomId,...preview,token:undefined});
      let cleanupPending=false;
      for(const fileId of new Set([...materials.map(m=>m.fileId),...homework.map(h=>h.fileId),...submissions.map(s=>s.fileId),...versionFiles.map(v=>v.fileId),...feedback.map(f=>f.fileId)].filter((f):f is string=>Boolean(f)))) { try {await deleteUnreferencedFile(fileId);} catch {cleanupPending=true;} }
      return NextResponse.json({ok:true,warning:cleanupPending?"内容已删除；未引用的 PDF 清理将在后续上传时重试":undefined});
    }
    throw new FolderError("未知文件夹操作");
  } catch(error) {return failure(error);}
}
