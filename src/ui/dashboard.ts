// ABOUTME: The dashboard tab — one reused panel, redrawn from the model on demand.
// ABOUTME: Buttons post back; the extension owns every action that touches data.

import * as vscode from "vscode";
import { dashboardHtml } from "./dashboardHtml";
import type { DashboardModel } from "../core/dashboardModel";

export interface DashboardActions {
  report(): void;
  refresh(): void;
  export(): void;
  reset(): void;
}

export class Dashboard {
  private static panel: vscode.WebviewPanel | undefined;
  private static actions: DashboardActions | undefined;

  static show(model: DashboardModel, actions: DashboardActions): void {
    Dashboard.actions = actions;
    if (!Dashboard.panel) {
      const panel = vscode.window.createWebviewPanel(
        "almanac.dashboard",
        "Almanac",
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      Dashboard.panel = panel;
      panel.onDidDispose(() => (Dashboard.panel = undefined));
      panel.webview.onDidReceiveMessage((raw: unknown) => {
        if (raw === null || typeof raw !== "object") {
          return;
        }
        const type = (raw as { type?: unknown }).type;
        if (type === "report") {
          Dashboard.actions?.report();
        } else if (type === "refresh") {
          Dashboard.actions?.refresh();
        } else if (type === "export") {
          Dashboard.actions?.export();
        } else if (type === "reset") {
          Dashboard.actions?.reset();
        }
      });
    }
    Dashboard.panel.webview.html = dashboardHtml(model);
    Dashboard.panel.reveal(Dashboard.panel.viewColumn);
  }

  static get isOpen(): boolean {
    return Dashboard.panel !== undefined;
  }

  /** Redraw only if it's already open — never steal focus to update numbers. */
  static update(model: DashboardModel): void {
    if (Dashboard.panel) {
      Dashboard.panel.webview.html = dashboardHtml(model);
    }
  }

  static close(): void {
    Dashboard.panel?.dispose();
  }
}
