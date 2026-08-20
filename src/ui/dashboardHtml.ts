import type {
  DashboardModel,
  DayDetail,
  DayRow,
  FolderRow,
  LabelledSlice,
  PunchBar,
  RepoRow,
  WeekHourRow,
} from "../core/dashboardModel";
import type { Composition } from "../core/composition";
import { bar, card, legend, pane, statStrip, tabNav, tabScript, type TabDef } from "./shell";
import { sharedStyles, type BrandFonts, type BrandTheme } from "./style";
import { contentSecurityPolicy, DynamicStyles, escapeHtml, nonce } from "./webview";

/**
 * Three tabs: how much, where it went, and when and how it was counted.
 *
 * When and How started as separate tabs and were merged because they answered
 * one question between them. "You work at 14:00, mostly on Tuesdays, and the
 * clock was held open by the terminal" is a single thought about the shape of
 * the work, and splitting it made each half look thinner than it was.
 */
export const DASHBOARD_TABS: TabDef[] = [
  { id: "activity", label: "Activity" },
  { id: "where", label: "Where" },
  { id: "when", label: "When and how" },
];

export type DashboardTab = "activity" | "where" | "when";

export function isDashboardTab(value: string | undefined): value is DashboardTab {
  return DASHBOARD_TABS.some((tab) => tab.id === value);
}

export function dashboardHtml(
  model: DashboardModel,
  cspSource: string,
  fonts: BrandFonts,
  theme: BrandTheme,
  tab: DashboardTab = "activity"
): string {
  const id = nonce();
  const styles = new DynamicStyles();
  // The body is rendered first so the generated classes exist by the time the
  // stylesheet is written. The CSP forbids inline style attributes, so this
  // ordering is load-bearing rather than a preference.
  const content = model.empty ? emptyState() : body(model, styles, tab);

  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(cspSource, id)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Almanac</title>
<style nonce="${id}">${sharedStyles(fonts, theme)}${styles.css}</style>
</head>
<body>
${header(model)}
${content}
<script nonce="${id}">
  const vscode = acquireVsCodeApi();
  const report = document.getElementById("open-report");
  if (report) {
    report.addEventListener("click", () => vscode.postMessage({ type: "report" }));
  }
  for (const cell of document.querySelectorAll("[data-day]")) {
    const open = () => vscode.postMessage({ type: "day", date: cell.dataset.day });
    cell.addEventListener("click", open);
    cell.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }
  document.getElementById("clear-day")?.addEventListener("click", () => {
    vscode.postMessage({ type: "day", date: "" });
  });
  ${tabScript()}
</script>
</body>
</html>`;
}

function header(model: DashboardModel): string {
  return `<header>
  <div>
    <h1>Almanac</h1>
    <p class="muted small mono">${escapeHtml(model.rangeLabel)}: ${escapeHtml(
      model.from
    )} to ${escapeHtml(model.to)}</p>
  </div>
  <div class="tabs"><button id="open-report">Report</button></div>
</header>`;
}

function emptyState(): string {
  return `<div class="card empty">
  <p><strong>Nothing tracked yet.</strong></p>
  <p class="small">Almanac starts counting as soon as you do something in this window: type, scroll, run a command in the terminal, step through a debugger. Come back in a few minutes.</p>
</div>`;
}

function body(model: DashboardModel, styles: DynamicStyles, tab: DashboardTab): string {
  return `${strip(model)}
${tabNav(DASHBOARD_TABS, tab, "These figures stay put on every tab")}
${activityPane(model, styles, tab === "activity")}
${wherePane(model, styles, tab === "where")}
${whenPane(model, styles, tab === "when")}`;
}

function strip(model: DashboardModel): string {
  const risk = model.streakAtRisk ? `${model.streakNeeds} more to keep it` : undefined;
  return statStrip([
    { value: model.todayTime, label: "today", live: true },
    { value: model.windowTime, label: model.rangeLabel },
    { value: model.averageDay, label: "average day" },
    { value: `${model.activeDays}`, label: "active days" },
    { value: `${model.streak.current}`, label: `streak, best ${model.streak.longest}`, warning: risk },
    { value: `${model.counts.commits}`, label: "commits" },
  ]);
}

/* --- Activity ------------------------------------------------------------ */

function activityPane(model: DashboardModel, styles: DynamicStyles, active: boolean): string {
  const graph = `${calendarGrid(model, styles)}${legend(model.legend)}${dayDetailCard(
    model.selected,
    styles
  )}`;
  const inner = `<div class="grid cols">
  ${card("Every day", graph, "c8")}
  ${card("Recent days", recentTable(model.recentDays), "c4")}
  ${card("Milestones", milestoneTable(model, styles), "c4")}
  ${card("Counted", countsTable(model), "c4")}
  ${card("All time on record", lifetimeTable(model), "c4")}
</div>`;
  return pane(
    "activity",
    active,
    "One square per day of the last year. Hover for the day, click it for what you were doing.",
    inner
  );
}

/** The calendar grid, with a weekday gutter and month labels that cannot collide. */
function calendarGrid(model: DashboardModel, styles: DynamicStyles): string {
  const columns = model.weeks.length;
  if (columns === 0) {
    return `<p class="muted small">Nothing tracked in this range yet.</p>`;
  }
  const track = styles.add(`grid-template-columns:repeat(${columns},var(--cell))`);

  const months = model.monthLabels
    .map(
      (month) =>
        `<span class="${styles.add(
          `grid-column:${month.column} / span ${month.span}`
        )}">${escapeHtml(month.label)}</span>`
    )
    .join("");

  const gutter = model.weekdayLabels
    .map((label) => `<span>${escapeHtml(label)}</span>`)
    .join("");

  const weeks = model.weeks
    .map(
      (week) =>
        `<div class="heat-week">${week.cells
          .map((cell) =>
            cell.filler
              ? `<div class="heat-cell filler"></div>`
              : `<div class="heat-cell${
                  cell.date === model.selected?.date ? " picked" : ""
                }" data-level="${cell.level}" data-day="${cell.date}" tabindex="0" role="button" title="${escapeHtml(
                  cell.label
                )}"></div>`
          )
          .join("")}</div>`
    )
    .join("");

  return `<div class="heat-layout">
  <div class="heat-gutter">${gutter}</div>
  <div class="heat-scroll">
    <div class="heat-months ${track}">${months}</div>
    <div class="heatmap">${weeks}</div>
  </div>
