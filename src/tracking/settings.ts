// ABOUTME: The tracking settings, read once and refreshed on change.
// ABOUTME: Selection and scroll events fire many times a second — too often to re-read configuration.

import * as vscode from "vscode";
import { DEFAULT_IDLE_MINUTES, idleWindowMs } from "../core/activityClock";

export interface Settings {
  enabled: boolean;
  trackProjects: boolean;
  trackTerminal: boolean;
  trackDebug: boolean;
  idleMs: number;
}

export function readSettings(): Settings {
  const config = vscode.workspace.getConfiguration();
  return {
    enabled: config.get<boolean>("almanac.tracking.enabled", true),
    trackProjects: config.get<boolean>("almanac.trackProjects", true),
    trackTerminal: config.get<boolean>("almanac.trackTerminal", true),
    trackDebug: config.get<boolean>("almanac.trackDebug", true),
    idleMs: idleWindowMs(config.get<number>("almanac.idleMinutes", DEFAULT_IDLE_MINUTES)),
  };
}

/** Holds the current settings so hot event paths read a field, not configuration. */
export class SettingsCache {
  private value = readSettings();
  private readonly subscription: vscode.Disposable;

  constructor() {
    this.subscription = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("almanac")) {
        this.value = readSettings();
      }
    });
  }

  get current(): Settings {
    return this.value;
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
