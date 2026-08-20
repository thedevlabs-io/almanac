import * as vscode from "vscode";
import { keyOf, type DayKey } from "../core/day";

/** The slice of the Git extension's API we use, typed loosely on purpose. */
interface GitCommit {
  authorDate?: Date;
  authorEmail?: string;
}

interface GitRepository {
  log(options?: { maxEntries?: number }): Promise<GitCommit[]>;
  getConfig(key: string): Promise<string>;
  getGlobalConfig?(key: string): Promise<string>;
}

interface GitApi {
  repositories: GitRepository[];
}

async function api(): Promise<GitApi | undefined> {
  try {
    const extension = vscode.extensions.getExtension<{ getAPI(version: number): GitApi }>(
      "vscode.git"
    );
    if (!extension) {
      return undefined;
    }
    const exports = extension.isActive ? extension.exports : await extension.activate();
    return exports.getAPI(1);
  } catch {
    return undefined;
  }
}

async function authorEmail(repository: GitRepository): Promise<string | undefined> {
  for (const read of [
    () => repository.getConfig("user.email"),
    () => repository.getGlobalConfig?.("user.email") ?? Promise.resolve(""),
  ]) {
    try {
      const value = await read();
      if (value) {
        return value.toLowerCase();
      }
    } catch {
      // Try the next source.
    }
  }
  return undefined;
}

/**
 * Commits per local day, counting only those you authored. Without the author
 * filter a `git pull` would credit you with your whole team's work.
 */
export async function commitsByDay(maxEntries = 1000): Promise<Record<DayKey, number>> {
  const counts: Record<DayKey, number> = {};
  const git = await api();
  if (!git) {
    return counts;
  }

  for (const repository of git.repositories) {
    try {
      const email = await authorEmail(repository);
      if (!email) {
        // Without knowing who you are, we would be counting everyone's work.
        continue;
      }
      const commits = await repository.log({ maxEntries });
      for (const commit of commits) {
        if (!commit.authorDate || commit.authorEmail?.toLowerCase() !== email) {
          continue;
        }
        const key = keyOf(new Date(commit.authorDate));
        counts[key] = (counts[key] ?? 0) + 1;
      }
    } catch {
      // A repository we cannot read is skipped rather than failing the rest.
    }
  }
  return counts;
}
