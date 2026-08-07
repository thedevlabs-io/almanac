// ABOUTME: Turns raw records into the exact view model the dashboard renders — labels included.
// ABOUTME: Pure, so what appears on screen is pinned by tests rather than assembled in the webview.

import { addDays, monthName, weekday } from "./day";
import { duration, languageName, plural } from "./format";
import { languageHeatmap, summarize, type HeatCell, type Summary } from "./aggregate";
import { milestonesFor, type Milestone } from "./milestones";
import type { DayKey, DayRecord } from "./types";

export interface HeatColumn {
  /** Month label above this column, when the month changes here. */
  month?: string;
  cells: (HeatCell | null)[];
}

export interface LanguageView {
  id: string;
  name: string;
  seconds: number;
  label: string;
  share: number;
  days: number;
  streak: number;
  longest: number;
  heatmap: HeatCell[];
}

export interface DashboardModel {
  headline: {
    streak: string;
    streakNote: string;
    today: string;
    week: string;
    total: string;
    longest: string;
  };
  columns: HeatColumn[];
  legendLabels: [string, string];
  languages: LanguageView[];
  projects: { name: string; label: string; days: string; share: number }[];
  punchcard: { rows: { label: string; cells: { level: number; seconds: number; hour: number }[] }[]; busiest: string };
  milestones: Milestone[];
  facts: { label: string; value: string }[];
  commits: { total: number; byDay: Record<DayKey, number> };
  composition: {
    typed: number;
    inserted: number;
    typedShare: number;
    insertedShare: number;
    summary: string;
    known: boolean;
  };
  assistants: string[];
  empty: boolean;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Lay the heatmap out in week columns, GitHub-style, padded to whole weeks. */
export function columnsFor(cells: HeatCell[]): HeatColumn[] {
  if (cells.length === 0) {
    return [];
  }
  const columns: HeatColumn[] = [];
  let current: (HeatCell | null)[] = new Array<HeatCell | null>(weekday(cells[0].date)).fill(null);
  let lastMonth = "";

  for (const cell of cells) {
    current.push(cell);
    if (current.length === 7) {
      const first = current.find((c): c is HeatCell => c !== null);
      const month = first ? monthName(first.date) : "";
      columns.push({ month: month !== lastMonth ? month : undefined, cells: current });
      if (month !== lastMonth) {
        lastMonth = month;
      }
      current = [];
    }
  }
  if (current.length > 0) {
    while (current.length < 7) {
      current.push(null);
    }
    columns.push({ cells: current });
  }
  return columns;
}

function punchcardView(summary: Summary): DashboardModel["punchcard"] {
  const flat = summary.punchcard.flat();
  const peak = Math.max(...flat, 0);
  const level = (seconds: number): number => {
    if (seconds <= 0 || peak <= 0) {
      return 0;
    }
    return Math.min(4, Math.max(1, Math.ceil((seconds / peak) * 4)));
  };

  let busiest = "—";
  if (peak > 0) {
    let bestDay = 0;
    let bestHour = 0;
    summary.punchcard.forEach((row, day) =>
      row.forEach((seconds, hour) => {
        if (seconds === peak) {
          bestDay = day;
          bestHour = hour;
        }
      })
    );
    busiest = `${WEEKDAYS[bestDay]} around ${bestHour}:00`;
  }

  return {
    rows: summary.punchcard.map((row, day) => ({
      label: WEEKDAYS[day],
      cells: row.map((seconds, hour) => ({ seconds, hour, level: level(seconds) })),
    })),
    busiest,
  };
}

export interface ModelOptions {
  today: DayKey;
  minSeconds: number;
  heatmapDays: number;
  /** Names of AI assistants installed, shown as context beside the split. */
  assistants?: string[];
}

function compositionView(summary: Summary): DashboardModel["composition"] {
  const { typedChars, insertedChars } = summary.composition;
  const share = summary.insertedShare;
  if (share === undefined) {
    return {
      typed: 0,
      inserted: 0,
      typedShare: 0,
      insertedShare: 0,
      summary: "Nothing written yet",
      known: false,
    };
  }
  const percent = Math.round(share * 100);
  return {
    typed: typedChars,
    inserted: insertedChars,
    typedShare: 1 - share,
    insertedShare: share,
    summary: `${percent}% of what you wrote arrived in blocks`,
    known: true,
  };
}

export function buildModel(
  days: Record<DayKey, DayRecord>,
  options: ModelOptions
): DashboardModel {
  const summary = summarize(days, options);
  const from = addDays(options.today, -(options.heatmapDays - 1));
  const totalLanguageSeconds = summary.languages.reduce((a, l) => a + l.seconds, 0) || 1;
  const totalProjectSeconds = summary.projects.reduce((a, p) => a + p.seconds, 0) || 1;

  const streakNote = summary.streak.current === 0
    ? summary.daysQualifying === 0
      ? "Work for a few minutes to start one"
      : "Broken — today can start a new one"
    : summary.streak.todayCounts
      ? "Today counts"
      : "Today hasn't counted yet";

  return {
    headline: {
      streak: plural(summary.streak.current, "day"),
      streakNote,
      today: duration(summary.today),
      week: duration(summary.week),
      total: duration(summary.total),
      longest: plural(summary.streak.longest, "day"),
    },
    columns: columnsFor(summary.heatmap),
    legendLabels: ["Less", "More"],
    languages: summary.languages.slice(0, 8).map((language) => ({
      id: language.id,
      name: language.name,
      seconds: language.seconds,
      label: duration(language.seconds),
      share: language.seconds / totalLanguageSeconds,
      days: language.days,
      streak: language.streak.current,
      longest: language.streak.longest,
      heatmap: languageHeatmap(days, language.id, from, options.today),
    })),
    projects: summary.projects.slice(0, 8).map((project) => ({
      name: project.name,
      label: duration(project.seconds),
      days: plural(project.days, "day"),
      share: project.seconds / totalProjectSeconds,
    })),
    punchcard: punchcardView(summary),
    milestones: milestonesFor(summary),
    facts: [
      { label: "Days worked", value: plural(summary.daysQualifying, "day") },
      { label: "Best day", value: summary.best ? `${duration(summary.best.seconds)} · ${summary.best.date}` : "—" },
      { label: "Sessions", value: String(summary.totals.sessions) },
      { label: "Files touched", value: String(summary.totals.files) },
      { label: "Saves", value: String(summary.totals.saves) },
      { label: "Edits", value: String(summary.totals.edits) },
      { label: "Busiest time", value: punchcardView(summary).busiest },
      { label: "Tracking since", value: summary.firstDay ?? "—" },
    ],
    commits: { total: summary.totals.commits, byDay: summary.commitsByDay },
    composition: compositionView(summary),
    assistants: options.assistants ?? [],
    empty: summary.total === 0,
  };
}

export { languageName };
