import { range, type DayKey } from "./day";
import { hoursDecimal } from "./format";
import {
  mergeProjectRecord,
  REPO_ROOT,
  treesFor,
  type FolderNode,
  type ProjectRecord,
} from "./project";
import type { DayRecord } from "./types";

export type Rounding = "none" | "15m" | "30m" | "1h";

const ROUNDING_SECONDS: Record<Rounding, number> = {
  none: 0,
  "15m": 15 * 60,
  "30m": 30 * 60,
  "1h": 60 * 60,
};

/** Rounds up to the increment. Rounding down would bill less than was worked. */
export function roundSeconds(seconds: number, rounding: Rounding): number {
  const increment = ROUNDING_SECONDS[rounding] ?? 0;
  if (increment <= 0 || seconds <= 0) {
    return Math.max(0, seconds);
  }
  return Math.ceil(seconds / increment) * increment;
}

/**
 * Which client a repository bills to. Unmapped repositories report under their
 * own name rather than being dropped, so time can never silently vanish from a
 * report because someone forgot to add a mapping.
 */
export function clientOf(repo: string, clients: Record<string, string>): string {
  const mapped = clients[repo];
  return mapped && mapped.trim().length > 0 ? mapped.trim() : repo;
}

/**
 * One thing a report can be narrowed to: a whole repository, or a folder inside
 * one.
 *
 * Folders are matched as prefixes, so selecting `src` includes `src/core` and
 * `src/ui`. Selecting the folder a person can see and getting only the time
 * they happened to have that exact folder open, and none of the work done
 * beneath it, would be a filter that lies.
 */
export interface Selection {
  repo: string;
  /** A folder path inside the repository, or undefined for the whole thing. */
  folder?: string;
}

/**
 * A selection as one string, for a checkbox value and a panel message.
 *
 * A repository name is a folder basename, so it can never contain a slash, and
 * the first slash is therefore always the separator.
 */
export function selectionKey(selection: Selection): string {
  return selection.folder === undefined ? selection.repo : `${selection.repo}/${selection.folder}`;
}

export function parseSelection(key: string): Selection {
  const slash = key.indexOf("/");
  if (slash === -1) {
    return { repo: key };
  }
  return { repo: key.slice(0, slash), folder: key.slice(slash + 1) };
}

/** Whether a stored folder falls inside any of the selected keys. */
export function matches(repo: string, folder: string, include: readonly string[]): boolean {
  if (include.length === 0) {
    return true;
  }
  return include.some((key) => {
    const selection = parseSelection(key);
    if (selection.repo !== repo) {
      return false;
    }
    if (selection.folder === undefined) {
      return true;
    }
    return folder === selection.folder || folder.startsWith(`${selection.folder}/`);
  });
}

/** A repository and its folders, for the filter's own checkboxes. */
export interface FilterOption {
  repo: string;
  /** Folder path within the repository. Undefined on the repository's own row. */
  folder?: string;
  key: string;
  /** Indent depth: 0 for the repository, 1 and up for folders. */
  depth: number;
  label: string;
  seconds: number;
}

/**
 * Everything the range has time against, whether or not it is currently
 * selected.
 *
 * Built from the same folder tree the dashboard draws, so an intermediate
 * folder is selectable even when nobody ever opened it directly: work recorded
 * against `src/core` and `src/ui` makes `src` a real thing to filter by, and a
 * list of only the exact paths on record would leave no way to say "the source".
 *
 * Built from the unfiltered days, too. A filter whose own options disappear as
 * you use it cannot be undone.
 */
export function filterOptions(
  days: Record<DayKey, DayRecord>,
  from: DayKey,
  to: DayKey
): FilterOption[] {
  const projects: Record<string, ProjectRecord> = {};
  for (const date of range(from, to)) {
    for (const [repo, record] of Object.entries(days[date]?.projects ?? {})) {
      const normalised: ProjectRecord = {
        seconds: record.seconds,
        folders: Object.fromEntries(foldersOf(record)),
      };
      const existing = projects[repo];
      projects[repo] = existing ? mergeProjectRecord(existing, normalised) : normalised;
    }
  }

  const options: FilterOption[] = [];
  for (const tree of treesFor(projects)) {
    if (tree.total <= 0) {
      continue;
    }
    options.push({
      repo: tree.repo,
      key: tree.repo,
      depth: 0,
      label: tree.repo,
      seconds: tree.total,
    });
    options.push(...folderOptions(tree.repo, tree.children, 1));
    if (tree.rootSeconds > 0 && tree.children.length > 0) {
      options.push({
        repo: tree.repo,
        folder: REPO_ROOT,
        key: selectionKey({ repo: tree.repo, folder: REPO_ROOT }),
        depth: 1,
        label: "repository root",
        seconds: tree.rootSeconds,
      });
    }
  }
  return options;
}

