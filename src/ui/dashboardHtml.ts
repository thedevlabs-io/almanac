import type { DashboardModel, FolderRow, LabelledSlice, RepoRow } from "../core/dashboardModel";
import { sharedStyles, type BrandFonts, type BrandTheme } from "./style";
import { contentSecurityPolicy, DynamicStyles, escapeHtml, nonce } from "./webview";

const WINDOWS: { id: string; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "quarter", label: "Quarter" },
  { id: "year", label: "Year" },
];

export function dashboardHtml(
  model: DashboardModel,
  cspSource: string,
  fonts: BrandFonts,
  theme: BrandTheme
): string {
  const id = nonce();
  const styles = new DynamicStyles();
  // The body is rendered first so the generated classes exist by the time the
  // stylesheet is written. The CSP forbids inline style attributes, so this
  // ordering is load-bearing rather than a preference.
  const content = model.empty ? emptyState() : body(model, styles);

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
  for (const button of document.querySelectorAll("[data-window]")) {
    button.addEventListener("click", () => {
      vscode.postMessage({ type: "window", window: button.dataset.window });
    });
  }
  const report = document.getElementById("open-report");
  if (report) {
    report.addEventListener("click", () => vscode.postMessage({ type: "report" }));
  }
</script>
</body>
</html>`;
}

function header(model: DashboardModel): string {
  const tabs = WINDOWS.map(
    (window) =>
      `<button data-window="${window.id}" aria-pressed="${
        window.id === model.window
      }">${window.label}</button>`
  ).join("");
  return `<header>
  <div>
    <h1>Almanac</h1>
    <p class="muted small">${escapeHtml(model.from)} to ${escapeHtml(model.to)}</p>
  </div>
  <div class="tabs">${tabs}<button id="open-report">Report</button></div>
</header>`;
}

function emptyState(): string {
  return `<div class="card empty">
  <p><strong>Nothing tracked yet.</strong></p>
  <p class="small">Almanac starts counting as soon as you do something in this window: type, scroll, run a command in the terminal, step through a debugger. Come back in a few minutes.</p>
</div>`;
}

function body(model: DashboardModel, styles: DynamicStyles): string {
  return `
${stats(model)}
${heatmapCard(model)}
<div class="grid halves">
  ${card("Languages", barRows(model.languages, styles))}
  ${signalsCard(model, styles)}
</div>
${repositoriesCard(model, styles)}
<div class="grid halves">
  ${punchcardCard(model, styles)}
  ${compositionCard(model, styles)}
</div>
${milestonesCard(model, styles)}`;
}

function card(title: string, inner: string): string {
  return `<div class="card"><h2>${escapeHtml(title)}</h2>${inner}</div>`;
}

function stat(value: string, label: string, extra = ""): string {
  return `<div class="card stat">
  <div class="value">${escapeHtml(value)}</div>
  <div class="label">${escapeHtml(label)}</div>
  ${extra}
</div>`;
}

function stats(model: DashboardModel): string {
  const risk = model.streakAtRisk
    ? `<div class="small warn">${escapeHtml(model.streakNeeds)} more today to keep it</div>`
    : "";
  return `<div class="grid stats">
  ${stat(model.todayTime, "Today")}
  ${stat(model.windowTime, `This ${model.window}`)}
  ${stat(`${model.streak.current}`, "Day streak", risk)}
  ${stat(model.averageDay, "Average active day")}
  ${stat(`${model.activeDays}`, "Days active")}
  ${stat(`${model.counts.commits}`, "Commits")}
</div>`;
}

function heatmapCard(model: DashboardModel): string {
  const months = model.weeks
    .map((_, index) => {
      const label = model.monthLabels.find((entry) => entry.index === index);
      return `<span>${label ? escapeHtml(label.label) : ""}</span>`;
    })
    .join("");
  const weeks = model.weeks
    .map(
      (week) =>
        `<div class="heat-week">${week.cells
          .map(
            (cell) =>
              `<div class="heat-cell" data-level="${cell.level}" title="${escapeHtml(
                cell.label
              )}"></div>`
          )
          .join("")}</div>`
    )
    .join("");
  const legend = [0, 1, 2, 3, 4]
    .map((level) => `<div class="heat-cell" data-level="${level}"></div>`)
    .join("");
  return `<div class="card">
  <h2>Activity</h2>
  <div class="heat-months">${months}</div>
  <div class="heatmap">${weeks}</div>
  <div class="legend">Less ${legend} More</div>
