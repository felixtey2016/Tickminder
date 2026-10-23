import { env } from "cloudflare:workers";
import { learningDb } from "@/lib/learning-server";
import { pdfBucket } from "@/lib/pdf-storage";
import {EXTERNAL_BOT_TABLES,externalSchemaPlan,type ExternalSchemaObject} from '@/lib/backup-external-schema';

const baseTables = [
  "accounts", "assignments", "audit", "lessons", "local_credentials",
  "login_attempts", "plans", "reschedule_requests", "sessions", "students", "teachers",
  "pdf_files", "storage_quota", "teaching_materials", "material_recipients",
  "homework", "homework_recipients", "homework_submissions", "study_blocks",
] as const;
const classroomTables = ["classrooms", "classroom_members", "classroom_announcements"] as const;
const billingTables = ["billing_students", "billing_subjects", "billing_policies", "billing_policy_versions", "billing_rates", "billing_rate_versions", "billing_operations", "billing_adjustments"] as const;
const invoiceTables = ["invoice_brand_assets","invoice_brand_settings","invoices","invoice_items","invoice_operations","invoice_sequences","invoice_source_locks"];
const recordingContactTables = ["whatsapp_contacts","whatsapp_challenges","whatsapp_contact_requests","class_recordings","recording_recipients","recording_operations"] as const;
const quizUpgradeTables = ["quiz_publications","quiz_publication_reports","quiz_publication_appeals","quiz_moderation_events","quiz_moderation_operations","quiz_question_sources"] as const;
const invoiceFinanceTables = ["invoice_finance_accounts","invoice_finance_operations","invoice_payments","invoice_receipt_sequences","invoice_receipts","invoice_finance_events","invoice_attendance_corrections"] as const;
const financeRound2Tables = ["payroll_teachers","payroll_rate_scopes","payroll_rate_versions","payroll_runs","payroll_operations","payroll_events","finance_expense_operations","finance_expenses","finance_expense_events"] as const;
const classPayrollTables = ["payroll_legacy_rate_links","payroll_monthly_reviews","payroll_deleted_drafts"] as const;
const prepaymentTables = ['prepayment_accounts','prepayment_operations','prepayment_sequences','prepayment_requests','prepayment_payments','prepayment_receipts','prepayment_allocations','prepayment_events','prepayment_collection_settings'] as const;
const parentTables=['parent_operations','parent_child_links','parent_link_events'] as const;
const parentFinancialTables=['parent_financial_operations','parent_financial_access','parent_financial_events'] as const;
const parentNotificationTables=['parent_notifications','parent_notification_deliveries','parent_notification_runtime'] as const;
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
    const logoId=url.searchParams.get('logo');
    if(logoId!==null){
      if(!/^[a-zA-Z0-9_-]{1,128}$/.test(logoId))return new Response(null,{status:400,headers:noStore});
      const logo=await db.prepare('SELECT object_key AS objectKey,bytes FROM invoice_brand_assets WHERE id=?').bind(logoId).first<{objectKey:string;bytes:number}>();
      if(!logo)return new Response(null,{status:404,headers:noStore});
      const object=await pdfBucket().get(logo.objectKey);if(!object||object.size!==logo.bytes)return new Response(null,{status:503,headers:noStore});
      return new Response(object.body,{headers:{...noStore,'Content-Type':'image/png','Content-Disposition':'attachment; filename=invoice-logo.png','Content-Length':String(object.size)}});
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
    const academicTables=await db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('academic_catalogues','student_grade_promotions')").first<{count:number}>();
    if(academicTables?.count&&academicTables.count!==2)throw new Error("Incomplete academic catalogue schema");
    const hasAcademicCatalogues=academicTables?.count===2;
    if(hasAcademicCatalogues){
      const scopes=await db.prepare("SELECT scope FROM academic_catalogues ORDER BY scope").all<{scope:string}>();
      if(scopes.results.map(row=>row.scope).join(',')!=='quiz,student')throw new Error("Incomplete academic catalogue settings");
      (names as string[]).unshift("academic_catalogues");
      (names as string[]).push("student_grade_promotions");
    }
    const billingSchema=await db.prepare(`SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN (${billingTables.map(()=>'?').join(',')})`).bind(...billingTables).first<{count:number}>();
    if(billingSchema?.count&&billingSchema.count!==billingTables.length)throw new Error("Incomplete billing schema");
    const hasBilling=billingSchema?.count===billingTables.length;
    if(hasBilling){
      if(!hasAcademicCatalogues||!hasClassSessions||!hasPractice||!hasFormalPractice||!hasQuizzes||!hasVersions||!hasFolders||!hasGroups||!hasReview)throw new Error("Billing schema lacks required teaching tables");
      (names as string[]).push(...billingTables);
    }
    const hasAdminPermissions=Boolean(await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='admin_permission_profiles'").first());
    if(hasAdminPermissions){
      if(!hasBilling)throw new Error("Administrator permission schema lacks required foundation tables");
      (names as string[]).push('admin_permission_profiles');
    }
    const invoiceSchema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+invoiceTables.map(()=>'?').join(',')+")").bind(...invoiceTables).first<{n:number}>();
    if(invoiceSchema?.n&&invoiceSchema.n!==invoiceTables.length)throw new Error('Incomplete invoice schema');
    const hasInvoices=invoiceSchema?.n===invoiceTables.length;
    if(hasInvoices){if(!hasAdminPermissions)throw new Error('Invoice foundation missing');(names as string[]).push(...invoiceTables);}
    const recordingContactSchema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+recordingContactTables.map(()=>'?').join(',')+")").bind(...recordingContactTables).first<{n:number}>();
    if(recordingContactSchema?.n&&recordingContactSchema.n!==recordingContactTables.length)throw new Error('Incomplete recordings or WhatsApp schema');
    const hasRecordingsAndContacts=recordingContactSchema?.n===recordingContactTables.length;
    if(hasRecordingsAndContacts){if(!hasInvoices)throw new Error('Recordings foundation missing');(names as string[]).push(...recordingContactTables);}
    const quizUpgradeSchema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+quizUpgradeTables.map(()=>'?').join(',')+")").bind(...quizUpgradeTables).first<{n:number}>();
    if(quizUpgradeSchema?.n&&quizUpgradeSchema.n!==quizUpgradeTables.length)throw new Error('Incomplete quiz library upgrade schema');
    const hasQuizUpgrade=quizUpgradeSchema?.n===quizUpgradeTables.length;
    if(hasQuizUpgrade){if(!hasRecordingsAndContacts)throw new Error('Quiz library upgrade foundation missing');(names as string[]).push(...quizUpgradeTables);}
    const financeSchema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+invoiceFinanceTables.map(()=>'?').join(',')+")").bind(...invoiceFinanceTables).first<{n:number}>();
    if(financeSchema?.n&&financeSchema.n!==invoiceFinanceTables.length)throw new Error('Incomplete invoice finance schema');
    const hasInvoiceFinance=financeSchema?.n===invoiceFinanceTables.length;
    if(hasInvoiceFinance){if(!hasQuizUpgrade||!hasInvoices)throw new Error('Invoice finance foundation missing');(names as string[]).push(...invoiceFinanceTables);}
    const round2Schema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+financeRound2Tables.map(()=>'?').join(',')+")").bind(...financeRound2Tables).first<{n:number}>();
    if(round2Schema?.n&&round2Schema.n!==financeRound2Tables.length)throw new Error('Incomplete teacher pay or expense schema');
    const hasFinanceRound2=round2Schema?.n===financeRound2Tables.length;
    if(hasFinanceRound2){if(!hasInvoiceFinance)throw new Error('Teacher pay and expense foundation missing');(names as string[]).push(...financeRound2Tables);}
    const classPayrollSchema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+classPayrollTables.map(()=>'?').join(',')+")").bind(...classPayrollTables).first<{n:number}>();
    if(classPayrollSchema?.n&&classPayrollSchema.n!==classPayrollTables.length)throw new Error('Incomplete classroom payroll schema');
    const hasClassPayroll=classPayrollSchema?.n===classPayrollTables.length;
    const payrollRateColumns=hasFinanceRound2?(await db.prepare('PRAGMA table_info(payroll_rate_versions)').all<{name:string}>()).results.map(item=>item.name):[];
    if(hasClassPayroll!==payrollRateColumns.includes('mode'))throw new Error('Classroom payroll rate schema mismatch');
    if(hasClassPayroll){if(!hasFinanceRound2)throw new Error('Classroom payroll foundation missing');(names as string[]).push(...classPayrollTables);}
    const prepaymentSchema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+prepaymentTables.map(()=>'?').join(',')+")").bind(...prepaymentTables).first<{n:number}>();
    if(prepaymentSchema?.n&&prepaymentSchema.n!==prepaymentTables.length)throw new Error('Incomplete prepayment schema');
    const hasPrepayments=prepaymentSchema?.n===prepaymentTables.length;
    const invoiceAccountColumns=hasInvoiceFinance?(await db.prepare('PRAGMA table_info(invoice_finance_accounts)').all<{name:string}>()).results.map(item=>item.name):[];
    if(hasPrepayments!==invoiceAccountColumns.includes('prepayment_cents'))throw new Error('Prepayment invoice schema mismatch');
    if(hasPrepayments){if(!hasClassPayroll)throw new Error('Prepayment foundation missing');(names as string[]).push(...prepaymentTables);}
    const parentSchema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+parentTables.map(()=>'?').join(',')+")").bind(...parentTables).first<{n:number}>();
    if(parentSchema?.n&&parentSchema.n!==parentTables.length)throw new Error('Incomplete parent account schema');
    const hasParents=parentSchema?.n===parentTables.length;
    if(hasParents){if(!hasPrepayments)throw new Error('Parent account foundation missing');(names as string[]).push(...parentTables);}
    const parentFinancialSchema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+parentFinancialTables.map(()=>'?').join(',')+")").bind(...parentFinancialTables).first<{n:number}>();
    if(parentFinancialSchema?.n&&parentFinancialSchema.n!==parentFinancialTables.length)throw new Error('Incomplete parent financial authorization schema');
    const hasParentFinancialAccess=parentFinancialSchema?.n===parentFinancialTables.length;
    if(hasParentFinancialAccess){if(!hasParents)throw new Error('Parent financial authorization foundation missing');(names as string[]).push(...parentFinancialTables);}
    const parentNotificationSchema=await db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ("+parentNotificationTables.map(()=>'?').join(',')+")").bind(...parentNotificationTables).first<{n:number}>();
    if(parentNotificationSchema?.n&&parentNotificationSchema.n!==parentNotificationTables.length)throw new Error('Incomplete parent notification schema');
    const hasParentNotifications=parentNotificationSchema?.n===parentNotificationTables.length;
    if(hasParentNotifications){if(!hasParentFinancialAccess)throw new Error('Parent notification foundation missing');(names as string[]).push(...parentNotificationTables);}
    const externalSchema=(await db.prepare("SELECT name,type,sql FROM sqlite_master WHERE tbl_name IN ("+EXTERNAL_BOT_TABLES.map(()=>'?').join(',')+") AND sql IS NOT NULL ORDER BY type,name").bind(...EXTERNAL_BOT_TABLES).all<ExternalSchemaObject>()).results||[];
    const externalNames=externalSchema.filter(item=>item.type==='table').map(item=>item.name);
    const externalHashes=Object.fromEntries(await Promise.all(externalSchema.map(async item=>[item.name,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(item.sql))),b=>b.toString(16).padStart(2,'0')).join('')])));
    const external=externalSchemaPlan(externalNames,externalSchema,externalHashes);
    if(external.names.length){if(!hasRecordingsAndContacts)throw new Error('External Bot backup requires v23');(names as string[]).push(...external.names);}
    const tables: Record<string, { columns: string[]; rows: Record<string, unknown>[] }> = {};
    for (const name of names) {
      const info = await db.prepare(`PRAGMA table_info("${name}")`).all<{ name: string }>();
      const columns = info.results.map((column) => column.name);
      if (columns.length === 0) throw new Error(`Missing table ${name}`);
      tables[name] = { columns, rows: [] };
    }
    if(hasBilling&&!tables.quiz_practice_attempts.columns.includes("discarded_at"))throw new Error("Billing schema lacks required practice history");
    if(hasQuizUpgrade&&!tables.quizzes.columns.includes('public_blocked_at'))throw new Error('Quiz library upgrade lacks moderation state');
    const contents=await db.batch<Record<string,unknown>>(names.map(name=>db.prepare(`SELECT * FROM "${name}"`)));
    names.forEach((name,index)=>{tables[name].rows=contents[index].results;});
    return Response.json({ format: hasParentNotifications ? "timelyo-d1-v31" : hasParentFinancialAccess ? "timelyo-d1-v30" : hasParents ? "timelyo-d1-v29" : hasPrepayments ? "timelyo-d1-v28" : hasClassPayroll ? "timelyo-d1-v27" : hasFinanceRound2 ? "timelyo-d1-v26" : hasInvoiceFinance ? "timelyo-d1-v25" : hasQuizUpgrade ? "timelyo-d1-v24" : hasRecordingsAndContacts ? "timelyo-d1-v23" : hasInvoices ? "timelyo-d1-v22" : hasAdminPermissions ? "timelyo-d1-v21" : hasBilling ? "timelyo-d1-v20" : hasAcademicCatalogues && tables.quiz_practice_attempts.columns.includes("discarded_at") ? "timelyo-d1-v19" : hasAcademicCatalogues ? "timelyo-d1-v18" : hasFormalPractice ? "timelyo-d1-v17" : hasPractice ? "timelyo-d1-v16" : hasQuizzes ? "timelyo-d1-v15" : hasClassSessions&&tables.class_sessions.columns.includes("teaching_status") ? "timelyo-d1-v14" : hasClassSessions ? "timelyo-d1-v13" : hasReview ? "timelyo-d1-v12" : hasVersions ? "timelyo-d1-v11" : hasFolders ? "timelyo-d1-v10" : hasGroups ? "timelyo-d1-v9" : hasInbox ? "timelyo-d1-v8" : hasNotifications ? "timelyo-d1-v7" : tables.accounts.columns.includes("pending_expires_at") ? "timelyo-d1-v6" : tables.reschedule_requests.columns.includes("requested_role") ? "timelyo-d1-v5" : hasTerms ? "timelyo-d1-v4" : hasIdentities ? "timelyo-d1-v3" : hasClassrooms ? "timelyo-d1-v2" : "timelyo-d1-v1", tables,...external.names.length?{externalSchema}:{} }, { headers: noStore });
  } catch {
    return Response.json({ error: "Backup export unavailable" }, { status: 503, headers: noStore });
  }
}
