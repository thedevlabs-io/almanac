// ABOUTME: Merging two days of the same date additively, so two VS Code windows can't clobber
// ABOUTME: each other. Pure — the store applies it around every write.

import type { DayKey, DayRecord } from "./types";

function addMaps(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = (out[key] ?? 0) + value;
  }
  return out;
}

/**
 * Sum two records for the same day. Every field is a count or a duration, so
 * addition is the correct merge for all of them — except `commits`, which is an
 * absolute count read from git rather than something we accumulate.
 */
export function mergeDays(a: DayRecord, b: DayRecord): DayRecord {
  const left = normalizeDay(a);
  const right = normalizeDay(b);
  return {
    date: left.date,
    activeSeconds: left.activeSeconds + right.activeSeconds,
    languages: addMaps(left.languages, right.languages),
    projects: addMaps(left.projects, right.projects),
    hours: left.hours.map((value, i) => value + right.hours[i]),
    edits: left.edits + right.edits,
    saves: left.saves + right.saves,
    files: left.files + right.files,
    sessions: left.sessions + right.sessions,
    commits: Math.max(left.commits ?? 0, right.commits ?? 0) || undefined,
    composition: {
      typedChars: left.composition.typedChars + right.composition.typedChars,
      insertedChars: left.composition.insertedChars + right.composition.insertedChars,
      removedChars: left.composition.removedChars + right.composition.removedChars,
    },
  };
}

export function mergeDatabases(
  base: Record<DayKey, DayRecord>,
  delta: Record<DayKey, DayRecord>
): Record<DayKey, DayRecord> {
  const out: Record<DayKey, DayRecord> = {};
  for (const [date, record] of Object.entries(base)) {
    out[date] = normalizeDay(record);
  }
  for (const [date, record] of Object.entries(delta)) {
    out[date] = out[date] ? mergeDays(out[date], record) : normalizeDay(record);
  }
  return out;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Fill in anything a record is missing. Files on disk outlive schema changes,
 * and a half-written or hand-edited one must not take the extension down on
 * activation — `summarize` reads `hours` without checking.
 */
export function normalizeDay(record: Partial<DayRecord> & { date: DayKey }): DayRecord {
  const hours = Array.isArray(record.hours) ? record.hours.slice(0, 24) : [];
  while (hours.length < 24) {
    hours.push(0);
  }
  return {
    date: record.date,
    activeSeconds: numberOr(record.activeSeconds),
    languages: mapOf(record.languages),
    projects: mapOf(record.projects),
    hours: hours.map((value) => numberOr(value)),
    edits: numberOr(record.edits),
    saves: numberOr(record.saves),
    files: numberOr(record.files),
    sessions: numberOr(record.sessions),
    commits: typeof record.commits === "number" ? record.commits : undefined,
    composition: {
      typedChars: numberOr(record.composition?.typedChars),
      insertedChars: numberOr(record.composition?.insertedChars),
      removedChars: numberOr(record.composition?.removedChars),
    },
  };
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function mapOf(value: unknown): Record<string, number> {
  if (value === null || typeof value !== "object") {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = numberOr(raw, -1);
    if (n >= 0) {
      out[key] = n;
    }
  }
  return out;
}

/** Drop anything that isn't a plausible day record — a corrupt file loses one day, not the lot. */
export function normalizeDatabase(days: unknown): Record<DayKey, DayRecord> {
  if (days === null || typeof days !== "object") {
    return {};
  }
  const out: Record<DayKey, DayRecord> = {};
  for (const [date, record] of Object.entries(days as Record<string, unknown>)) {
    if (!DATE.test(date) || record === null || typeof record !== "object") {
      continue;
    }
    out[date] = normalizeDay({ ...(record as Partial<DayRecord>), date });
  }
  return out;
}

export function emptyDelta(): Record<DayKey, DayRecord> {
  return {};
}
