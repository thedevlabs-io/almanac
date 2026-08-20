import * as vscode from "vscode";
import { keyOf } from "../core/day";
import { duration } from "../core/format";
import { streaks } from "../core/streaks";
import type { Store } from "../storage/store";
import type { SettingsCache } from "../tracking/settings";
import type { Explanation } from "../core/presence";

export class StatusBar {
  private readonly item: vscode.StatusBarItem;

  constructor(
    private readonly store: Store,
    private readonly settings: SettingsCache,
    private readonly status: () => Explanation
  ) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "almanac.open";
  }

  refresh(): void {
    if (!this.settings.current.statusBar) {
      this.item.hide();
      return;
    }
    const today = keyOf(new Date());
    const seconds = this.store.day(today).activeSeconds;
    const { current } = streaks(this.store.days, today, this.settings.current.streakMinMinutes);
    const explanation = this.status();

    const streakText = current > 0 ? ` $(flame) ${current}` : "";
    this.item.text = `$(watch) ${duration(seconds)}${streakText}`;
    this.item.tooltip = new vscode.MarkdownString(
      [
        `**Almanac**`,
        ``,
        `Today: ${duration(seconds)}`,
        current > 0 ? `Streak: ${current} days` : `No streak yet`,
        ``,
        explanation.active ? `$(check) ${explanation.reason}` : `$(circle-slash) ${explanation.reason}`,
        ``,
        `Click to open the dashboard.`,
      ].join("\n"),
      true
    );
    this.item.tooltip.supportThemeIcons = true;
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
