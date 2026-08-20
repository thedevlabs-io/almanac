import { durationPadded, hoursDecimal } from "../core/format";
import type { Report } from "../core/report";
import { sharedStyles, type BrandFonts, type BrandTheme } from "./style";
import { contentSecurityPolicy, escapeHtml, nonce } from "./webview";

const RANGES = [
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "quarter", label: "Last 90 days" },
  { id: "year", label: "Last 12 months" },
];

export function reportHtml(
  report: Report,
  range: string,
  cspSource: string,
  fonts: BrandFonts,
  theme: BrandTheme
): string {
  const id = nonce();
  const tabs = RANGES.map(
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
<style nonce="${id}">${sharedStyles(fonts, theme)}</style>
</head>
<body>
<header>
  <div>
    <h1>Report</h1>
    <p class="muted small">${escapeHtml(report.from)} to ${escapeHtml(report.to)}${
      report.rounding === "none" ? "" : ` &middot; rounded up to ${escapeHtml(report.rounding)} per client per day`
    }</p>
  </div>
  <div class="tabs">${tabs}<button id="export">Export CSV</button></div>
</header>
${report.rows.length === 0 ? empty() : `${clientTable(report)}${dayTable(report)}`}
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
</script>
</body>
</html>`;
}

function empty(): string {
  return `<div class="card empty">
  <p><strong>No repository time in this range.</strong></p>
  <p class="small">Reports are built from repository time, so they need <span class="mono">almanac.trackProjects</span> turned on and at least one tracked day.</p>
</div>`;
}

function clientTable(report: Report): string {
  const rows = report.clients
    .map(
      (client) => `<tr>
    <td>${escapeHtml(client.client)}</td>
    <td class="muted small">${escapeHtml(client.repos.join(", "))}</td>
    <td class="num">${client.days}</td>
    <td class="num mono">${durationPadded(client.seconds)}</td>
    <td class="num mono">${durationPadded(client.billableSeconds)}</td>
    <td class="num mono">${hoursDecimal(client.billableSeconds)}</td>
  </tr>`
    )
    .join("");
  return `<div class="card">
  <h2>By client</h2>
  <table>
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
  </table>
</div>`;
}

function dayTable(report: Report): string {
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
  return `<div class="card">
  <h2>By day</h2>
  <table>
    <thead><tr>
      <th>Date</th><th>Client</th><th>Repositories</th>
      <th class="num">Tracked</th><th class="num">Billable</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}
