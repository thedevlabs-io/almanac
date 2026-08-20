// Loads the built bundle against a stub VS Code API and drives a fake day of
// terminal-only work. Catches wiring mistakes that unit tests cannot: a command
// that fails to register, a store that never writes, a tick that credits
// nothing because a subscription was missed.

import Module from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const listeners = new Map();
const commands = new Map();
let windowActive = false;
let windowFocused = true;

const event = (name) => (handler) => {
  const bucket = listeners.get(name) ?? [];
  bucket.push(handler);
  listeners.set(name, bucket);
  return { dispose() {} };
};
const fire = (name, payload) => {
  for (const handler of listeners.get(name) ?? []) handler(payload);
};

const config = {
  almanac: {
    enabled: true,
    idleMinutes: 1,
    countTerminal: true,
    countDebug: true,
    trackProjects: true,
    trackGitCommits: false,
    "statusBar.enabled": true,
    "streak.minMinutes": 5,
    retentionDays: 730,
    clients: {},
    "report.rounding": "none",
  },
};

const storage = await fs.mkdtemp(path.join(os.tmpdir(), "almanac-smoke-"));
const repo = await fs.mkdtemp(path.join(os.tmpdir(), "acme-"));
await fs.mkdir(path.join(repo, ".git"), { recursive: true });
await fs.mkdir(path.join(repo, "apps", "web"), { recursive: true });
const opened = path.join(repo, "apps", "web");

const vscode = {
  version: "1.94.0",
  ViewColumn: { Active: 1 },
  StatusBarAlignment: { Right: 2 },
  ConfigurationTarget: { Global: 1 },
  Uri: {
    file: (p) => ({ fsPath: p, scheme: "file", toString: () => `file://${p}` }),
    joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts) }),
  },
  EventEmitter: class {
    constructor() {
      this.handlers = [];
      this.event = (handler) => {
        this.handlers.push(handler);
        return { dispose() {} };
      };
    }
    fire(value) {
      for (const handler of this.handlers) handler(value);
    }
    dispose() {}
  },
  MarkdownString: class {
    constructor(value) {
      this.value = value;
    }
  },
  workspace: {
    workspaceFolders: [{ name: "web", uri: { fsPath: opened, scheme: "file" }, index: 0 }],
    getWorkspaceFolder: () => undefined,
    getConfiguration: (section) => ({
      get: (key, fallback) => config[section]?.[key] ?? fallback,
      update: async (key, value) => {
        config[section][key] = value;
      },
    }),
    onDidChangeConfiguration: event("config"),
    onDidChangeTextDocument: event("textChange"),
    onDidSaveTextDocument: event("save"),
    onDidChangeWorkspaceFolders: event("folders"),
    onDidChangeNotebookDocument: event("notebook"),
    fs: { writeFile: async () => {} },
  },
  window: {
    get state() {
      return { focused: windowFocused, active: windowActive };
    },
    activeTextEditor: undefined,
    activeNotebookEditor: undefined,
    activeTerminal: { name: "zsh" },
    tabGroups: { onDidChangeTabs: event("tabs"), onDidChangeTabGroups: event("tabGroups") },
    onDidChangeWindowState: event("windowState"),
    onDidChangeTextEditorSelection: event("selection"),
    onDidChangeTextEditorVisibleRanges: event("ranges"),
    onDidChangeActiveTextEditor: event("activeEditor"),
    onDidChangeActiveNotebookEditor: event("activeNotebook"),
    onDidChangeActiveTerminal: event("activeTerminal"),
    onDidOpenTerminal: event("openTerminal"),
    onDidStartTerminalShellExecution: event("shellStart"),
    onDidEndTerminalShellExecution: event("shellEnd"),
    createStatusBarItem: () => ({ show() {}, hide() {}, dispose() {} }),
    createWebviewPanel: () => {
      throw new Error("smoke test should not open a panel");
    },
    showInformationMessage: async () => undefined,
    showWarningMessage: async () => undefined,
    showSaveDialog: async () => undefined,
    showInputBox: async () => undefined,
  },
  commands: {
    registerCommand: (id, run) => {
      commands.set(id, run);
      return { dispose() {} };
    },
    executeCommand: async () => undefined,
  },
  debug: {
    onDidChangeActiveStackItem: event("stack"),
    onDidStartDebugSession: event("debugStart"),
    onDidTerminateDebugSession: event("debugEnd"),
  },
  tasks: { onDidStartTask: event("taskStart"), onDidEndTask: event("taskEnd") },
  extensions: { getExtension: () => undefined },
};

