export const DEFAULT_PDF_MAX_BYTES = 10 * 1024 * 1024;
export const DEFAULT_TOTAL_STORAGE_BYTES = 1024 * 1024 * 1024;
export const STAGED_FILE_TTL_MS = 24 * 60 * 60 * 1000;

export function configuredBytes(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function malaysiaInputToIso(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("请输入有效的马来西亚日期和时间");
  const date = new Date(`${value}:00+08:00`);
  if (Number.isNaN(date.getTime())) throw new Error("请输入有效的马来西亚日期和时间");
  const roundTrip = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(" ", "T");
  if (roundTrip !== value) throw new Error("请输入有效的马来西亚日期和时间");
  return date.toISOString();
}

export function intervalsOverlap(start: string, end: string, otherStart: string, otherEnd: string) {
  return start < otherEnd && end > otherStart;
}

export function submissionRule(now: string, startsAt: string, dueAt: string, alreadySubmitted: boolean) {
  if (now < startsAt) return "not_started";
  if (now > dueAt && alreadySubmitted) return "replacement_closed";
  return now > dueAt ? "late" : "open";
}

export function pdfSignatureValid(bytes: Uint8Array) {
  if (bytes.length < 16) return false;
  const prefix = new TextDecoder().decode(bytes.subarray(0, 5));
  const end = new TextDecoder().decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  return prefix === "%PDF-" && end.includes("%%EOF");
}

export function displayPdfName(original: string, fallback: string) {
  const leaf = original.replaceAll("\\", "/").split("/").pop() || "";
  const cleaned = leaf.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 120);
  if (!cleaned.toLowerCase().endsWith(".pdf") || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(cleaned) || /(?:\+?60[\s-]?)?0?1[0-9][\s-]?\d{3,4}[\s-]?\d{4}\b/.test(cleaned)) return `${fallback}.pdf`;
  return cleaned;
}
