import {PayrollError} from './payroll';

export const PAYSLIP_PAGE_WIDTH = 1190;
export const PAYSLIP_PAGE_HEIGHT = 1684;
export const MAX_PAYSLIP_PAGES = 40;

const pageWidth = 595.28;
const pageHeight = 841.89;
const canvasWidth = PAYSLIP_PAGE_WIDTH / 2;
const canvasHeight = PAYSLIP_PAGE_HEIGHT / 2;

// Original 1,000-unit TrueType font with a rectangle glyph and a space. The
// glyphs provide selection bounds only. The ToUnicode map carries the text.
const selectionFont = Uint8Array.from(atob(
  'AAEAAAAKAIAAAwAgT1MvMkUARe0AAAEoAAAAYGNtYXAAdQBbAAABkAAAADxnbHlm97rQ9wAAAdQAAAAaaGVh' +
  'ZFtKpGAAAACsAAAANmhoZWEHHgM2AAAA5AAAACRobXR4A+gAAAAAAYgAAAAIbG9jYQANAA0AAAHMAAAACG1h' +
  'eHAABQAGAAABCAAAACBuYW1lwdMRhwAAAfAAAAC6cG9zdHLZ03UAAAKsAAAALwABAAAAAQAA9RlUJl8PPPUA' +
  'AwPoAAAAAHwlsIAAAAAAfCWwgAAA/0wD6AM0AAAAAwACAAAAAAAAAAEAAAM0/0wAAAPoAAAAAAPoAAEAAAAA' +
  'AAAAAAAAAAAAAAABAAEAAAADAAQAAQAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwPoAZAABQAEAAAAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAACAAQQM0/0wAAAM0ALQAAAAA' +
  'AAAAAAAAAAAAAAAgAAAD6AAAAAAAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAKAAAAAYABAABAAIAIABB//8A' +
  'AAAgAEH////i/8AAAQAAAAAAAAAAAAAADQANAAEAAP9MA+gDNAADAAAVIREhA+j8GLQD6AAAAAAAAAgAZgAB' +
  'AAAAAAABABUAAAABAAAAAAACAAcAFQABAAAAAAAEABUAAAABAAAAAAAGABUAAAADAAEECQABACoAHAADAAEE' +
  'CQACAA4ARgADAAEECQAEACoAHAADAAEECQAGACoAHFRpY2ttaW5kZXJQYXlzbGlwVGV4dFJlZ3VsYXIAVABp' +
  'AGMAawBtAGkAbgBkAGUAcgBQAGEAeQBzAGwAaQBwAFQAZQB4AHQAUgBlAGcAdQBsAGEAcgAAAAIAAAAAAAAA' +
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwAAAQIAAwZtYXJrZXIA'
), char => char.charCodeAt(0));

type PayslipTextLine = {
  value: string;
  left: number;
  top: number;
  width: number;
  size: number;
  account?: true;
};

function invalidTextLayer() {
  return new PayrollError('薪资单文字格式无效，请重新打开预览。', 400);
}

function isTextLine(value: unknown): value is PayslipTextLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as PayslipTextLine;
  return typeof line.value === 'string' && line.value.length <= 320 &&
    Boolean(line.value.trim()) && !/[\p{Cc}\p{Cs}]/u.test(line.value) &&
    [line.left, line.top, line.width, line.size].every(Number.isFinite) &&
    line.left >= 0 && line.top >= 0 && line.width > 0 && line.size >= 8 && line.size <= 24 &&
    line.left + line.width <= canvasWidth + 0.02 && line.top + line.size <= canvasHeight &&
    (line.account === undefined || line.account === true);
}

export function parsePayslipTextLayer(raw: unknown, pageCount: number, expectedAccount?: string): PayslipTextLine[][] {
  if (typeof raw !== 'string' || raw.length > 2 * 1024 * 1024) throw invalidTextLayer();
  let layer: unknown;
  try {
    layer = JSON.parse(raw);
  } catch {
    throw invalidTextLayer();
  }
  if (!Array.isArray(layer) || layer.length !== pageCount) throw invalidTextLayer();
  let accountNumber: string | undefined;
  for (const page of layer) {
    if (!Array.isArray(page) || !page.length || page.length > 600 || !page.every(isTextLine)) throw invalidTextLayer();
    for (const line of page) {
      if (!line.account) continue;
      if (accountNumber !== undefined || !/^[0-9]{5,34}$/.test(line.value)) throw invalidTextLayer();
      accountNumber = line.value;
    }
  }
  if (!accountNumber || expectedAccount !== undefined && accountNumber !== expectedAccount) throw invalidTextLayer();
  return layer;
}

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
// The service wraps the preview images and their selectable text in PDF.
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

