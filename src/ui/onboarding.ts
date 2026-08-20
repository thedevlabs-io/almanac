import * as vscode from "vscode";

const SEEN_KEY = "almanac.introShown";
const WALKTHROUGH_ID = "thedevlabs-io.almanac#almanac.welcome";

/** Opens the walkthrough. Also the `Almanac: Show the introduction` command. */
export async function showWalkthrough(): Promise<void> {
  try {
    await vscode.commands.executeCommand("workbench.action.openWalkthrough", WALKTHROUGH_ID, false);
  } catch {
    // Older hosts and some remote setups have no walkthrough surface. The
    // settings page is the next most useful place to land.
    await vscode.commands.executeCommand("workbench.action.openSettings", "almanac");
  }
}

/**
 * Shown once, on the first activation after install. VS Code opens a
 * walkthrough by itself on install in most setups, so this is a fallback rather
 * than the main path, and it takes one dismissal to be gone for good.
 */
export async function offerIntroduction(context: vscode.ExtensionContext): Promise<void> {
  if (context.globalState.get<boolean>(SEEN_KEY)) {
    return;
  }
  await context.globalState.update(SEEN_KEY, true);

  const tour = "Show me how it works";
  const dashboard = "Open the dashboard";
  const choice = await vscode.window.showInformationMessage(
    "Almanac is now tracking how you work. Nothing leaves this machine.",
    tour,
    dashboard
  );
  if (choice === tour) {
    await showWalkthrough();
  } else if (choice === dashboard) {
    await vscode.commands.executeCommand("almanac.open");
  }
}
