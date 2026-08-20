import * as vscode from "vscode";
import { keyOf, shift, startOfMonth } from "../core/day";
import { buildReport, reportToCsv } from "../core/report";
import type { Store } from "../storage/store";
import type { SettingsCache } from "../tracking/settings";
import { reportHtml } from "./reportHtml";

type RangeName = "month" | "lastMonth" | "quarter" | "year";

function rangeFor(name: RangeName, today = keyOf(new Date())): { from: string; to: string } {
  switch (name) {
    case "month":
      return { from: startOfMonth(today), to: today };
    case "lastMonth": {
      const lastMonthDay = shift(startOfMonth(today), -1);
      const start = startOfMonth(lastMonthDay);
      return { from: start, to: lastMonthDay };
    }
    case "quarter":
      return { from: shift(today, -89), to: today };
    case "year":
      return { from: shift(today, -364), to: today };
  }
}

export class ReportPanel {
  private static instance: ReportPanel | undefined;

  private range: RangeName = "month";
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly store: Store,
    private readonly settings: SettingsCache
  ) {
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: { type?: string; range?: string }) => void this.handle(message),
      null,
      this.disposables
    );
    this.disposables.push(this.settings.onDidChange(() => this.render()));
    this.render();
  }

  static show(context: vscode.ExtensionContext, store: Store, settings: SettingsCache): void {
    if (ReportPanel.instance) {
      ReportPanel.instance.panel.reveal(vscode.ViewColumn.Active);
      ReportPanel.instance.render();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "almanac.report",
      "Almanac report",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] }
    );
    ReportPanel.instance = new ReportPanel(panel, store, settings);
  }

  private async handle(message: { type?: string; range?: string }): Promise<void> {
    if (message.type === "range" && isRange(message.range)) {
      this.range = message.range;
      this.render();
      return;
    }
    if (message.type === "export") {
      await this.exportCsv();
    }
  }

  private report() {
    const { from, to } = rangeFor(this.range);
    return buildReport(this.store.days, {
      from,
      to,
      clients: this.settings.current.clients,
      rounding: this.settings.current.rounding,
    });
  }

  async exportCsv(): Promise<void> {
    const report = this.report();
    const target = await vscode.window.showSaveDialog({
      title: "Export Almanac report",
      defaultUri: vscode.Uri.file(`almanac-${report.from}-to-${report.to}.csv`),
      filters: { "CSV file": ["csv"] },
    });
    if (!target) {
      return;
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(reportToCsv(report), "utf8"));
    void vscode.window.showInformationMessage(`Almanac report written to ${target.fsPath}`);
  }

  render(): void {
    this.panel.webview.html = reportHtml(this.report(), this.range, this.panel.webview.cspSource);
  }

  dispose(): void {
    ReportPanel.instance = undefined;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }
}

function isRange(value: string | undefined): value is RangeName {
  return value === "month" || value === "lastMonth" || value === "quarter" || value === "year";
}