</div>`;
}

function bar(styles: DynamicStyles, share: number, extraClass = ""): string {
  const width = styles.percent("width", share);
  const outer = extraClass.length > 0 ? `bar ${extraClass}` : "bar";
  return `<span class="${outer}"><span class="${width}"></span></span>`;
}

function barRows(slices: LabelledSlice[], styles: DynamicStyles): string {
  if (slices.length === 0) {
    return `<p class="muted small">Nothing yet.</p>`;
  }
  return `<div class="bars">${slices
    .map(
      (slice) => `<div class="bar-row">
    <span>${escapeHtml(slice.label)}</span>
    ${bar(styles, slice.share)}
    <span class="mono small">${escapeHtml(slice.text)}</span>
  </div>`
    )
    .join("")}</div>`;
}

function signalsCard(model: DashboardModel, styles: DynamicStyles): string {
  return `<div class="card">
  <h2>Where the time came from</h2>
  ${barRows(model.signals, styles)}
  <p class="muted small note">Terminal time is counted the same as editor time. If a row here looks wrong, run <span class="mono">Almanac: Why am I idle right now?</span></p>
</div>`;
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

function repositoriesCard(model: DashboardModel, styles: DynamicStyles): string {
  if (model.repositories.length === 0) {
    return `<div class="card">
  <h2>Repositories</h2>
  <p class="muted small">No repository time recorded. Either project tracking is off, or the folders you have open are not inside a git repository.</p>
</div>`;
  }
  return `<div class="card">
  <h2>Repositories</h2>
  <p class="muted small lead">Time rolls up to the repository. Folders beneath it are the workspace folders you opened inside that repository.</p>
  ${model.repositories.map((repo) => repoCard(repo, styles)).join("")}
</div>`;
}

function punchcardCard(model: DashboardModel, styles: DynamicStyles): string {
  const { hours, busiest } = model.punchcard;
  const bars = hours
    .map((seconds, hour) => {
      const share = busiest === 0 ? 0 : seconds / busiest;
      return `<div class="${styles.percent("height", share)}" title="${hour}:00, ${seconds} seconds"></div>`;
    })
    .join("");
  const labels = hours.map((_, hour) => `<span>${hour % 6 === 0 ? hour : ""}</span>`).join("");
  return `<div class="card">
  <h2>When you work</h2>
  <div class="punchcard">${bars}</div>
  <div class="punch-labels">${labels}</div>
  <p class="muted small note">Busiest hour: ${escapeHtml(model.peakHourLabel)}</p>
</div>`;
}

function compositionCard(model: DashboardModel, styles: DynamicStyles): string {
  const { typedChars, blockChars, blockCount } = model.composition;
  const average = blockCount === 0 ? 0 : Math.round(blockChars / blockCount);
  const typed = model.typedPercent;
  return `<div class="card">
  <h2>How text arrived</h2>
  <div class="bars">
    <div class="bar-row">
      <span>Typed</span>
      ${bar(styles, typed / 100)}
      <span class="mono small">${typed}%</span>
    </div>
    <div class="bar-row">
      <span>In blocks</span>
      ${bar(styles, (100 - typed) / 100)}
      <span class="mono small">${100 - typed}%</span>
    </div>
  </div>
  <p class="muted small note">${typedChars.toLocaleString()} characters typed, ${blockChars.toLocaleString()} arrived in ${blockCount.toLocaleString()} blocks averaging ${average} characters. A block is a paste, a formatter, a refactor or a coding agent. Almanac does not guess which.</p>
</div>`;
}

function milestonesCard(model: DashboardModel, styles: DynamicStyles): string {
  const rows = model.milestones
    .map(
      (milestone) => `<div class="bar-row">
    <span>${escapeHtml(milestone.label)}</span>
    ${bar(styles, milestone.progress)}
    <span class="mono small">${escapeHtml(milestone.valueText)} / ${escapeHtml(
      milestone.nextText
    )}</span>
  </div>`
    )
    .join("");
  return `<div class="card"><h2>Milestones</h2><div class="bars">${rows}</div></div>`;
}