</div>`;
}

function recentTable(rows: DayRow[]): string {
  const body = [...rows]
    .reverse()
    .map(
      (row) => `<tr>
    <td><span class="heat-cell recent-cell" data-level="${row.level}"></span><span class="mono">${escapeHtml(
      row.dayLabel
    )}</span></td>
    <td class="num mono">${escapeHtml(row.seconds > 0 ? row.time : "none")}</td>
  </tr>`
    )
    .join("");
  return `<table class="tight"><tbody>${body}</tbody></table>`;
}

function countsTable(model: DashboardModel): string {
  const { edits, saves, files, sessions, commits } = model.counts;
  return `<table class="tight"><tbody>
  ${countRow("Edits", edits.toLocaleString(), "Saves", saves.toLocaleString())}
  ${countRow("Files", files.toLocaleString(), "Sessions", sessions.toLocaleString())}
  ${countRow("Commits", commits.toLocaleString(), "Peak hour", model.peakHourLabel)}
</tbody></table>`;
}

function countRow(a: string, av: string, b: string, bv: string): string {
  return `<tr>
    <td>${escapeHtml(a)}</td><td class="num mono">${escapeHtml(av)}</td>
    <td>${escapeHtml(b)}</td><td class="num mono">${escapeHtml(bv)}</td>
  </tr>`;
}

/**
 * Not the window, and not quite forever either. Windowing these would make them
 * wrong rather than filtered, but the store prunes days past
 * `almanac.retentionDays`, so the card says what it covers instead of calling a
 * pruned total a lifetime.
 */
function lifetimeTable(model: DashboardModel): string {
  const { lifetime } = model;
  return `<table class="tight"><tbody>
  <tr><td>Tracked since</td><td class="num mono">${escapeHtml(lifetime.sinceText)}</td></tr>
  <tr><td>Total time</td><td class="num mono">${escapeHtml(lifetime.total)}</td></tr>
  <tr><td>Active days</td><td class="num mono">${lifetime.activeDays.toLocaleString()}</td></tr>
  <tr><td>Longest streak</td><td class="num mono">${lifetime.longestStreak} days</td></tr>
