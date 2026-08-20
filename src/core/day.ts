/** A local calendar day, `YYYY-MM-DD`. */
export type DayKey = string;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** The local calendar day a moment falls in. */
export function keyOf(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight local time on the given day. Parsed by hand so no timezone is guessed. */
export function dateOf(key: DayKey): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** The day `count` days after `key`. Negative counts go backwards. */
export function shift(key: DayKey, count: number): DayKey {
  const date = dateOf(key);
  date.setDate(date.getDate() + count);
  return keyOf(date);
}

/**
 * Whole days between two keys. Both are normalised to local midnight first, so
 * a daylight-saving change cannot turn one day into 0.958 of one.
 */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / MS_PER_DAY);
}

/** Every day from `from` to `to` inclusive, ascending. */
export function range(from: DayKey, to: DayKey): DayKey[] {
  const days: DayKey[] = [];
  const total = daysBetween(from, to);
  for (let i = 0; i <= total; i += 1) {
    days.push(shift(from, i));
  }
  return days;
}

/** Day of week with Monday as 0, matching how a heatmap column is read. */
export function weekdayOf(key: DayKey): number {
  return (dateOf(key).getDay() + 6) % 7;
}

/** The Monday on or before `key`. */
export function startOfWeek(key: DayKey): DayKey {
  return shift(key, -weekdayOf(key));
}

/** The first day of `key`'s month. */
export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}
