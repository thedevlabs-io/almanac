// ABOUTME: Date-ranged reports grouped by client and project, with rounding and CSV output.
// ABOUTME: Pure. Reports tracked editor time only — never a claim about total billable work.

import { daysBetween, range } from "./day";
import { duration, languageName } from "./format";
import type { DayKey, DayRecord } from "./types";

/** Folder name → client label. Folders with no entry report under their own name. */
export type ClientMap = Record<string, string>;

export type Rounding = "none" | "15m" | "30m" | "1h";

const INCREMENTS: Record<Rounding, number> = {
  none: 0,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
};

/**
 * Round a day's time up to the next increment, the way consultancies bill.
 * Zero stays zero — a day you didn't work must never round up to 15 minutes.
 */
export function roundSeconds(seconds: number, rounding: Rounding): number {
  const increment = INCREMENTS[rounding];
  if (increment === 0 || seconds <= 0) {
    return Math.max(seconds, 0);
  }
  return Math.ceil(seconds / increment) * increment;
}

export function clientOf(project: string, clients: ClientMap): string {
  return clients[project] ?? project;
}

export interface ProjectLine {
  project: string;
  seconds: number;
  days: number;
}

export interface ClientLine {
  client: string;
  seconds: number;
  /** Sum of each day's rounded time — rounding per day, not on the total. */
  rounded: number;
  days: number;
  projects: ProjectLine[];
}

export interface DayLine {
  date: DayKey;
  seconds: number;
  rounded: number;
  entries: { client: string; project: string; seconds: number }[];
}

export interface Report {
  from: DayKey;
  to: DayKey;
  label: string;
  rounding: Rounding;
  totalSeconds: number;
  totalRounded: number;
  daysWorked: number;
  clients: ClientLine[];
  byDay: DayLine[];
  /** Set when some tracked time has no project — usually work outside a folder. */
  unassignedSeconds: number;
}

export interface ReportOptions {
  from: DayKey;
  to: DayKey;
  label: string;
  clients: ClientMap;
  rounding: Rounding;
}

