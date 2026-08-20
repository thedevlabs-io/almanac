import { range, type DayKey } from "./day";
import { hoursDecimal } from "./format";
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
}

export function buildReport(
  days: Record<DayKey, DayRecord>,
  options: ReportOptions
): Report {
  const clients = options.clients ?? {};
  const rounding = options.rounding ?? "none";
  const rows: ReportRow[] = [];

  for (const date of range(options.from, options.to)) {
    const day = days[date];
    if (!day) {
      continue;
    }
    const perClient = new Map<string, { seconds: number; repos: Map<string, number> }>();
    for (const [repo, record] of Object.entries(day.projects ?? {})) {
      if (record.seconds <= 0) {
        continue;
      }
      const client = clientOf(repo, clients);
      const entry = perClient.get(client) ?? { seconds: 0, repos: new Map<string, number>() };
      entry.seconds += record.seconds;
      entry.repos.set(repo, (entry.repos.get(repo) ?? 0) + record.seconds);
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
