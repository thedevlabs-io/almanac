import * as vscode from "vscode";
import { dateOf, keyOf } from "../core/day";
import { buildDashboard } from "../core/dashboardModel";
import type { Store } from "../storage/store";
import type { SettingsCache } from "../tracking/settings";
import { dashboardHtml, isDashboardTab, type DashboardTab } from "./dashboardHtml";
import { brandFonts, brandTheme } from "./panel";

const REFRESH_MS = 30 * 1000;

export class Dashboard {
  private static instance: Dashboard | undefined;

  /**
   * Which tab is open. Held here, not only in the webview: the panel re-renders
   * itself every 30 seconds and on any theme or settings change, and a tab that
   * jumped back to Activity each time would read as a bug.
   */
  private tab: DashboardTab = "activity";
  /** The day whose square was clicked, cleared by clicking Close. */
  private selectedDay: string | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly store: Store,
    private readonly settings: SettingsCache,
    private readonly extensionUri: vscode.Uri
  ) {
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: { type?: string; tab?: string; date?: string }) => this.handle(message),
      null,
      this.disposables
    );
    this.panel.onDidChangeViewState(() => this.scheduleRefresh(), null, this.disposables);
    this.disposables.push(
      this.settings.onDidChange(() => this.render()),
      // Switching between a light and a dark theme changes which accent holds
      // contrast, so the panel is rebuilt rather than left mismatched.
      vscode.window.onDidChangeActiveColorTheme(() => this.render())
    );
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
    Dashboard.instance = new Dashboard(panel, store, settings, context.extensionUri);
    return Dashboard.instance;
  }

  private handle(message: { type?: string; tab?: string; date?: string }): void {
    // The webview has already switched tabs on its own. Recording it is all
    // that is needed, and re-rendering here would only make the click flicker.
    if (message.type === "tab" && isDashboardTab(message.tab)) {
      this.tab = message.tab;
      return;
    }
    // An empty date is the Close button: the same message either way, so there
    // is one path in and one path out of having a day open.
    if (message.type === "day") {
      const date = message.date ?? "";
      this.selectedDay = isDayKey(date) ? date : undefined;
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
      minStreakMinutes: this.settings.current.streakMinMinutes,
      selected: this.selectedDay,
    });
    this.panel.webview.html = dashboardHtml(
      model,
      this.panel.webview.cspSource,
      brandFonts(this.panel.webview, this.extensionUri),
      brandTheme(),
      this.tab
    );
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

/**
 * Shape-checked before it reaches the model: the webview is untrusted input.
 * Round-tripped rather than pattern-matched, so `2026-99-99` is rejected
 * instead of rolling over into a nonsense label.
 */
function isDayKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && keyOf(dateOf(value)) === value;
}
