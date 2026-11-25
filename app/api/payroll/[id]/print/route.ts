import {currentBusinessAccount} from '@/lib/auth';
import {PayrollError} from '@/lib/payroll';
import {payrollPayslip} from '@/lib/payroll-server';
import {isPayslipTemplate, renderPayrollPayslip} from '@/lib/payroll-payslip';
import {pdfBucket} from '@/lib/pdf-storage';
import {readTeacherBank, savedPayslipKey, teacherBankKey} from '@/lib/teacher-finance-storage';
import {MAX_PAYSLIP_BYTES} from '@/lib/private-payroll-objects';
import {createArchivedPayslip, MAX_PAYSLIP_PAGES, parsePayslipTextLayer, payslipDisposition, payslipFileName} from '@/lib/payroll-pdf';

const headers = {
 'Cache-Control': 'private, no-store',
 'Vary': 'Cookie, x-tickminder-group',
 'X-Content-Type-Options': 'nosniff',
 'Referrer-Policy': 'no-referrer',
 'X-Robots-Tag': 'noindex',
 'Cross-Origin-Resource-Policy': 'same-origin',
};
const json = (body: unknown, status = 200) => Response.json(body, {status, headers});
type Payslip = Awaited<ReturnType<typeof payrollPayslip>>;
type Context = {params: Promise<{id: string}>};

async function bankKey(document: Payslip) {
 return document.teacherCreatedAt
  ? teacherBankKey(document.payroll.groupId, document.teacherName, document.teacherCreatedAt)
  : null;
}

export async function GET(request: Request, context: Context) {
 const actor = await currentBusinessAccount();
 if (!actor) return json({error:'请先登录'}, 401);
 try {
  const {id} = await context.params;
  const query = new URL(request.url).searchParams;
  const language = query.get('lang') === 'zh' ? 'zh' : 'en';
  const document = await payrollPayslip(actor, id);
  const key = savedPayslipKey(document.payroll.groupId, document.payroll.id);
  const existing = await pdfBucket().get(key);
  if (existing) {
   const fileName = payslipFileName(document.payroll.teacherName, document.payroll.month);
   return new Response(existing.body, {headers: {
    ...headers,
    'Content-Type': 'application/pdf',
    'Content-Length': String(existing.size),
    'Content-Disposition': payslipDisposition(fileName, query.get('download') === '1'),
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
   }});
  }
  const profileKey = await bankKey(document);
  const profile = profileKey ? await readTeacherBank(profileKey) : {bank: null, version: null};
  const nonce = crypto.randomUUID().replaceAll('-', '');
  return new Response(renderPayrollPayslip(document, language, nonce, {
   bank: profile.bank,
   bankVersion: profile.version,
   revision: document.revision,
   canArchive: document.canArchive,
  }), {headers:{
   ...headers,
   'Content-Type': 'text/html; charset=utf-8',
   'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  }});
 } catch (error) {
  if (error instanceof PayrollError) return json({error:error.message}, error.status);
  return json({error:'薪资单暂时无法生成，请稍后重试'}, 503);
 }
}

async function readArchiveForm(request: Request) {
 const maximum = MAX_PAYSLIP_BYTES + 48 * 1024;
 const contentType = request.headers.get('content-type') || '';
 if (!/^multipart\/form-data; *boundary=[-\w]{1,70}$/i.test(contentType) || !request.body) {
  throw new PayrollError('薪资单请求格式无效', 400);
 }
 if (Number(request.headers.get('content-length') || 0) > maximum) throw new PayrollError('薪资单超出文件大小上限', 413);
 const reader = request.body.getReader();
 const chunks: Uint8Array[] = [];
 let length = 0;
 while (true) {
  const {done, value} = await reader.read();
  if (done) break;
  length += value.byteLength;
  if (length > maximum) {
   await reader.cancel();
   throw new PayrollError('薪资单超出文件大小上限', 413);
  }
  chunks.push(value);
 }
 const body = new Uint8Array(length);
 let offset = 0;
 for (const chunk of chunks) {
  body.set(chunk, offset);
  offset += chunk.byteLength;
 }
 try {
  return await new Response(body, {headers: {'Content-Type': contentType}}).formData();
 } catch {
  throw new PayrollError('薪资单请求格式无效', 400);
 }
}

export async function POST(request: Request, context: Context) {
 if (request.headers.get('origin') !== new URL(request.url).origin) return json({error: '没有权限执行此操作'}, 403);
 const actor = await currentBusinessAccount();
 if (!actor) return json({error: '请先登录'}, 401);
 try {
  const {id} = await context.params;
  const document = await payrollPayslip(actor, id);
  if (!document.canArchive) return json({error: '没有权限存档薪资单'}, 403);
  const bucket = pdfBucket();
  const key = savedPayslipKey(document.payroll.groupId, document.payroll.id);
  if (await bucket.head(key)) return json({ok: true});
  const form = await readArchiveForm(request);
  const textLayer = form.get('textLayer');
  if (textLayer === null) return json({error: '薪资单预览已更新，请重新打开'}, 409);
  if (form.get('revision') !== String(document.revision)) return json({error: '薪资记录已更新，请重新打开预览'}, 409);
  if (!isPayslipTemplate(form.get('template'))) return json({error: '请选择有效排版'}, 400);
  const profileKey = await bankKey(document);
  const profile = profileKey ? await readTeacherBank(profileKey) : null;
  if ((profile?.version || '') !== form.get('bankVersion')) return json({error: '老师的收款户口已更新，请重新打开预览'}, 409);
  const files = form.getAll('page');
  if (!files.length || files.length > MAX_PAYSLIP_PAGES ||
      files.some(file => typeof file === 'string' || file.type !== 'image/jpeg')) {
   return json({error: '薪资单页面格式无效，请重新打开预览'}, 400);
  }
  const layer = parsePayslipTextLayer(textLayer, files.length, profile?.bank?.accountNumber);
  // Recheck the payroll revision and session after the upload before storing.
  const current = await payrollPayslip(actor, id);
  if (!current.canArchive) return json({error: '没有权限存档薪资单'}, 403);
  if (current.revision !== document.revision) return json({error: '薪资记录已更新，请重新打开预览'}, 409);
  const pages = await Promise.all((files as File[]).map(async file => new Uint8Array(await file.arrayBuffer())));
  const pdf = createArchivedPayslip(pages, layer);
  if (pdf.byteLength > MAX_PAYSLIP_BYTES) return json({error: '薪资单超出文件大小上限'}, 413);
  // A retry or concurrent request cannot replace the first saved document.
  await bucket.put(key, pdf, {
   onlyIf: {etagDoesNotMatch: '*'},
   httpMetadata: {contentType: 'application/pdf', cacheControl: 'private, no-store'},
  });
  return json({ok: true});
 } catch (error) {
  if (error instanceof PayrollError) return json({error: error.message}, error.status);
  return json({error: '薪资单暂时无法存档，请稍后重试'}, 503);
 }
}
