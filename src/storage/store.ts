import * as fs from "fs/promises";
import * as path from "path";
import type { Change } from "../core/composition";
import { keyOf, shift, type DayKey } from "../core/day";
import { migrate } from "../core/migrate";
import {
  addChange,
  applyTick,
  bump,
  dayIn,
  mergeDays,
  prune,
  setCommits,
  type Counter,
} from "../core/record";
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

/**
 * How long a write may hold the lock before another window treats it as
 * abandoned. A read, merge and rename take milliseconds; a lock this old was
 * left by a window that died between creating it and removing it.
 */
const LOCK_STALE_MS = 10 * 1000;
const LOCK_ATTEMPTS = 8;
const LOCK_RETRY_MS = 25;

type Listener = () => void;

/**
 * One file, shared by every VS Code window on the machine.
 *
 * Each window runs its own extension host, so each has its own `Store`. The
 * first version of this class loaded the file once and wrote its whole memory
 * back on every change, which with two windows open meant each write erased
 * the other window's day. Now a window keeps only its own unwritten
 * contribution, the `delta`, and at write time re-reads the file, folds the
 * delta onto it under a lock, and adopts the result. What it shows is always
 * disk plus its own delta, so two windows converge on the same numbers.
 */
export class Store {
  private base: Database = emptyDatabase();
  private baseStamp = "";
  private baseText = "";
  /** What the last `read` saw, kept so a sync that writes nothing can still adopt it. */
  private diskText = "";
  private diskStamp = "";
  /** This window's contribution since the last successful write. */
  private delta: Record<DayKey, DayRecord> = {};
  /** The contribution a write in progress has taken, still shown until it lands. */
  private inFlight: Record<DayKey, DayRecord> = {};
  private view: Database | undefined;
  private loaded = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Serialises syncs, so two can never interleave on the same file. */
  private syncing: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly directory: string,
    private readonly retentionDays: () => number
  ) {}

  private get file(): string {
    return path.join(this.directory, FILE_NAME);
  }

  private get lockFile(): string {
    return `${this.file}.lock`;
  }

  /**
   * Fires when a sync found the file changed by another window. The dashboard
   * and the status bar re-render on it, so a second window's minutes appear
   * without waiting for this one to write.
   */
  onDidChange(listener: Listener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    await this.sync();
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

  private pruned(days: Record<DayKey, DayRecord>): Record<DayKey, DayRecord> {
    return prune(days, shift(keyOf(new Date()), -this.retention));
  }

  get days(): Record<DayKey, DayRecord> {
    return this.snapshot.days;
  }

  get snapshot(): Database {
    if (!this.view) {
      this.view = {
        ...this.base,
        days: mergeDays(mergeDays(this.base.days, this.inFlight), this.delta),
      };
    }
    return this.view;
  }

  day(date: DayKey): DayRecord {
    return dayIn(this.days, date);
  }

  private get dirty(): boolean {
    return Object.keys(this.delta).length > 0;
  }

  private update(date: DayKey, change: (record: DayRecord) => DayRecord): void {
    this.delta = { ...this.delta, [date]: change(dayIn(this.delta, date)) };
    this.view = undefined;
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

  /**
   * Commits merge by max across windows, so a reading no larger than what is
   * already shown would change nothing and is not written. That also means a
   * count never goes down: a rebase that squashes today's commits keeps the
   * higher figure until the day is pruned.
   */
  setCommits(date: DayKey, commits: number): void {
    if ((this.day(date).commits ?? -1) >= commits) {
      return;
    }
    this.update(date, (record) => setCommits(record, commits));
  }

  /**
   * Deletes everything, including what other windows have written. A window
   * that still holds an unwritten delta will add those few seconds back on its
   * next write, which is honest: they happened.
   */
  async clear(): Promise<void> {
    this.delta = {};
    this.inFlight = {};
    this.view = undefined;
    await this.run(async () => {
      const done = await this.withLock(async () => {
        const empty = emptyDatabase();
        const written = await this.persist(empty);
        this.adopt(empty, written.text, written.stamp);
      });
      if (!done) {
        throw new Error("Almanac could not delete activity.json: another window is writing it. Try again.");
      }
    });
  }

  private schedule(): void {
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
    return this.sync();
  }

  /**
   * Brings this window up to date with the file, writing its delta if it has
   * one. Cheap when nothing moved: a stat, and no read when the stamp matches.
   */
  async sync(): Promise<void> {
    return this.run(() => this.reconcile());
  }

  private run(step: () => Promise<void>): Promise<void> {
    this.syncing = this.syncing.then(step, step);
    return this.syncing;
  }

  private async reconcile(): Promise<void> {
    const taken = this.delta;
    this.delta = {};
    this.inFlight = taken;
    const writing = Object.keys(taken).length > 0;
    try {
      const done = await this.withLock(async () => {
        const disk = await this.read();
        const merged = this.pruned(writing ? mergeDays(disk.days, taken) : disk.days);
        const next = { ...disk, days: merged };
        if (writing || Object.keys(merged).length !== Object.keys(disk.days).length) {
          const written = await this.persist(next);
          this.adopt(next, written.text, written.stamp);
        } else {
          this.adopt(next, this.diskText, this.diskStamp);
        }
      });
      if (!done) {
        this.restore();
      }
    } catch (error) {
      // Never thrown into the extension host, but the delta goes back so the
      // next write carries it. A full disk during the final flush on deactivate
      // would otherwise lose the whole session with nothing left to retry.
      this.restore();
      console.error("[Almanac] could not save activity data:", error);
    }
  }

  /**
   * Puts a delta that failed to land back in front of anything added since.
   * Only what is still in flight: a delta the rename already carried to disk
   * has been moved into `base`, and replaying it would count it twice.
   */
  private restore(): void {
    this.delta = mergeDays(this.inFlight, this.delta);
    this.inFlight = {};
    this.view = undefined;
    if (this.dirty) {
      this.schedule();
    }
  }

  /**
   * The file as it is now. Skips the parse when the stamp says nothing has
   * moved since this window last read or wrote it, which is the common case
   * with a single window open.
   */
  private async read(): Promise<Database> {
    let stamp = "";
    try {
      const stat = await fs.stat(this.file);
      stamp = `${stat.ino}:${stat.mtimeMs}:${stat.size}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
        throw error;
      }
      this.diskText = "";
      this.diskStamp = "";
      return emptyDatabase();
    }
    if (stamp === this.baseStamp) {
      this.diskText = this.baseText;
      this.diskStamp = stamp;
      return this.base;
    }
    const text = await fs.readFile(this.file, "utf8");
    this.diskText = text;
    this.diskStamp = stamp;
    try {
      return migrate(JSON.parse(text));
    } catch (error) {
      // Starting empty would write the empty database back over the original
      // within seconds, so it is kept aside instead.
      await this.quarantine(error);
      this.diskText = "";
      this.diskStamp = "";
      return emptyDatabase();
    }
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
   * Written to a temporary file and renamed, because rename is atomic. Writing
   * in place means a crash mid-write leaves a truncated file, which is the one
   * way this extension could lose a year of history.
   */
  private async persist(database: Database): Promise<{ text: string; stamp: string }> {
    const text = JSON.stringify(database);
    const temporary = `${this.file}.${process.pid}.tmp`;
    await fs.mkdir(this.directory, { recursive: true });
    await fs.writeFile(temporary, text, "utf8");
    await fs.rename(temporary, this.file);
    // The rename is the moment the delta is on disk. Nothing after it may put
    // the delta back, and `adopt` notifies listeners who would otherwise see
    // it in both `base` and `inFlight`.
    this.inFlight = {};
    // An empty stamp when the stat fails forces a real read next time rather
    // than trusting a base that might be behind the file.
    const stamp = await fs
      .stat(this.file)
      .then((stat) => `${stat.ino}:${stat.mtimeMs}:${stat.size}`)
      .catch(() => "");
    return { text, stamp };
  }

  private adopt(database: Database, text: string, stamp: string): void {
    const changed = text !== this.baseText;
    this.base = database;
    this.baseText = text;
    this.baseStamp = stamp;
    this.view = undefined;
    if (changed) {
      for (const listener of this.listeners) {
        listener();
      }
    }
  }

  /**
   * Runs `step` while holding the lock file, and returns false when the lock
   * could not be taken in time. The wait is bounded and short: a delta that
   * misses this write simply rides the next one, two seconds later.
   */
  private async withLock(step: () => Promise<void>): Promise<boolean> {
    await fs.mkdir(this.directory, { recursive: true });
    for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
      const handle = await fs.open(this.lockFile, "wx").catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "EEXIST") {
          throw error;
        }
        return undefined;
      });
      if (handle) {
        try {
          await handle.close();
          await step();
        } finally {
          await fs.rm(this.lockFile, { force: true });
        }
        return true;
      }
      await this.clearStaleLock();
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
    console.error("[Almanac] activity.json is locked by another window; will retry");
    return false;
  }

  /**
   * Stolen by rename rather than removed, so two windows finding the same
   * stale lock cannot both "clear" it: only one rename succeeds, and the
   * other's removal can no longer hit a lock the winner has since created.
   */
  private async clearStaleLock(): Promise<void> {
    const stolen = `${this.lockFile}.${process.pid}.stale`;
    try {
      const stat = await fs.stat(this.lockFile);
      if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        await fs.rename(this.lockFile, stolen);
        await fs.rm(stolen, { force: true });
      }
    } catch {
      // Gone already, or another window got there first. Either way we retry.
    }
  }

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.listeners.clear();
  }
}
