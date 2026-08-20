import * as vscode from "vscode";
import { keyOf, shift, startOfMonth } from "../core/day";
import { buildReport, filterOptions, reportToCsv } from "../core/report";
import type { Store } from "../storage/store";
import type { SettingsCache } from "../tracking/settings";
import { brandFonts, brandTheme } from "./panel";
import { isReportTab, reportHtml, type ReportTab } from "./reportHtml";

type RangeName = "month" | "lastMonth" | "quarter" | "year";

/** Far above any real repository's folder count, far below a denial of service. */
const MAX_FILTER_KEYS = 500;

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
  /** Remembered for the same reason as the dashboard's: renders are cheap and frequent. */
  private tab: ReportTab = "clients";
  /** Repository and folder keys the report is narrowed to. Empty is everything. */
  private include: string[] = [];
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly store: Store,
    private readonly settings: SettingsCache,
    private readonly extensionUri: vscode.Uri
  ) {
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: { type?: string; range?: string; tab?: string; keys?: unknown }) =>
        void this.handle(message),
      null,
      this.disposables
    );
    this.disposables.push(
      this.settings.onDidChange(() => this.render()),
      vscode.window.onDidChangeActiveColorTheme(() => this.render())
    );
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
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    ReportPanel.instance = new ReportPanel(panel, store, settings, context.extensionUri);
  }

  private async handle(message: {
    type?: string;
    range?: string;
    tab?: string;
    keys?: unknown;
  }): Promise<void> {
    if (message.type === "filter") {
      // The webview is untrusted input, so the keys are shape-checked rather
      // than trusted to be the ones this panel rendered, and capped: every key
      // is tested against every folder of every day in range, so an unbounded
      // list is unbounded work.
      this.include = Array.isArray(message.keys)
        ? message.keys.filter((key): key is string => typeof key === "string").slice(0, MAX_FILTER_KEYS)
        : [];
      this.render();
      return;
    }
    if (message.type === "tab" && isReportTab(message.tab)) {
      this.tab = message.tab;
      return;
    }
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
      include: this.include,
    });
  }

  /** Built from the unfiltered days, so a filter can always be undone. */
  private options() {
    const { from, to } = rangeFor(this.range);
    return filterOptions(this.store.days, from, to);
  }

  async exportCsv(): Promise<void> {
    const report = this.report();
    const target = await vscode.window.showSaveDialog({
      title: "Export Almanac report",
      // The name says the file is narrowed, so a filtered export cannot be
      // mistaken for the whole range once it is sitting in a downloads folder.
      defaultUri: vscode.Uri.file(
        `almanac-${report.from}-to-${report.to}${report.include.length > 0 ? "-filtered" : ""}.csv`
      ),
      filters: { "CSV file": ["csv"] },
    });
    if (!target) {
      return;
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(reportToCsv(report), "utf8"));
    void vscode.window.showInformationMessage(`Almanac report written to ${target.fsPath}`);
  }

  render(): void {
    this.panel.webview.html = reportHtml(
      this.report(),
      this.range,
      this.panel.webview.cspSource,
      brandFonts(this.panel.webview, this.extensionUri),
      brandTheme(),
      this.tab,
      this.options()
    );
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
