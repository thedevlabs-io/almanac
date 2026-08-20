import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildDashboard } from "../src/core/dashboardModel";
import { applyTick } from "../src/core/record";
import { buildReport } from "../src/core/report";
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