export function buildReport(
  days: Record<DayKey, DayRecord>,
  options: ReportOptions
): Report {
  const { from, to, clients, rounding, label } = options;
  const inRange = range(from, to)
    .map((date) => days[date])
    .filter((record): record is DayRecord => record !== undefined);

  const clientSeconds = new Map<string, number>();
  const clientDays = new Map<string, Set<DayKey>>();
  const projectSeconds = new Map<string, Map<string, number>>();
  const projectDays = new Map<string, Map<string, Set<DayKey>>>();
  const clientRounded = new Map<string, number>();
  const byDay: DayLine[] = [];
  let unassignedSeconds = 0;

  for (const record of inRange) {
    const entries: DayLine["entries"] = [];
    const perClientToday = new Map<string, number>();

    for (const [project, seconds] of Object.entries(record.projects)) {
      if (seconds <= 0) {
        continue;
      }
      const client = clientOf(project, clients);
      entries.push({ client, project, seconds });

      clientSeconds.set(client, (clientSeconds.get(client) ?? 0) + seconds);
      perClientToday.set(client, (perClientToday.get(client) ?? 0) + seconds);

      const seen = clientDays.get(client) ?? new Set<DayKey>();
      seen.add(record.date);
      clientDays.set(client, seen);

      const projects = projectSeconds.get(client) ?? new Map<string, number>();
      projects.set(project, (projects.get(project) ?? 0) + seconds);
      projectSeconds.set(client, projects);

      const pDays = projectDays.get(client) ?? new Map<string, Set<DayKey>>();
      const pSeen = pDays.get(project) ?? new Set<DayKey>();
      pSeen.add(record.date);
      pDays.set(project, pSeen);
      projectDays.set(client, pDays);
    }

    // Time tracked with no folder open — real work, but not attributable.
    const assigned = entries.reduce((a, e) => a + e.seconds, 0);
    unassignedSeconds += Math.max(record.activeSeconds - assigned, 0);

    // Rounding applies per client per day: that's how a day is billed.
    for (const [client, seconds] of perClientToday) {
      clientRounded.set(client, (clientRounded.get(client) ?? 0) + roundSeconds(seconds, rounding));
    }

    if (record.activeSeconds > 0) {
      byDay.push({
        date: record.date,
        seconds: record.activeSeconds,
        rounded: roundSeconds(record.activeSeconds, rounding),
        entries: entries.sort((a, b) => b.seconds - a.seconds),
      });
    }
  }

  const clientLines: ClientLine[] = [...clientSeconds.entries()]
    .map(([client, seconds]) => ({
      client,
      seconds,
      rounded: clientRounded.get(client) ?? seconds,
      days: clientDays.get(client)?.size ?? 0,
      projects: [...(projectSeconds.get(client) ?? new Map<string, number>()).entries()]
        .map(([project, value]) => ({
          project,
          seconds: value,
          days: projectDays.get(client)?.get(project)?.size ?? 0,
        }))
        .sort((a, b) => b.seconds - a.seconds),
    }))
    .sort((a, b) => b.seconds - a.seconds);

  return {
    from,
    to,
    label,
    rounding,
    totalSeconds: inRange.reduce((a, r) => a + r.activeSeconds, 0),
    totalRounded: clientLines.reduce((a, c) => a + c.rounded, 0),
    daysWorked: byDay.length,
    clients: clientLines,
    byDay: byDay.sort((a, b) => a.date.localeCompare(b.date)),
    unassignedSeconds,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * One row per day per project — the shape a spreadsheet or invoicing tool wants.
 * Hours are given to two decimals alongside the raw seconds so nothing is lost.
 */
export function toCsv(report: Report): string {
  const rows = [["date", "client", "project", "hours", "rounded_hours", "seconds"]];
  for (const day of report.byDay) {
    for (const entry of day.entries) {
      const rounded = roundSeconds(entry.seconds, report.rounding);
      rows.push([
        day.date,
        entry.client,
        entry.project,
        (entry.seconds / 3600).toFixed(2),
        (rounded / 3600).toFixed(2),
        String(entry.seconds),
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export interface DayDetail {
  date: DayKey;
  total: string;
  languages: { name: string; label: string; share: number }[];
  projects: { name: string; client: string; label: string }[];
  hours: { hour: number; seconds: number; level: number }[];
  commits: number;
  files: number;
  saves: number;
  typedShare?: number;
}

/** Everything about one day, for the drill-down under the heatmap. */
export function dayDetail(
  record: DayRecord | undefined,
  clients: ClientMap
): DayDetail | undefined {
  if (!record || record.activeSeconds <= 0) {
    return undefined;
  }
  const peak = Math.max(...record.hours, 0);
  const written = record.composition.typedChars + record.composition.insertedChars;

  return {
    date: record.date,
    total: duration(record.activeSeconds),
    languages: Object.entries(record.languages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([id, seconds]) => ({
        name: languageName(id),
        label: duration(seconds),
        share: seconds / record.activeSeconds,
      })),
    projects: Object.entries(record.projects)
      .sort(([, a], [, b]) => b - a)
      .map(([name, seconds]) => ({
        name,
        client: clientOf(name, clients),
        label: duration(seconds),
      })),
    hours: record.hours.map((seconds, hour) => ({
      hour,
      seconds,
      level: seconds <= 0 || peak <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((seconds / peak) * 4))),
    })),
    commits: record.commits ?? 0,
    files: record.files,
    saves: record.saves,
    typedShare: written === 0 ? undefined : record.composition.typedChars / written,
  };
}

export interface Preset {
  id: string;
  label: string;
  from: (today: DayKey) => DayKey;
  to: (today: DayKey) => DayKey;
}

function monthStart(key: DayKey, monthsBack = 0): DayKey {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - 1 - monthsBack, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function monthEnd(key: DayKey, monthsBack = 0): DayKey {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(y, m - monthsBack, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export const PRESETS: Preset[] = [
  { id: "this-month", label: "This month", from: (t) => monthStart(t), to: (t) => t },
  {
    id: "last-month",
    label: "Last month",
    from: (t) => monthStart(t, 1),
    to: (t) => monthEnd(t, 1),
  },
  { id: "last-7", label: "Last 7 days", from: (t) => shift(t, -6), to: (t) => t },
  { id: "last-30", label: "Last 30 days", from: (t) => shift(t, -29), to: (t) => t },
  { id: "all", label: "All time", from: () => "1970-01-01", to: (t) => t },
];

function shift(key: DayKey, delta: number): DayKey {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function presetRange(id: string, today: DayKey): { from: DayKey; to: DayKey; label: string } {
  const preset = PRESETS.find((p) => p.id === id) ?? PRESETS[0];
  return { from: preset.from(today), to: preset.to(today), label: preset.label };
}

/** Guard against a range so large the report would try to walk decades. */
export function clampRange(from: DayKey, to: DayKey, earliest: DayKey): DayKey {
  return daysBetween(from, to) > 3650 && earliest > from ? earliest : from;
}
