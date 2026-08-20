import { BRAND } from "./brand";

/**
 * Which half of the design system's semantic layer applies.
 *
 * Taken from VS Code's active colour theme, never from the OS. `tokens.css`
 * falls back to `prefers-color-scheme` when nothing says otherwise, and that is
 * wrong inside an editor: someone running a dark VS Code on a light OS would
 * get a panel that disagrees with every other panel around it.
 */
export type BrandTheme = "dark" | "light";

/** Webview URIs for the bundled brand fonts, resolved by the panel that owns them. */
export interface BrandFonts {
  display: string;
  mono400: string;
  mono600: string;
}

/**
 * The shared stylesheet for Almanac's panels.
 *
 * Surfaces stay on VS Code's theme variables so a panel still belongs inside
 * whatever theme is running, high contrast included. What the design system
 * supplies is everything carrying identity: flask orange for the heat ramp,
 * bars and streak, Space Grotesk and IBM Plex Mono, and the token radius and
 * spacing scale. Both halves matter. A panel that ignores the editor's theme
 * looks broken, and one that ignores the brand looks like nobody made it.
 */
export function sharedStyles(fonts: BrandFonts, theme: BrandTheme): string {
  return `
@font-face {
  font-family: 'Space Grotesk Variable';
  src: url('${fonts.display}') format('woff2-variations');
  font-weight: 300 700;
  font-display: swap;
}
@font-face {
  font-family: 'IBM Plex Mono';
  src: url('${fonts.mono400}') format('woff2');
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: 'IBM Plex Mono';
  src: url('${fonts.mono600}') format('woff2');
  font-weight: 600;
  font-display: swap;
}

:root {
  --gap: ${BRAND.space.md};
  --gap-sm: ${BRAND.space.sm};
  --radius: ${BRAND.radius.md};
  --radius-sm: ${BRAND.radius.sm};
  --radius-full: ${BRAND.radius.full};

  --brand-accent: ${BRAND.accent};
  /* Accent as *text* needs the darker orange on a light surface to hold AA.
     Selected from VS Code's theme, which is why this is not a media query. */
  --brand-accent-text: ${theme === "light" ? BRAND.accentStrong : BRAND.accent};
  --brand-on-accent: ${BRAND.ink};
  --brand-grey: ${BRAND.grey};
  --font-display: ${BRAND.fontDisplay};
  --font-mono: ${BRAND.fontMono};

  --cell: 13px;
  --cell-gap: 3px;

  --heat-0: color-mix(in srgb, var(--vscode-foreground) 11%, transparent);
  --heat-1: color-mix(in srgb, var(--brand-accent) 22%, transparent);
  --heat-2: color-mix(in srgb, var(--brand-accent) 44%, transparent);
  --heat-3: color-mix(in srgb, var(--brand-accent) 68%, transparent);
  --heat-4: var(--brand-accent);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: var(--gap);
  font-family: var(--font-display);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
}

h1, h2 {
  font-family: var(--font-display);
  font-weight: ${BRAND.displayWeight};
  letter-spacing: ${BRAND.displayTracking};
}
h1 { font-size: 1.5em; margin: 0 0 4px; }
h2 { font-size: 1em; margin: 0 0 12px; }
p { margin: 0 0 ${BRAND.space.xs}; }

.muted { color: var(--vscode-descriptionForeground); }
.small { font-size: 0.85em; }
.mono {
  font-family: var(--font-mono);
  letter-spacing: ${BRAND.monoTracking};
  font-variant-numeric: tabular-nums;
}

header {
  margin-bottom: var(--gap);
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap);
  align-items: flex-end;
  justify-content: space-between;
}

.card {
  background: var(--vscode-editorWidget-background);
  border: 1px solid var(--vscode-editorWidget-border, transparent);
  border-radius: var(--radius);
  padding: var(--gap);
  margin-bottom: var(--gap);
}

.grid { display: grid; gap: var(--gap); }
.grid.stats { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.grid.halves { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }

.stat .value {
  font-family: var(--font-mono);
  letter-spacing: ${BRAND.monoTracking};
  font-size: 1.55em;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.stat .label {
  font-size: 0.8em;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: ${BRAND.monoTracking};
  font-family: var(--font-mono);
}

button {
  font-family: var(--font-mono);
  letter-spacing: ${BRAND.monoTracking};
  font-size: 0.85em;
  color: var(--vscode-button-secondaryForeground);
  background: var(--vscode-button-secondaryBackground);
  border: none;
  border-radius: var(--radius-sm);
  padding: 5px 11px;
  cursor: pointer;
}
button:hover { background: var(--vscode-button-secondaryHoverBackground); }
/* The selected tab is the one place a brand fill belongs on a control: it is
   the panel's own state, not the editor's. */
button[aria-pressed="true"] {
  color: var(--brand-on-accent);
  background: var(--brand-accent);
}
button:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }

.tabs { display: flex; gap: 6px; flex-wrap: wrap; }

.heat-layout { display: flex; gap: 6px; align-items: flex-start; }

/* The gutter sits outside the scroll area so weekday names stay put while a
   year of columns scrolls under them. */
.heat-gutter {
  display: grid;
  grid-template-rows: repeat(7, var(--cell));
  gap: var(--cell-gap);
  padding-top: calc(1.3em + 4px);
  font-family: var(--font-mono);
  font-size: 0.68em;
  color: var(--vscode-descriptionForeground);
}
.heat-gutter span { line-height: var(--cell); text-align: right; min-width: 1.8em; }

.heat-scroll { overflow-x: auto; padding-bottom: 4px; min-width: 0; }
.heatmap { display: flex; gap: var(--cell-gap); }
.heat-week { display: grid; grid-template-rows: repeat(7, var(--cell)); gap: var(--cell-gap); }
.heat-cell {
  width: var(--cell);
  height: var(--cell);
  border-radius: 2px;
  background: var(--heat-0);
}
.heat-cell[data-level="1"] { background: var(--heat-1); }
.heat-cell[data-level="2"] { background: var(--heat-2); }
.heat-cell[data-level="3"] { background: var(--heat-3); }
.heat-cell[data-level="4"] { background: var(--heat-4); }
/* Padding for the days after today in the final column: present so the rows
   stay aligned with the gutter, drawn as nothing. */
.heat-cell.filler { background: transparent; }

/* A grid rather than a row of fixed-width spans. Each label is given the
   columns up to the next month, so "Jul" and "Aug" can no longer print on top
   of each other and read as "JulAug". */
.heat-months {
  display: grid;
  gap: var(--cell-gap);
  margin-bottom: 4px;
  height: 1.3em;
  font-family: var(--font-mono);
  font-size: 0.7em;
  color: var(--vscode-descriptionForeground);
}
.heat-months span { white-space: nowrap; }

.legend {
  display: flex;
  align-items: center;
  gap: ${BRAND.space.sm};
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: ${BRAND.space.sm};
  font-family: var(--font-mono);
  font-size: 0.72em;
  color: var(--vscode-descriptionForeground);
}
.legend-stop { display: inline-flex; align-items: center; gap: 5px; }

.day-rows { display: grid; gap: 6px; }
.day-row {
  display: grid;
  grid-template-columns: 5.5em 1fr auto 8.5em;
  gap: 10px;
  align-items: center;
  padding: 3px 0;
}
.day-row.today .day-name { color: var(--brand-accent-text); }
.day-name { font-size: 0.85em; }
.day-time { min-width: 4em; text-align: right; }
.day-hours { text-align: right; font-size: 0.72em; }

@media (max-width: 560px) {
  .day-row { grid-template-columns: 5.5em 1fr auto; }
  .day-hours { display: none; }
}

.bars { display: grid; gap: ${BRAND.space.xs}; }
.bar-row { display: grid; grid-template-columns: minmax(90px, 1fr) 2fr auto; gap: 10px; align-items: center; }
.bar {
  height: 8px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
  overflow: hidden;
}
.bar > span { display: block; height: 100%; background: var(--brand-accent); border-radius: var(--radius-full); }

.punchcard { display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px; align-items: end; height: 90px; }
.punchcard div {
  background: color-mix(in srgb, var(--brand-accent) 78%, transparent);
  border-radius: 2px 2px 0 0;
  min-height: 2px;
}
.punch-labels {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  gap: 3px;
  font-family: var(--font-mono);
  font-size: 0.7em;
  color: var(--vscode-descriptionForeground);
  margin-top: 4px;
}

table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border)); }
th {
  font-family: var(--font-mono);
  font-size: 0.85em;
  text-transform: uppercase;
  letter-spacing: ${BRAND.monoTracking};
  color: var(--vscode-descriptionForeground);
  font-weight: 600;
}
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

.repo { border-bottom: 1px solid var(--vscode-panel-border); padding: 10px 0; }
.repo:last-child { border-bottom: none; }
.repo-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.repo-name { font-weight: ${BRAND.displayWeight}; letter-spacing: ${BRAND.displayTracking}; }
.folder-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; padding: 3px 0; font-size: 0.9em; }
.folder-name { color: var(--vscode-descriptionForeground); }
.folder-name.opened { color: var(--vscode-foreground); }
.tree-line { color: var(--brand-accent-text); opacity: 0.5; }

.empty { text-align: center; padding: 40px 20px; color: var(--vscode-descriptionForeground); }
a, .accent-text { color: var(--brand-accent-text); }

.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: 0.78em;
  background: color-mix(in srgb, var(--brand-accent) 18%, transparent);
  color: var(--vscode-foreground);
}
.warn { color: var(--vscode-editorWarning-foreground); }

/* Utility classes exist because the panels' CSP forbids inline style
   attributes: a nonce covers <style> elements only. Anything that varies with
   data goes through DynamicStyles into the nonced stylesheet instead. */
.note { margin-top: 10px; }
.lead { margin-bottom: 12px; }
.repo-bar { display: block; margin: 6px 0 8px; }

/* ---------------------------------------------------------------------------
   The tabbed shell.

   Both panels are one page with a headline strip that never moves and a set of
   tabs beneath it. The strip is the reason the tabs are allowed to hide things:
   whichever tab is open, today's time, the window total and the streak are
   still on screen, so navigating never costs the reader the basics.
   --------------------------------------------------------------------------- */

.strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 1px;
  background: var(--vscode-editorWidget-border, var(--vscode-panel-border));
  border: 1px solid var(--vscode-editorWidget-border, transparent);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: ${BRAND.space.sm};
}
.strip .cell { background: var(--vscode-editorWidget-background); padding: 8px 12px; }
.strip .v {
  display: block;
  font-family: var(--font-mono);
  letter-spacing: ${BRAND.monoTracking};
  font-variant-numeric: tabular-nums;
  font-size: 1.3em;
  font-weight: 600;
  line-height: 1.25;
}
.strip .k {
  font-family: var(--font-mono);
  font-size: 0.68em;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--vscode-descriptionForeground);
}
/* Today is the one figure still changing, so it carries the accent. */
.strip .cell.live .v { color: var(--brand-accent-text); }

.tabnav { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-bottom: ${BRAND.space.sm}; }
.tabnav .hint { margin-left: auto; font-size: 0.72em; color: var(--vscode-descriptionForeground); }

.pane { display: none; }
.pane.on { display: block; }
.pane > .lead { font-size: 0.85em; color: var(--vscode-descriptionForeground); max-width: 78ch; }

/* Twelve columns, because half the panes want a 7/5 or 8/4 split and a
   minmax(320px, 1fr) auto-fit cannot express one. */
.grid.cols { grid-template-columns: repeat(12, 1fr); gap: 10px; }
.grid.cols > .c4 { grid-column: span 4; }
.grid.cols > .c5 { grid-column: span 5; }
.grid.cols > .c7 { grid-column: span 7; }
.grid.cols > .c8 { grid-column: span 8; }
.grid.cols > .c12 { grid-column: span 12; }
@media (max-width: 900px) {
  .grid.cols > .c4, .grid.cols > .c5, .grid.cols > .c7, .grid.cols > .c8 { grid-column: span 12; }
}

/* Density. Cards inside a pane hold tables rather than prose, so they carry
   less padding and a smaller heading than a full-width prose card would. */
.card { padding: 12px 14px; margin-bottom: 0; }
.card + .card { margin-top: 10px; }
h2 {
  font-family: var(--font-mono);
  font-size: 0.72em;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vscode-descriptionForeground);
  margin: 0 0 10px;
}

table.tight th, table.tight td { padding: 4px 6px; font-size: 0.95em; }
table.tight tbody tr:last-child td { border-bottom: none; }
table.tight .bar { height: 5px; }
table.tight td.barcell { width: 68px; }
tfoot th { border-bottom: none; text-transform: none; letter-spacing: 0; font-size: 1em; color: var(--vscode-foreground); }

/* The weekday-by-hour grid. Cells are flexible in width so 24 of them fit
   whatever the panel is; only the height is fixed. */
.matrix { display: grid; gap: 2px; }
.matrix-row { display: grid; grid-template-columns: 2.4em repeat(24, 1fr); gap: 2px; align-items: center; }
.matrix-row .heat-cell { width: auto; height: 12px; }
.matrix-label {
  font-family: var(--font-mono);
  font-size: 0.68em;
  color: var(--vscode-descriptionForeground);
}
.matrix-head { display: grid; grid-template-columns: 2.4em repeat(24, 1fr); gap: 2px; }
.matrix-head span {
  font-family: var(--font-mono);
  font-size: 0.6em;
  text-align: center;
  color: var(--vscode-descriptionForeground);
}

.spark { display: flex; align-items: flex-end; gap: 1px; height: 46px; }
.spark span {
  flex: 1;
  min-height: 2px;
  border-radius: 1px 1px 0 0;
  background: color-mix(in srgb, var(--brand-accent) 52%, transparent);
}
.spark span.peak { background: var(--brand-accent); }
.axis {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-mono);
  font-size: 0.68em;
  color: var(--vscode-descriptionForeground);
  margin-top: 4px;
}

/* The client split. One bar, one segment per client, so a glance answers "who
   did this month belong to" before any row is read. */
.stack { display: flex; height: 9px; border-radius: var(--radius-full); overflow: hidden; background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent); margin-bottom: 10px; }
.stack span { display: block; }
.swatch { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 6px; }
.seg-0, .swatch.seg-0 { background: var(--brand-accent); }
.seg-1, .swatch.seg-1 { background: color-mix(in srgb, var(--brand-accent) 58%, transparent); }
.seg-2, .swatch.seg-2 { background: color-mix(in srgb, var(--brand-accent) 32%, transparent); }
.seg-3, .swatch.seg-3 { background: color-mix(in srgb, var(--vscode-foreground) 34%, transparent); }

.recent-cell { display: inline-block; vertical-align: -2px; margin-right: 7px; }

/* A day's square is a control now, so it says so on hover and on focus. */
.heat-cell[data-day] { cursor: pointer; }
.heat-cell[data-day]:hover { outline: 1px solid var(--vscode-foreground); outline-offset: 1px; }
.heat-cell[data-day]:focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 1px; }
.heat-cell.picked { outline: 2px solid var(--brand-accent); outline-offset: 1px; }

/* The clicked day, inline under the grid so the grid stays on screen. */
.day-detail {
  margin-top: ${BRAND.space.sm};
  padding-top: ${BRAND.space.sm};
  border-top: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border));
}
.day-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.day-head strong { letter-spacing: ${BRAND.displayTracking}; }
.day-head .muted { margin-left: 8px; }
.day-head-right { display: flex; align-items: center; gap: 10px; }
.day-grid { margin-top: 10px; }
/* Inside the detail the cards are already nested one deep, so they lose their
   own fill and keep only the rule that separates them. */
.day-grid > .card { background: none; border: none; padding: 0 0 4px; }

/* The repository and folder filter. Scrolls rather than pushing the tables off
   the page: a monorepo with fifty folders would otherwise own the panel. */
.filter { margin-bottom: ${BRAND.space.sm}; }
.filter-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
.filter-box {
  max-height: 190px;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 1px 16px;
}
.filter-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 8px;
  align-items: center;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.9em;
}
.filter-row:hover { background: color-mix(in srgb, var(--vscode-foreground) 7%, transparent); }
.filter-repo { font-weight: ${BRAND.displayWeight}; }
.filter-row.depth-1 { padding-left: 18px; }
.filter-row.depth-2 { padding-left: 32px; }
.filter-row.depth-3 { padding-left: 46px; }
.filter-row input { accent-color: var(--brand-accent); margin: 0; }
button:disabled { opacity: 0.5; cursor: default; }
`;
}
