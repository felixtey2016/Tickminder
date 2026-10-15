import { env } from "cloudflare:workers";
import { learningDb } from "@/lib/learning-server";
import { pdfBucket } from "@/lib/pdf-storage";

const baseTables = [
  "accounts", "assignments", "audit", "lessons", "local_credentials",
  "login_attempts", "plans", "reschedule_requests", "sessions", "students", "teachers",
  "pdf_files", "storage_quota", "teaching_materials", "material_recipients",
  "homework", "homework_recipients", "homework_submissions", "study_blocks",
] as const;
const classroomTables = ["classrooms", "classroom_members", "classroom_announcements"] as const;
const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

async function authorized(request: Request): Promise<boolean> {
  const configured = env.BACKUP_EXPORT_TOKEN;
  const supplied = request.headers.get("Authorization");
  if (!configured || configured.length < 32 || !supplied?.startsWith("Bearer ")) return false;
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(configured), digest(supplied.slice(7))]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return new Response(null, { status: 404, headers: noStore });
  try {
    const db = learningDb();
    const url = new URL(request.url);
    const imageId = url.searchParams.get("image");
    if (imageId !== null) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(imageId)) return new Response(null, { status: 400, headers: noStore });
      const image = await db.prepare("SELECT object_key AS objectKey, mime, bytes FROM quiz_images WHERE id=? AND status='ready'")
        .bind(imageId).first<{ objectKey: string; mime: string; bytes: number }>();
      if (!image) return new Response(null, { status: 404, headers: noStore });
      const object = await pdfBucket().get(image.objectKey);
      if (!object || object.size !== image.bytes) return new Response(null, { status: 503, headers: noStore });
      return new Response(object.body, { headers: { ...noStore, "Content-Type": image.mime,
        "Content-Disposition": "attachment; filename=backup.image", "Content-Length": String(object.size) } });
    }
    const fileId = url.searchParams.get("file");
    if (fileId !== null) {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(fileId)) return new Response(null, { status: 400, headers: noStore });
      const file = await db.prepare("SELECT object_key AS objectKey, bytes FROM pdf_files WHERE id = ?")
        .bind(fileId).first<{ objectKey: string; bytes: number }>();
      if (!file) return new Response(null, { status: 404, headers: noStore });
      const object = await pdfBucket().get(file.objectKey);
      if (!object) return new Response(null, { status: 503, headers: noStore });
      return new Response(object.body, { headers: {
        ...noStore, "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=backup.pdf",
        "Content-Length": String(object.size),
      } });
    }
    const hasClassrooms = await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'classrooms'").first();
    const hasIdentities = await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'google_identities'").first();
    const hasTerms = await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'academic_terms'").first();
    const hasNotifications = await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'notification_items'").first();
    const hasInbox = hasNotifications && await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'site_notifications'").first();
    const hasGroups=await db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='tuition_groups'").first();
    const folderTables=await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('classroom_folders','classroom_content_state')").first<{count:number}>();
    if(folderTables?.count===1)throw new Error("Incomplete folder schema");
    const hasFolders=folderTables?.count===2;
    const versionTables=await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('learning_versions','homework_score_history')").first<{count:number}>();
    if(versionTables?.count===1)throw new Error("Incomplete learning history schema");
    const hasVersions=versionTables?.count===2;
    const names = hasClassrooms ? [...baseTables, ...classroomTables] : [...baseTables];
    if (hasIdentities) (names as string[]).push("google_identities");
    if (hasTerms) (names as string[]).push("academic_terms");
    if (hasNotifications) (names as string[]).push("notification_items","notification_deliveries","push_subscriptions","notification_runtime");
    if (hasInbox) (names as string[]).push("site_notifications");
    if(hasGroups)(names as string[]).unshift("tuition_groups");
    if(hasFolders)(names as string[]).push("classroom_folders","classroom_content_state");
    if(hasVersions)(names as string[]).push("learning_versions","homework_score_history");
    const reviewTables=await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('homework_feedback','homework_resubmission_grants','learning_notifications','learning_notification_deliveries')").first<{count:number}>();
    if(reviewTables?.count&&reviewTables.count!==4)throw new Error("Incomplete homework review schema");
    const hasReview=reviewTables?.count===4;
    if(hasReview)(names as string[]).push("homework_resubmission_grants","homework_feedback","learning_notifications","learning_notification_deliveries");
    const sessionTables=await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('class_sessions','class_session_participants')").first<{count:number}>();
    if(sessionTables?.count&&sessionTables.count!==2)throw new Error("Incomplete class session schema");
    const hasClassSessions=sessionTables?.count===2;
    if(hasClassSessions)(names as string[]).push("class_sessions","class_session_participants");
    const quizTables=await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('quizzes','quiz_versions','quiz_answer_keys','quiz_images','quiz_version_images')").first<{count:number}>();
    if(quizTables?.count&&quizTables.count!==5)throw new Error("Incomplete quiz schema");
    const hasQuizzes=quizTables?.count===5;
    if(hasQuizzes)(names as string[]).push("quizzes","quiz_versions","quiz_answer_keys","quiz_images","quiz_version_images");
    const practiceTables=await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('quiz_practice_assignments','quiz_practice_recipients','quiz_practice_attempts','quiz_practice_operations')").first<{count:number}>();
    if(practiceTables?.count&&practiceTables.count!==4)throw new Error("Incomplete quiz practice schema");
    const hasPractice=practiceTables?.count===4;
    if(hasPractice)(names as string[]).push("quiz_practice_assignments","quiz_practice_recipients","quiz_practice_attempts","quiz_practice_operations");
    const formalTables=await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('quiz_practice_events','quiz_assignment_notifications')").first<{count:number}>();
    if(formalTables?.count&&formalTables.count!==2)throw new Error("Incomplete formal quiz schema");
    const hasFormalPractice=formalTables?.count===2;
    if(hasFormalPractice&&!hasPractice)throw new Error("Formal quiz schema lacks practice tables");
    if(hasFormalPractice)(names as string[]).push("quiz_practice_events","quiz_assignment_notifications");
    const tables: Record<string, { columns: string[]; rows: Record<string, unknown>[] }> = {};
    for (const name of names) {
      const info = await db.prepare(`PRAGMA table_info("${name}")`).all<{ name: string }>();
      const columns = info.results.map((column) => column.name);
      if (columns.length === 0) throw new Error(`Missing table ${name}`);
      tables[name] = { columns, rows: [] };
    }
    const contents=await db.batch<Record<string,unknown>>(names.map(name=>db.prepare(`SELECT * FROM "${name}"`)));
    names.forEach((name,index)=>{tables[name].rows=contents[index].results;});
    return Response.json({ format: hasFormalPractice ? "timelyo-d1-v17" : hasPractice ? "timelyo-d1-v16" : hasQuizzes ? "timelyo-d1-v15" : hasClassSessions&&tables.class_sessions.columns.includes("teaching_status") ? "timelyo-d1-v14" : hasClassSessions ? "timelyo-d1-v13" : hasReview ? "timelyo-d1-v12" : hasVersions ? "timelyo-d1-v11" : hasFolders ? "timelyo-d1-v10" : hasGroups ? "timelyo-d1-v9" : hasInbox ? "timelyo-d1-v8" : hasNotifications ? "timelyo-d1-v7" : tables.accounts.columns.includes("pending_expires_at") ? "timelyo-d1-v6" : tables.reschedule_requests.columns.includes("requested_role") ? "timelyo-d1-v5" : hasTerms ? "timelyo-d1-v4" : hasIdentities ? "timelyo-d1-v3" : hasClassrooms ? "timelyo-d1-v2" : "timelyo-d1-v1", tables }, { headers: noStore });
  } catch {
    return Response.json({ error: "Backup export unavailable" }, { status: 503, headers: noStore });
  }
}
