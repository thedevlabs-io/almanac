import { daysBetween, shift, type DayKey } from "./day";
import type { DayRecord } from "./types";

export const DEFAULT_MIN_MINUTES = 5;

export function qualifies(record: DayRecord | undefined, minMinutes: number): boolean {
  return (record?.activeSeconds ?? 0) >= minMinutes * 60;
}

/** The days that count towards a streak, ascending. */
export function qualifyingDays(
  days: Record<DayKey, DayRecord>,
  minMinutes = DEFAULT_MIN_MINUTES
): DayKey[] {
  return Object.keys(days)
    .filter((date) => qualifies(days[date], minMinutes))
    .sort();
}

export interface Streaks {
  current: number;
  longest: number;
  /** The last day that counted, so the UI can say when the streak will lapse. */
  lastQualifying?: DayKey;
}

/**
 * Today not being worked yet does not break a streak. Yesterday still counts as
 * current until midnight passes without a qualifying day, which is how anyone
 * would describe their own streak at nine in the morning.
 */
export function streaks(
  days: Record<DayKey, DayRecord>,
  today: DayKey,
  minMinutes = DEFAULT_MIN_MINUTES
): Streaks {
  const qualifying = qualifyingDays(days, minMinutes);
  if (qualifying.length === 0) {
    return { current: 0, longest: 0 };
  }

  let longest = 1;
  let run = 1;
  for (let i = 1; i < qualifying.length; i += 1) {
    const previous = qualifying[i - 1] as DayKey;
    const day = qualifying[i] as DayKey;
    run = daysBetween(previous, day) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const last = qualifying[qualifying.length - 1] as DayKey;
  const gap = daysBetween(last, today);
  const current = gap === 0 || gap === 1 ? trailingRun(qualifying) : 0;

  return { current, longest, lastQualifying: last };
}

function trailingRun(qualifying: DayKey[]): number {
  let run = 1;
  for (let i = qualifying.length - 1; i > 0; i -= 1) {
    if (daysBetween(qualifying[i - 1] as DayKey, qualifying[i] as DayKey) !== 1) {
      break;
    }
    run += 1;
  }
  return run;
}

/** Whether today still needs work to keep the streak alive, and how much. */
export function secondsToKeepStreak(
  days: Record<DayKey, DayRecord>,
  today: DayKey,
  minMinutes = DEFAULT_MIN_MINUTES
): number {
  const done = days[today]?.activeSeconds ?? 0;
  return Math.max(0, minMinutes * 60 - done);
}

/** Whether a streak lapses at midnight unless today gets some work. */
export function atRisk(
  days: Record<DayKey, DayRecord>,
  today: DayKey,
  minMinutes = DEFAULT_MIN_MINUTES
): boolean {
  const { current } = streaks(days, today, minMinutes);
  return current > 0 && !qualifies(days[today], minMinutes) && qualifies(days[shift(today, -1)], minMinutes);
}
