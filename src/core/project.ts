/** Where a piece of work belongs. */
export interface ProjectRef {
  /** The repository's own folder name. Falls back to the opened folder's name. */
  repo: string;
  /** Path from the repository root to the folder you opened. `.` at the root. */
  folder: string;
  /** False when the opened folder is not inside a repository at all. */
  isRepo: boolean;
}

/** The root of a repository folder, as stored in a day record. */
export const REPO_ROOT = ".";

/** Windows separators normalised away so one set of rules covers both platforms. */
export function normalise(path: string): string {
  const slashed = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return slashed.length === 0 ? "/" : slashed;
}

export function basename(path: string): string {
  const normalised = normalise(path);
  const index = normalised.lastIndexOf("/");
  const name = index === -1 ? normalised : normalised.slice(index + 1);
  // A drive root or `/` has no name worth showing.
  return name.length === 0 ? normalised.replace(/[:/]/g, "") || "root" : name;
}

/** Every directory from `path` up to the filesystem root, nearest first. */
export function ancestors(path: string): string[] {
  const chain: string[] = [];
  let current = normalise(path);
  for (;;) {
    chain.push(current);
    const index = current.lastIndexOf("/");
    if (index <= 0) {
      break;
    }
    current = current.slice(0, index);
  }
  return chain;
}

/**
 * The path of `folder` relative to `root`, or `.` when they are the same.
 * Returns undefined when `folder` is not inside `root`, which is the caller's
 * signal that the probe returned something nonsensical.
 */
export function relativeTo(root: string, folder: string): string | undefined {
  const from = normalise(root);
  const to = normalise(folder);
  if (from === to) {
    return REPO_ROOT;
  }
  const prefix = from.endsWith("/") ? from : `${from}/`;
  return to.startsWith(prefix) ? to.slice(prefix.length) : undefined;
}

/**
 * Resolve where an opened folder belongs.
 *
 * `repoRoot` is whatever the caller's filesystem probe found by walking up for
 * a `.git` entry, or undefined when there is none. Outside a repository the
 * folder stands alone as its own project, which is the honest answer rather
 * than inventing a parent.
 */
export function projectFrom(folderPath: string, repoRoot: string | undefined): ProjectRef {
  if (!repoRoot) {
    return { repo: basename(folderPath), folder: REPO_ROOT, isRepo: false };
  }
  const folder = relativeTo(repoRoot, folderPath);
  if (folder === undefined) {
    return { repo: basename(folderPath), folder: REPO_ROOT, isRepo: false };
  }
  return { repo: basename(repoRoot), folder, isRepo: true };
}

/** Seconds recorded against one repository, split by the folders opened in it. */
export interface ProjectRecord {
  /** Total for the repository. Always the sum of `folders`. */
  seconds: number;
  /** Folder path within the repository to seconds. `.` is the repository root. */
  folders: Record<string, number>;
}

export function emptyProjectRecord(): ProjectRecord {
  return { seconds: 0, folders: {} };
}

export function addProjectTime(
  projects: Record<string, ProjectRecord>,
  ref: Pick<ProjectRef, "repo" | "folder">,
  seconds: number
): Record<string, ProjectRecord> {
  const existing = projects[ref.repo] ?? emptyProjectRecord();
  return {
    ...projects,
    [ref.repo]: {
      seconds: existing.seconds + seconds,
      folders: {
        ...existing.folders,
        [ref.folder]: (existing.folders[ref.folder] ?? 0) + seconds,
      },
    },
  };
}

export function mergeProjectRecord(a: ProjectRecord, b: ProjectRecord): ProjectRecord {
  const folders: Record<string, number> = { ...a.folders };
  for (const [folder, seconds] of Object.entries(b.folders)) {
    folders[folder] = (folders[folder] ?? 0) + seconds;
  }
  return { seconds: a.seconds + b.seconds, folders };
}

/** One node of the folder tree shown under a repository. */
export interface FolderNode {
  /** The segment's own name, e.g. `web`. */
  name: string;
  /** Full path within the repository, e.g. `apps/web`. */
  path: string;
  /** Seconds recorded with this exact folder open. */
  seconds: number;
  /** This folder plus everything beneath it. */
  total: number;
  children: FolderNode[];
}

export interface RepoTree {
  repo: string;
  total: number;
  /** Seconds recorded with the repository root itself open. */
  rootSeconds: number;
  children: FolderNode[];
}

/**
 * Build the folder tree for one repository.
 *
 * Intermediate folders you never opened are still created as nodes, so a
 * monorepo where you only ever open `apps/web` still reads as `apps` containing
 * `web` rather than as one flat entry. Those nodes carry zero of their own
 * seconds and only a total, which is what makes the distinction visible.
 */
export function treeFor(repo: string, record: ProjectRecord): RepoTree {
  const root: FolderNode = { name: repo, path: REPO_ROOT, seconds: 0, total: 0, children: [] };
  const index = new Map<string, FolderNode>([[REPO_ROOT, root]]);

  for (const [folder, seconds] of Object.entries(record.folders)) {
    if (folder === REPO_ROOT) {
      root.seconds += seconds;
      continue;
    }
    const segments = folder.split("/").filter((segment) => segment.length > 0);
    let parent = root;
    let path = "";
    for (const segment of segments) {
      path = path.length === 0 ? segment : `${path}/${segment}`;
      let node = index.get(path);
      if (!node) {
        node = { name: segment, path, seconds: 0, total: 0, children: [] };
        index.set(path, node);
        parent.children.push(node);
      }
      parent = node;
    }
    parent.seconds += seconds;
  }

  const total = totalise(root);
  sortByTotal(root);
  return { repo, total, rootSeconds: root.seconds, children: root.children };
}

/** Sums each node's own seconds with its descendants', bottom up. */
function totalise(node: FolderNode): number {
  node.total = node.seconds + node.children.reduce((sum, child) => sum + totalise(child), 0);
  return node.total;
}

function sortByTotal(node: FolderNode): void {
  node.children.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  for (const child of node.children) {
    sortByTotal(child);
  }
}

/** Every repository as a tree, busiest first. */
export function treesFor(projects: Record<string, ProjectRecord>): RepoTree[] {
  return Object.entries(projects)
    .map(([repo, record]) => treeFor(repo, record))
    .sort((a, b) => b.total - a.total || a.repo.localeCompare(b.repo));
}
