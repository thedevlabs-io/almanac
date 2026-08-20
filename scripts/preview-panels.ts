/**
 * Renders the real panel HTML to files you can open in a browser.
 *
 * The panels take their surfaces from VS Code's theme variables, which do not
 * exist outside the editor, so this injects one palette per theme purely for
 * the preview. It exists because a layout change is otherwise unreviewable
 * without launching an extension host, and it renders the shipping markup, not
 * a mockup of it.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { keyOf, shift, weekdayOf } from "../src/core/day";
import { buildDashboard } from "../src/core/dashboardModel";
import { applyTick } from "../src/core/record";
import { buildReport, filterOptions } from "../src/core/report";
import { emptyDay, type DayKey, type DayRecord } from "../src/core/types";
import { dashboardHtml, type DashboardTab } from "../src/ui/dashboardHtml";
import { reportHtml, type ReportTab } from "../src/ui/reportHtml";
import type { BrandFonts, BrandTheme } from "../src/ui/style";

const OUT = join(process.cwd(), "docs", "mockups", "preview");
const TODAY = keyOf(new Date());

/** A deterministic pseudo-random source, so two runs produce the same preview. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const LANGUAGES = ["typescript", "markdown", "json", "css", "shellscript", "python"];
const KINDS = ["editor", "terminal", "debug", "tabs", "task"] as const;
const REPOS: [string, string][] = [
  ["almanac", "src/core"],
  ["almanac", "src/ui"],
  ["almanac", "test"],
  ["devlabs-web", "app"],
  ["design-system", "."],
];

function fakeDays(): Record<DayKey, DayRecord> {
  const random = generator(20260820);
  const days: Record<DayKey, DayRecord> = {};
  for (let back = 400; back >= 0; back -= 1) {
    const date = shift(TODAY, -back);
    // weekdayOf, not `new Date(date).getDay()`: the latter parses the key as UTC
    // and lands on the wrong day west of Greenwich.
    const weekday = weekdayOf(date);
    const roll = random();
    const weekend = weekday >= 5;
    if ((weekend && roll < 0.6) || roll < 0.08) {
      continue;
    }
    let record = emptyDay(date);
    const bursts = 2 + Math.floor(random() * 7);
    for (let burst = 0; burst < bursts; burst += 1) {
      const hour = Math.min(23, Math.max(6, Math.round(9 + random() * 12)));
      const [repo, folder] = REPOS[Math.floor(random() * REPOS.length)] ?? ["almanac", "."];
      record = applyTick(record, {
        seconds: Math.round(600 + random() * 2400),
        hour,
        language: LANGUAGES[Math.floor(random() * LANGUAGES.length)],
        kind: KINDS[Math.floor(random() * KINDS.length)],
        project: { repo, folder },
      });
    }
    record.edits = Math.round(random() * 900);
    record.saves = Math.round(random() * 60);
    record.files = Math.round(random() * 25);
    record.sessions = 1 + Math.round(random() * 4);
    record.commits = Math.round(random() * 6);
    record.composition = {
      typedChars: Math.round(random() * 9000),
      blockChars: Math.round(random() * 6000),
      blockCount: Math.round(random() * 60),
    };
    days[date] = record;
  }
  return days;
}

/**
 * A stand-in for the editor's own variables. Values are read off VS Code's
 * default Dark Modern and Light Modern themes, and only exist in the preview.
 */
function shim(theme: BrandTheme): string {
  const dark = theme === "dark";
  return `<style>:root{
  --vscode-font-size: 13px;
  --vscode-editor-background: ${dark ? "#1f1f1f" : "#ffffff"};
  --vscode-editorWidget-background: ${dark ? "#252526" : "#f3f3f3"};
  --vscode-editorWidget-border: ${dark ? "#3a3a3c" : "#dcdcdc"};
  --vscode-panel-border: ${dark ? "#3a3a3c" : "#dcdcdc"};
  --vscode-foreground: ${dark ? "#cccccc" : "#313131"};
  --vscode-descriptionForeground: ${dark ? "#9d9d9d" : "#6a6a6a"};
  --vscode-focusBorder: #0078d4;
  --vscode-editorWarning-foreground: #cca700;
  --vscode-button-secondaryForeground: ${dark ? "#cccccc" : "#313131"};
  --vscode-button-secondaryBackground: ${dark ? "#313131" : "#e5e5e5"};
  --vscode-button-secondaryHoverBackground: ${dark ? "#3c3c3c" : "#dcdcdc"};
}
body{max-width:1120px;margin:0 auto}
</style>
<script>window.acquireVsCodeApi = () => ({ postMessage() {} });</script>`;
}

function fonts(): BrandFonts {
  const dir = relative(OUT, join(process.cwd(), "media", "fonts"));
  return {
    display: `${dir}/space-grotesk-variable.woff2`,
    mono400: `${dir}/ibm-plex-mono-400.woff2`,
    mono600: `${dir}/ibm-plex-mono-600.woff2`,
  };
}

/** The CSP would block the shim, and the preview is not the security boundary. */
function forPreview(html: string, theme: BrandTheme): string {
  return html
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "")
    .replace("</head>", `${shim(theme)}</head>`);
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const days = fakeDays();
  const written: string[] = [];

  const dashboards: [DashboardTab, BrandTheme, string | undefined][] = [
    ["activity", "dark", undefined],
    ["activity", "dark", TODAY],
    ["where", "dark", undefined],
    ["when", "dark", undefined],
    ["activity", "light", TODAY],
  ];
  for (const [tab, theme, selected] of dashboards) {
    const model = buildDashboard(days, { selected });
    const name = `dashboard-${tab}${selected ? "-day" : ""}-${theme}.html`;
    writeFileSync(
      join(OUT, name),
      forPreview(dashboardHtml(model, "", fonts(), theme, tab), theme),
      "utf8"
    );
    written.push(name);
  }

  const report = buildReport(days, {
    from: shift(TODAY, -29),
    to: TODAY,
    clients: { "devlabs-web": "Acme Corp", "design-system": "Acme Corp" },
    rounding: "15m",
  });
  const options = filterOptions(days, shift(TODAY, -29), TODAY);
  const filtered = buildReport(days, {
    from: shift(TODAY, -29),
    to: TODAY,
    clients: { "devlabs-web": "Acme Corp", "design-system": "Acme Corp" },
    rounding: "15m",
    include: ["almanac/src"],
  });
  const reports: [ReportTab, BrandTheme, boolean][] = [
    ["clients", "dark", false],
    ["days", "dark", false],
    ["clients", "dark", true],
    ["clients", "light", false],
  ];
  for (const [tab, theme, narrow] of reports) {
    const name = `report-${tab}${narrow ? "-filtered" : ""}-${theme}.html`;
    writeFileSync(
      join(OUT, name),
      forPreview(
        reportHtml(narrow ? filtered : report, "month", "", fonts(), theme, tab, options),
        theme
      ),
      "utf8"
    );
    written.push(name);
  }

  const index = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Almanac panel previews</title>${shim(
    "dark"
  )}</head><body style="font-family:sans-serif;padding:24px"><h1>Panel previews</h1><p>Real panel markup, with a stand-in for VS Code's theme variables.</p><ul>${written
    .map((name) => `<li><a href="${name}">${name}</a></li>`)
    .join("")}</ul></body></html>`;
  writeFileSync(join(OUT, "index.html"), index, "utf8");

  console.error(`wrote ${written.length + 1} previews to docs/mockups/preview`);
}

main();
