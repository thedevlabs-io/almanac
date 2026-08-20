import * as vscode from "vscode";
import { buildDashboard, type WindowName } from "../core/dashboardModel";
import type { Store } from "../storage/store";
import type { SettingsCache } from "../tracking/settings";
import { dashboardHtml } from "./dashboardHtml";

const REFRESH_MS = 30 * 1000;

export class Dashboard {
  private static instance: Dashboard | undefined;

  private window: WindowName = "year";
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly store: Store,
    private readonly settings: SettingsCache
  ) {
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: { type?: string; window?: string }) => this.handle(message),
      null,
      this.disposables
    );
    this.panel.onDidChangeViewState(() => this.scheduleRefresh(), null, this.disposables);
    this.disposables.push(this.settings.onDidChange(() => this.render()));
    this.scheduleRefresh();
    this.render();
  }

  static show(
    context: vscode.ExtensionContext,
    store: Store,
    settings: SettingsCache
  ): Dashboard {
    if (Dashboard.instance) {
      Dashboard.instance.panel.reveal(vscode.ViewColumn.Active);
      Dashboard.instance.render();
      return Dashboard.instance;
    }
    const panel = vscode.window.createWebviewPanel(
      "almanac.dashboard",
      "Almanac",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] }
    );
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    Dashboard.instance = new Dashboard(panel, store, settings);
    return Dashboard.instance;
  }

  private handle(message: { type?: string; window?: string }): void {
    if (message.type === "window" && isWindowName(message.window)) {
      this.window = message.window;
      this.render();
      return;
    }
    if (message.type === "report") {
      void vscode.commands.executeCommand("almanac.report");
    }
  }

  /** Only ticks while the panel is visible; a hidden panel refreshing costs for nothing. */
  private scheduleRefresh(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.panel.visible) {
      this.timer = setInterval(() => this.render(), REFRESH_MS);
    }
  }

  render(): void {
    const model = buildDashboard(this.store.days, {
      window: this.window,
      minStreakMinutes: this.settings.current.streakMinMinutes,
    });
    this.panel.webview.html = dashboardHtml(model, this.panel.webview.cspSource);
  }

  dispose(): void {
    Dashboard.instance = undefined;
    if (this.timer) {
      clearInterval(this.timer);
    }
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}

function isWindowName(value: string | undefined): value is WindowName {
  return value === "week" || value === "month" || value === "quarter" || value === "year";
}
