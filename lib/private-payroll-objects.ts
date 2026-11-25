export const payrollObjectPrefix = 'private-payroll/';
export const MAX_PAYSLIP_BYTES = 8 * 1024 * 1024;
export const MAX_BANK_BYTES = 2048;
const objectKey = /^private-payroll\/([a-z0-9-]{1,64})\/(bank\/([a-f0-9]{64})|payslip\/([A-Za-z0-9_-]{1,100}))$/;

export function inspectPrivatePayrollKey(key: string) {
  const match = key.match(objectKey);
  if (!match) return null;
  const bank = Boolean(match[3]);
  return {
    kind: bank ? 'teacher-bank' : 'payroll-payslip',
    group_id: match[1],
    id: match[3] || match[4],
    mime: bank ? 'application/json' : 'application/pdf',
    maxBytes: bank ? MAX_BANK_BYTES : MAX_PAYSLIP_BYTES,
  };
}

export async function listPrivatePayrollObjects(bucket: R2Bucket) {
  const rows = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({prefix: payrollObjectPrefix, cursor});
    for (const object of page.objects) {
      const info = inspectPrivatePayrollKey(object.key);
      if (!info || object.size < 1 || object.size > info.maxBytes) throw new Error('Invalid private payroll object');
      rows.push({kind: info.kind, group_id: info.group_id, id: info.id, mime: info.mime,
        object_key: object.key, bytes: object.size, etag: object.etag});
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return rows;
}
