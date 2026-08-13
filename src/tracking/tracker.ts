// ABOUTME: Credits active time to the day's record, and counts what was written while you were there.
// ABOUTME: Nothing here reads file contents or paths — only language ids and the folder name.

import * as vscode from "vscode";
import { creditFor, isActive, startsSession, TICK_MS } from "../core/activityClock";
import { keyOf } from "../core/day";
import type { Store } from "../storage/store";
import { SettingsCache } from "./settings";
import { InputSignals } from "./signals";

export class Tracker {
  private readonly settings = new SettingsCache();
  private readonly signals = new InputSignals(this.settings);
  private lastTick = Date.now();
  private wasActive = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly seenToday = new Set<string>();
  private seenDate = keyOf(new Date());
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly store: Store) {}

  /** Folder name only — never the path, which would leak the whole directory tree. */
  private projectName(): string | undefined {
    if (!this.settings.current.trackProjects) {
      return undefined;
    }
    return vscode.workspace.workspaceFolders?.[0]?.name;
  }

  start(): void {
    this.signals.watch();

    this.subscriptions.push(
      // Every edit is counted, whoever made it — a keystroke, a paste, a
      // refactor, an agent. Volume is measurable and honest; authorship is not,
      // so composition.ts splits it by how the text arrived and stops there.
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (
          !this.settings.current.enabled ||
          e.contentChanges.length === 0 ||
          e.document.uri.scheme !== "file"
        ) {
          return;
        }
        const date = keyOf(new Date());
        this.store.count(date, "edits");
        for (const change of e.contentChanges) {
          this.store.addChange(date, {
            inserted: change.text.length,
            removed: change.rangeLength,
            multiline: change.text.includes("\n"),
          });
        }
        this.noteFile(e.document);
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (this.settings.current.enabled && doc.uri.scheme === "file") {
          this.store.count(keyOf(new Date()), "saves");
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.settings.current.enabled && editor) {
          this.noteFile(editor.document);
        }
      })
    );

    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Counts distinct files per day without keeping any identifying detail. */
  private noteFile(document: vscode.TextDocument): void {
    const date = keyOf(new Date());
    if (date !== this.seenDate) {
      this.seenToday.clear();
      this.seenDate = date;
    }
    const key = document.uri.toString();
    if (!this.seenToday.has(key)) {
      this.seenToday.add(key);
      this.store.count(date, "files");
    }
  }

  private tick(): void {
    const now = Date.now();
    const { enabled, idleMs } = this.settings.current;
    const state = this.signals.state;

    if (!enabled) {
      this.wasActive = false;
      this.lastTick = now;
      return;
    }

    const active = isActive(state, now, idleMs);
    const seconds = creditFor(state, now, this.lastTick, idleMs);

    if (seconds > 0) {
      const date = keyOf(new Date());
      if (startsSession(this.wasActive, active)) {
        this.store.count(date, "sessions");
      }
      this.store.addTick(date, {
        seconds,
        hour: new Date().getHours(),
        language: vscode.window.activeTextEditor?.document.languageId,
        project: this.projectName(),
      });
    }

    this.wasActive = active;
    this.lastTick = now;
  }

  async dispose(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.signals.dispose();
    this.settings.dispose();
    await this.store.flush();
  }
}
