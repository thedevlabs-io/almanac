import {
  averageActiveDay,
  heatmap,
  punchcard,
  repositories,
  signalSplit,
  topLanguages,
  totalsFor,
  weekHours,
  type HeatCell,
  heatLevel,
  type Punchcard,
  type Slice,
} from "./aggregate";
import { typedShare, type Composition } from "./composition";
import { daysBetween, keyOf, range, shift, weekdayOf, type DayKey } from "./day";
import { duration, languageName, relativeDays } from "./format";
import { milestones, type Milestone } from "./milestones";
import type { RepoTree } from "./project";
import { streaks, secondsToKeepStreak, atRisk, type Streaks } from "./streaks";
import type { DayRecord } from "./types";

/**
 * The dashboard covers one rolling year, and offers no control to change it.
 *
 * There used to be Week, Month, Quarter and Year tabs. They were four ways to
 * ask a question the page already answered twice: the heatmap shows every day
 * of the year at once, and the recent-days table shows the last seven. What the
 * tabs added was ambiguity, because "average day" meant something different in
 * each one and nothing on screen said which.
 */
const WINDOW_DAYS = 364;

export function windowRange(today: DayKey): { from: DayKey; to: DayKey } {
  return { from: shift(today, -WINDOW_DAYS), to: today };
}

/** One cell, with everything the view needs already worded. */
export interface HeatCellView extends HeatCell {
  /** Tooltip text: the duration, the weekday, the date, how long ago. */
  label: string;
  /** Monday is 0, matching the row order of the grid. */
  weekday: number;
  /** True for a slot that pads the grid to a whole week, so it renders blank. */
  filler: boolean;
}

export interface HeatWeek {
  cells: HeatCellView[];
}

/** A month label placed over the week column its first day falls in. */
export interface MonthLabel {
  /** Column index, 1-based, for CSS grid placement. */
  column: number;
  /** How many columns the label may occupy before the next one starts. */
  span: number;
  label: string;
}

/** One step of the heat scale, worded in real time rather than "less to more". */
export interface LegendStop {
  level: 0 | 1 | 2 | 3 | 4;
  text: string;
}

/**
 * One day of the week window, shown as a labelled row rather than a cell.
 *
 * Seven squares in a single column is a heatmap of nothing: there is no shape
 * to see and no way to tell Tuesday from Thursday. At this range the useful
 * view is the days themselves, named and measured.
 */
