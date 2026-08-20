import { durationPadded, hoursDecimal } from "../core/format";
import type { ClientTotal, FilterOption, Report } from "../core/report";
import { card, pane, statStrip, tabNav, tabScript, type TabDef } from "./shell";
import { sharedStyles, type BrandFonts, type BrandTheme } from "./style";
import { contentSecurityPolicy, DynamicStyles, escapeHtml, nonce } from "./webview";

const RANGES = [
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "quarter", label: "Last 90 days" },
  { id: "year", label: "Last 12 months" },
];

export const REPORT_TABS: TabDef[] = [
  { id: "clients", label: "By client" },
  { id: "days", label: "Day by day" },
];

export type ReportTab = "clients" | "days";

export function isReportTab(value: string | undefined): value is ReportTab {
  return REPORT_TABS.some((tab) => tab.id === value);
}

export function reportHtml(
  report: Report,
  range: string,
  cspSource: string,
  fonts: BrandFonts,
  theme: BrandTheme,
  tab: ReportTab = "clients",
  options: readonly FilterOption[] = []
): string {
  const id = nonce();
  const styles = new DynamicStyles();
  const content =
    report.rows.length === 0
      ? `${filterCard(options, report.include)}${empty(report.include.length > 0)}`
      : body(report, styles, tab, options);

  const ranges = RANGES.map(
    (entry) =>
      `<button data-range="${entry.id}" aria-pressed="${entry.id === range}">${entry.label}</button>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(cspSource, id)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Almanac report</title>
<style nonce="${id}">${sharedStyles(fonts, theme)}${styles.css}</style>
</head>
<body>
<header>
  <div>
    <h1>Report</h1>
    <p class="muted small mono">${escapeHtml(report.from)} to ${escapeHtml(report.to)}</p>
  </div>
  <div class="tabs">${ranges}<button id="export">Export CSV</button></div>
</header>
${content}
<script nonce="${id}">
  const vscode = acquireVsCodeApi();
  for (const button of document.querySelectorAll("[data-range]")) {
    button.addEventListener("click", () => {
      vscode.postMessage({ type: "range", range: button.dataset.range });
    });
  }
  document.getElementById("export")?.addEventListener("click", () => {
    vscode.postMessage({ type: "export" });
  });
  const filters = document.querySelectorAll("[data-filter]");
  for (const box of filters) {
    box.addEventListener("change", () => {
      const keys = [];
      for (const other of filters) {
        if (other.checked) {
          keys.push(other.dataset.filter);
        }
      }
      vscode.postMessage({ type: "filter", keys });
    });
  }
  document.getElementById("clear-filter")?.addEventListener("click", () => {
    vscode.postMessage({ type: "filter", keys: [] });
  });
  ${tabScript()}
</script>
</body>
</html>`;
}

function empty(filtered: boolean): string {
  if (filtered) {
    return `<div class="card empty">
  <p><strong>Nothing in this range matches the filter.</strong></p>
  <p class="small">Clear it, or widen the range. The filter's own options are built from everything in range, so nothing you can select disappears as you select it.</p>
</div>`;
  }
  return `<div class="card empty">
  <p><strong>No repository time in this range.</strong></p>
  <p class="small">Reports are built from repository time, so they need <span class="mono">almanac.trackProjects</span> turned on and at least one tracked day.</p>
</div>`;
}

function body(
  report: Report,
  styles: DynamicStyles,
  tab: ReportTab,
  options: readonly FilterOption[]
): string {
  return `${strip(report)}
${filterCard(options, report.include)}
${tabNav(REPORT_TABS, tab, "Range, filter and rounding apply to both tabs and to the export")}
${clientsPane(report, styles, tab === "clients")}
${daysPane(report, tab === "days")}`;
}

/**
 * The repository and folder filter.
 *
 * It sits above the tabs, not inside one, because it narrows both tables and
 * the CSV alike. Selecting a folder includes everything beneath it: picking
 * `src` and being told only about the minutes that folder itself happened to be
 * open would be a filter that lies.
 */
function filterCard(options: readonly FilterOption[], include: readonly string[]): string {
  if (options.length === 0) {
    return "";
  }
  const selected = new Set(include);
  const rows = options
    .map((option) => {
      const checked = selected.has(option.key) ? " checked" : "";
      return `<label class="filter-row depth-${Math.min(option.depth, 3)}">
    <input type="checkbox" data-filter="${escapeHtml(option.key)}"${checked}>
    <span class="${option.depth === 0 ? "filter-repo" : "muted"}">${escapeHtml(option.label)}</span>
    <span class="mono small muted">${durationPadded(option.seconds)}</span>
  </label>`;
    })
    .join("");
  const summary =
    include.length === 0
      ? "Everything in range"
      : `${include.length} selected of ${options.length}`;
  return `<div class="card filter">
  <h2>Repositories and folders</h2>
  <div class="filter-head">
    <span class="muted small">${escapeHtml(summary)}</span>
    <button id="clear-filter"${include.length === 0 ? " disabled" : ""}>Show everything</button>
  </div>
  <div class="filter-box">${rows}</div>
</div>`;
}

function strip(report: Report): string {
  const days = new Set(report.rows.map((row) => row.date)).size;
  return statStrip([
    { value: durationPadded(report.billableSeconds), label: "billable", live: true },
    { value: durationPadded(report.seconds), label: "tracked" },
    { value: hoursDecimal(report.billableSeconds), label: "billable hours" },
    { value: `${days}`, label: "working days" },
    { value: `${report.clients.length}`, label: "clients" },
    {
      value: report.rounding === "none" ? "exact" : report.rounding,
      label: report.rounding === "none" ? "no rounding" : "rounded up per day",
    },
  ]);
}

function clientsPane(report: Report, styles: DynamicStyles, active: boolean): string {
  const inner = card("Split", `${stack(report, styles)}${clientTable(report)}`, "c12");
  return pane(
    "clients",
    active,
    report.rounding === "none"
      ? "Repository time mapped to clients. An unmapped repository bills under its own name rather than disappearing."
      : `Repository time mapped to clients, rounded up to ${report.rounding} per client per day. An unmapped repository bills under its own name rather than disappearing.`,
    `<div class="grid cols">${inner}</div>`
  );
}

/**
 * One bar, one segment per client. It answers "who did this month belong to"
 * before a single row of the table has been read.
 */
function stack(report: Report, styles: DynamicStyles): string {
  if (report.billableSeconds <= 0) {
    return "";
  }
  const segments = report.clients
    .map((client, index) => {
      const width = styles.percent("width", client.billableSeconds / report.billableSeconds);
      return `<span class="seg-${segmentIndex(index)} ${width}" title="${escapeHtml(
        `${client.client}: ${durationPadded(client.billableSeconds)}`
      )}"></span>`;
    })
    .join("");
  return `<div class="stack">${segments}</div>`;
}

/** Four segment shades, then everything else shares the last one. */
function segmentIndex(index: number): number {
  return Math.min(index, 3);
}

function clientRow(client: ClientTotal, index: number): string {
  return `<tr>
    <td><span class="swatch seg-${segmentIndex(index)}"></span>${escapeHtml(client.client)}</td>
    <td class="muted small">${escapeHtml(client.repos.join(", "))}</td>
    <td class="num mono">${client.days}</td>
    <td class="num mono">${durationPadded(client.seconds)}</td>
    <td class="num mono">${durationPadded(client.billableSeconds)}</td>
    <td class="num mono">${hoursDecimal(client.billableSeconds)}</td>
  </tr>`;
}

function clientTable(report: Report): string {
  const rows = report.clients.map(clientRow).join("");
  return `<table class="tight">
    <thead><tr>
      <th>Client</th><th>Repositories</th><th class="num">Days</th>
      <th class="num">Tracked</th><th class="num">Billable</th><th class="num">Hours</th>
    </tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr>
      <th>Total</th><th></th><th></th>
      <th class="num mono">${durationPadded(report.seconds)}</th>
      <th class="num mono">${durationPadded(report.billableSeconds)}</th>
      <th class="num mono">${hoursDecimal(report.billableSeconds)}</th>
    </tr></tfoot>
  </table>`;
}

function daysPane(report: Report, active: boolean): string {
  const rows = report.rows
    .map(
      (row) => `<tr>
    <td class="mono">${escapeHtml(row.date)}</td>
    <td>${escapeHtml(row.client)}</td>
    <td class="muted small">${escapeHtml(row.repos.join(", "))}</td>
    <td class="num mono">${durationPadded(row.seconds)}</td>
    <td class="num mono">${durationPadded(row.billableSeconds)}</td>
  </tr>`
    )
    .join("");
  const table = `<table class="tight">
    <thead><tr>
      <th>Date</th><th>Client</th><th>Repositories</th>
      <th class="num">Tracked</th><th class="num">Billable</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
  return pane(
    "days",
    active,
    "One row per client per day, which is the shape a client asking you to justify an invoice wants. The CSV export is this table.",
    `<div class="grid cols">${card("Every day", table, "c12")}</div>`
  );
}
