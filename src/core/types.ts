import { emptyComposition, type Composition } from "./composition";
import type { DayKey } from "./day";
import type { ProjectRecord } from "./project";
import type { SignalKind } from "./presence";

export type { DayKey };

export const SCHEMA_VERSION = 2;

/**
 * One day of activity. Deliberately an aggregate. Almanac never keeps an event
 * log, which would amount to a timeline of when you touched your keyboard.
 */
export interface DayRecord {
  date: DayKey;
  /** Seconds counted as active. */
  activeSeconds: number;
  /** Seconds per language id, e.g. `typescript`. */
  languages: Record<string, number>;
  /** Seconds per repository, split by the folder opened inside it. */
  projects: Record<string, ProjectRecord>;
  /** 24 buckets of seconds, indexed by local hour. */
  hours: number[];
  /**
   * Seconds per kind of signal that held the clock open. Not used by any rule.
   * It exists so "where did my day go" has an answer, and so a user who thinks
   * their terminal work is being missed can see for themselves whether it is.
   */
  signals: Record<string, number>;
  /** Document change events, a rough measure of how much was written. */
  edits: number;
  saves: number;
  /** Distinct files touched. A count only, no names and no paths. */
  files: number;
  /** Times work resumed after a gap. */
  sessions: number;
  /** Commits you authored, when the Git extension can tell us. */
  commits?: number;
  /** How text arrived. Never attributed to a tool. */
  composition: Composition;
}

export interface Database {
  version: number;
  days: Record<DayKey, DayRecord>;
}

export function emptyDay(date: DayKey): DayRecord {
  return {
    date,
    activeSeconds: 0,
    languages: {},
    projects: {},
    hours: new Array<number>(24).fill(0),
    signals: {},
    edits: 0,
    saves: 0,
    files: 0,
    sessions: 0,
    composition: emptyComposition(),
  };
}

export function emptyDatabase(): Database {
  return { version: SCHEMA_VERSION, days: {} };
}

/** One credited interval, ready to be folded into a day. */
export interface Tick {
  seconds: number;
  hour: number;
  language?: string;
  project?: { repo: string; folder: string };
  kind?: SignalKind;
}
