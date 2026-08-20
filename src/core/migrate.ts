import { emptyComposition, type Composition } from "./composition";
import { emptyProjectRecord, REPO_ROOT, type ProjectRecord } from "./project";
import { emptyDatabase, emptyDay, SCHEMA_VERSION, type Database, type DayRecord } from "./types";

/**
 * Version 1 kept `projects` as a flat map of workspace folder name to seconds,
 * with no idea which repository a folder belonged to. That information was
 * never recorded, so it cannot be recovered. Each old name becomes a repository
 * of its own with all of its time at the root, which is exactly what version 1
 * was claiming, and new time lands in the real tree from the upgrade onwards.
 */
function migrateProjects(value: unknown): Record<string, ProjectRecord> {
  const projects: Record<string, ProjectRecord> = {};
  if (!isRecord(value)) {
    return projects;
  }
  for (const [name, entry] of Object.entries(value)) {
    if (typeof entry === "number") {
      const seconds = finite(entry);
      projects[name] = { seconds, folders: { [REPO_ROOT]: seconds } };
      continue;
    }
    if (isRecord(entry)) {
      const folders: Record<string, number> = {};
      const rawFolders = isRecord(entry.folders) ? entry.folders : {};
      let sum = 0;
      for (const [folder, seconds] of Object.entries(rawFolders)) {
        const value = finite(seconds);
        folders[folder] = value;
        sum += value;
      }
      // The stored total is advisory. The folders are the truth, so a total
      // that drifted from them is rebuilt rather than trusted.
      projects[name] = { seconds: sum, folders };
    }
  }
  return projects;
}

function migrateDay(date: string, value: unknown): DayRecord {
  const base = emptyDay(date);
  if (!isRecord(value)) {
    return base;
  }
  return {
    ...base,
    activeSeconds: finite(value.activeSeconds),
    languages: numberMap(value.languages),
    projects: migrateProjects(value.projects),
    hours: hourBuckets(value.hours),
    signals: numberMap(value.signals),
    edits: finite(value.edits),
    saves: finite(value.saves),
    files: finite(value.files),
    sessions: finite(value.sessions),
    ...(typeof value.commits === "number" ? { commits: finite(value.commits) } : {}),
    composition: migrateComposition(value.composition),
  };
}

function migrateComposition(value: unknown): Composition {
  if (!isRecord(value)) {
    return emptyComposition();
  }
  return {
    typedChars: finite(value.typedChars),
    blockChars: finite(value.blockChars),
    blockCount: finite(value.blockCount),
  };
}

/**
 * Thrown when a file is readable as JSON but is not a shape Almanac can safely
 * take over. The caller quarantines rather than starting empty, because an
 * empty start would be written back over the original within seconds.
 */
export class UnreadableDatabase extends Error {
  constructor(reason: string) {
    super(`activity.json is not usable: ${reason}`);
    this.name = "UnreadableDatabase";
  }
}

/**
 * Bring any stored database up to the current schema.
 *
 * Throws `UnreadableDatabase` in the two cases where continuing would destroy
 * data: a `days` field that is not a map of days, and a file written by a newer
 * schema than this build understands. The second matters because global storage
 * can be synced, so an older install must refuse a newer file rather than
 * quietly drop every field it does not recognise.
 */
export function migrate(value: unknown): Database {
  if (value === null || value === undefined) {
    return emptyDatabase();
  }
  if (!isRecord(value)) {
    throw new UnreadableDatabase(`expected an object, found ${Array.isArray(value) ? "an array" : typeof value}`);
  }
  if (typeof value.version === "number" && value.version > SCHEMA_VERSION) {
    throw new UnreadableDatabase(
      `written by schema version ${value.version}, and this build understands ${SCHEMA_VERSION}`
    );
  }
  if (value.days === undefined) {
    return emptyDatabase();
  }
  if (!isRecord(value.days)) {
    throw new UnreadableDatabase("its `days` field is not a map of days");
  }

  const days: Record<string, DayRecord> = {};
  for (const [date, record] of Object.entries(value.days)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      days[date] = migrateDay(date, record);
    }
  }
  return { version: SCHEMA_VERSION, days };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function numberMap(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      result[key] = finite(entry);
    }
  }
  return result;
}

function hourBuckets(value: unknown): number[] {
  const hours = new Array<number>(24).fill(0);
  if (Array.isArray(value)) {
    for (let i = 0; i < 24; i += 1) {
      hours[i] = finite(value[i]);
    }
  }
  return hours;
}

export { emptyProjectRecord };
