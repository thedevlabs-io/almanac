import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import { ancestors, projectFrom, type ProjectRef } from "../core/project";

/**
 * `.git` is a directory in an ordinary clone and a file in a worktree or a
 * submodule, so existence is what is checked rather than the type. Either way
 * the folder holding it is the root of a working tree, which is what we want.
 */
async function hasGitEntry(directory: string): Promise<boolean> {
  try {
    await fs.stat(path.join(directory, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function findRepoRoot(folderPath: string): Promise<string | undefined> {
  for (const directory of ancestors(folderPath)) {
    if (await hasGitEntry(directory)) {
      return directory;
    }
  }
  return undefined;
}

/**
 * Resolves and caches the repository a folder belongs to.
 *
 * Cached because this runs on the tick path and a repository root does not move
 * while a window is open. `git init` in an already-open folder is the one case
 * the cache gets wrong, and the cache is cleared when folders change so a
 * reload fixes it.
 */
export class ProjectResolver {
  private readonly cache = new Map<string, ProjectRef>();
  private readonly pending = new Map<string, Promise<ProjectRef>>();
  private readonly subscription: vscode.Disposable;

  constructor() {
    // Re-warmed rather than merely cleared, otherwise adding one folder costs a
    // tick of attribution for every folder already open.
    this.subscription = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.cache.clear();
      void this.warm();
    });
  }

  /**
   * The project for a folder, or undefined the very first time it is asked for.
   * Resolution touches the filesystem, and the tick path must not await, so the
   * first tick in a new folder is attributed to nothing and every later one is
   * attributed correctly. That costs at most fifteen seconds, once per folder.
   */
  resolve(folder: vscode.WorkspaceFolder): ProjectRef | undefined {
    const key = folder.uri.fsPath;
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    if (!this.pending.has(key)) {
      const promise = findRepoRoot(key)
        .then((root) => {
          const ref = projectFrom(key, root);
          this.cache.set(key, ref);
          this.pending.delete(key);
          return ref;
        })
        .catch(() => {
          const ref = projectFrom(key, undefined);
          this.cache.set(key, ref);
          this.pending.delete(key);
          return ref;
        });
      this.pending.set(key, promise);
    }
    return undefined;
  }

  /**
   * The folder the work belongs to: the one holding the file you are looking
   * at, falling back to the first folder in the window. Using the active file
   * is what makes a multi-root window attribute to the right repository rather
   * than to whichever folder happens to be first.
   */
  activeFolder(): vscode.WorkspaceFolder | undefined {
    const uri = vscode.window.activeTextEditor?.document.uri;
    if (uri && uri.scheme === "file") {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      if (folder) {
        return folder;
      }
    }
    return vscode.workspace.workspaceFolders?.[0];
  }

  current(): ProjectRef | undefined {
    const folder = this.activeFolder();
    return folder ? this.resolve(folder) : undefined;
  }

  /** Pre-resolves every open folder so the first tick already has an answer. */
  async warm(): Promise<void> {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const key = folder.uri.fsPath;
      if (!this.cache.has(key)) {
        this.cache.set(key, projectFrom(key, await findRepoRoot(key)));
      }
    }
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
