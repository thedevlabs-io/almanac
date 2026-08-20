import * as vscode from "vscode";
import {
  initialState,
  isHumanScroll,
  type PresenceState,
  type SignalKind,
  type SignalSource,
} from "../core/presence";
import type { SettingsCache } from "./settings";

/**
 * What Almanac can observe about a person being present.
 *
 * The human tier is `vscode.window.state.active`, VS Code's own answer to "has
 * this window been interacted with recently", plus editor selections whose
 * `kind` is specifically `Keyboard` or `Mouse`. That is deliberately narrow:
 * `state.active` already sees keystrokes in the terminal, the Simple Browser,
 * webviews and the settings editor, none of which reach an extension any other
 * way, so nothing else needs to be trusted to prove a person is here.
 *
 * Everything else is machine evidence. An agent writing to the file you have
 * open, a watch task restarting, a debugger landing on a frame in a crash loop,
 * output from a command: each is real evidence that work is happening, and none
 * of it proves you are in the chair. Those extend a clock a person opened and
 * never open one, which is what bounds how long a `tail -f` in a focused window
 * can keep counting.
 */
export class InputSignals {
  private state: PresenceState = initialState(vscode.window.state.focused);
  private lastEdit = 0;
  private viewport: { uri: string; top: number } | undefined;
  private disposed = false;
  /** Live output readers, so dispose can stop consuming rather than leak them. */
  private readonly readers = new Set<AbortController>();
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly settings: SettingsCache) {}

  get presence(): PresenceState {
    return this.state;
  }

  private signal(kind: SignalKind, source: SignalSource): void {
    if (this.disposed || !this.settings.current.enabled) {
      return;
    }
    const now = Date.now();
    this.state = {
      ...this.state,
      lastSignal: now,
      lastHuman: source === "human" ? now : this.state.lastHuman,
      lastKind: kind,
    };
  }

  /**
   * Called once per tick. Polled rather than subscribed because between its own
   * transitions `state.active` fires no event, and the stretch we most need to
   * see is someone typing steadily in a terminal.
   */
  sample(): void {
    this.state = { ...this.state, focused: vscode.window.state.focused };
    if (!vscode.window.state.active || !this.state.focused) {
      return;
    }
    const surface = this.activeSurface();
    if (surface === undefined) {
      return;
    }
    this.signal(surface, "human");
  }

  /**
   * Which surface the interaction came from, or undefined when a setting says
   * that surface should not be counted.
   *
   * The settings check has to happen here rather than on the label, otherwise
   * turning off `countTerminal` would keep crediting terminal keystrokes under
   * a different name and the setting would do nothing at all.
   */
  private activeSurface(): SignalKind | undefined {
    // No text editor in front and a terminal open is as close as the API gets
    // to "the terminal has the keyboard".
    if (vscode.window.activeTextEditor === undefined && vscode.window.activeTerminal) {
      return this.settings.current.countTerminal ? "terminal" : undefined;
    }
    if (vscode.window.activeNotebookEditor) {
      return "notebook";
    }
    if (vscode.window.activeTextEditor) {
      return "editor";
    }
    return "window";
  }

  watch(): void {
    this.subscriptions.push(
      vscode.window.onDidChangeWindowState((state) => {
        this.state = { ...this.state, focused: state.focused };
        if (state.focused && state.active) {
          this.signal("window", "human");
        }
      }),

      // `Keyboard` and `Mouse` are the only kinds a person is required to have
      // produced. `Command` covers any extension moving the cursor, which is
      // why it is excluded rather than merely deprioritised.
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (
          event.kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
          event.kind === vscode.TextEditorSelectionChangeKind.Mouse
        ) {
          this.signal("editor", "human");
        }
      }),

      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length === 0) {
          return;
        }
        // Stamped for every change wherever it landed, because it is what tells
        // a human scroll from an edit's own reflow.
        this.lastEdit = Date.now();
        // Machine, not human: an agent writing to the file you have open and
        // focused produces exactly this event, and your own typing is already
        // covered by the selection change and by `state.active`.
        if (
          vscode.window.activeTextEditor?.document.uri.toString() === event.document.uri.toString()
        ) {
          this.signal("editor", "machine");
        }
      }),

      // Reading is work, and reading looks like scrolling. Machine, because an
      // extension can reveal a range; a person scrolling sets `state.active`.
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (event.textEditor !== vscode.window.activeTextEditor) {
          return;
        }
        const uri = event.textEditor.document.uri.toString();
        const top = event.visibleRanges[0]?.start.line;
        if (top === undefined) {
          return;
        }
        const previous = this.viewport;
        this.viewport = { uri, top };
        if (!previous || previous.uri !== uri) {
          return;
        }
        if (isHumanScroll(Date.now(), this.lastEdit, previous.top !== top)) {
          this.signal("editor", "machine");
        }
      }),

      vscode.window.onDidChangeActiveTextEditor(() => {
        this.viewport = undefined;
        this.signal("editor", "machine");
      }),

      vscode.window.tabGroups.onDidChangeTabs(() => this.signal("tabs", "machine")),
      vscode.window.tabGroups.onDidChangeTabGroups(() => this.signal("tabs", "machine")),

      vscode.window.onDidChangeActiveNotebookEditor(() => this.signal("notebook", "machine")),
      // Fires on cell output too, so a long running cell printing progress is
      // machine evidence rather than proof anyone is watching it.
      vscode.workspace.onDidChangeNotebookDocument(() => this.signal("notebook", "machine"))
    );

    this.watchTerminals();
    this.watchDebug();
    this.watchTasks();
  }

  /**
   * The terminal case `state.active` cannot cover: a command running for twenty
   * minutes while you read its output and touch nothing.
   *
   * Only the fact that a chunk arrived is used. The chunks are discarded
   * without being inspected, because they are your shell's output.
   */
  private watchTerminals(): void {
    const terminal = (): boolean => this.settings.current.countTerminal;
    this.subscriptions.push(
      vscode.window.onDidChangeActiveTerminal(() => {
        if (terminal()) {
          this.signal("terminal", "machine");
        }
      }),
      vscode.window.onDidOpenTerminal(() => {
        if (terminal()) {
          this.signal("terminal", "machine");
        }
      }),
      vscode.window.onDidStartTerminalShellExecution((event) => {
        if (terminal()) {
          this.signal("terminal", "machine");
          void this.followOutput(event.execution);
        }
      }),
      vscode.window.onDidEndTerminalShellExecution(() => {
        if (terminal()) {
          this.signal("terminal", "machine");
        }
      })
    );
  }

  /**
   * Reads a command's output stream for as long as it runs. Registered in
   * `readers` so `dispose` can abandon a stream that never ends, which is the
   * ordinary case for a dev server or a `tail -f`.
   */
  private async followOutput(execution: vscode.TerminalShellExecution): Promise<void> {
    const controller = new AbortController();
    this.readers.add(controller);
    try {
      for await (const chunk of execution.read()) {
        void chunk;
        if (controller.signal.aborted || this.disposed || !this.settings.current.countTerminal) {
          return;
        }
        this.signal("terminal", "machine");
      }
    } catch {
      // A stream that ends badly is not worth reporting; the command is over.
    } finally {
      this.readers.delete(controller);
    }
  }

  /**
   * Stepping moves no cursor and often scrolls nothing, so a debugging session
   * would otherwise read as idle. Machine, because a session that stops on its
   * own, a crash loop under `restart`, lands on a new frame exactly as a step
   * does and nothing in the API distinguishes them. Your own keypress on the
   * step button is counted by `state.active` regardless.
   */
  private watchDebug(): void {
    const debugging = (): boolean => this.settings.current.countDebug;
    this.subscriptions.push(
      vscode.debug.onDidChangeActiveStackItem((item) => {
        if (item && debugging()) {
          this.signal("debug", "machine");
        }
      }),
      vscode.debug.onDidStartDebugSession(() => {
        if (debugging()) {
          this.signal("debug", "machine");
        }
      }),
      vscode.debug.onDidTerminateDebugSession(() => {
        if (debugging()) {
          this.signal("debug", "machine");
        }
      })
    );
  }

  /** A watch task restarts on every file change, so this is machine evidence. */
  private watchTasks(): void {
    this.subscriptions.push(
      vscode.tasks.onDidStartTask(() => this.signal("task", "machine")),
      vscode.tasks.onDidEndTask(() => this.signal("task", "machine"))
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const controller of this.readers) {
      controller.abort();
    }
    this.readers.clear();
    for (const subscription of this.subscriptions) {
      subscription.dispose();
    }
    this.subscriptions.length = 0;
  }
}
