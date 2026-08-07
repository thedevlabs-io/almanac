// ABOUTME: Activation for Cadence — starts tracking, keeps the status bar current, wires commands.
// ABOUTME: All the arithmetic lives in core/; this file only connects things.

import * as vscode from "vscode";
import { keyOf } from "./core/day";
import { summarize } from "./core/aggregate";
import { buildModel } from "./core/dashboardModel";
import { Store } from "./storage/store";
import { Tracker } from "./tracking/tracker";
import { commitsByDay } from "./tracking/git";
import { detectAssistants } from "./tracking/assistants";
import { Dashboard } from "./ui/dashboard";
import { StatusBar } from "./ui/statusBar";

const HEATMAP_DAYS = 371; // 53 whole weeks, so the grid is always square-edged
const STATUS_REFRESH_MS = 60_000;

function config<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration().get<T>(key, fallback);
}

function minSeconds(): number {
  return Math.max(1, config("cadence.streak.minMinutes", 5)) * 60;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new Store(context);
  await store.load();
  store.applyRetention(config("cadence.retentionDays", 730));

  const tracker = new Tracker(store);
  tracker.start();

  const statusBar = new StatusBar();
  const options = () => ({
    today: keyOf(new Date()),
    minSeconds: minSeconds(),
    heatmapDays: HEATMAP_DAYS,
    assistants: detectAssistants().map((a) => a.name),
  });

  const paintStatus = (): void => {
    statusBar.update(
      summarize(store.days, options()),
      config("cadence.tracking.enabled", true)
    );
  };

  /** Commits are read on demand — the Git API is slow enough not to poll. */
  const withCommits = async (): Promise<void> => {
    if (!config("cadence.trackGitCommits", true)) {
      return;
    }
    const counts = await commitsByDay();
    for (const [date, commits] of Object.entries(counts)) {
      if (store.days[date] || commits > 0) {
        store.recordCommits(date, commits);
      }
    }
  };

  const openDashboard = async (): Promise<void> => {
    await withCommits();
    Dashboard.show(buildModel(store.days, options()), {
      refresh: () => void openDashboard(),
      export: () => void exportData(store),
      reset: () => void resetData(store, paintStatus),
    });
  };

  paintStatus();
  const ticker = setInterval(() => {
    paintStatus();
    if (Dashboard.isOpen) {
      Dashboard.update(buildModel(store.days, options()));
    }
  }, STATUS_REFRESH_MS);

  context.subscriptions.push(
    statusBar,
    store,
    new vscode.Disposable(() => clearInterval(ticker)),
    new vscode.Disposable(() => void tracker.dispose()),

    vscode.commands.registerCommand("cadence.open", () => openDashboard()),

    vscode.commands.registerCommand("cadence.pause", async () => {
      await vscode.workspace
        .getConfiguration()
        .update("cadence.tracking.enabled", false, vscode.ConfigurationTarget.Global);
      paintStatus();
      void vscode.window.showInformationMessage("Cadence: tracking paused.");
    }),

    vscode.commands.registerCommand("cadence.resume", async () => {
      await vscode.workspace
        .getConfiguration()
        .update("cadence.tracking.enabled", true, vscode.ConfigurationTarget.Global);
      paintStatus();
      void vscode.window.showInformationMessage("Cadence: tracking again.");
    }),

    vscode.commands.registerCommand("cadence.export", () => exportData(store)),
    vscode.commands.registerCommand("cadence.reset", () => resetData(store, paintStatus)),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("cadence")) {
        store.applyRetention(config("cadence.retentionDays", 730));
        paintStatus();
      }
    })
  );
}

async function exportData(store: Store): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    title: "Export Cadence data",
    filters: { JSON: ["json"] },
    defaultUri: vscode.Uri.file("cadence-export.json"),
  });
  if (!target) {
    return;
  }
  await store.flush();
  await vscode.workspace.fs.writeFile(
    target,
    new TextEncoder().encode(JSON.stringify(store.snapshot, null, 2) + "\n")
  );
  void vscode.window.showInformationMessage("Cadence: exported. It's your data — nothing was sent anywhere.");
}

async function resetData(store: Store, after: () => void): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    "Delete everything Cadence has tracked?",
    { modal: true, detail: "Streaks, heatmaps and totals all go. This cannot be undone." },
    "Delete"
  );
  if (confirm !== "Delete") {
    return;
  }
  await store.clear();
  after();
  Dashboard.close();
  void vscode.window.showInformationMessage("Cadence: all tracked data deleted.");
}

export function deactivate(): void {
  // Disposables registered on the context flush the store on the way out.
}