export interface DayRow {
  date: DayKey;
  /** `Mon 18 Aug`. */
  dayLabel: string;
  time: string;
  seconds: number;
  /** Share of the scale the row was cut against, 0 to 1. */
  share: number;
  /** The same shade the grid would give this day. */
  level: 0 | 1 | 2 | 3 | 4;
  isToday: boolean;
  /** The hours worked that day, worded, or empty when none. */
  busiestHours: string;
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

/** One punchcard column, already worded. */
export interface PunchBar {
  hour: number;
  /** Share of the busiest hour, 0 to 1. */
  share: number;
  /** `09:00 to 10:00, 3h 12m across the window`. */
  label: string;
}

/** One cell of the weekday-by-hour grid. */
export interface WeekHourCell {
  hour: number;
  level: 0 | 1 | 2 | 3 | 4;
  /** `Tue 14:00 to 15:00, 4h 12m across the window`. Empty when nothing. */
  label: string;
}

/** One weekday of the weekday-by-hour grid. */
export interface WeekHourRow {
  /** Monday is 0. */
  weekday: number;
  label: string;
  total: string;
  cells: WeekHourCell[];
}

/**
 * Everything on record, which is not quite the same as everything ever.
 *
 * These are deliberately not windowed: windowing them would make them wrong
 * rather than filtered. But `almanac.retentionDays` prunes old days from the
 * store, so this is bounded by retention, and the card says so rather than
 * calling a two year total a lifetime.
 */
export interface Lifetime {
  since: DayKey | undefined;
  sinceText: string;
  total: string;
  activeDays: number;
  longestStreak: number;
}

/**
 * One day, opened by clicking its square.
 *
 * Built by running the same window arithmetic over a range of one day, so a
 * day's detail cannot disagree with the year's totals: they are the same code.
 */
export interface DayDetail {
  date: DayKey;
  /** `Thu 20 Aug 2026`. */
  dateLabel: string;
  /** `today`, `yesterday`, `3 days ago`. */
  relative: string;
  time: string;
  /** The hours worked, worded. Empty when nothing was tracked. */
  hoursText: string;
  hourBars: PunchBar[];
  languages: LabelledSlice[];
  signals: LabelledSlice[];
  repositories: RepoRow[];
  counts: { edits: number; saves: number; files: number; sessions: number; commits: number };
  typedPercent: number;
  composition: Composition;
  /** True when the clicked day has nothing on it, which is worth saying plainly. */
  empty: boolean;
}

export interface DashboardModel {
  today: DayKey;
  from: DayKey;
  to: DayKey;
  /** `last 365 days`, for the header. */
  rangeLabel: string;
  todayTime: string;
  windowTime: string;
  averageDay: string;
  activeDays: number;
  streak: Streaks;
  streakAtRisk: boolean;
  streakNeeds: string;
  /** The calendar grid, for month, quarter and year. Empty for the week window. */
  weeks: HeatWeek[];
  monthLabels: MonthLabel[];
  /** Row labels down the left of the grid. Blank strings are unlabelled rows. */
  weekdayLabels: string[];
  legend: LegendStop[];
  /** Day rows, for the week window. Empty for every other window. */
  /** True when the window is short enough that day rows replace the grid. */
  languages: LabelledSlice[];
  signals: LabelledSlice[];
  repositories: RepoRow[];
  punchcard: Punchcard;
  punchBars: PunchBar[];
  peakHourLabel: string;
  /** Weekday by hour, Monday first. Derived from stored hour buckets. */
  weekHours: WeekHourRow[];
  /**
   * The matrix's own scale. Separate from `legend` on purpose: those shades are
   * cut against the busiest day and these against the busiest hour, and one
   * legend serving both would print bounds several times too large.
   */
  weekHoursLegend: LegendStop[];
  busiestWeekdayLabel: string;
  /** The last seven days, for the activity tab. */
  recentDays: DayRow[];
  /** The day whose square was clicked, when one was. */
  selected?: DayDetail;
  lifetime: Lifetime;
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
  today?: DayKey;
  minStreakMinutes?: number;
  /** A day to open the detail for, from a click on its square. */
  selected?: DayKey;
}

export function buildDashboard(
  days: Record<DayKey, DayRecord>,
  options: ModelOptions = {}
): DashboardModel {
  const today = options.today ?? keyOf(new Date());
  const minMinutes = options.minStreakMinutes ?? 5;
  const { from, to } = windowRange(today);

  const totals = totalsFor(days, from, to);
  const grid = heatmap(days, alignToWeek(from), to);
  const streakInfo = streaks(days, today, minMinutes);
  const week = weekHours(days, from, to);
  const hours = punchcard(totals);

  return {
    today,
    from,
    to,
    rangeLabel: `last ${range(from, to).length} days`,
    todayTime: duration(days[today]?.activeSeconds ?? 0),
    windowTime: duration(totals.seconds),
    averageDay: duration(averageActiveDay(totals)),
    activeDays: totals.activeDays,
    streak: streakInfo,
    streakAtRisk: atRisk(days, today, minMinutes),
    streakNeeds: duration(secondsToKeepStreak(days, today, minMinutes)),
    weeks: intoWeeks(grid.cells, today, days),
    monthLabels: monthLabels(grid.cells),
    weekdayLabels: WEEKDAYS.map((name, row) => (SHOWN_WEEKDAY_ROWS.has(row) ? name : "")),
    legend: legendFor(grid),
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
    punchcard: hours,
    punchBars: punchBars(totals.hours),
    peakHourLabel: peakLabel(hours.peakHour),
    weekHours: weekHourRows(week),
    weekHoursLegend: legendFor({
      busiest: week.busiest,
      thresholds: [week.busiest * 0.25, week.busiest * 0.5, week.busiest * 0.75],
    }),
    busiestWeekdayLabel: busiestWeekdayLabel(week),
    recentDays: dayRows(days, shift(today, -6), today, today, grid.busiest),
    selected: options.selected === undefined ? undefined : dayDetail(days, options.selected, today),
    lifetime: lifetimeOf(days, streakInfo),
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

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * Which weekday rows carry a label. Labelling all seven at a 12px row height
 * stacks unreadable text down the side, so alternate rows are labelled and the
 * pattern reads from three points, which is the convention every contribution
 * graph settled on.
 */
const SHOWN_WEEKDAY_ROWS = new Set([0, 2, 4]);

/**
 * The legend, worded in hours rather than "Less to More".
 *
 * Levels are cut against the busiest day in the window, so the same shade means
 * different things in different windows. Saying so out loud is the only way the
 * graph is readable rather than merely decorative.
 */
function legendFor(grid: { busiest: number; thresholds: [number, number, number] }): LegendStop[] {
  if (grid.busiest <= 0) {
    return [{ level: 0, text: "No activity yet" }];
  }
  const [one, two, three] = grid.thresholds;
  return [
    { level: 0, text: "None" },
    { level: 1, text: `to ${duration(one)}` },
    { level: 2, text: `to ${duration(two)}` },
    { level: 3, text: `to ${duration(three)}` },
    { level: 4, text: `to ${duration(grid.busiest)}` },
  ];
}

/** Heatmap columns are weeks, so the window has to start on a Monday. */
function alignToWeek(from: DayKey): DayKey {
  return shift(from, -weekdayOf(from));
}

function intoWeeks(
  cells: HeatCell[],
  today: DayKey,
  days: Record<DayKey, DayRecord>
): HeatWeek[] {
  const weeks: HeatWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7).map((cell) => ({
      ...cell,
      weekday: weekdayOf(cell.date),
      filler: false,
      label: cellLabel(cell, today, days[cell.date]),
    }));
    // The final week runs out mid-column. Padding it keeps every column seven
    // rows tall so the weekday gutter still lines up with the right rows.
    while (week.length < 7) {
      const date = shift(week[week.length - 1]?.date ?? today, 1);
      week.push({
        date,
        seconds: 0,
        level: 0,
        weekday: week.length,
        filler: true,
        label: "",
      });
    }
    weeks.push({ cells: week });
  }
  return weeks;
}

/**
 * A square's tooltip.
 *
 * The duration and the date are the minimum, and the busiest repository and
 * language are added when there are any, because "4h 12m" alone leaves the
 * reader clicking every square to find the day they are looking for. Nothing
 * here is new data: it is the day's own top entries.
 */
function cellLabel(cell: HeatCell, today: DayKey, record: DayRecord | undefined): string {
  const when = `${WEEKDAYS[weekdayOf(cell.date)]} ${describeDate(cell.date)} (${relativeDays(
    daysBetween(cell.date, today)
  )})`;
  if (cell.seconds <= 0) {
    return `Nothing tracked on ${when}`;
  }
  const parts = [`${duration(cell.seconds)} on ${when}`];
  const repo = busiestKey(record?.projects, (value) => value.seconds);
  if (repo !== undefined) {
    parts.push(`mostly in ${repo}`);
  }
  const language = busiestKey(record?.languages, (value) => value);
  if (language !== undefined) {
    parts.push(languageName(language));
  }
  return `${parts.join(", ")}. Click for the day.`;
}

function busiestKey<T>(
  entries: Record<string, T> | undefined,
  secondsOf: (value: T) => number
): string | undefined {
  let best: { key: string; seconds: number } | undefined;
  for (const [key, value] of Object.entries(entries ?? {})) {
    const seconds = secondsOf(value);
    if (seconds > 0 && (best === undefined || seconds > best.seconds)) {
      best = { key, seconds };
    }
  }
  return best?.key;
}

/**
 * One day, assembled from the same aggregates the year uses.
 *
 * A day with nothing on it still returns a detail rather than undefined: the
 * click happened, and answering it with silence looks like a broken panel
 * rather than an empty Sunday.
 */
function dayDetail(
  days: Record<DayKey, DayRecord>,
  date: DayKey,
  today: DayKey
): DayDetail {
  const totals = totalsFor(days, date, date);
  const record = days[date];
  return {
    date,
    dateLabel: `${WEEKDAYS[weekdayOf(date)]} ${describeDate(date)}`,
    relative: relativeDays(daysBetween(date, today)),
    time: duration(totals.seconds),
    hoursText: record ? describeHours(record.hours) : "",
    hourBars: punchBars(totals.hours),
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
    counts: {
      edits: totals.edits,
      saves: totals.saves,
      files: totals.files,
      sessions: totals.sessions,
      commits: totals.commits,
    },
    typedPercent: Math.round(typedShare(totals.composition) * 100),
    composition: totals.composition,
    empty: totals.seconds === 0,
  };
}

/** `18 Aug 2026`, for a tooltip where a bare `2026-08-18` reads as a serial number. */
function describeDate(key: DayKey): string {
  const month = MONTHS[Number(key.slice(5, 7)) - 1] ?? "";
  return `${Number(key.slice(8, 10))} ${month} ${key.slice(0, 4)}`;
}

/**
 * The week window as named rows.
 *
 * Every day in the range appears, including the ones with nothing on them: a
 * week with Wednesday missing is information, and a list that silently omits it
 * looks like a week with six days.
 */
function dayRows(
  days: Record<DayKey, DayRecord>,
  from: DayKey,
  to: DayKey,
  today: DayKey,
  /**
   * What a full bar means. The recent-days table passes the year's busiest day
   * so its squares carry the same meaning as the grid beside them; two sets of
   * squares in the same colours on the same screen must not use two scales.
   */
  scale?: number
): DayRow[] {
  const window = range(from, to);
  const busiest =
    scale ?? window.reduce((max, date) => Math.max(max, days[date]?.activeSeconds ?? 0), 0);
  return window.map((date) => {
    const record = days[date];
    const seconds = record?.activeSeconds ?? 0;
    return {
      date,
      dayLabel: `${WEEKDAYS[weekdayOf(date)]} ${Number(date.slice(8, 10))} ${
        MONTHS[Number(date.slice(5, 7)) - 1] ?? ""
      }`,
      time: duration(seconds),
      seconds,
      share: busiest === 0 ? 0 : seconds / busiest,
      level: heatLevel(seconds, busiest),
      isToday: date === today,
      busiestHours: record ? describeHours(record.hours) : "",
    };
  });
}

/**
 * The stretch of the day the work fell in, as `09:00 to 18:00`.
 *
 * Read off the hour buckets rather than stored, because Almanac keeps totals
 * and not a timeline. It is the span that had activity, not a claim that the
 * whole span was worked, and the duration beside it already says how much was.
 */
function describeHours(hours: number[]): string {
  const worked = hours.map((seconds, hour) => ({ seconds, hour })).filter((entry) => entry.seconds > 0);
  if (worked.length === 0) {
    return "";
  }
  const first = worked[0]?.hour ?? 0;
  const last = worked[worked.length - 1]?.hour ?? 0;
  return `${pad(first)}:00 to ${pad((last + 1) % 24)}:00`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The weekday-by-hour grid, shaded against its own busiest cell.
 *
 * Its own busiest cell, not the day heatmap's: an hour of a Tuesday and a whole
 * Tuesday are different quantities, and sharing one scale would leave every
 * cell here in the coldest band.
 */
function weekHourRows(week: { rows: number[][]; busiest: number; weekdayTotals: number[] }): WeekHourRow[] {
  return WEEKDAYS.map((label, weekday) => ({
    weekday,
    label,
    total: duration(week.weekdayTotals[weekday] ?? 0),
    cells: (week.rows[weekday] ?? []).map((seconds, hour) => ({
      hour,
      level: heatLevel(seconds, week.busiest),
      label:
        seconds <= 0
          ? ""
          : `${label} ${pad(hour)}:00 to ${pad((hour + 1) % 24)}:00, ${duration(seconds)} across the window`,
    })),
  }));
}

function busiestWeekdayLabel(week: { weekdayTotals: number[]; busiestWeekday?: number }): string {
  if (week.busiestWeekday === undefined) {
    return "Nothing tracked yet";
  }
  return `${WEEKDAYS[week.busiestWeekday]}, ${duration(week.weekdayTotals[week.busiestWeekday] ?? 0)}`;
}

/** Lifetime figures, read from every day on record rather than the window. */
function lifetimeOf(days: Record<DayKey, DayRecord>, streakInfo: Streaks): Lifetime {
  const dates = Object.keys(days)
    .filter((date) => (days[date]?.activeSeconds ?? 0) > 0)
    .sort();
  const seconds = dates.reduce((sum, date) => sum + (days[date]?.activeSeconds ?? 0), 0);
  const since = dates[0];
  return {
    since,
    sinceText: since === undefined ? "Nothing tracked yet" : describeDate(since),
    total: duration(seconds),
    activeDays: dates.length,
    longestStreak: streakInfo.longest,
  };
}

/**
 * One label per month, placed over the week column its first day falls in.
 *
 * Each label is given the columns up to the next one, and a month whose label
 * would not fit is dropped rather than drawn. Without that, a three column
 * month renders `Jul` and `Aug` hard against each other and reads as `JulAug`,
 * which is exactly what a fixed-width span per week produced.
 */
const MIN_LABEL_COLUMNS = 3;

function monthLabels(cells: HeatCell[]): MonthLabel[] {
  const starts: { column: number; label: string }[] = [];
  let lastMonth = "";
  cells.forEach((cell, index) => {
    const month = cell.date.slice(0, 7);
    if (month !== lastMonth) {
      lastMonth = month;
      starts.push({
        column: Math.floor(index / 7) + 1,
        label: MONTHS[Number(cell.date.slice(5, 7)) - 1] ?? "",
      });
    }
  });

  const totalColumns = Math.ceil(cells.length / 7);
  const labels: MonthLabel[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    if (!start) {
      continue;
    }
    const nextColumn = starts[i + 1]?.column ?? totalColumns + 1;
    const span = nextColumn - start.column;
    if (span >= MIN_LABEL_COLUMNS) {
      labels.push({ column: start.column, span, label: start.label });
    }
  }
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

/**
 * The punchcard columns, worded. The tooltip said `9:00, 1234 seconds`, which
 * is a number nobody reads in seconds and an hour nobody reads without its end.
 */
function punchBars(hours: number[]): PunchBar[] {
  const busiest = hours.reduce((max, seconds) => Math.max(max, seconds), 0);
  return hours.map((seconds, hour) => ({
    hour,
    share: busiest === 0 ? 0 : seconds / busiest,
    label:
      seconds === 0
        ? `${pad(hour)}:00 to ${pad((hour + 1) % 24)}:00, nothing tracked`
        : `${pad(hour)}:00 to ${pad((hour + 1) % 24)}:00, ${duration(seconds)} across this window`,
  }));
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
