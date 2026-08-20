import * as vscode from "vscode";
import { keyOf } from "./core/day";
import { Store } from "./storage/store";
import { ProjectResolver } from "./tracking/projects";
import { SettingsCache } from "./tracking/settings";
import { Tracker } from "./tracking/tracker";
import { Dashboard } from "./ui/dashboard";
import { offerIntroduction, showWalkthrough } from "./ui/onboarding";
import { ReportPanel } from "./ui/report";
import { StatusBar } from "./ui/statusBar";

let tracker: Tracker | undefined;
let store: Store | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const settings = new SettingsCache();
  context.subscriptions.push(settings);

  store = new Store(context.globalStorageUri.fsPath, () => settings.current.retentionDays);
  await store.load();

  tracker = new Tracker(store, settings);
  const statusBar = new StatusBar(store, settings, () => tracker?.status() ?? { active: false, reason: "Starting up." });

  context.subscriptions.push(
    statusBar,
    { dispose: () => void tracker?.dispose() },
    { dispose: () => store?.dispose() },
    tracker.onDidChange(() => statusBar.refresh()),
    settings.onDidChange(() => statusBar.refresh())
  );

  await tracker.start();
  statusBar.refresh();
  // The status bar shows a live clock, so it has to move without an event.
  const statusTimer = setInterval(() => statusBar.refresh(), 30 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(statusTimer) });

  registerCommands(context, store, settings);
  await offerIntroduction(context);
}

function registerCommands(
  context: vscode.ExtensionContext,
  store: Store,
  settings: SettingsCache
): void {
  const register = (id: string, run: () => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, run));
  };

  register("almanac.open", () => Dashboard.show(context, store, settings));
  register("almanac.report", () => ReportPanel.show(context, store, settings));
  register("almanac.tour", () => showWalkthrough());

  register("almanac.why", async () => {
    const status = tracker?.status();
    if (!status) {
      return;
    }
    const open = "Open settings";
    const choice = await vscode.window.showInformationMessage(
      status.active ? `Almanac is counting. ${status.reason}` : `Almanac is not counting. ${status.reason}`,
      open
    );
    if (choice === open) {
      await vscode.commands.executeCommand("workbench.action.openSettings", "almanac");
    }
  });

  register("almanac.pause", async () => {
    await setEnabled(false);
    void vscode.window.showInformationMessage("Almanac paused. Data already recorded is kept.");
  });

  register("almanac.resume", async () => {
    await setEnabled(true);
    void vscode.window.showInformationMessage("Almanac is tracking again.");
  });

  register("almanac.setClient", () => setClientForRepository(settings));

  register("almanac.export", async () => {
    await store.flush();
    const target = await vscode.window.showSaveDialog({
      title: "Export Almanac data",
      defaultUri: vscode.Uri.file(`almanac-export-${keyOf(new Date())}.json`),
      filters: { "JSON file": ["json"] },
    });
    if (!target) {
      return;
    }
    const payload = JSON.stringify(store.snapshot, null, 2);
    await vscode.workspace.fs.writeFile(target, Buffer.from(payload, "utf8"));
    void vscode.window.showInformationMessage(`Almanac data written to ${target.fsPath}`);
  });

  register("almanac.exportCsv", () => {
    ReportPanel.show(context, store, settings);
    return vscode.commands.executeCommand("almanac.report");
  });

  register("almanac.reset", async () => {
    const confirm = "Delete everything";
    const choice = await vscode.window.showWarningMessage(
      "Delete all tracked data? This cannot be undone.",
      { modal: true },
      confirm
    );
    if (choice === confirm) {
      await store.clear();
      void vscode.window.showInformationMessage("Almanac data deleted.");
    }
  });
}

async function setEnabled(enabled: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration("almanac")
    .update("enabled", enabled, vscode.ConfigurationTarget.Global);
}

/**
 * Maps the repository you are in to a client. Asked as a free text prompt
 * rather than a picker, because the first client anyone adds does not exist yet.
 */
async function setClientForRepository(settings: SettingsCache): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showWarningMessage("Open a folder first, so Almanac knows which repository you mean.");
    return;
  }
  const resolver = new ProjectResolver();
  await resolver.warm();
  const project = resolver.resolve(folder);
  resolver.dispose();
  const repo = project?.repo ?? folder.name;

  const client = await vscode.window.showInputBox({
    title: `Client for ${repo}`,
    prompt: "Repositories sharing a client name are billed together. Leave empty to clear.",
    value: settings.current.clients[repo] ?? "",
  });
  if (client === undefined) {
    return;
  }
  const clients = { ...settings.current.clients };
  if (client.trim().length === 0) {
    delete clients[repo];
  } else {
    clients[repo] = client.trim();
  }
  await vscode.workspace
    .getConfiguration("almanac")
    .update("clients", clients, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(
    client.trim().length === 0 ? `Cleared the client for ${repo}.` : `${repo} now reports as ${client.trim()}.`
  );
}

export async function deactivate(): Promise<void> {
  await tracker?.dispose();
  store?.dispose();
}
