// ABOUTME: Watches window focus and editor input, and credits active time to the day's record.
// ABOUTME: Nothing here reads file contents or paths — only language ids and the folder name.

import * as vscode from "vscode";
import { creditFor, isActive, startsSession, TICK_MS } from "../core/activityClock";
import { keyOf } from "../core/day";
import type { Store } from "../storage/store";

export class Tracker {
  private focused = vscode.window.state.focused;
  private lastInput = Date.now();
  private lastTick = Date.now();
  private wasActive = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly seenToday = new Set<string>();
  private seenDate = keyOf(new Date());
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly store: Store) {}

  private get enabled(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>("cadence.tracking.enabled", true);
  }

  private get trackProjects(): boolean {
    return vscode.workspace.getConfiguration().get<boolean>("cadence.trackProjects", true);
  }

  /** Folder name only — never the path, which would leak the whole directory tree. */
  private projectName(): string | undefined {
    if (!this.trackProjects) {
      return undefined;
    }
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder?.name;
  }

  private noteInput(): void {
    this.lastInput = Date.now();
  }

  start(): void {
    this.subscriptions.push(
      vscode.window.onDidChangeWindowState((state) => {
        this.focused = state.focused;
        if (state.focused) {
          this.noteInput();
        }
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== "file" || e.contentChanges.length === 0) {
          return;
        }
        this.noteInput();
        this.store.count(keyOf(new Date()), "edits");
        this.noteFile(e.document);
      }),
      vscode.window.onDidChangeTextEditorSelection(() => this.noteInput()),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this.noteInput();
        if (doc.uri.scheme === "file") {
          this.store.count(keyOf(new Date()), "saves");
        }
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.noteInput();
        if (editor) {
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
    const state = { focused: this.focused, lastInput: this.lastInput };
    const active = isActive(state, now);

    if (!this.enabled) {
      this.wasActive = false;
      this.lastTick = now;
      return;
    }

    const seconds = creditFor(state, now, this.lastTick);
    const date = keyOf(new Date());

    if (seconds > 0) {
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
    await this.store.flush();
  }
}
