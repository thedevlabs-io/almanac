import * as vscode from "vscode";
import { DEFAULT_IDLE_MINUTES, idleWindowMs } from "../core/presence";
import type { Rounding } from "../core/report";

export interface Settings {
  enabled: boolean;
  idleMs: number;
  countTerminal: boolean;
  countDebug: boolean;
  trackProjects: boolean;
  trackGitCommits: boolean;
  statusBar: boolean;
  streakMinMinutes: number;
  retentionDays: number;
  clients: Record<string, string>;
  rounding: Rounding;
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration("almanac");
  return {
    enabled: config.get<boolean>("enabled", true),
    idleMs: idleWindowMs(config.get<number>("idleMinutes", DEFAULT_IDLE_MINUTES)),
    countTerminal: config.get<boolean>("countTerminal", true),
    countDebug: config.get<boolean>("countDebug", true),
    trackProjects: config.get<boolean>("trackProjects", true),
    trackGitCommits: config.get<boolean>("trackGitCommits", true),
    statusBar: config.get<boolean>("statusBar.enabled", true),
    streakMinMinutes: config.get<number>("streak.minMinutes", 5),
    retentionDays: config.get<number>("retentionDays", 730),
    clients: config.get<Record<string, string>>("clients", {}),
    rounding: config.get<Rounding>("report.rounding", "none"),
  };
}

/** Holds current settings so hot event paths read a field rather than configuration. */
export class SettingsCache {
  private value = readSettings();
  private readonly emitter = new vscode.EventEmitter<Settings>();
  private readonly subscription: vscode.Disposable;

  readonly onDidChange = this.emitter.event;

  constructor() {
    this.subscription = vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("almanac")) {
        this.value = readSettings();
        this.emitter.fire(this.value);
      }
    });
  }

  get current(): Settings {
    return this.value;
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }
}