function folderOptions(repo: string, nodes: FolderNode[], depth: number): FilterOption[] {
  const options: FilterOption[] = [];
  for (const node of nodes) {
    options.push({
      repo,
      folder: node.path,
      key: selectionKey({ repo, folder: node.path }),
      depth,
      label: node.name,
      seconds: node.total,
    });
    options.push(...folderOptions(repo, node.children, depth + 1));
  }
  return options;
}

/**
 * A record's folder entries, with the repository total as a single root entry
 * when there are none.
 *
 * `migrate.ts` should make that impossible, and today it does. It is kept
 * because the alternative failure is silent: a record that ever reached here
 * with an empty `folders` map would drop its time from a filtered report while
 * still counting in an unfiltered one.
 */
function foldersOf(record: ProjectRecord): [string, number][] {
  const entries = Object.entries(record.folders ?? {});
  return entries.length > 0 ? entries : [[REPO_ROOT, record.seconds]];
}

export interface ReportRow {
  date: DayKey;
  client: string;
  /** Exactly what was tracked. */
  seconds: number;
  /** After rounding. Equal to `seconds` when rounding is off. */
  billableSeconds: number;
  /** Which repositories contributed, busiest first. */
  repos: string[];
}

export interface ClientTotal {
  client: string;
  seconds: number;
  billableSeconds: number;
  days: number;
  repos: string[];
}

export interface Report {
  from: DayKey;
  to: DayKey;
  rounding: Rounding;
  /** The keys this report was narrowed to. Empty when it covers everything. */
  include: readonly string[];
  rows: ReportRow[];
  clients: ClientTotal[];
  seconds: number;
  billableSeconds: number;
}

export interface ReportOptions {
  from: DayKey;
  to: DayKey;
  clients?: Record<string, string>;
  rounding?: Rounding;
  /** Repository or folder keys to report on. Empty means everything. */
  include?: readonly string[];
}

export function buildReport(
  days: Record<DayKey, DayRecord>,
  options: ReportOptions
): Report {
  const clients = options.clients ?? {};
  const rounding = options.rounding ?? "none";
  const include = options.include ?? [];
  const rows: ReportRow[] = [];

  for (const date of range(options.from, options.to)) {
    const day = days[date];
    if (!day) {
      continue;
    }
    const perClient = new Map<string, { seconds: number; repos: Map<string, number> }>();
    for (const [repo, record] of Object.entries(day.projects ?? {})) {
      // Summed folder by folder rather than taken from the repository total,
      // because that is the only level a folder filter can be applied at.
      const seconds = foldersOf(record)
        .filter(([folder]) => matches(repo, folder, include))
        .reduce((sum, [, folderSeconds]) => sum + folderSeconds, 0);
      if (seconds <= 0) {
        continue;
      }
      const client = clientOf(repo, clients);
      const entry = perClient.get(client) ?? { seconds: 0, repos: new Map<string, number>() };
      entry.seconds += seconds;
      entry.repos.set(repo, (entry.repos.get(repo) ?? 0) + seconds);
      perClient.set(client, entry);
    }
    for (const [client, entry] of perClient) {
      rows.push({
        date,
        client,
        seconds: entry.seconds,
        billableSeconds: roundSeconds(entry.seconds, rounding),
        repos: [...entry.repos.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([repo]) => repo),
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.client.localeCompare(b.client));

  const totals = new Map<string, ClientTotal>();
  for (const row of rows) {
    const existing =
      totals.get(row.client) ??
      { client: row.client, seconds: 0, billableSeconds: 0, days: 0, repos: [] };
    existing.seconds += row.seconds;
    existing.billableSeconds += row.billableSeconds;
    existing.days += 1;
    for (const repo of row.repos) {
      if (!existing.repos.includes(repo)) {
        existing.repos.push(repo);
      }
    }
    totals.set(row.client, existing);
  }

  const clientTotals = [...totals.values()].sort(
    (a, b) => b.billableSeconds - a.billableSeconds || a.client.localeCompare(b.client)
  );

  return {
    from: options.from,
    to: options.to,
    rounding,
    include,
    rows,
    clients: clientTotals,
    seconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    billableSeconds: rows.reduce((sum, row) => sum + row.billableSeconds, 0),
  };
}

/** RFC 4180 quoting: a field with a comma, quote or newline must be quoted. */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function reportToCsv(report: Report): string {
  const lines = ["date,client,repositories,tracked_hours,billable_hours"];
  for (const row of report.rows) {
    lines.push(
      [
        row.date,
        csvField(row.client),
        csvField(row.repos.join(" ")),
        hoursDecimal(row.seconds),
        hoursDecimal(row.billableSeconds),
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}
