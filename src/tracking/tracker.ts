import * as vscode from "vscode";
import { keyOf } from "../core/day";
import {
  creditFor,
  explain,
  isActive,
  startsSession,
  SUSPEND_MS,
  TICK_MS,
  type Explanation,
} from "../core/presence";
import type { Store } from "../storage/store";
import { commitsByDay } from "./git";
import { ProjectResolver } from "./projects";
import type { SettingsCache } from "./settings";
import { InputSignals } from "./signals";

/** How often commit counts are refreshed. Reading git logs is not free. */
const COMMIT_POLL_MS = 5 * 60 * 1000;

export class Tracker {
  private readonly signals: InputSignals;
  private readonly projects = new ProjectResolver();
  private lastTick = Date.now();
  private wasActive = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private commitTimer: ReturnType<typeof setInterval> | undefined;
  private readonly seenToday = new Set<string>();
  private seenDate = keyOf(new Date());
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly changed = new vscode.EventEmitter<void>();

  /** Fires when today's totals moved, so the status bar can refresh itself. */
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly store: Store,
    private readonly settings: SettingsCache
  ) {
    this.signals = new InputSignals(settings);
  }

  async start(): Promise<void> {
    this.signals.watch();
    await this.projects.warm();

    this.subscriptions.push(
      // Every edit is counted, whoever made it: a keystroke, a paste, a
      // refactor, an agent. Volume is measurable and honest; authorship is not,
      // so composition.ts splits it by how the text arrived and stops there.
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (
          !this.settings.current.enabled ||
          event.contentChanges.length === 0 ||
          event.document.uri.scheme !== "file"
        ) {
          return;
        }
        const date = keyOf(new Date());
        this.store.count(date, "edits");
        for (const change of event.contentChanges) {
          this.store.addChange(date, {
            inserted: change.text.length,
            removed: change.rangeLength,
            multiline: change.text.includes("\n"),
          });
        }
        this.noteFile(event.document);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (this.settings.current.enabled && document.uri.scheme === "file") {
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
    void this.refreshCommits();
    this.commitTimer = setInterval(() => void this.refreshCommits(), COMMIT_POLL_MS);
  }

  /** Counts distinct files per day without keeping anything identifying. */
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
    const { enabled, idleMs, trackProjects } = this.settings.current;

    if (!enabled) {
      this.wasActive = false;
      this.lastTick = now;
      return;
    }

    // Polled rather than purely event-driven, because this is what sees a
    // keystroke in a terminal or the Simple Browser.
    this.signals.sample();
    const state = this.signals.presence;

    const active = isActive(state, now, idleMs);
    const seconds = creditFor(state, now, this.lastTick, idleMs);

    // A gap this long means the host stopped running: a closed lid, a sleeping
    // machine. Coming back is a new session, and without this the pre-suspend
    // signal is still inside the idle window so `wasActive` never drops.
    if (now - this.lastTick > SUSPEND_MS) {
      this.wasActive = false;
    }

    if (seconds > 0) {
      const date = keyOf(new Date());
      if (startsSession(this.wasActive, active)) {
        this.store.count(date, "sessions");
      }
      const project = trackProjects ? this.projects.current() : undefined;
      // The whole interval lands on the day and hour read at the end of the
      // tick. Across midnight that misfiles at most one tick, fifteen seconds,
      // which is not worth splitting an interval to avoid.
      this.store.addTick(date, {
        seconds,
        hour: new Date().getHours(),
        language: vscode.window.activeTextEditor?.document.languageId,
        ...(project ? { project: { repo: project.repo, folder: project.folder } } : {}),
        ...(state.lastKind ? { kind: state.lastKind } : {}),
      });
      this.changed.fire();
    }

    this.wasActive = active;
    this.lastTick = now;
  }

  private async refreshCommits(): Promise<void> {
    if (!this.settings.current.enabled || !this.settings.current.trackGitCommits) {
      return;
    }
    const counts = await commitsByDay();
    for (const [date, commits] of Object.entries(counts)) {
      this.store.setCommits(date, commits);
    }
    this.changed.fire();
  }

  /** Why the clock is or is not running right now, in a sentence. */
  status(): Explanation {
    return explain(
      this.signals.presence,
      Date.now(),
      this.settings.current.idleMs,
      this.settings.current.enabled
    );
  }

  async dispose(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.commitTimer) {
      clearInterval(this.commitTimer);
    }
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.signals.dispose();
    this.projects.dispose();
    this.changed.dispose();
    await this.store.flush();
  }
}