</tbody></table>
<p class="muted small note">Everything Almanac still holds. Days past <span class="mono">almanac.retentionDays</span> are pruned from the store, so this grows with you and stops at that limit.</p>`;
}

function milestoneTable(model: DashboardModel, styles: DynamicStyles): string {
  const rows = model.milestones
    .map(
      (milestone) => `<tr>
    <td>${escapeHtml(milestone.label)}</td>
    <td class="num mono">${escapeHtml(milestone.valueText)}</td>
    <td class="num mono muted">${escapeHtml(milestone.nextText)}</td>
    <td class="barcell">${bar(styles, milestone.progress)}</td>
  </tr>`
    )
    .join("");
  return `<table class="tight"><tbody>${rows}</tbody></table>`;
}

/* --- Where --------------------------------------------------------------- */

function wherePane(model: DashboardModel, styles: DynamicStyles, active: boolean): string {
  const inner = `<div class="grid cols">
  ${card("Repositories and folders", repositoriesInner(model, styles), "c7")}
  ${card("Languages", shareTable(model.languages, styles), "c5")}
</div>`;
  return pane(
    "where",
    active,
    "Time follows the repository you were inside, then the language of the file in front of you. Only a repository folder name and a path relative to its root is ever stored.",
    inner
  );
}

function shareTable(slices: LabelledSlice[], styles: DynamicStyles): string {
  if (slices.length === 0) {
    return `<p class="muted small">Nothing yet.</p>`;
  }
  const rows = slices
    .map(
      (slice) => `<tr>
    <td>${escapeHtml(slice.label)}</td>
    <td class="num mono">${escapeHtml(slice.text)}</td>
    <td class="num mono muted">${Math.round(slice.share * 100)}%</td>
    <td class="barcell">${bar(styles, slice.share)}</td>
  </tr>`
    )
    .join("");
  return `<table class="tight"><tbody>${rows}</tbody></table>`;
}

function folderRow(row: FolderRow): string {
  const indent = "&nbsp;".repeat(row.depth * 3);
  const opened = row.own.length > 0;
  const own = opened ? `<span class="muted small">opened directly: ${escapeHtml(row.own)}</span>` : "";
  return `<div class="folder-row">
  <span>${indent}<span class="tree-line">&#9492;</span> <span class="folder-name${
    opened ? " opened" : ""
  }">${escapeHtml(row.name)}</span> ${own}</span>
  <span class="mono small">${escapeHtml(row.total)}</span>
</div>`;
}

function repoCard(repo: RepoRow, styles: DynamicStyles): string {
  const root =
    repo.rootTime.length > 0
      ? `<div class="folder-row"><span><span class="folder-name opened">repository root</span></span><span class="mono small">${escapeHtml(
          repo.rootTime
        )}</span></div>`
      : "";
  const folders = repo.folders.map(folderRow).join("");
  const nothingBelow =
    root.length === 0 && folders.length === 0
      ? `<p class="muted small">No folder detail recorded.</p>`
      : "";
  return `<div class="repo">
  <div class="repo-head">
    <span class="repo-name">${escapeHtml(repo.repo)}</span>
    <span class="mono">${escapeHtml(repo.total)}</span>
  </div>
  ${bar(styles, repo.share, "repo-bar")}
  ${root}${folders}${nothingBelow}
