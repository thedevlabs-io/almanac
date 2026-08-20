import * as fs from "fs/promises";
import * as path from "path";
import type { Change } from "../core/composition";
import { keyOf, shift, type DayKey } from "../core/day";
import { migrate } from "../core/migrate";
import { addChange, applyTick, bump, dayIn, prune, setCommits, type Counter } from "../core/record";
import { emptyDatabase, type Database, type DayRecord, type Tick } from "../core/types";

const FILE_NAME = "activity.json";

/**
 * Ticks land every fifteen seconds and edits land per keystroke, so writing on
 * every mutation would mean thousands of writes an hour. Two seconds of delay
 * costs at most two seconds of data on a hard kill, and `flush` on deactivate
 * covers the ordinary exit.
 */
const WRITE_DELAY_MS = 2000;

/** Used when the configured retention is missing or not a usable number. */
const DEFAULT_RETENTION_DAYS = 730;

export class Store {
  private database: Database = emptyDatabase();
  private loaded = false;
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Serialises writes, so two flushes can never interleave on the same file. */
  private writing: Promise<void> = Promise.resolve();

  constructor(
    private readonly directory: string,
    private readonly retentionDays: () => number
  ) {}

  private get file(): string {
    return path.join(this.directory, FILE_NAME);
  }

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    try {
      const raw = await fs.readFile(this.file, "utf8");
      this.database = migrate(JSON.parse(raw));
    } catch (error) {
      // A missing file is the normal first run. Anything else is a file we
      // could not parse, and starting empty would silently destroy history, so
      // it is kept aside instead.
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        await this.quarantine(error);
      }
      this.database = emptyDatabase();
    }
    this.loaded = true;
    this.pruneOld();
  }

  /**
   * Moves an unreadable file aside rather than overwriting it. Stamped, so a
   * second failure cannot discard the first casualty, which would be the one
   * holding the most history.
   */
  private async quarantine(reason: unknown): Promise<void> {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const kept = `${this.file}.${stamp}.corrupt`;
    try {
      await fs.rename(this.file, kept);
      console.error(`[Almanac] activity.json could not be read (${String(reason)}); kept as ${kept}`);
    } catch (error) {
      console.error("[Almanac] activity.json could not be read or renamed:", error);
    }
  }

  /**
   * VS Code does not coerce a settings value that violates the contributed
   * schema, so `retentionDays` can arrive as a string or NaN. Left unguarded
   * that produces an invalid date, a `"NaN-NaN-NaN"` key, and a prune that
   * deletes every day the user has.
   */
  private get retention(): number {
    const configured = this.retentionDays();
    return Number.isFinite(configured) && configured >= 1 ? Math.floor(configured) : DEFAULT_RETENTION_DAYS;
  }

  private pruneOld(): void {
    const oldest = shift(keyOf(new Date()), -this.retention);
    const kept = prune(this.database.days, oldest);
    if (Object.keys(kept).length !== Object.keys(this.database.days).length) {
      this.database = { ...this.database, days: kept };
      this.dirty = true;
    }
  }

  get days(): Record<DayKey, DayRecord> {
    return this.database.days;
  }

  get snapshot(): Database {
    return this.database;
  }

  day(date: DayKey): DayRecord {
    return dayIn(this.database.days, date);
  }

  private update(date: DayKey, change: (record: DayRecord) => DayRecord): void {
    const next = change(dayIn(this.database.days, date));
    this.database = { ...this.database, days: { ...this.database.days, [date]: next } };
    this.schedule();
  }

  addTick(date: DayKey, tick: Tick): void {
    this.update(date, (record) => applyTick(record, tick));
  }

  count(date: DayKey, counter: Counter, by = 1): void {
    this.update(date, (record) => bump(record, counter, by));
  }

  addChange(date: DayKey, change: Change): void {
    this.update(date, (record) => addChange(record, change));
  }

  setCommits(date: DayKey, commits: number): void {
    if (this.day(date).commits === commits) {
      return;
    }
    this.update(date, (record) => setCommits(record, commits));
  }

  async clear(): Promise<void> {
    this.database = emptyDatabase();
    this.dirty = true;
    await this.flush();
  }

  private schedule(): void {
    this.dirty = true;
    if (this.timer) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, WRITE_DELAY_MS);
  }

  /** Writes now if anything changed. Safe to call concurrently. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.dirty) {
      return this.writing;
    }
    this.dirty = false;
    const payload = JSON.stringify(this.database);
    this.writing = this.writing.then(() => this.write(payload));
    return this.writing;
  }

  /**
   * Written to a temporary file and renamed, because rename is atomic. Writing
   * in place means a crash mid-write leaves a truncated file, which is the one
   * way this extension could lose a year of history.
   */
  private async write(payload: string): Promise<void> {
    const temporary = `${this.file}.tmp`;
    try {
      await fs.mkdir(this.directory, { recursive: true });
      await fs.writeFile(temporary, payload, "utf8");
      await fs.rename(temporary, this.file);
    } catch (error) {
      // Never thrown into the extension host, but the state has to go back to
      // dirty. A full disk during the final flush on deactivate would otherwise
      // lose the whole session with nothing left to trigger a retry.
      this.dirty = true;
      console.error("[Almanac] could not save activity data:", error);
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }
}
