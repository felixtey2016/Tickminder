import {PayrollError} from './payroll';

export const PAYSLIP_PAGE_WIDTH = 1190;
export const PAYSLIP_PAGE_HEIGHT = 1684;
export const MAX_PAYSLIP_PAGES = 40;

export function payslipFileName(teacherName: string, month: string) {
  const safe = teacherName.replace(/[<>:"/\\|?*\p{Cc}\p{Cf}\p{Cs}]/gu, ' ')
    .replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '');
  const name = Array.from(safe).slice(0, 54).join('').trim() || 'Teacher';
  return `${name} ${month} salary.pdf`;
}

export function payslipDisposition(fileName: string, download: boolean) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '').replace(/^\s+/, '');
  const unicode = encodeURIComponent(fileName).replace(/['()*]/g, value => '%' + value.charCodeAt(0).toString(16));
  return `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${unicode}`;
}

// An uploaded page must be a browser-sized, three-component baseline JPEG.
// The service creates the PDF structure itself from these static page images.
function validPage(bytes: Uint8Array) {
  const read16 = (offset: number) => bytes[offset] * 256 + bytes[offset + 1];
  if (bytes.length < 12 || read16(0) !== 0xffd8 || read16(bytes.length - 2) !== 0xffd9) return false;
  const limit = Math.min(bytes.length - 10, 65536);
  let offset = 2;
  while (offset < limit && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    const length = read16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return false;
    if (marker === 0xc0) {
      return length === 17 && bytes[offset + 4] === 8 &&
        read16(offset + 5) === PAYSLIP_PAGE_HEIGHT && read16(offset + 7) === PAYSLIP_PAGE_WIDTH &&
        bytes[offset + 9] === 3;
    }
    if (marker === 0xda || marker === 0xd9) return false;
    offset += 2 + length;
  }
  return false;
}

export function createArchivedPayslip(pages: Uint8Array[]) {
  if (!pages.length || pages.length > MAX_PAYSLIP_PAGES || pages.some(page => !validPage(page))) {
    throw new PayrollError('薪资单页面格式无效，请重新打开预览。', 400);
  }
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  function append(value: string | Uint8Array) {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  }
  function object(id: number, ...parts: (string | Uint8Array)[]) {
    offsets[id] = length;
    append(id + ' 0 obj\n');
    for (const part of parts) append(part);
    append('\nendobj\n');
  }
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const content = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /PageImage Do Q\n`;
  append('%PDF-1.4\n%ÐÔÅØ\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => (4 + index * 2) + ' 0 R').join(' ')}] >>`);
  object(3, `<< /Length ${content.length} >>\nstream\n${content}endstream`);
  for (const [index, page] of pages.entries()) {
    const number = 4 + index * 2;
    object(number, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 3 0 R /Resources << /XObject << /PageImage ${number + 1} 0 R >> >> >>`);
    object(number + 1, `<< /Type /XObject /Subtype /Image /Width ${PAYSLIP_PAGE_WIDTH} /Height ${PAYSLIP_PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.byteLength} >>\nstream\n`,
      page, '\nendstream');
  }
  const xref = length;
  append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const start of offsets.slice(1)) append(String(start).padStart(10, '0') + ' 00000 n \n');
  append(`trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xref}\n%%EOF\n`);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
