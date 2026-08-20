import { emptyComposition, foldChange, type Change } from "./composition";
import type { DayKey } from "./day";
import { addProjectTime } from "./project";
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
