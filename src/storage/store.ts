// ABOUTME: Persistence for daily records — a single JSON file in the extension's global storage.
// ABOUTME: Never the workspace, never the network. Writes merge, are queued, and are atomic.

import * as vscode from "vscode";
import { addDays, keyOf } from "../core/day";
import { addChange, applyTick, bump, dayIn, prune, setCommits, type Counter } from "../core/record";
import { emptyDelta, mergeDatabases, normalizeDatabase } from "../core/merge";
import type { Change } from "../core/composition";
import { emptyDatabase, type Database, type DayKey, type DayRecord, type Tick } from "../core/types";

const FILE = "activity.json";
const TEMP = "activity.json.tmp";
const CORRUPT = "activity.corrupt.json";
const SAVE_DEBOUNCE_MS = 5000;

export class Store {
  /** Everything on disk as of the last read, plus everything merged since. */
  private data: Database = emptyDatabase();
  /** Only what this window has recorded since the last flush. */
  private delta: Record<DayKey, DayRecord> = emptyDelta();
  private queue: Promise<unknown> = Promise.resolve();
  private pending: ReturnType<typeof setTimeout> | undefined;
  private readOnly = false;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private uri(name: string): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, name);
  }

  private async readFile(): Promise<Record<DayKey, DayRecord> | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.uri(FILE));
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { days?: unknown };
      return normalizeDatabase(parsed.days);
    } catch (err) {
      if (err instanceof vscode.FileSystemError && err.code === "FileNotFound") {
        return {};
      }
      return undefined;
    }
  }

  async load(): Promise<void> {
    const days = await this.readFile();
    if (days === undefined) {
      // The file exists but won't parse. Keep it — overwriting would destroy
      // history that may still be recoverable — and don't write until told.
      this.readOnly = true;
      this.data = emptyDatabase();
      await this.preserveCorrupt();
      void vscode.window
        .showWarningMessage(
          "Cadence: your history file couldn't be read, so tracking is paused to avoid overwriting it.",
          "Start fresh"
        )
        .then(async (choice) => {
          if (choice === "Start fresh") {
            this.readOnly = false;
            await this.flush();
          }
        });
      return;
    }
    this.data = { version: 1, days };
  }

  private async preserveCorrupt(): Promise<void> {
    try {
      await vscode.workspace.fs.copy(this.uri(FILE), this.uri(CORRUPT), { overwrite: true });
    } catch {
      // Nothing to preserve, or we can't — either way, don't make it worse.
    }
  }

  get days(): Record<DayKey, DayRecord> {
    return this.data.days;
  }

  private scheduleSave(): void {
    if (this.pending) {
      return;
    }
    this.pending = setTimeout(() => {
      this.pending = undefined;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Re-read, merge this window's delta into what's on disk, then write atomically.
   *
   * A second VS Code window runs its own extension host with its own Store; a
   * plain overwrite would silently discard whatever the other window recorded.
   * Merging additively is safe because every field is a count or a duration.
   */
  flush(): Promise<void> {
    const work = async (): Promise<void> => {
      if (this.readOnly) {
        return;
      }
      const delta = this.delta;
      this.delta = emptyDelta();
      const onDisk = (await this.readFile()) ?? {};
      const merged = mergeDatabases(onDisk, delta);
      this.data = { version: 1, days: merged };

      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      const bytes = new TextEncoder().encode(JSON.stringify(this.data));
      // Write beside the real file and rename, so a kill mid-write can never
      // leave a truncated history behind.
      await vscode.workspace.fs.writeFile(this.uri(TEMP), bytes);
      await vscode.workspace.fs.rename(this.uri(TEMP), this.uri(FILE), { overwrite: true });
    };
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Record into both the delta (to be merged) and the live view (for the UI). */
  private mutate(date: DayKey, change: (record: DayRecord) => DayRecord): void {
    this.delta[date] = change(dayIn(this.delta, date));
    this.data.days[date] = change(dayIn(this.data.days, date));
    this.scheduleSave();
  }

  addTick(date: DayKey, tick: Tick): void {
    this.mutate(date, (record) => applyTick(record, tick));
  }

  count(date: DayKey, counter: Counter, by = 1): void {
    this.mutate(date, (record) => bump(record, counter, by));
  }

  addChange(date: DayKey, change: Change): void {
    this.mutate(date, (record) => addChange(record, change));
  }

  /** Commits are an absolute count from git, so this replaces rather than adds. */
  recordCommits(date: DayKey, commits: number): void {
    this.delta[date] = setCommits(dayIn(this.delta, date), commits);
    this.data.days[date] = setCommits(dayIn(this.data.days, date), commits);
    this.scheduleSave();
  }

  applyRetention(retentionDays: number, now = new Date()): void {
    const oldest = addDays(keyOf(now), -(retentionDays - 1));
    const before = Object.keys(this.data.days).length;
    this.data.days = prune(this.data.days, oldest);
    this.delta = prune(this.delta, oldest);
    if (Object.keys(this.data.days).length !== before) {
      this.scheduleSave();
    }
  }

  /** Days inside the retention window — used to avoid resurrecting pruned days. */
  isWithinRetention(date: DayKey, retentionDays: number, now = new Date()): boolean {
    return date >= addDays(keyOf(now), -(retentionDays - 1));
  }

  async clear(): Promise<void> {
    this.data = emptyDatabase();
    this.delta = emptyDelta();
    this.readOnly = false;
    await this.queue;
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    await vscode.workspace.fs.writeFile(
      this.uri(FILE),
      new TextEncoder().encode(JSON.stringify(this.data))
    );
  }

  get snapshot(): Database {
    return JSON.parse(JSON.stringify(this.data)) as Database;
  }

  /** Write anything still pending rather than dropping it on the way out. */
  async dispose(): Promise<void> {
    if (this.pending) {
      clearTimeout(this.pending);
      this.pending = undefined;
    }
    await this.flush();
  }
}
