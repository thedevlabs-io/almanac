import {
  averageActiveDay,
  heatmap,
  punchcard,
  repositories,
  signalSplit,
  topLanguages,
  totalsFor,
  type HeatCell,
  type Punchcard,
  type Slice,
} from "./aggregate";
import { typedShare, type Composition } from "./composition";
import { daysBetween, keyOf, shift, weekdayOf, type DayKey } from "./day";
import { duration, languageName, relativeDays } from "./format";
import { milestones, type Milestone } from "./milestones";
import type { RepoTree } from "./project";
import { streaks, secondsToKeepStreak, atRisk, type Streaks } from "./streaks";
import type { DayRecord } from "./types";

export type WindowName = "week" | "month" | "quarter" | "year";

const WINDOW_DAYS: Record<WindowName, number> = {
  week: 6,
  month: 29,
  quarter: 89,
  year: 364,
};

export function windowRange(name: WindowName, today: DayKey): { from: DayKey; to: DayKey } {
  return { from: shift(today, -(WINDOW_DAYS[name] ?? 364)), to: today };
}

export interface HeatWeek {
  cells: (HeatCell & { label: string })[];
}

export interface LabelledSlice extends Slice {
  label: string;
  text: string;
}

export interface FolderRow {
  /** Indent level, 0 for a repository's immediate children. */
  depth: number;
  name: string;
  path: string;
  /** Seconds with this folder open, formatted. Empty when the folder was never opened directly. */
  own: string;
  total: string;
  /** Share of the repository's total, 0 to 1, for the bar. */
  share: number;
}

export interface RepoRow {
  repo: string;
  total: string;
  totalSeconds: number;
  share: number;
  /** Seconds recorded at the repository root, formatted. Empty when none. */
  rootTime: string;
  folders: FolderRow[];
}

export interface DashboardModel {
  today: DayKey;
  window: WindowName;
  from: DayKey;
  to: DayKey;
  todayTime: string;
  windowTime: string;
  averageDay: string;
  activeDays: number;
  streak: Streaks;
  streakAtRisk: boolean;
  streakNeeds: string;
  weeks: HeatWeek[];
  monthLabels: { index: number; label: string }[];
  languages: LabelledSlice[];
  signals: LabelledSlice[];
  repositories: RepoRow[];
  punchcard: Punchcard;
  peakHourLabel: string;
  milestones: (Milestone & { valueText: string; nextText: string })[];
  composition: Composition;
  typedPercent: number;
  counts: { edits: number; saves: number; files: number; sessions: number; commits: number };
  empty: boolean;
}

const SIGNAL_LABELS: Record<string, string> = {
  editor: "Editor",
  terminal: "Terminal",
  debug: "Debugging",
  task: "Tasks",
  notebook: "Notebooks",
  tabs: "Tabs and panels",
  window: "Window",
};

export interface ModelOptions {
  window?: WindowName;
  today?: DayKey;
  minStreakMinutes?: number;
}

export function buildDashboard(
  days: Record<DayKey, DayRecord>,
  options: ModelOptions = {}
): DashboardModel {
  const today = options.today ?? keyOf(new Date());
  const window = options.window ?? "year";
  const minMinutes = options.minStreakMinutes ?? 5;
  const { from, to } = windowRange(window, today);

  const totals = totalsFor(days, from, to);
  const cells = heatmap(days, alignToWeek(from), to);
  const streakInfo = streaks(days, today, minMinutes);

  return {
    today,
    window,
    from,
    to,
    todayTime: duration(days[today]?.activeSeconds ?? 0),
    windowTime: duration(totals.seconds),
    averageDay: duration(averageActiveDay(totals)),
    activeDays: totals.activeDays,
    streak: streakInfo,
    streakAtRisk: atRisk(days, today, minMinutes),
    streakNeeds: duration(secondsToKeepStreak(days, today, minMinutes)),
    weeks: intoWeeks(cells, today),
    monthLabels: monthLabels(cells),
    languages: topLanguages(totals).map((slice) => ({
      ...slice,
      label: languageName(slice.key),
      text: duration(slice.seconds),
    })),
    signals: signalSplit(totals).map((slice) => ({
      ...slice,
      label: SIGNAL_LABELS[slice.key] ?? slice.key,
      text: duration(slice.seconds),
    })),
    repositories: repoRows(repositories(totals)),
    punchcard: punchcard(totals),
    peakHourLabel: peakLabel(punchcard(totals).peakHour),
    milestones: milestones({
      totalSeconds: totals.seconds,
      longestStreak: streakInfo.longest,
      activeDays: totals.activeDays,
    }).map((milestone) => ({
      ...milestone,
      valueText: milestone.describe(milestone.value),
      nextText: milestone.next === undefined ? "All reached" : milestone.describe(milestone.next),
    })),
    composition: totals.composition,
    typedPercent: Math.round(typedShare(totals.composition) * 100),
    counts: {
      edits: totals.edits,
      saves: totals.saves,
      files: totals.files,
      sessions: totals.sessions,
      commits: totals.commits,
    },
    empty: totals.seconds === 0,
  };
}

/** Heatmap columns are weeks, so the window has to start on a Monday. */
function alignToWeek(from: DayKey): DayKey {
  return shift(from, -weekdayOf(from));
}

function intoWeeks(cells: HeatCell[], today: DayKey): HeatWeek[] {
  const weeks: HeatWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push({
      cells: cells.slice(i, i + 7).map((cell) => ({
        ...cell,
        label: `${duration(cell.seconds)} on ${cell.date} (${relativeDays(
          daysBetween(cell.date, today)
        )})`,
      })),
    });
  }
  return weeks;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** One label per month, positioned at the week its first day falls in. */
function monthLabels(cells: HeatCell[]): { index: number; label: string }[] {
  const labels: { index: number; label: string }[] = [];
  let lastMonth = "";
  cells.forEach((cell, index) => {
    const month = cell.date.slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      const monthIndex = Number(cell.date.slice(5, 7)) - 1;
      labels.push({ index: Math.floor(index / 7), label: MONTHS[monthIndex] ?? "" });
    }
  });
  return labels;
}

function repoRows(trees: RepoTree[]): RepoRow[] {
  const grand = trees.reduce((sum, tree) => sum + tree.total, 0);
  return trees.map((tree) => ({
    repo: tree.repo,
    total: duration(tree.total),
    totalSeconds: tree.total,
    share: grand === 0 ? 0 : tree.total / grand,
    rootTime: tree.rootSeconds > 0 ? duration(tree.rootSeconds) : "",
    folders: flattenFolders(tree, 0, tree.total),
  }));
}

function flattenFolders(
  node: RepoTree | { children: RepoTree["children"] },
  depth: number,
  repoTotal: number
): FolderRow[] {
  const rows: FolderRow[] = [];
  for (const child of node.children) {
    rows.push({
      depth,
      name: child.name,
      path: child.path,
      own: child.seconds > 0 ? duration(child.seconds) : "",
      total: duration(child.total),
      share: repoTotal === 0 ? 0 : child.total / repoTotal,
    });
    rows.push(...flattenFolders(child, depth + 1, repoTotal));
  }
  return rows;
}

function peakLabel(hour: number | undefined): string {
  if (hour === undefined) {
    return "No peak yet";
  }
  const end = (hour + 1) % 24;
  return `${pad(hour)}:00 to ${pad(end)}:00`;
}

function pad(hour: number): string {
  return hour < 10 ? `0${hour}` : String(hour);
}
