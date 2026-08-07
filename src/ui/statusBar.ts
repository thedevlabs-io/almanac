// ABOUTME: The status bar item — current streak and today's active time, click to open the dashboard.
// ABOUTME: Quiet by design: a number and a flame, no colour, no nagging.

import * as vscode from "vscode";
import { shortDuration } from "../core/format";
import type { Summary } from "../core/aggregate";

export class StatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    this.item.command = "almanac.open";
    this.item.name = "Almanac";
  }

  update(summary: Summary, tracking: boolean): void {
    const enabled = vscode.workspace
      .getConfiguration()
      .get<boolean>("almanac.statusBar.enabled", true);
    if (!enabled) {
      this.item.hide();
      return;
    }

    const streak = summary.streak.current;
    const flame = streak > 0 ? `$(flame) ${streak}` : "$(circle-large-outline)";
    this.item.text = `${flame} · ${shortDuration(summary.today)}`;
    this.item.tooltip = new vscode.MarkdownString(
      [
        tracking ? "**Almanac**" : "**Almanac** — tracking paused",
        "",
        streak > 0
          ? `${streak}-day streak${summary.streak.todayCounts ? "" : " · today hasn't counted yet"}`
          : "No streak yet",
        `Today: ${shortDuration(summary.today)} · Last 7 days: ${shortDuration(summary.week)}`,
        "",
        "_Click to open the dashboard._",
      ].join("\n")
    );
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
