import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildDashboard } from "../src/core/dashboardModel";
import { applyTick } from "../src/core/record";
import { buildReport, filterOptions } from "../src/core/report";
import { emptyDay, type DayRecord } from "../src/core/types";
import { BRAND } from "../src/ui/brand";
import { dashboardHtml } from "../src/ui/dashboardHtml";
import { reportHtml } from "../src/ui/reportHtml";
import type { BrandFonts, BrandTheme } from "../src/ui/style";

const FONTS: BrandFonts = {
  display: "https://file+.vscode-resource/fonts/space-grotesk-variable.woff2",
  mono400: "https://file+.vscode-resource/fonts/ibm-plex-mono-400.woff2",
  mono600: "https://file+.vscode-resource/fonts/ibm-plex-mono-600.woff2",
};
const CSP_SOURCE = "https://file+.vscode-resource";

function days(): Record<string, DayRecord> {
  const day = [
    { seconds: 3600, hour: 9, language: "typescript", kind: "editor" as const, project: { repo: "acme", folder: "apps/web" } },
    { seconds: 1800, hour: 14, language: "markdown", kind: "terminal" as const, project: { repo: "acme", folder: "." } },
  ].reduce((record, tick) => applyTick(record, tick), emptyDay("2026-08-20"));
  return { "2026-08-20": day };
}

function dashboard(theme: BrandTheme = "dark"): string {
  return dashboardHtml(buildDashboard(days(), { today: "2026-08-20" }), CSP_SOURCE, FONTS, theme);
}

