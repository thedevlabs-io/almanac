// ABOUTME: The data model — one aggregated record per calendar day, and the shapes derived from it.
// ABOUTME: Pure types; no vscode import so everything downstream stays unit-testable.

/** A local calendar day, `YYYY-MM-DD`. Local, not UTC: a streak is a human day. */
export type DayKey = string;

/**
 * One day of activity. Deliberately an aggregate — Cadence never keeps an event
 * log, which would amount to a timeline of when you touched your keyboard.
 */
export interface DayRecord {
  date: DayKey;
  /** Seconds counted as active: focused, with input inside the idle window. */
  activeSeconds: number;
  /** Seconds per language id, e.g. `typescript`. */
  languages: Record<string, number>;
  /** Seconds per workspace folder name. Empty when project tracking is off. */
  projects: Record<string, number>;
  /** 24 buckets of seconds, indexed by local hour. */
  hours: number[];
  /** Document change events — a rough measure of how much you wrote. */
  edits: number;
  saves: number;
  /** Distinct files touched. A count only; no names, no paths. */
  files: number;
  /** Times the window regained focus and you started working again. */
  sessions: number;
  /** Commits authored by you, when the Git extension can tell us. */
  commits?: number;
}

export interface Database {
  version: 1;
  days: Record<DayKey, DayRecord>;
}

export function emptyDay(date: DayKey): DayRecord {
  return {
    date,
    activeSeconds: 0,
    languages: {},
    projects: {},
    hours: new Array<number>(24).fill(0),
    edits: 0,
    saves: 0,
    files: 0,
    sessions: 0,
  };
}

export function emptyDatabase(): Database {
  return { version: 1, days: {} };
}

/** A day's worth of tracked work, ready to be folded into a record. */
export interface Tick {
  seconds: number;
  hour: number;
  language?: string;
  project?: string;
}
