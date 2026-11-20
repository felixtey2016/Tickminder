import {pdfBucket} from './pdf-storage';
import {PayrollError} from './payroll';
import {parseTeacherBank, type TeacherBank} from './teacher-bank';
import {MAX_BANK_BYTES, payrollObjectPrefix} from './private-payroll-objects';

export async function teacherBankKey(groupId: string, name: string, createdAt: string) {
  const identity = new TextEncoder().encode(JSON.stringify([groupId, name, createdAt]));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', identity));
  return payrollObjectPrefix + groupId + '/bank/' + Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function savedPayslipKey(groupId: string, id: string) {
  return payrollObjectPrefix + groupId + '/payslip/' + id;
}

export async function readTeacherBank(key: string): Promise<{bank: TeacherBank | null; version: string | null}> {
  const object = await pdfBucket().get(key);
  if (!object) return {bank: null, version: null};
  const bank = object.size <= MAX_BANK_BYTES ? parseTeacherBank(await object.json()) : null;
  if (!bank) throw new Error('Invalid stored teacher bank profile');
  return {bank, version: object.etag};
}

export async function writeTeacherBank(key: string, bank: TeacherBank, version: string | null) {
  const object = await pdfBucket().put(key, JSON.stringify(bank), {
    httpMetadata: {contentType: 'application/json', cacheControl: 'private, no-store'},
    onlyIf: version ? {etagMatches: version} : {etagDoesNotMatch: '*'},
  });
  if (!object) throw new PayrollError('老师的收款户口已更新，请重新打开后再修改。', 409);
  return {bank, version: object.etag};
}

