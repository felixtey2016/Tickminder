import {currentBusinessAccount} from '@/lib/auth';
import {PayrollError} from '@/lib/payroll';
import {payrollBankTeacher} from '@/lib/payroll-server';
import {parseTeacherBank} from '@/lib/teacher-bank';
import {readTeacherBank, teacherBankKey, writeTeacherBank} from '@/lib/teacher-finance-storage';
import {MAX_BANK_BYTES} from '@/lib/private-payroll-objects';

const headers = {
  'Cache-Control': 'private, no-store',
  'Vary': 'Cookie, x-tickminder-group',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const json = (value: unknown, status = 200) => Response.json(value, {status, headers});
const failure = (error: unknown) => error instanceof PayrollError
  ? json({error: error.message}, error.status)
  : json({error: '收款户口暂时无法读取或保存，请稍后重试。'}, 503);

async function key(actor: Parameters<typeof payrollBankTeacher>[0], name: unknown) {
  const teacher = await payrollBankTeacher(actor, name);
  return teacherBankKey(teacher.gid, teacher.name, teacher.createdAt);
}

// Keep teacher names and bank values out of request URLs and request diagnostics.
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({error: '没有权限执行此操作'}, 403);
  const actor = await currentBusinessAccount();
  if (!actor) return json({error: '请先登录'}, 401);
  try {
    if (Number(request.headers.get('content-length') || 0) > MAX_BANK_BYTES) return json({error: '请求内容过大'}, 413);
    const raw = await request.text();
    if (raw.length > MAX_BANK_BYTES) return json({error: '请求内容过大'}, 413);
    const data = JSON.parse(raw);
    if (!data || !['read', 'save'].includes(data.action)) return json({error: '请求格式无效'}, 400);
    const profileKey = await key(actor, data.teacherName);
    if (data.action === 'read') return json(await readTeacherBank(profileKey));
    const bank = parseTeacherBank(data.bank);
    const version = data.version;
    if (!bank || version !== null && (typeof version !== 'string' || !/^[a-f0-9]{32}$/.test(version))) {
      return json({error: '请填写银行名称、户名和 5 至 34 位数字的户口号码。'}, 400);
    }
    const saved = await writeTeacherBank(profileKey, bank, version);
    return json({version: saved.version});
  } catch (error) {
    return error instanceof SyntaxError ? json({error: '请求格式无效'}, 400) : failure(error);
  }
}
