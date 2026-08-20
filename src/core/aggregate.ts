import { mergeComposition, type Composition, emptyComposition } from "./composition";
import { keyOf, range, shift, type DayKey } from "./day";
import { mergeProjectRecord, treesFor, type ProjectRecord, type RepoTree } from "./project";
import type { DayRecord } from "./types";

/** A heatmap cell. Level 0 to 4, the scale every contribution graph uses. */
export interface HeatCell {
  date: DayKey;
  seconds: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/**
 * Levels are cut against the busiest day in the window rather than fixed hour
 * counts. A fixed scale makes a part-time user's graph uniformly cold and a
 * full-time user's uniformly hot, and in both cases it stops saying anything.
 */
export function heatLevel(seconds: number, busiest: number): HeatCell["level"] {
  if (seconds <= 0) {
    return 0;
  }
  if (busiest <= 0) {
    return 1;
  }
  const share = seconds / busiest;
  if (share <= 0.25) {
    return 1;
  }
  if (share <= 0.5) {
    return 2;
  }
  return share <= 0.75 ? 3 : 4;
}

/**
 * The cells, plus the scale they were cut against.
 *
 * The scale is returned because a legend reading "Less to More" tells nobody
 * anything. With the thresholds in hand it can say what a shade is worth in
 * hours, which is the difference between a decorative graph and a readable one.
 */
export interface Heatmap {
  cells: HeatCell[];
  busiest: number;
  /** Upper bound in seconds of levels 1, 2 and 3. Level 4 runs to `busiest`. */
  thresholds: [number, number, number];
}

export function heatmap(days: Record<DayKey, DayRecord>, from: DayKey, to: DayKey): Heatmap {
  const window = range(from, to);
  const busiest = window.reduce((max, date) => Math.max(max, days[date]?.activeSeconds ?? 0), 0);
  const cells = window.map((date) => {
    const seconds = days[date]?.activeSeconds ?? 0;
    return { date, seconds, level: heatLevel(seconds, busiest) };
  });
  return { cells, busiest, thresholds: [busiest * 0.25, busiest * 0.5, busiest * 0.75] };
}

export interface Slice {
  key: string;
  seconds: number;
  /** Share of the total, 0 to 1. */
  share: number;
}

function slices(totals: Record<string, number>, limit?: number): Slice[] {
  const sum = Object.values(totals).reduce((total, seconds) => total + seconds, 0);
  const sorted = Object.entries(totals)
    .filter(([, seconds]) => seconds > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, seconds]) => ({ key, seconds, share: sum === 0 ? 0 : seconds / sum }));
  return limit === undefined ? sorted : sorted.slice(0, limit);
}

export interface Totals {
  seconds: number;
  languages: Record<string, number>;
  projects: Record<string, ProjectRecord>;
  signals: Record<string, number>;
  hours: number[];
  edits: number;
  saves: number;
  files: number;
  sessions: number;
  commits: number;
  composition: Composition;
  /** Days in the window with any tracked time at all. */
  activeDays: number;
}

export function emptyTotals(): Totals {
  return {
    seconds: 0,
    languages: {},
    projects: {},
    signals: {},
    hours: new Array<number>(24).fill(0),
    edits: 0,
    saves: 0,
    files: 0,
    sessions: 0,
    commits: 0,
    composition: emptyComposition(),
    activeDays: 0,
  };
}

/** Sum a window of days into one set of totals. */
export function totalsFor(
  days: Record<DayKey, DayRecord>,
  from: DayKey,
  to: DayKey
): Totals {
  const totals = emptyTotals();
  for (const date of range(from, to)) {
    const day = days[date];
    if (!day) {
      continue;
    }
    totals.seconds += day.activeSeconds;
    totals.edits += day.edits;
    totals.saves += day.saves;
    totals.files += day.files;
    totals.sessions += day.sessions;
    totals.commits += day.commits ?? 0;
    totals.composition = mergeComposition(totals.composition, day.composition ?? emptyComposition());
    if (day.activeSeconds > 0) {
      totals.activeDays += 1;
    }
    for (const [language, seconds] of Object.entries(day.languages)) {
      totals.languages[language] = (totals.languages[language] ?? 0) + seconds;
    }
    for (const [kind, seconds] of Object.entries(day.signals ?? {})) {
      totals.signals[kind] = (totals.signals[kind] ?? 0) + seconds;
    }
    for (const [repo, record] of Object.entries(day.projects ?? {})) {
      const existing = totals.projects[repo];
      totals.projects[repo] = existing ? mergeProjectRecord(existing, record) : record;
    }
    for (let hour = 0; hour < 24; hour += 1) {
      totals.hours[hour] = (totals.hours[hour] ?? 0) + (day.hours[hour] ?? 0);
    }
  }
  return totals;
}

export function topLanguages(totals: Totals, limit = 8): Slice[] {
  return slices(totals.languages, limit);
}

export function signalSplit(totals: Totals): Slice[] {
  return slices(totals.signals);
}

/** Repository trees for the window, busiest first. */
export function repositories(totals: Totals): RepoTree[] {
  return treesFor(totals.projects);
}

/** Seconds per local hour, plus the busiest hour, for the punchcard. */
export interface Punchcard {
  hours: number[];
  busiest: number;
  peakHour?: number;
}

export function punchcard(totals: Totals): Punchcard {
  const busiest = totals.hours.reduce((max, seconds) => Math.max(max, seconds), 0);
  const peakHour = busiest === 0 ? undefined : totals.hours.indexOf(busiest);
  return { hours: totals.hours, busiest, peakHour };
}

/** The window a dashboard shows by default: the last year, ending today. */
export function defaultWindow(today = keyOf(new Date())): { from: DayKey; to: DayKey } {
  return { from: shift(today, -364), to: today };
}

/** Mean seconds per day over days that had any activity. Zero when none did. */
export function averageActiveDay(totals: Totals): number {
  return totals.activeDays === 0 ? 0 : Math.round(totals.seconds / totals.activeDays);
}

export { slices };