</div>`;
}

function repositoriesInner(model: DashboardModel, styles: DynamicStyles): string {
  if (model.repositories.length === 0) {
    return `<p class="muted small">No repository time recorded. Either project tracking is off, or the folders you have open are not inside a git repository.</p>`;
  }
  return `${model.repositories.map((repo) => repoCard(repo, styles)).join("")}
<p class="muted small note">Folders beneath a repository are the workspace folders you opened inside it.</p>`;
}

/* --- When ---------------------------------------------------------------- */

function whenPane(model: DashboardModel, styles: DynamicStyles, active: boolean): string {
  const inner = `<div class="grid cols">
  ${card("Hour of day", `${sparkline(model.punchBars, model.punchcard.peakHour, model.peakHourLabel, styles)}${whenFacts(model)}`, "c5")}
  ${card("Weekday by hour", `${matrix(model)}${legend(model.weekHoursLegend, "one hour of one weekday, not a whole day")}`, "c7")}
  ${card("Where the time came from", signalsInner(model, styles), "c5")}
  ${card("How text arrived", compositionInner(model.composition, model.typedPercent), "c7")}
</div>`;
  return pane(
    "when",
    active,
    "A minute counts only when this window was focused and something actually happened in it. This is when that happened, and what held the clock open. The weekday grid is built from the 24 hour buckets a day already keeps, so no timeline of your keystrokes exists anywhere.",
    inner
  );
}

function sparkline(
  bars: PunchBar[],
  peak: number | undefined,
  peakLabel: string,
  styles: DynamicStyles
): string {
  const columns = bars
    .map(
      (column) =>
        // The generated class comes last so it ends the attribute: the panel
        // test walks every generated rule and checks the class is really used.
        `<span class="${column.hour === peak ? "peak " : ""}${styles.percent(
          "height",
          column.share
        )}" title="${escapeHtml(column.label)}"></span>`
    )
    .join("");
  return `<div class="spark">${columns}</div>
<div class="axis"><span>00</span><span>${escapeHtml(peakLabel)}</span><span>23</span></div>`;
}

function whenFacts(model: DashboardModel): string {
  return `<table class="tight"><tbody>
  <tr><td>Busiest hour</td><td class="num mono">${escapeHtml(model.peakHourLabel)}</td></tr>
  <tr><td>Busiest weekday</td><td class="num mono">${escapeHtml(model.busiestWeekdayLabel)}</td></tr>
  <tr><td>Sessions</td><td class="num mono">${model.counts.sessions.toLocaleString()}</td></tr>
  <tr><td>Average day</td><td class="num mono">${escapeHtml(model.averageDay)}</td></tr>
</tbody></table>`;
}

function matrix(model: DashboardModel): string {
  const head = Array.from({ length: 24 }, (_, hour) =>
    hour % 3 === 0 ? `<span>${pad2(hour)}</span>` : "<span></span>"
  ).join("");
  const rows = model.weekHours.map(matrixRow).join("");
  return `<div class="matrix">
  <div class="matrix-head"><span></span>${head}</div>
  ${rows}
</div>`;
}

function matrixRow(row: WeekHourRow): string {
  const cells = row.cells
    .map(
      (cell) =>
        `<span class="heat-cell" data-level="${cell.level}"${
          cell.label.length > 0 ? ` title="${escapeHtml(cell.label)}"` : ""
        }></span>`
    )
    .join("");
  return `<div class="matrix-row">
  <span class="matrix-label" title="${escapeHtml(`${row.label}: ${row.total}`)}">${escapeHtml(
    row.label
  )}</span>${cells}
</div>`;
}

function pad2(hour: number): string {
  return hour < 10 ? `0${hour}` : String(hour);
}

function signalsInner(model: DashboardModel, styles: DynamicStyles): string {
  return `${shareTable(model.signals, styles)}
<p class="muted small note">Terminal time counts the same as editor time. If a row looks wrong, run <span class="mono">Almanac: Why am I idle right now?</span></p>`;
}

