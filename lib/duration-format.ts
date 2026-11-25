/** Lesson durations stay numeric for calculation/export and are rounded only for display. */
export type DurationLanguage = "zh" | "en";

type DurationValue = number | null | undefined;
type DurationDate = string | Date | null | undefined;

export function durationMillisecondsBetween(start: DurationDate, end: DurationDate): number | null {
  if (start == null || end == null || start === "" || end === "") return null;
  const startTime = start instanceof Date ? start.getTime() : Date.parse(start);
  const endTime = end instanceof Date ? end.getTime() : Date.parse(end);
  const elapsed = endTime - startTime;
  return Number.isFinite(startTime) && Number.isFinite(endTime) && elapsed >= 0 ? elapsed : null;
}

export function formatDurationMilliseconds(value: DurationValue, language: DurationLanguage): string {
  if (value == null || !Number.isFinite(value) || value < 0) return "—";
  if (value > 0 && value < 60_000) return language === "zh" ? "不足1分钟" : "Less than 1 minute";
  const totalMinutes = Math.round(value / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (language === "zh") return hours > 0 ? `${hours}小时${minutes ? `${minutes}分钟` : ""}` : `${minutes}分钟`;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

export function formatDurationSeconds(value: DurationValue, language: DurationLanguage): string {
  return formatDurationMilliseconds(value == null ? value : value * 1_000, language);
}

export function formatDurationMinutes(value: DurationValue, language: DurationLanguage): string {
  return formatDurationMilliseconds(value == null ? value : value * 60_000, language);
}

/** Use for existing numeric-hour API fields; never pass a pre-rounded display string. */
export function formatDurationHours(value: DurationValue, language: DurationLanguage): string {
  return formatDurationMilliseconds(value == null ? value : value * 3_600_000, language);
}

export function formatDurationBetween(start: DurationDate, end: DurationDate, language: DurationLanguage): string {
  return formatDurationMilliseconds(durationMillisecondsBetween(start, end), language);
}
