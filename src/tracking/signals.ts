// ABOUTME: Decides what counts as a human being present — the only thing that opens the clock.
// ABOUTME: Records nothing and touches no store: it answers "is someone here?", not "what did they do?".

import * as vscode from "vscode";
import { isHumanScroll, withinIdle, type ClockState } from "../core/activityClock";
import { classify } from "../core/composition";
import type { SettingsCache } from "./settings";

/**
 * Every signal here has to be something a person did. The hard cases are the
 * ones a machine can fake — an agent writing to the file you left open, an
 * extension running a command in a terminal it opened for you — and each is
 * excluded at the point it arrives rather than after the fact.
 *
 * Saving is deliberately not a signal. `TextDocumentSaveReason.Manual` covers
 * "by an API call" as well as your Ctrl+S, so an agent that saves what it wrote
 * is indistinguishable from you saving it — and a save you made yourself is
 * always preceded by the typing that made it worth saving, which already counts.
 */
export class InputSignals {
  private focused = vscode.window.state.focused;
  // Zero, not now: opening a window is not working in it. The clock stays shut
  // until something actually happens, so a window restored on login and left
  // alone credits nothing.
  private lastInput = 0;
  /** The last signal that came from a keyboard, mouse or trackpad specifically. */
  private lastDevice = 0;
  /** When a document last changed, to tell a human scroll from an edit's reflow. */
  private lastEdit = 0;
  /** Where the active editor was last seen, to tell a scroll from a resize. */
  private viewport: { uri: string; top: number } | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly settings: SettingsCache) {}

  /** What the clock needs to know, and all it needs to know. */
  get state(): ClockState {
    return { focused: this.focused, lastInput: this.lastInput };
  }

  /** A keyboard or pointer did this. Only these can open the clock. */
  private note(): void {
    const now = Date.now();
    this.lastInput = now;
    this.lastDevice = now;
  }

  /**
   * A terminal or debugger did this, and neither can prove a person did it: an
   * agent shows its terminal, so it becomes the active one, and a crash loop
   * lands on a stack frame like a step does. So these may only hold open a clock
   * a keyboard or pointer already opened — never start one. That bounds what a
   * machine can claim to one idle window past the last thing you actually did.
   */
  private extend(): void {
    const now = Date.now();
    if (withinIdle(now, this.lastDevice, this.settings.current.idleMs)) {
      this.lastInput = now;
    }
  }

  private get enabled(): boolean {
    return this.settings.current.enabled;
  }

  watch(): void {
    this.subscriptions.push(
      // Focus alone must never restart the clock: alt-tabbing in and reading for
      // two minutes is not two minutes of work.
      vscode.window.onDidChangeWindowState((state) => {
        this.focused = state.focused;
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!this.enabled || e.contentChanges.length === 0) {
          return;
        }
        // Stamped for every change, whatever the scheme and wherever it landed,
        // because it is what tells a human scroll from an edit's own reflow.
        this.lastEdit = Date.now();
        // Only keystroke-sized edits in the editor you're looking at count as
        // input. A formatter, a git checkout or an agent writing a file must not
        // hold the clock open while you're away — which is precisely the case
        // this extension has to get right, since it also measures agent edits.
        // Typing counts wherever you type it: an untitled scratch buffer or a
        // notebook cell is work too, even though only files are counted.
        const inActiveEditor =
          vscode.window.activeTextEditor?.document.uri.toString() === e.document.uri.toString();
        if (inActiveEditor && e.contentChanges.some(isKeystroke)) {
          this.note();
        }
      }),
      // Moving the cursor is the clearest human signal there is.
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (this.enabled && e.kind !== undefined) {
          this.note();
        }
      }),
      // Reading is work, and reading looks like scrolling.
      vscode.window.onDidChangeTextEditorVisibleRanges((e) => {
        if (e.textEditor !== vscode.window.activeTextEditor || !this.enabled) {
          return;
        }
        const uri = e.textEditor.document.uri.toString();
        const top = e.visibleRanges[0]?.start.line;
        if (top === undefined) {
          return;
        }
        const previous = this.viewport;
        this.viewport = { uri, top };
        // A different document is a tab switch, which an extension can do too.
        if (!previous || previous.uri !== uri) {
          return;
        }
        if (isHumanScroll(Date.now(), this.lastEdit, previous.top !== top)) {
          this.note();
        }
      }),
      // Switching tabs is not input — an extension can open a document too.
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.viewport = undefined;
      }),
      // Running the test suite is work even though the editor never moves.
      vscode.window.onDidChangeActiveTerminal((terminal) => {
        if (this.enabled && this.settings.current.trackTerminal && terminal) {
          this.extend();
        }
      })
    );

    this.watchShellExecutions();
    this.watchDebugSteps();
  }

  /**
   * Shell integration reports each command you run — the keypress the terminal
   * itself never exposes. Three limits: only the start, because a command that
   * outlives the idle window is the kind you started and walked away from; only
   * in the terminal you're actually in; and only through `extend`, since an
   * agent shows the terminal it works in and that makes it the active one.
   * Added in VS Code 1.93, so it is probed rather than assumed — the rest still
   * works without it.
   */
  private watchShellExecutions(): void {
    if (typeof vscode.window.onDidStartTerminalShellExecution !== "function") {
      return;
    }
    this.subscriptions.push(
      vscode.window.onDidStartTerminalShellExecution((e) => {
        if (
          this.enabled &&
          this.settings.current.trackTerminal &&
          e.terminal === vscode.window.activeTerminal
        ) {
          this.extend();
        }
      })
    );
  }

  /**
   * Stepping moves no cursor and often scrolls nothing, so without this a
   * debugging session reads as idle. The honest caveat, and why it has its own
   * setting: a session that stops on its own — a crash loop under `restart` —
   * lands on a new frame too, and this cannot tell that from a step. Added in
   * VS Code 1.94, so it is probed rather than assumed.
   */
  private watchDebugSteps(): void {
    if (typeof vscode.debug.onDidChangeActiveStackItem !== "function") {
      return;
    }
    this.subscriptions.push(
      vscode.debug.onDidChangeActiveStackItem((item) => {
        if (this.enabled && this.settings.current.trackDebug && item) {
          this.extend();
        }
      })
    );
  }

  dispose(): void {
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
  }
}

/** A keystroke-sized edit — the only kind of edit that proves someone is typing. */
function isKeystroke(change: vscode.TextDocumentContentChangeEvent): boolean {
  return (
    classify({
      inserted: change.text.length,
      removed: change.rangeLength,
      multiline: change.text.includes("\n"),
    }) === "typed"
  );
}
