// ABOUTME: Folding ticks and events into a day's record. Pure — the store just persists the result.
// ABOUTME: Keeps every mutation in one place so no field is updated two different ways.

import { emptyDay, type DayKey, type DayRecord, type Tick } from "./types";
import { emptyComposition, foldChange, type Change } from "./composition";

export function applyTick(record: DayRecord, tick: Tick): DayRecord {
  if (tick.seconds <= 0) {
    return record;
  }
  const next: DayRecord = {
    ...record,
    activeSeconds: record.activeSeconds + tick.seconds,
    languages: { ...record.languages },
    projects: { ...record.projects },
    hours: [...record.hours],
  };
  if (tick.language) {
    next.languages[tick.language] = (next.languages[tick.language] ?? 0) + tick.seconds;
  }
  if (tick.project) {
    next.projects[tick.project] = (next.projects[tick.project] ?? 0) + tick.seconds;
  }
  const hour = Math.min(Math.max(tick.hour, 0), 23);
  next.hours[hour] += tick.seconds;
  return next;
}

export type Counter = "edits" | "saves" | "files" | "sessions";

export function bump(record: DayRecord, counter: Counter, by = 1): DayRecord {
  return { ...record, [counter]: record[counter] + by };
}

export function addChange(record: DayRecord, change: Change): DayRecord {
  return {
    ...record,
    composition: foldChange(record.composition ?? emptyComposition(), change),
  };
}

export function setCommits(record: DayRecord, commits: number): DayRecord {
  return { ...record, commits };
}

/** Read a day out of the map, or an empty one — callers never deal with undefined. */
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
