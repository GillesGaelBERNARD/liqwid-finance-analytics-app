export const UTC_INCLUSIVE_DAY_CONTRACT = "utc-inclusive-day-v1";

function assertCalendarDay(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${name} must be a YYYY-MM-DD calendar date`);
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`${name} must be a real calendar date`);
  }
  return value;
}

export function toUtcApiRange({ startDay, endDay } = {}) {
  const start = assertCalendarDay(startDay, "startDay");
  const end = assertCalendarDay(endDay, "endDay");
  if (end < start) throw new RangeError("endDay must not precede startDay");
  return {
    startDate: `${start}T00:00:00Z`,
    endDate: `${end}T23:59:59Z`
  };
}

export function toDateKey(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayDateKey() {
  return new Date().toISOString().slice(0, 10);
}

export function compareDateKeys(a, b) {
  return String(a).localeCompare(String(b));
}

export function filterRowsByDate(rows, startDate, endDate) {
  const start = startDate ? toDateKey(startDate) : null;
  const end = endDate ? toDateKey(endDate) : null;
  return rows.filter((row) => {
    const date = toDateKey(row.date ?? row.timestamp);
    return (!start || date >= start) && (!end || date <= end);
  });
}
