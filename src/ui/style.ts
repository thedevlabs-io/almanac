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

  /* The heat ramp is the brand orange stepped down against the panel surface,
     so an empty day reads as the editor's own background rather than as a
     colour we picked. */
  --heat-0: var(--vscode-editorWidget-background);
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

.heatmap { display: flex; gap: 3px; overflow-x: auto; padding-bottom: 4px; }
.heat-week { display: grid; grid-template-rows: repeat(7, 12px); gap: 3px; }
.heat-cell { width: 12px; height: 12px; border-radius: 2px; background: var(--heat-0); }
.heat-cell[data-level="1"] { background: var(--heat-1); }
.heat-cell[data-level="2"] { background: var(--heat-2); }
.heat-cell[data-level="3"] { background: var(--heat-3); }
.heat-cell[data-level="4"] { background: var(--heat-4); }
.heat-months { display: flex; gap: 3px; margin-bottom: 4px; height: 1.2em; }
.heat-months span {
  font-family: var(--font-mono);
  font-size: 0.7em;
  color: var(--vscode-descriptionForeground);
  width: 12px;
  white-space: nowrap;
}
.legend {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-content: flex-end;
  margin-top: ${BRAND.space.xs};
  font-family: var(--font-mono);
  font-size: 0.75em;
  color: var(--vscode-descriptionForeground);
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
`;
}
