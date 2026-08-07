// ABOUTME: Persistence for daily records — a single JSON file in the extension's global storage.
// ABOUTME: Never the workspace, never the network. Writes are queued and debounced.

import * as vscode from "vscode";
import { addDays, keyOf } from "../core/day";
import { dayIn, prune, type Counter } from "../core/record";
import { addChange, applyTick, bump, setCommits } from "../core/record";
import type { Change } from "../core/composition";
import { emptyDatabase, type Database, type DayKey, type DayRecord, type Tick } from "../core/types";

const FILE = "activity.json";
const SAVE_DEBOUNCE_MS = 5000;

export class Store {
  private data: Database = emptyDatabase();
  private queue: Promise<unknown> = Promise.resolve();
  private pending: ReturnType<typeof setTimeout> | undefined;

  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private get uri(): vscode.Uri {
    return vscode.Uri.joinPath(this.context.globalStorageUri, FILE);
  }

  async load(): Promise<void> {
    try {
      const bytes = await vscode.workspace.fs.readFile(this.uri);
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Database>;
      this.data = { version: 1, days: parsed.days ?? {} };
    } catch {
      this.data = emptyDatabase();
    }
    this.changed.fire();
  }

  get days(): Record<DayKey, DayRecord> {
    return this.data.days;
  }

  today(now = new Date()): DayRecord {
    return dayIn(this.data.days, keyOf(now));
  }

  /**
   * Ticks arrive every few seconds, so writes are debounced rather than
   * immediate; `flush` on deactivate makes sure the last minutes aren't lost.
   */
  private scheduleSave(): void {
    this.changed.fire();
    if (this.pending) {
      return;
    }
    this.pending = setTimeout(() => {
      this.pending = undefined;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  flush(): Promise<void> {
    const work = async (): Promise<void> => {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      await vscode.workspace.fs.writeFile(
        this.uri,
        new TextEncoder().encode(JSON.stringify(this.data))
      );
    };
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private mutate(date: DayKey, change: (record: DayRecord) => DayRecord): void {
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

  recordCommits(date: DayKey, commits: number): void {
    this.mutate(date, (record) => setCommits(record, commits));
  }

  applyRetention(retentionDays: number, now = new Date()): void {
    const oldest = addDays(keyOf(now), -(retentionDays - 1));
    const before = Object.keys(this.data.days).length;
    this.data.days = prune(this.data.days, oldest);
    if (Object.keys(this.data.days).length !== before) {
      this.scheduleSave();
    }
  }

  async clear(): Promise<void> {
    this.data = emptyDatabase();
    await this.flush();
    this.changed.fire();
  }

  get snapshot(): Database {
    return JSON.parse(JSON.stringify(this.data)) as Database;
  }

  dispose(): void {
    if (this.pending) {
      clearTimeout(this.pending);
    }
    this.changed.dispose();
  }
}
