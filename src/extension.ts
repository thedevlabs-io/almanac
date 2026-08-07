// ABOUTME: Activation for Almanac — starts tracking, keeps the status bar current, wires commands.
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
  return Math.max(1, config("almanac.streak.minMinutes", 5)) * 60;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const store = new Store(context);
  await store.load();
  store.applyRetention(config("almanac.retentionDays", 730));

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
      config("almanac.tracking.enabled", true)
    );
  };

  /** Commits are read on demand — the Git API is slow enough not to poll. */
  const withCommits = async (): Promise<void> => {
    if (!config("almanac.trackGitCommits", true)) {
      return;
    }
    const retention = config("almanac.retentionDays", 730);
    const counts = await commitsByDay();
    for (const [date, commits] of Object.entries(counts)) {
      // Only days we'd keep anyway — otherwise every commit in the repo's history
      // creates a record that retention immediately prunes and this recreates.
      if (commits > 0 && store.isWithinRetention(date, retention)) {
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

  // Kept for deactivate(), which must await the final write.
  shutdown = async (): Promise<void> => {
    clearInterval(ticker);
    await tracker.dispose();
    await store.dispose();
  };

  context.subscriptions.push(
    statusBar,
    new vscode.Disposable(() => clearInterval(ticker)),

    vscode.commands.registerCommand("almanac.open", () => openDashboard()),

    vscode.commands.registerCommand("almanac.pause", async () => {
      await vscode.workspace
        .getConfiguration()
        .update("almanac.tracking.enabled", false, vscode.ConfigurationTarget.Global);
      paintStatus();
      void vscode.window.showInformationMessage("Almanac: tracking paused.");
    }),

    vscode.commands.registerCommand("almanac.resume", async () => {
      await vscode.workspace
        .getConfiguration()
        .update("almanac.tracking.enabled", true, vscode.ConfigurationTarget.Global);
      paintStatus();
      void vscode.window.showInformationMessage("Almanac: tracking again.");
    }),

    vscode.commands.registerCommand("almanac.export", () => exportData(store)),
    vscode.commands.registerCommand("almanac.reset", () => resetData(store, paintStatus)),

    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("almanac")) {
        store.applyRetention(config("almanac.retentionDays", 730));
        paintStatus();
      }
    })
  );
}

async function exportData(store: Store): Promise<void> {
  const target = await vscode.window.showSaveDialog({
    title: "Export Almanac data",
    filters: { JSON: ["json"] },
    defaultUri: vscode.Uri.file("almanac-export.json"),
  });
  if (!target) {
    return;
  }
  await store.flush();
  await vscode.workspace.fs.writeFile(
    target,
    new TextEncoder().encode(JSON.stringify(store.snapshot, null, 2) + "\n")
  );
  void vscode.window.showInformationMessage("Almanac: exported. It's your data — nothing was sent anywhere.");
}

async function resetData(store: Store, after: () => void): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    "Delete everything Almanac has tracked?",
    { modal: true, detail: "Streaks, heatmaps and totals all go. This cannot be undone." },
    "Delete"
  );
  if (confirm !== "Delete") {
    return;
  }
  await store.clear();
  after();
  Dashboard.close();
  void vscode.window.showInformationMessage("Almanac: all tracked data deleted.");
}

let shutdown: (() => Promise<void>) | undefined;

export function deactivate(): Promise<void> {
  // Returned so VS Code waits for the last write instead of killing us mid-flush.
  return shutdown ? shutdown() : Promise.resolve();
}