function compositionInner(composition: Composition, typed: number): string {
  const { typedChars, blockChars, blockCount } = composition;
  const average = blockCount === 0 ? 0 : Math.round(blockChars / blockCount);
  return `<table class="tight"><tbody>
  <tr><td>Typed</td><td class="num mono">${typed}%</td><td class="num mono muted">${typedChars.toLocaleString()} chars</td></tr>
  <tr><td>In blocks</td><td class="num mono">${100 - typed}%</td><td class="num mono muted">${blockChars.toLocaleString()} chars</td></tr>
  <tr><td>Blocks</td><td class="num mono">${blockCount.toLocaleString()}</td><td class="num mono muted">avg ${average} chars</td></tr>
</tbody></table>
<p class="muted small note">A block is a paste, a formatter, a refactor or a coding agent. Almanac does not guess which.</p>`;
}

/* --- one day ------------------------------------------------------------- */

/**
 * The clicked day, inline under the grid.
 *
 * Inline rather than a separate view so the grid stays on screen: comparing
 * Tuesday with the Tuesday before it is the reason someone clicks a square in
 * the first place, and a view that replaced the graph would make that two
 * navigations instead of one click.
 */
function dayDetailCard(day: DayDetail | undefined, styles: DynamicStyles): string {
  if (day === undefined) {
    return "";
  }
  const head = `<div class="day-head">
  <div>
    <strong>${escapeHtml(day.dateLabel)}</strong>
    <span class="muted small">${escapeHtml(day.relative)}</span>
  </div>
  <div class="day-head-right">
    <span class="mono">${escapeHtml(day.time)}</span>
    <button id="clear-day" title="Close this day">Close</button>
  </div>
</div>`;

  if (day.empty) {
    return `<div class="day-detail">${head}
  <p class="muted small">Nothing tracked on this day. Either you were not in the editor, or the window was open with nothing happening in it, which Almanac does not count.</p>
</div>`;
  }

  const hours = day.hoursText.length > 0 ? `<p class="muted small">Worked ${escapeHtml(day.hoursText)}</p>` : "";
  return `<div class="day-detail">${head}
  ${sparkline(day.hourBars, undefined, day.hoursText.length > 0 ? day.hoursText : "", styles)}
  ${hours}
  <div class="grid cols day-grid">
    ${card("Repositories", dayRepoTable(day), "c4")}
    ${card("Languages", shareTable(day.languages, styles), "c4")}
    ${card("Signals", shareTable(day.signals, styles), "c4")}
    ${card("Counted", dayCounts(day), "c4")}
    ${card("Text", compositionInner(day.composition, day.typedPercent), "c8")}
  </div>
</div>`;
}

function dayRepoTable(day: DayDetail): string {
  if (day.repositories.length === 0) {
    return `<p class="muted small">No repository recorded.</p>`;
  }
  const rows = day.repositories
    .map(
      (repo) => `<tr>
    <td>${escapeHtml(repo.repo)}</td>
    <td class="num mono">${escapeHtml(repo.total)}</td>
  </tr>${repo.folders
    .map(
      (folder) => `<tr>
    <td class="muted small">${"&nbsp;".repeat(folder.depth * 3)}${escapeHtml(folder.name)}</td>
    <td class="num mono muted">${escapeHtml(folder.total)}</td>
  </tr>`
    )
    .join("")}`
    )
    .join("");
  return `<table class="tight"><tbody>${rows}</tbody></table>`;
}

function dayCounts(day: DayDetail): string {
  const { edits, saves, files, sessions, commits } = day.counts;
  return `<table class="tight"><tbody>
  ${countRow("Edits", edits.toLocaleString(), "Saves", saves.toLocaleString())}
  ${countRow("Files", files.toLocaleString(), "Sessions", sessions.toLocaleString())}
  ${countRow("Commits", commits.toLocaleString(), "", "")}
</tbody></table>`;
}