const load = Module._load;
Module._load = (request, ...rest) =>
  request === "vscode" ? vscode : load(request, ...rest);

const { activate, deactivate } = await import("../dist/extension.js");

const context = {
  subscriptions: [],
  globalStorageUri: { fsPath: storage },
  extensionUri: { fsPath: process.cwd() },
  globalState: { get: () => true, update: async () => {} },
};

await activate(context);

const expected = [
  "almanac.open", "almanac.report", "almanac.tour", "almanac.why",
  "almanac.pause", "almanac.resume", "almanac.setClient",
  "almanac.export", "almanac.exportCsv", "almanac.reset",
];
for (const id of expected) {
  assert.ok(commands.has(id), `command ${id} was not registered`);
}
console.log(`ok  all ${expected.length} commands registered`);

// Phase 1: the state.active poll on its own. No shell execution is fired, so
// this can only pass if the polled window flag works. The previous build
// credited nothing at all here.
const file = path.join(storage, "activity.json");
const readDb = async () => JSON.parse(await fs.readFile(file, "utf8"));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

windowActive = true;
await wait(20000);

const db = await readDb();
const today = Object.keys(db.days)[0];
const day = db.days[today];

assert.ok(day, "no day was recorded");
assert.ok(day.activeSeconds > 0, "the window.state.active poll credited nothing");
assert.equal(db.version, 2);
console.log(`ok  poll-only terminal presence credited ${day.activeSeconds}s on ${today}`);
console.log(`ok  signals ${JSON.stringify(day.signals)}`);
assert.ok(day.signals.terminal > 0, "terminal presence was not labelled as terminal");

// Repository attribution: a subfolder of a repo rolls up under the repo.
const repoName = path.basename(repo);
console.log(`ok  projects ${JSON.stringify(day.projects)}`);
assert.ok(day.projects[repoName], `expected repository ${repoName}, got ${Object.keys(day.projects)}`);
assert.deepEqual(
  Object.keys(day.projects[repoName].folders),
  ["apps/web"],
  "subfolder not attributed under the repository"
);
console.log(`ok  ${repoName} > apps/web attributed correctly`);

// Phase 2: countTerminal:false must actually suppress, not relabel. The idle
// window has to drain first, since turning the setting off does not retract a
// clock the last human signal already opened.
config.almanac.countTerminal = false;
fire("config", { affectsConfiguration: () => true });
await wait(80000);
let before = (await readDb()).days[today].activeSeconds;
await wait(20000);
assert.equal(
  (await readDb()).days[today].activeSeconds,
  before,
  "countTerminal:false still credited terminal time"
);
console.log("ok  countTerminal:false suppresses rather than relabels");

// Phase 3: losing focus stops the clock outright.
config.almanac.countTerminal = true;
fire("config", { affectsConfiguration: () => true });
windowFocused = false;
before = (await readDb()).days[today].activeSeconds;
fire("windowState", { focused: false, active: false });
await wait(20000);
assert.equal(
  (await readDb()).days[today].activeSeconds,
  before,
  "clock kept running while unfocused"
);
console.log("ok  losing focus stops the clock");

// Phase 4: machine output alone cannot open a clock no person opened.
windowFocused = true;
windowActive = false;
fire("windowState", { focused: true, active: false });
before = (await readDb()).days[today].activeSeconds;
let chunks = 0;
fire("shellStart", {
  terminal: vscode.window.activeTerminal,
  execution: {
    read: async function* () {
      while (chunks < 40) {
        chunks += 1;
        yield "build output";
        await wait(500);
      }
    },
  },
});
await wait(20000);
assert.equal(
  (await readDb()).days[today].activeSeconds,
  before,
  "terminal output opened a clock with no human signal behind it"
);
console.log("ok  machine output alone cannot open the clock");

await deactivate();
await fs.rm(storage, { recursive: true, force: true });
await fs.rm(repo, { recursive: true, force: true });
console.log("\nsmoke test passed");
process.exit(0);