// The regression this file exists for. The panels' CSP has no 'unsafe-inline'
// in style-src, and a nonce covers <style> ELEMENTS only: inline style
// attributes fall under style-src-attr, which no nonce can satisfy. An inline
// style attribute therefore does not fail loudly, it silently renders every bar
// at zero width.
test("no panel emits an inline style attribute", () => {
  for (const [name, html] of [
    ["dashboard", dashboard()],
    ["dashboard (empty)", dashboardHtml(buildDashboard({}, { today: "2026-08-20" }), CSP_SOURCE, FONTS, "dark")],
    [
      "report",
      reportHtml(
        buildReport(days(), { from: "2026-08-20", to: "2026-08-20" }),
        "month",
        CSP_SOURCE,
        FONTS,
        "light"
      ),
    ],
  ] as const) {
    assert.equal(/\sstyle\s*=\s*["']/.test(html), false, `${name} has an inline style attribute`);
  }
});

test("data-driven dimensions reach the stylesheet, not the markup", () => {
  const html = dashboard();
  // Two languages, one repository, two composition bars, three milestones,
  // 24 punchcard columns: every one of them needs a generated class.
  const generated = html.match(/\.d\d+\{[^}]+\}/g) ?? [];
  assert.ok(generated.length > 24, `expected generated width classes, found ${generated.length}`);
  assert.ok(
    generated.some((rule) => /width:\d+\.\d+%/.test(rule)),
    "no width rule was generated"
  );
  assert.ok(
    generated.some((rule) => /height:\d+\.\d+%/.test(rule)),
    "no punchcard height rule was generated"
  );
  for (const rule of generated) {
    const name = rule.slice(1, rule.indexOf("{"));
    assert.ok(html.includes(`class="${name}"`) || html.includes(` ${name}"`), `${name} is unused`);
  }
});

test("the content security policy allows no network of any kind", () => {
  const html = dashboard();
  const policy = html.match(/content="([^"]*default-src[^"]*)"/)?.[1] ?? "";
  assert.ok(policy.includes("default-src 'none'"), "default-src is not locked down");
  assert.equal(policy.includes("connect-src"), false, "connect-src must stay absent");
  assert.equal(policy.includes("unsafe-inline"), false, "unsafe-inline must stay absent");
  assert.equal(policy.includes("unsafe-eval"), false);
  assert.ok(policy.includes(`font-src ${CSP_SOURCE}`), "bundled fonts would be blocked");
});

test("the brand fonts are declared and pointed at the bundled files", () => {
  const html = dashboard();
  assert.ok(html.includes("@font-face"), "no font faces declared");
  for (const uri of Object.values(FONTS)) {
    assert.ok(html.includes(uri), `${uri} is not referenced`);
  }
  assert.ok(html.includes("Space Grotesk Variable"));
  assert.ok(html.includes("IBM Plex Mono"));
});

test("the heat ramp and bars are built from the brand accent", () => {
  const html = dashboard();
  assert.ok(html.includes(BRAND.accent), "the brand accent is not in the stylesheet");
  assert.ok(html.includes("--heat-4: var(--brand-accent)"), "the hottest heat level is not the accent");
});

test("surfaces still come from the editor's theme, not the brand", () => {
  const html = dashboard();
  // The whole point of the hybrid: a panel has to belong inside whatever theme
  // is running, high contrast included.
  assert.ok(html.includes("background: var(--vscode-editor-background)"));
  assert.ok(html.includes("color: var(--vscode-foreground)"));
  // The brand ink is allowed as text on an accent fill; what must never happen
  // is the brand taking over the canvas or the body text.
  assert.equal(
    /body\s*\{[^}]*background:\s*#/.test(html),
    false,
    "a literal colour on the body canvas would override the editor theme"
  );
});

test("the light and dark accents come from VS Code's theme, not the OS", () => {
  const dark = dashboard("dark");
  const light = dashboard("light");

  assert.ok(dark.includes(`--brand-accent-text: ${BRAND.accent}`), "dark should use the plain accent");
  assert.ok(
    light.includes(`--brand-accent-text: ${BRAND.accentStrong}`),
    "light should darken the accent to hold AA"
  );
  assert.ok(dark.includes('data-theme="dark"'));
  assert.ok(light.includes('data-theme="light"'));
  assert.equal(
    dark.includes("prefers-color-scheme"),
    false,
    "the OS colour scheme must never decide a panel's theme"
  );
});

test("a repository named like markup renders as text", () => {
  const hostile = { "2026-08-20": applyTick(emptyDay("2026-08-20"), {
    seconds: 60,
    hour: 9,
    project: { repo: '<img src=x onerror="alert(1)">', folder: "." },
  }) };
  const html = dashboardHtml(buildDashboard(hostile, { today: "2026-08-20" }), CSP_SOURCE, FONTS, "dark");
  assert.equal(html.includes("<img src=x"), false, "a repository name was injected as markup");
  assert.ok(html.includes("&lt;img src=x"));
});

/* --- the tabbed shell ---------------------------------------------------- */

function paneIds(html: string): string[] {
  return [...html.matchAll(/data-pane="([a-z]+)"/g)].map((match) => match[1] ?? "");
}

function activePanes(html: string): string[] {
  return [...html.matchAll(/class="pane on" data-pane="([a-z]+)"/g)].map((match) => match[1] ?? "");
}

test("the dashboard renders every tab's pane, with exactly one open", () => {
  const html = dashboard();
  assert.deepEqual(paneIds(html), ["activity", "where", "when"]);
  assert.deepEqual(activePanes(html), ["activity"]);
});

// When and How answered one question between them, so they are one tab.
test("when and how share a tab, and it holds all four of their cards", () => {
  const html = dashboardHtml(
    buildDashboard(days(), { today: "2026-08-20" }),
    CSP_SOURCE,
    FONTS,
    "dark",
    "when"
  );
  for (const heading of ["Hour of day", "Weekday by hour", "Where the time came from", "How text arrived"]) {
    assert.ok(html.includes(heading), `${heading} is missing from the merged tab`);
  }
});

test("the panel decides which tab is open, so a re-render cannot lose it", () => {
  const model = buildDashboard(days(), { today: "2026-08-20" });
  const html = dashboardHtml(model, CSP_SOURCE, FONTS, "dark", "when");
  assert.deepEqual(activePanes(html), ["when"]);
  assert.ok(
    /data-tab="when" aria-pressed="true"/.test(html),
    "the open tab's button should read as pressed"
  );
  assert.ok(/data-tab="activity" aria-pressed="false"/.test(html));
});

test("the report renders both its tabs and defaults to the client split", () => {
  const html = reportHtml(
    buildReport(days(), { from: "2026-08-20", to: "2026-08-20" }),
    "month",
    CSP_SOURCE,
    FONTS,
    "dark"
  );
  assert.deepEqual(paneIds(html), ["clients", "days"]);
  assert.deepEqual(activePanes(html), ["clients"]);
});

test("the report can open on the day table", () => {
  const html = reportHtml(
    buildReport(days(), { from: "2026-08-20", to: "2026-08-20" }),
    "month",
    CSP_SOURCE,
    FONTS,
    "dark",
    "days"
  );
  assert.deepEqual(activePanes(html), ["days"]);
});

// The strip is what earns the tabs the right to hide anything: whichever tab is
// open, the figures a person opened the panel for are still on screen.
test("the headline figures sit outside the panes, so no tab can hide them", () => {
  const html = dashboard();
  const strip = html.match(/<div class="strip">[\s\S]*?<\/div>\s*<nav/)?.[0] ?? "";
  assert.ok(strip.length > 0, "no strip was rendered");
  assert.equal(strip.includes("data-pane"), false, "the strip must not live inside a pane");
  for (const label of ["today", "average day", "active days", "commits"]) {
    assert.ok(strip.includes(label), `the strip is missing ${label}`);
  }
  assert.ok(html.indexOf('class="strip"') < html.indexOf("data-pane"), "the strip should come first");
});

test("the report strip states the rounding rather than burying it in a caption", () => {
  const rounded = reportHtml(
    buildReport(days(), { from: "2026-08-20", to: "2026-08-20", rounding: "15m" }),
    "month",
    CSP_SOURCE,
    FONTS,
    "dark"
  );
  assert.ok(rounded.includes("rounded up per day"));
  assert.ok(rounded.includes(">15m<"));
  const exact = reportHtml(
    buildReport(days(), { from: "2026-08-20", to: "2026-08-20" }),
    "month",
    CSP_SOURCE,
    FONTS,
    "dark"
  );
  assert.ok(exact.includes("no rounding"));
});

test("the weekday grid renders seven labelled rows of 24 cells", () => {
  const html = dashboard();
  const rows = [...html.matchAll(/<div class="matrix-row">([\s\S]*?)<\/div>/g)];
  assert.equal(rows.length, 7);
  for (const row of rows) {
    const cells = (row[1] ?? "").match(/<span class="heat-cell"/g) ?? [];
    assert.equal(cells.length, 24, "each weekday needs all 24 hours");
  }
  assert.ok(html.includes('class="matrix-label"'));
});

test("lifetime figures are not windowed, so a month view still shows the whole history", () => {
  const record = days();
  const older = applyTick(emptyDay("2025-01-06"), { seconds: 7200, hour: 10 });
  const html = dashboardHtml(
    buildDashboard({ ...record, "2025-01-06": older }, { today: "2026-08-20" }),
    CSP_SOURCE,
    FONTS,
    "dark"
  );
  assert.ok(html.includes("6 Jan 2025"), "the first tracked day should survive the rolling year");
  // 1h 30m in the window plus 2h from before it started.
  assert.ok(html.includes("3h 30m"), "lifetime total should count days outside the window");
});

test("the filter lists every repository and folder, with the selected ones checked", () => {
  const record = days();
  const options = filterOptions(record, "2026-08-20", "2026-08-20");
  const html = reportHtml(
    buildReport(record, { from: "2026-08-20", to: "2026-08-20", include: ["acme/apps/web"] }),
    "month",
    CSP_SOURCE,
    FONTS,
    "dark",
    "clients",
    options
  );
  for (const option of options) {
    assert.ok(
      html.includes(`data-filter="${option.key}"`),
      `${option.key} is missing from the filter`
    );
  }
  assert.ok(/data-filter="acme\/apps\/web" checked/.test(html), "the selected folder is not checked");
  assert.equal(/data-filter="acme" checked/.test(html), false, "an unselected row is checked");
  assert.ok(html.includes("Show everything"), "there is no way to clear the filter");
});

// The filter narrows both tables and the export, so it cannot live inside a tab.
test("the filter sits outside the panes", () => {
  const record = days();
  const html = reportHtml(
    buildReport(record, { from: "2026-08-20", to: "2026-08-20" }),
    "month",
    CSP_SOURCE,
    FONTS,
    "dark",
    "clients",
    filterOptions(record, "2026-08-20", "2026-08-20")
  );
  assert.ok(html.indexOf('class="card filter"') < html.indexOf("data-pane"));
});

test("a filter with no matches says so rather than looking like lost data", () => {
  const record = days();
  const html = reportHtml(
    buildReport(record, { from: "2026-08-20", to: "2026-08-20", include: ["nothing-here"] }),
    "month",
    CSP_SOURCE,
    FONTS,
    "dark",
    "clients",
    filterOptions(record, "2026-08-20", "2026-08-20")
  );
  assert.ok(html.includes("Nothing in this range matches the filter"));
  assert.ok(html.includes('data-filter="acme"'), "the filter must stay on screen to be undone");
});

test("no inline style attribute survives the filter or a day detail either", () => {
  const record = days();
  const withFilter = reportHtml(
    buildReport(record, { from: "2026-08-20", to: "2026-08-20", include: ["acme"] }),
    "month",
    CSP_SOURCE,
    FONTS,
    "dark",
    "days",
    filterOptions(record, "2026-08-20", "2026-08-20")
  );
  const withDay = dashboardHtml(
    buildDashboard(record, { today: "2026-08-20", selected: "2026-08-20" }),
    CSP_SOURCE,
    FONTS,
    "dark"
  );
  for (const [name, html] of [["report+filter", withFilter], ["dashboard+day", withDay]] as const) {
    assert.equal(/\sstyle\s*=\s*["']/.test(html), false, `${name} has an inline style attribute`);
  }
});
