import { emptyComposition, foldChange, mergeComposition, type Change } from "./composition";
import type { DayKey } from "./day";
import { addProjectTime, mergeProjectRecord } from "./project";
import { emptyDay, type DayRecord } from "./types";
import type { Tick } from "./types";

export function applyTick(record: DayRecord, tick: Tick): DayRecord {
  if (tick.seconds <= 0) {
    return record;
  }
  const next: DayRecord = {
    ...record,
    activeSeconds: record.activeSeconds + tick.seconds,
    languages: { ...record.languages },
    hours: [...record.hours],
    signals: { ...record.signals },
  };
  if (tick.language) {
    next.languages[tick.language] = (next.languages[tick.language] ?? 0) + tick.seconds;
  }
  if (tick.project) {
    next.projects = addProjectTime(record.projects, tick.project, tick.seconds);
  }
  if (tick.kind) {
    next.signals[tick.kind] = (next.signals[tick.kind] ?? 0) + tick.seconds;
  }
  const hour = Math.min(Math.max(Math.trunc(tick.hour), 0), 23);
  next.hours[hour] = (next.hours[hour] ?? 0) + tick.seconds;
  return next;
}

/**
 * Repository time with no day time behind it. This is what an unfocused window
 * records under `almanac.concurrentProjects`: the repository's clock runs, the
 * day's does not, so `activeSeconds`, hours, languages and signals are left
 * alone and the repository rows may add up to more than the day.
 */
export function addProjectSeconds(
  record: DayRecord,
  project: NonNullable<Tick["project"]>,
  seconds: number
): DayRecord {
  if (seconds <= 0) {
    return record;
  }
  return { ...record, projects: addProjectTime(record.projects, project, seconds) };
}

export type Counter = "edits" | "saves" | "files" | "sessions";

export function bump(record: DayRecord, counter: Counter, by = 1): DayRecord {
  return { ...record, [counter]: record[counter] + by };
}

export function addChange(record: DayRecord, change: Change): DayRecord {
  return { ...record, composition: foldChange(record.composition ?? emptyComposition(), change) };
}

export function setCommits(record: DayRecord, commits: number): DayRecord {
  return { ...record, commits };
}

/**
 * Two records of the same day, folded into one.
 *
 * This is what lets several VS Code windows share one file. Each window holds
 * only what it has not yet written, and merges that onto whatever is on disk
 * at write time, so a window can never overwrite another's minutes. Every
 * field is a sum except `commits`, which each window reads whole from git, so
 * the larger reading wins: two windows on the same repository agree, and two
 * on different repositories at least never lose the bigger count.
 */
export function mergeDay(a: DayRecord, b: DayRecord): DayRecord {
  const languages = { ...a.languages };
  for (const [language, seconds] of Object.entries(b.languages)) {
    languages[language] = (languages[language] ?? 0) + seconds;
  }
  const signals = { ...a.signals };
  for (const [kind, seconds] of Object.entries(b.signals)) {
    signals[kind] = (signals[kind] ?? 0) + seconds;
  }
  const projects = { ...a.projects };
  for (const [repo, record] of Object.entries(b.projects)) {
    const existing = projects[repo];
    projects[repo] = existing ? mergeProjectRecord(existing, record) : record;
  }
  const hours = a.hours.map((seconds, hour) => seconds + (b.hours[hour] ?? 0));
  const commits =
    a.commits === undefined ? b.commits : b.commits === undefined ? a.commits : Math.max(a.commits, b.commits);
  return {
    date: a.date,
    activeSeconds: a.activeSeconds + b.activeSeconds,
    languages,
    projects,
    hours,
    signals,
    edits: a.edits + b.edits,
    saves: a.saves + b.saves,
    files: a.files + b.files,
    sessions: a.sessions + b.sessions,
    ...(commits === undefined ? {} : { commits }),
    composition: mergeComposition(a.composition, b.composition),
  };
}

/** Fold every day of `delta` onto `days`. Days only in one side pass through. */
export function mergeDays(
  days: Record<DayKey, DayRecord>,
  delta: Record<DayKey, DayRecord>
): Record<DayKey, DayRecord> {
  const merged = { ...days };
  for (const [date, record] of Object.entries(delta)) {
    const existing = merged[date];
    merged[date] = existing ? mergeDay(existing, record) : record;
  }
  return merged;
}

/** Read a day out of the map, or an empty one, so callers never handle undefined. */
export function dayIn(days: Record<DayKey, DayRecord>, date: DayKey): DayRecord {
  return days[date] ?? emptyDay(date);
}

/** Drop days older than the retention window. Almanac has no reason to keep them. */
export function prune(
  days: Record<DayKey, DayRecord>,
  oldestToKeep: DayKey
): Record<DayKey, DayRecord> {
  const kept: Record<DayKey, DayRecord> = {};
  for (const [date, record] of Object.entries(days)) {
    if (date >= oldestToKeep) {
      kept[date] = record;
    }
  }
  return kept;
}
