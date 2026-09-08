import * as vscode from "vscode";
import { keyOf } from "../core/day";
import {
  creditFor,
  explain,
  projectCreditFor,
  startsSession,
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

/**
 * Schemes whose documents are yours. The output panel and a git diff are text
 * editors too, and without this the language table fills with `log` for time
 * spent reading build output.
 */
const OWN_SCHEMES = new Set(["file", "untitled", "vscode-notebook-cell"]);

function currentLanguage(): string | undefined {
  const document = vscode.window.activeTextEditor?.document;
  return document && OWN_SCHEMES.has(document.uri.scheme) ? document.languageId : undefined;
}

export class Tracker {
  private readonly signals: InputSignals;
  private readonly projects = new ProjectResolver();
  private lastTick = Date.now();
  /** Epoch ms of the last tick that credited time. Zero until one has. */
  private lastCredited = 0;
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
    const moment = new Date();
    const now = moment.getTime();
    const { enabled, idleMs, trackProjects, concurrentProjects } = this.settings.current;

    if (!enabled) {
      this.lastTick = now;
      return;
    }

    // Polled rather than purely event-driven, because this is what sees a
    // keystroke in a terminal.
    this.signals.sample();
    const state = this.signals.presence;
    const seconds = creditFor(state, now, this.lastTick, idleMs);
    const projectSeconds =
      trackProjects && concurrentProjects ? projectCreditFor(state, now, this.lastTick, idleMs) : 0;
    this.lastTick = now;
    const date = keyOf(moment);
    const project = trackProjects ? this.projects.current() : undefined;

    if (seconds <= 0) {
      // Not focused, or nothing happening. Under concurrentProjects the
      // repository alone keeps counting: no session, no hour, no language,
      // nothing that would make the day itself longer.
      if (projectSeconds > 0 && project) {
        this.store.addProjectTime(date, { repo: project.repo, folder: project.folder }, projectSeconds);
        this.changed.fire();
      }
      return;
    }

    if (startsSession(this.lastCredited, now)) {
      this.store.count(date, "sessions");
    }
    this.lastCredited = now;
    const language = currentLanguage();
    // The whole interval lands on the day and hour read at the end of the
    // tick. Across midnight that misfiles at most one tick, fifteen seconds,
    // which is not worth splitting an interval to avoid.
    this.store.addTick(date, {
      seconds,
      hour: moment.getHours(),
      ...(language ? { language } : {}),
      ...(project ? { project: { repo: project.repo, folder: project.folder } } : {}),
      ...(state.lastKind ? { kind: state.lastKind } : {}),
    });
    this.changed.fire();
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
      this.settings.current.enabled,
      this.settings.current.trackProjects && this.settings.current.concurrentProjects
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
