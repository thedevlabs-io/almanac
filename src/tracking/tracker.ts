// ABOUTME: Watches window focus and editor input, and credits active time to the day's record.
// ABOUTME: Nothing here reads file contents or paths — only language ids and the folder name.

import * as vscode from "vscode";
import { creditFor, isActive, startsSession, TICK_MS } from "../core/activityClock";
import { classify } from "../core/composition";
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
      // Focus alone must never restart the clock: alt-tabbing in and reading for
      // two minutes is not two minutes of work.
      vscode.window.onDidChangeWindowState((state) => {
        this.focused = state.focused;
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this.enabled || e.document.uri.scheme !== "file" || e.contentChanges.length === 0) {
          return;
        }
        // Only keystroke-sized edits in the editor you're looking at count as
        // input. A formatter, a git checkout or an agent writing a file must not
        // hold the clock open while you're away — which is precisely the case
        // this extension has to get right, since it also measures agent edits.
        const inActiveEditor =
          vscode.window.activeTextEditor?.document.uri.toString() === e.document.uri.toString();
        const typed = e.contentChanges.some(
          (change) =>
            classify({
              inserted: change.text.length,
              removed: change.rangeLength,
              multiline: change.text.includes("\n"),
            }) === "typed"
        );
        if (inActiveEditor && typed) {
          this.noteInput();
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
      // Moving the cursor is the clearest human signal there is.
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (this.enabled && e.kind !== undefined) {
          this.noteInput();
        }
      }),
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (!this.enabled || doc.uri.scheme !== "file") {
          return;
        }
        this.noteInput();
        this.store.count(keyOf(new Date()), "saves");
      }),
      // Switching tabs is not input — an extension can open a document too.
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (this.enabled && editor) {
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
