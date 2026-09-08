import * as vscode from "vscode";
import type { Store } from "../storage/store";
import type { SettingsCache } from "../tracking/settings";

const ASKED_KEY = "almanac.windowModeAsked";
const SETTING = "concurrentProjects";

const SPLIT = "Split by focus";
const EACH = "Count each window";

interface Mode extends vscode.QuickPickItem {
  concurrent: boolean;
}

function modes(concurrent: boolean): Mode[] {
  return [
    {
      label: SPLIT,
      concurrent: false,
      description: concurrent ? "" : "current",
      detail: "An hour across two windows is one hour, divided by which window had focus. Repository rows add up to the day.",
    },
    {
      label: EACH,
      concurrent: true,
      description: concurrent ? "current" : "",
      detail: "Each repository is timed in its own window while something keeps happening in it. Two clients can each hold the same hour.",
    },
  ];
}

async function apply(concurrent: boolean): Promise<void> {
  await vscode.workspace
    .getConfiguration("almanac")
    .update(SETTING, concurrent, vscode.ConfigurationTarget.Global);
  void vscode.window.showInformationMessage(
    concurrent
      ? "Almanac now times each repository in its own window. Repository rows can add up to more than the day."
      : "Almanac now splits time between windows by focus. Repository rows add up to the day."
  );
}

/** The `Almanac: Choose how several windows count` command. */
export async function chooseWindowMode(settings: SettingsCache): Promise<void> {
  const choice = await vscode.window.showQuickPick(modes(settings.current.concurrentProjects), {
    title: "How should time in several VS Code windows count?",
    placeHolder: "Only the focused window ever adds to your day. This decides what the repositories see.",
  });
  if (choice && choice.concurrent !== settings.current.concurrentProjects) {
    await apply(choice.concurrent);
  }
}

/**
 * Asked once, the first time another window writes the activity file, because
 * that is the moment the choice starts to matter and a setting nobody has
 * heard of is not a choice. Skipped when the setting was already set by hand.
 * The asked flag is shared across windows, so the first window to notice asks
 * and the other normally stays quiet; each host caches global state, so two
 * noticing within the same few seconds can both ask, which is tolerable once.
 *
 * With project tracking off the choice means nothing, so the flag is left
 * alone and the question waits for the setting to come back on.
 */
export async function offerWindowMode(
  context: vscode.ExtensionContext,
  store: Store,
  settings: SettingsCache
): Promise<void> {
  if (!store.otherWindowSeen || !settings.current.trackProjects || context.globalState.get<boolean>(ASKED_KEY)) {
    return;
  }
  await context.globalState.update(ASKED_KEY, true);
  const configured = vscode.workspace.getConfiguration("almanac").inspect<boolean>(SETTING);
  if (configured?.globalValue !== undefined || configured?.workspaceValue !== undefined) {
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    "Almanac noticed a second VS Code window. Should an hour spent across both be split between their repositories, or counted for each? You can change this later with Almanac: Choose how several windows count.",
    SPLIT,
    EACH
  );
  if (choice === SPLIT) {
    await apply(false);
  } else if (choice === EACH) {
    await apply(true);
  }
}
