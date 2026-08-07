// ABOUTME: Rollups from daily records into everything the dashboard shows.
// ABOUTME: Pure, so the numbers on screen are exactly what the tests pin down.

import { addDays, daysBetween, range, weekday } from "./day";
import { languageName } from "./format";
import { qualifyingDays, streakOf, type Streak } from "./streaks";
import type { DayKey, DayRecord } from "./types";

export interface HeatCell {
  date: DayKey;
  seconds: number;
  /** 0 (nothing) to 4 (busiest band), for the heatmap's five shades. */
  level: number;
}

export interface LanguageStat {
  id: string;
  name: string;
  seconds: number;
  /** Days this language was touched at all. */
  days: number;
  streak: Streak;
}

export interface ProjectStat {
  name: string;
  seconds: number;
  days: number;
}

export interface Summary {
  today: number;
  week: number;
  month: number;
  total: number;
  daysTracked: number;
  daysQualifying: number;
  streak: Streak;
  best?: { date: DayKey; seconds: number };
  languages: LanguageStat[];
  projects: ProjectStat[];
  /** [weekday][hour] in seconds — 7 rows of 24. */
  punchcard: number[][];
  heatmap: HeatCell[];
  totals: { edits: number; saves: number; files: number; sessions: number; commits: number };
  commitsByDay: Record<DayKey, number>;
  firstDay?: DayKey;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * Five bands from the non-zero days, so the heatmap adapts to how much you
 * actually work — a fixed scale would show one shade for a light user and one
 * for a heavy one.
 */
export function levelsFor(values: number[]): (seconds: number) => number {
  const active = values.filter((v) => v > 0).sort((a, b) => a - b);
  if (active.length === 0) {
    return () => 0;
  }
  // Index across (n-1) so the busiest day always lands in the top band; indexing
  // across n puts the maximum on the last boundary and level 4 goes unused.
  const at = (q: number): number => active[Math.floor((active.length - 1) * q)];
  const bands = [at(0.25), at(0.5), at(0.75)];
  return (seconds: number): number => {
    if (seconds <= 0) {
      return 0;
    }
    if (seconds <= bands[0]) {
      return 1;
    }
    if (seconds <= bands[1]) {
      return 2;
    }
    if (seconds <= bands[2]) {
      return 3;
    }
    return 4;
  };
}

function totalsOf(records: DayRecord[]): Summary["totals"] {
  return {
    edits: sum(records.map((r) => r.edits)),
    saves: sum(records.map((r) => r.saves)),
    files: sum(records.map((r) => r.files)),
    sessions: sum(records.map((r) => r.sessions)),
    commits: sum(records.map((r) => r.commits ?? 0)),
  };
}

function languageStats(records: DayRecord[], today: DayKey, minSeconds: number): LanguageStat[] {
  const seconds = new Map<string, number>();
  const days = new Map<string, DayKey[]>();

  for (const record of records) {
    for (const [id, value] of Object.entries(record.languages)) {
      if (value <= 0) {
        continue;
      }
      seconds.set(id, (seconds.get(id) ?? 0) + value);
      const list = days.get(id) ?? [];
      // A language's streak uses the same bar as the day streak, so "5 days of
      // Rust" means five days you actually worked in it, not five days it was open.
      if (value >= minSeconds) {
        list.push(record.date);
      }
      days.set(id, list);
    }
  }

  return [...seconds.entries()]
    .map(([id, total]) => ({
      id,
      name: languageName(id),
      seconds: total,
      days: (days.get(id) ?? []).length,
      streak: streakOf(days.get(id) ?? [], today),
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

function projectStats(records: DayRecord[]): ProjectStat[] {
  const seconds = new Map<string, number>();
  const days = new Map<string, number>();
  for (const record of records) {
    for (const [name, value] of Object.entries(record.projects)) {
      if (value <= 0) {
        continue;
      }
      seconds.set(name, (seconds.get(name) ?? 0) + value);
      days.set(name, (days.get(name) ?? 0) + 1);
    }
  }
  return [...seconds.entries()]
    .map(([name, total]) => ({ name, seconds: total, days: days.get(name) ?? 0 }))
    .sort((a, b) => b.seconds - a.seconds);
}

function punchcardOf(records: DayRecord[]): number[][] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const record of records) {
    const row = weekday(record.date);
    record.hours.forEach((value, hour) => {
      grid[row][hour] += value;
    });
  }
  return grid;
}

export interface SummaryOptions {
  today: DayKey;
  /** Seconds a day needs to count towards a streak. */
  minSeconds: number;
  /** How many days the heatmap covers, ending today. */
  heatmapDays: number;
}

export function summarize(days: Record<DayKey, DayRecord>, options: SummaryOptions): Summary {
  const records = Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
  const byDate = new Map(records.map((r) => [r.date, r]));
  const { today, minSeconds, heatmapDays } = options;

  const heatFrom = addDays(today, -(heatmapDays - 1));
  const heatDays = range(heatFrom, today);
  const level = levelsFor(heatDays.map((key) => byDate.get(key)?.activeSeconds ?? 0));
  const heatmap: HeatCell[] = heatDays.map((date) => {
    const seconds = byDate.get(date)?.activeSeconds ?? 0;
    return { date, seconds, level: level(seconds) };
  });

  const since = (from: DayKey): number =>
    sum(records.filter((r) => daysBetween(from, r.date) >= 0).map((r) => r.activeSeconds));

  const best = records.reduce<Summary["best"]>((top, r) => {
    if (r.activeSeconds <= 0) {
      return top;
    }
    return !top || r.activeSeconds > top.seconds ? { date: r.date, seconds: r.activeSeconds } : top;
  }, undefined);

  const qualifying = qualifyingDays(records, minSeconds);
  const commitsByDay: Record<DayKey, number> = {};
  for (const record of records) {
    if (record.commits) {
      commitsByDay[record.date] = record.commits;
    }
  }

  return {
    today: byDate.get(today)?.activeSeconds ?? 0,
    week: since(addDays(today, -6)),
    month: since(addDays(today, -29)),
    total: sum(records.map((r) => r.activeSeconds)),
    daysTracked: records.filter((r) => r.activeSeconds > 0).length,
    daysQualifying: qualifying.length,
    streak: streakOf(qualifying, today),
    best,
    languages: languageStats(records, today, minSeconds),
    projects: projectStats(records),
    punchcard: punchcardOf(records),
    heatmap,
    totals: totalsOf(records),
    commitsByDay,
    firstDay: records.find((r) => r.activeSeconds > 0)?.date,
  };
}

/** Per-language heatmap cells, for the small grids under each language. */
export function languageHeatmap(
  days: Record<DayKey, DayRecord>,
  languageId: string,
  from: DayKey,
  to: DayKey
): HeatCell[] {
  const keys = range(from, to);
  const values = keys.map((key) => days[key]?.languages[languageId] ?? 0);
  const level = levelsFor(values);
  return keys.map((date, i) => ({ date, seconds: values[i], level: level(values[i]) }));
}
