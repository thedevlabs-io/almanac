// ABOUTME: Streak arithmetic over a set of qualifying days — current, longest, and per-language.
// ABOUTME: Pure and calendar-aware; a gap of one day breaks a streak, however busy the days around it.

import { addDays, daysBetween } from "./day";
import type { DayKey } from "./types";

export interface Streak {
  /** Days running up to today (or yesterday, if today hasn't qualified yet). */
  current: number;
  longest: number;
  /** First and last day of the longest run, for the dashboard to label it. */
  longestFrom?: DayKey;
  longestTo?: DayKey;
  /** True when today itself qualifies, so the UI can say "today counts". */
  todayCounts: boolean;
}

/**
 * A streak is unbroken calendar days. `today` is passed in rather than read from
 * the clock so this stays pure and testable.
 *
 * Today not qualifying *yet* does not break the streak — you may still be about
 * to work. The run is measured from yesterday in that case, which is what every
 * streak tracker means by "you're on a 6-day streak" at 9am.
 */
export function streakOf(qualifying: Iterable<DayKey>, today: DayKey): Streak {
  const days = [...new Set(qualifying)].sort();
  if (days.length === 0) {
    return { current: 0, longest: 0, todayCounts: false };
  }

  let longest = 1;
  let longestFrom = days[0];
  let longestTo = days[0];
  let runStart = days[0];
  let run = 1;

  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i - 1], days[i]) === 1) {
      run++;
    } else {
      run = 1;
      runStart = days[i];
    }
    if (run > longest) {
      longest = run;
      longestFrom = runStart;
      longestTo = days[i];
    }
  }

  const set = new Set(days);
  const todayCounts = set.has(today);
  let current = 0;
  let cursor = todayCounts ? today : addDays(today, -1);
  while (set.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  return { current, longest, longestFrom, longestTo, todayCounts };
}

/** Days meeting the "this day counts" bar, used to feed `streakOf`. */
export function qualifyingDays(
  records: { date: DayKey; activeSeconds: number }[],
  minSeconds: number
): DayKey[] {
  return records.filter((r) => r.activeSeconds >= minSeconds).map((r) => r.date);
}
