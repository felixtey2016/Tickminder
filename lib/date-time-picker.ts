/** Calendar arithmetic on ISO local values. No timezone conversion is involved. */
export type PickerType = 'date' | 'datetime-local';
export type PickerConstraints = {type: PickerType; min: string; max: string; step: string; defaultValue: string; required: boolean};
export const DAY = 86400000;
export const pad = (value: number, length = 2) => String(value).padStart(length, '0');
export function daysInMonth(year: number, month: number) {
  return [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 0;
}
export function parseDate(value: string) {
  const match = /^(\d{4,6})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  return year >= 1 && year <= 275760 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month) ? {year, month, day} : null;
}
export function dateValue(year: number, month: number, day: number) {return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;}
export function dayNumber(year: number, month: number, day: number) {
  const y = year - (month <= 2 ? 1 : 0), era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
}
export function fromDayNumber(day: number) {
  const z = day + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  let year = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1, month = mp + (mp < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return dateValue(year, month, d);
}
export function localNumber(type: PickerType, value: string): number | null {
  const pieces = value.split('T'), [date, time] = pieces, parsed = parseDate(date);
  if (!parsed || pieces.length > 2 || (type === 'date' && time !== undefined)) return null;
  const base = dayNumber(parsed.year, parsed.month, parsed.day) * DAY;
  if (type === 'date') return base;
  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(time || '');
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[3] || 0) > 59) return null;
  return base + Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3] || 0) * 1000 + Number((match[4] || '').padEnd(3, '0'));
}
export function localValue(type: PickerType, value: number) {
  const days = Math.floor(value / DAY), date = fromDayNumber(days);
  if (type === 'date') return date;
  const remainder = value - days * DAY, h = Math.floor(remainder / 3600000), m = Math.floor(remainder % 3600000 / 60000), s = Math.floor(remainder % 60000 / 1000), ms = remainder % 1000;
  return `${date}T${pad(h)}:${pad(m)}${s || ms ? ':' + pad(s) : ''}${ms ? '.' + pad(ms, 3).replace(/0+$/, '') : ''}`;
}
export function pickerLimits(constraints: PickerConstraints) {
  const unit = constraints.type === 'date' ? DAY : 1000;
  const minimum = localNumber(constraints.type, constraints.min), maximum = localNumber(constraints.type, constraints.max);
  const raw = Number(constraints.step), step = constraints.step === 'any' ? (constraints.type === 'date' ? DAY : 1) : (Number.isFinite(raw) && raw > 0 ? raw : constraints.type === 'date' ? 1 : 60) * unit;
  return {min: minimum ?? dayNumber(1, 1, 1) * DAY, max: maximum ?? 8640000000000000, step, base: minimum ?? localNumber(constraints.type, constraints.defaultValue) ?? 0};
}
/** Find a representable step-aligned value in an inclusive interval. */
export function nearestAllowed(constraints: PickerConstraints, preferred: number, low?: number, high?: number) {
  const {min, max, step, base} = pickerLimits(constraints), start = Math.max(min, low ?? min), end = Math.min(max, high ?? max);
  if (start > end) return null;
  const first = Math.ceil((start - base) / step - 1e-9), last = Math.floor((end - base) / step + 1e-9);
  if (first > last) return null;
  const value = base + Math.max(first, Math.min(last, Math.round((preferred - base) / step))) * step;
  // HTML values have millisecond precision; fractional date steps still land on full days.
  if (constraints.type === 'date' && value % DAY !== 0) {
    const day = Math.ceil(start / DAY);
    for (let index = 0; index < 3660 && (day + index) * DAY <= end; index++) {
      const candidate = (day + index) * DAY, quotient = (candidate - base) / step;
      if (Math.abs(quotient - Math.round(quotient)) < 1e-7) return candidate;
    }
    return null;
  }
  return Math.round(value);
}
export function dateAllowed(constraints: PickerConstraints, value: string) {
  const day = localNumber('date', value);
  return day !== null && nearestAllowed(constraints, day, day, day + (constraints.type === 'date' ? 0 : DAY - 1)) !== null;
}
export function currentLocalDate() {
  const now = new Date();
  return dateValue(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