// Two-byte character codes point to Unicode strings, including surrogate
// pairs for characters outside the basic multilingual plane.
function hex(value: number) {
  return value.toString(16).padStart(4, '0');
}

function toUnicodeCMap(alphabet: Map<string, number>) {
  const entries = Array.from(alphabet, ([char, code]) => {
    const unicode = Array.from({length: char.length}, (_, index) => hex(char.charCodeAt(index))).join('');
    return `<${hex(code)}> <${unicode}>`;
  });
  const sections = [];
  for (let start = 0; start < entries.length; start += 100) {
    const section = entries.slice(start, start + 100);
    sections.push(`${section.length} beginbfchar\n${section.join('\n')}\nendbfchar\n`);
  }
  return '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /TickminderPayslipToUnicode def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
    sections.join('') + 'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
}

function selectableText(lines: PayslipTextLine[], alphabet: Map<string, number>) {
  const xScale = pageWidth / canvasWidth;
  const yScale = pageHeight / canvasHeight;
  const commands = ['BT\n3 Tr\n'];
  for (const line of lines) {
    const characters = Array.from(line.value);
    const fontSize = line.size * yScale;
    const horizontalScale = line.width * xScale / (characters.length * fontSize);
    const left = line.left * xScale;
    const baseline = pageHeight - (line.top + 0.82 * line.size) * yScale;
    const data = characters.map(char => {
      let code = alphabet.get(char);
      if (code === undefined) {
        code = alphabet.size + 1;
        if (code > 65535) throw invalidTextLayer();
        alphabet.set(char, code);
      }
      return hex(code);
    }).join('');
    commands.push(`/Select ${fontSize.toFixed(3)} Tf\n${horizontalScale.toFixed(6)} 0 0 1 ${left.toFixed(3)} ${baseline.toFixed(3)} Tm\n<${data}> Tj\n`);
  }
  commands.push('ET\n');
  return commands.join('');
}

export function createArchivedPayslip(pages: Uint8Array[], layer: PayslipTextLine[][]) {
  if (!pages.length || pages.length > MAX_PAYSLIP_PAGES || pages.some(page => !validPage(page))) {
    throw new PayrollError('薪资单页面格式无效，请重新打开预览。', 400);
  }
  if (layer.length !== pages.length) throw invalidTextLayer();
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
  function stream(id: number, data: string | Uint8Array, attributes = '') {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    object(id, `<< /Length ${bytes.byteLength}${attributes} >>\nstream\n`, bytes, '\nendstream');
  }
  const imageCommands = `q ${pageWidth} 0 0 ${pageHeight} 0 0 cm /PageImage Do Q\n`;
  const alphabet = new Map<string, number>();
  const pageContents = layer.map(lines => imageCommands + selectableText(lines, alphabet));
  const cidToGlyph = new Uint8Array((alphabet.size + 1) * 2);
  for (const [char, code] of alphabet) cidToGlyph[code * 2 + 1] = char === ' ' ? 2 : 1;

  const firstPage = 9;
  append('%PDF-1.4\n%ÐÔÅØ\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => (firstPage + index * 3) + ' 0 R').join(' ')}] >>`);
  object(3, '<< /Type /Font /Subtype /Type0 /BaseFont /TickminderPayslipText /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 8 0 R >>');
  object(4, '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /TickminderPayslipText /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 1000 /CIDToGIDMap 7 0 R >>');
  object(5, '<< /Type /FontDescriptor /FontName /TickminderPayslipText /Flags 32 /FontBBox [0 -180 1000 820] /ItalicAngle 0 /Ascent 820 /Descent -180 /CapHeight 820 /StemV 80 /FontFile2 6 0 R >>');
  stream(6, selectionFont, ' /Length1 ' + selectionFont.byteLength);
  stream(7, cidToGlyph);
  stream(8, toUnicodeCMap(alphabet));
  for (const [index, page] of pages.entries()) {
    const number = firstPage + index * 3;
    object(number, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${number + 2} 0 R /Resources << /XObject << /PageImage ${number + 1} 0 R >> /Font << /Select 3 0 R >> >> >>`);
    stream(number + 1, page, ` /Type /XObject /Subtype /Image /Width ${PAYSLIP_PAGE_WIDTH} /Height ${PAYSLIP_PAGE_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`);
    stream(number + 2, pageContents[index]);
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
