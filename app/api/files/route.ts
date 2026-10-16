import {groupReader,requireGroup} from "@/lib/group-data";
import { NextResponse } from "next/server";
import { currentBusinessAccount as currentAccount } from "@/lib/auth";
import { first, learningDb, studentHasHomework } from "@/lib/learning-server";
import { pdfSignatureValid } from "@/lib/learning";
import { cleanOldStagedFiles, pdfBucket, pdfLimits } from "@/lib/pdf-storage";
import {activeResubmissionGrant} from "@/lib/homework-review";
import {operationId} from "@/lib/learning-operations";
import {contentRecord,LearningEditError} from "@/lib/learning-versions";
import { classroomMayManage } from "@/lib/classrooms-server";
import { pdfUploadAuthority } from "@/lib/pdf-upload-access";

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  if (new URL(request.url).origin !== request.headers.get("origin")) return errorResponse("Origin mismatch", 403);
  const actor = await currentAccount();
  if (!actor || !["teacher", "student"].includes(actor.role)) return errorResponse("没有上传权限", 403);
  const groupId=requireGroup(actor.groupId); const {first,rows}=groupReader(groupId);
  if (await first("SELECT 1 AS mustChange FROM local_credentials WHERE account_id = ? AND must_change_password = 1", actor.id)) return errorResponse("请先修改初始密码", 403);
  try {
    const bucket = pdfBucket();
    const limits = pdfLimits();
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > limits.perFile + 100_000) return errorResponse("PDF 超过单份大小限制", 413);
    const form = await request.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "");
    const contextId = String(form.get("homeworkId") || "");
    const classroomId = String(form.get("classroomId") || "").trim();
    const submissionId=String(form.get("submissionId")||"").trim(),uploadRequestId=form.get("requestId")?operationId(form.get("requestId")):null;
    if (!(file instanceof File) || file.type !== "application/pdf") return errorResponse("请选择 PDF 文件", 400);
    if (file.size <= 0 || file.size > limits.perFile) return errorResponse("PDF 超过单份大小限制", 413);
    if (actor.role === "teacher" && !["material", "homework","feedback"].includes(kind)) return errorResponse("老师只能上传教学资料、功课附件或批改 PDF", 403);
    if (actor.role === "teacher") {
      if (!classroomId) return errorResponse("请选择有效班级",400);
      const classroom=await classroomMayManage(actor,classroomId);
      if (!classroom || classroom.archived) return errorResponse("班级不存在、已封存或无权管理",403);
    }
    if(actor.role==="teacher"&&kind==="feedback"){
      const submitted=await first<{homeworkId:string}>("SELECT homework_id AS homeworkId FROM homework_submissions WHERE id=?",submissionId);
      if(!submitted)return errorResponse("提交记录不存在或无权访问",404);
      const task=await contentRecord(actor,"homework",submitted.homeworkId,true);
      if(task.classroomId!==classroomId)return errorResponse("批改 PDF 必须属于这份功课的班级",403);
    }
    if (actor.role === "student" && kind !== "submission") return errorResponse("当前登录的是学生账号，请切换到老师账号后上传功课附件", 403);
    if (actor.role === "student" && (!contextId || !await studentHasHomework(actor, contextId))) return errorResponse("只能上传自己功课的 PDF", 403);
    if (actor.role === "student") {
      const homework = await first<{ startsAt: string; dueAt: string }>("SELECT starts_at AS startsAt, due_at AS dueAt FROM homework WHERE id = ?", contextId);
      const submitted = await first("SELECT 1 AS found FROM homework_submissions WHERE homework_id = ? AND student_name = ?", contextId, actor.studentName);
      if (!homework || new Date().toISOString() < homework.startsAt) return errorResponse("开始时间尚未到，暂不能提交", 403);
      if (new Date().toISOString() > homework.dueAt && submitted && !await activeResubmissionGrant(actor,contextId)) return errorResponse("截止后需要老师授权才能重新提交",403);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!pdfSignatureValid(bytes)) return errorResponse("文件内容不是有效的 PDF", 400);
    const contentHash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
    const uploadContext=kind==="submission"?contextId:kind==="feedback"?submissionId:classroomId;
    if(uploadRequestId){const previous=await first<{id:string;filename:string;bytes:number;kind:string;contextId:string;sha256:string;status:string;objectKey:string}>("SELECT id,filename,bytes,kind,context_id AS contextId,sha256,status,object_key AS objectKey FROM pdf_files WHERE owner_id=? AND upload_request_id=?",actor.id,uploadRequestId);
      if(previous){if(previous.kind!==kind || previous.contextId!==uploadContext || previous.sha256!==contentHash)return errorResponse("重复上传的文件或对象不一致，请重新选择文件",409);
        if(!["staged","attached"].includes(previous.status)||!await bucket.head(previous.objectKey))return errorResponse("上传尚未完成或已失效，请稍后重试",409);
        return NextResponse.json({id:previous.id,filename:previous.filename,bytes:previous.bytes,replayed:true});}}
    await cleanOldStagedFiles();
    const db = learningDb();
    const authority = () => pdfUploadAuthority(actor,kind,{classroomId,homeworkId:contextId,submissionId});
    const guard = authority();
    await db.prepare("INSERT OR IGNORE INTO storage_quota (group_id,id, used_bytes) VALUES (?,1, 0)").bind(groupId).run();
    // Both resource families reserve against the same group limit. Quiz image
    // rows include in-flight uploads so concurrent PDF/image requests cannot
    // independently consume the final bytes of a group's allowance.
    const reserved = await db.prepare(`UPDATE storage_quota SET used_bytes = used_bytes + ? WHERE id = 1 AND group_id = ? AND used_bytes + ? + (SELECT coalesce(sum(bytes),0) FROM quiz_images WHERE group_id=?) <= ? AND ${guard.sql}`)
      .bind(file.size,groupId,file.size,groupId,limits.total,...guard.values).run();
    if (!reserved.meta.changes) {
      if (!await db.prepare(`SELECT 1 WHERE ${guard.sql}`).bind(...guard.values).first()) return errorResponse("账号或班级权限已改变，请刷新后重试",403);
      return errorResponse("PDF 储存总容量已满，请联系管理员", 409);
    }
    const id = crypto.randomUUID();
    const objectKey = `pdf/${crypto.randomUUID()}`;
    let inserted = false;
    try {
      const insertionGuard=authority();
      const saved=await db.prepare(`INSERT INTO pdf_files (group_id,id, object_key, owner_id, kind, context_id, filename, bytes, status, created_at,upload_request_id,sha256) SELECT ?,?, ?, ?, ?, ?, ?, ?, 'staged', ?,?,? WHERE ${insertionGuard.sql}`)
        .bind(groupId,id, objectKey, actor.id, kind, uploadContext,file.name.slice(0,180),file.size,new Date().toISOString(),uploadRequestId,contentHash,...insertionGuard.values).run();
      if(!saved.meta.changes)throw new LearningEditError("账号或班级权限已改变，请刷新后重试",403);
      inserted = true;
      await bucket.put(objectKey, bytes, { httpMetadata: { contentType: "application/pdf" } });
      const completionGuard=authority();
      if(!await db.prepare(`SELECT 1 WHERE ${completionGuard.sql}`).bind(...completionGuard.values).first())throw new LearningEditError("账号或班级权限已改变，请刷新后重试",403);
      return NextResponse.json({ id, filename: file.name, bytes: file.size });
    } catch (error) {
      let removed = false;
      try { await bucket.delete(objectKey); removed = true; } catch { /* Keep the staged row for later cleanup. */ }
      if (removed || !inserted) {
        if (inserted) await db.prepare("DELETE FROM pdf_files WHERE (id = ?) AND group_id = ?").bind(id,groupId).run();
        await db.prepare("UPDATE storage_quota SET used_bytes = max(0, used_bytes - ?) WHERE (id = 1) AND group_id = ?").bind(file.size,groupId).run();
      }
      throw error;
    }
  } catch (error) {
    if(error instanceof LearningEditError)return errorResponse(error.message,error.status);
    if(/UNIQUE constraint/.test(String(error)))return errorResponse("上传正在处理，请稍后重试",409);
    const message = error instanceof Error ? error.message : "";
    return errorResponse(/PDF storage|储存.*配置|storage.*configured/i.test(message) ? "PDF 储存暂未配置，请联系管理员" : "PDF 上传失败，请稍后重试", 503);
  }
}
