export const SHARED_STYLES = `
:root {
  --gap: 16px;
  --radius: 8px;
  --heat-0: var(--vscode-editorWidget-background);
  --heat-1: color-mix(in srgb, var(--vscode-charts-green) 25%, transparent);
  --heat-2: color-mix(in srgb, var(--vscode-charts-green) 45%, transparent);
  --heat-3: color-mix(in srgb, var(--vscode-charts-green) 70%, transparent);
  --heat-4: var(--vscode-charts-green);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  padding: var(--gap);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
}

h1 { font-size: 1.4em; margin: 0 0 4px; font-weight: 600; }
h2 { font-size: 1em; margin: 0 0 12px; font-weight: 600; }
p { margin: 0 0 8px; }

.muted { color: var(--vscode-descriptionForeground); }
.small { font-size: 0.85em; }
.mono { font-family: var(--vscode-editor-font-family); }

header { margin-bottom: var(--gap); display: flex; flex-wrap: wrap; gap: var(--gap); align-items: flex-end; justify-content: space-between; }

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

.stat .value { font-size: 1.6em; font-weight: 600; line-height: 1.2; }
.stat .label { color: var(--vscode-descriptionForeground); font-size: 0.85em; }

button, .tab {
  font-family: inherit;
  font-size: 0.9em;
  color: var(--vscode-button-secondaryForeground);
  background: var(--vscode-button-secondaryBackground);
  border: none;
  border-radius: 4px;
  padding: 4px 10px;
  cursor: pointer;
}
button:hover, .tab:hover { background: var(--vscode-button-secondaryHoverBackground); }
button[aria-pressed="true"] {
  color: var(--vscode-button-foreground);
  background: var(--vscode-button-background);
}
button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }

.tabs { display: flex; gap: 6px; flex-wrap: wrap; }

.heatmap { display: flex; gap: 3px; overflow-x: auto; padding-bottom: 4px; }
.heat-week { display: grid; grid-template-rows: repeat(7, 12px); gap: 3px; }
.heat-cell { width: 12px; height: 12px; border-radius: 2px; background: var(--heat-0); }
.heat-cell[data-level="1"] { background: var(--heat-1); }
.heat-cell[data-level="2"] { background: var(--heat-2); }
.heat-cell[data-level="3"] { background: var(--heat-3); }
.heat-cell[data-level="4"] { background: var(--heat-4); }
.heat-months { display: flex; gap: 3px; margin-bottom: 4px; height: 1.2em; }
.heat-months span { font-size: 0.75em; color: var(--vscode-descriptionForeground); width: 12px; white-space: nowrap; }
.legend { display: flex; align-items: center; gap: 4px; justify-content: flex-end; margin-top: 8px; font-size: 0.8em; color: var(--vscode-descriptionForeground); }

.bars { display: grid; gap: 8px; }
.bar-row { display: grid; grid-template-columns: minmax(90px, 1fr) 2fr auto; gap: 10px; align-items: center; }
.bar { height: 8px; border-radius: 4px; background: var(--vscode-editorWidget-background); overflow: hidden; }
.bar > span { display: block; height: 100%; background: var(--vscode-charts-blue); }

.punchcard { display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px; align-items: end; height: 90px; }
.punchcard div { background: var(--vscode-charts-purple); border-radius: 2px 2px 0 0; min-height: 2px; }
.punch-labels { display: grid; grid-template-columns: repeat(24, 1fr); gap: 3px; font-size: 0.7em; color: var(--vscode-descriptionForeground); margin-top: 4px; }

table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border)); }
th { color: var(--vscode-descriptionForeground); font-weight: 600; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

.repo { border-bottom: 1px solid var(--vscode-panel-border); padding: 10px 0; }
.repo:last-child { border-bottom: none; }
.repo-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.repo-name { font-weight: 600; }
.folder-row { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; padding: 3px 0; font-size: 0.9em; }
.folder-name { color: var(--vscode-descriptionForeground); }
.folder-name.opened { color: var(--vscode-foreground); }
.tree-line { color: var(--vscode-descriptionForeground); opacity: 0.6; }

/* Utility classes exist because the panels' CSP forbids inline style
   attributes: a nonce covers <style> elements only. Anything that varies with
   data goes through DynamicStyles into the nonced stylesheet instead. */
.note { margin-top: 10px; }
.lead { margin-bottom: 12px; }
.repo-bar { display: block; margin: 6px 0 8px; }

.empty { text-align: center; padding: 40px 20px; color: var(--vscode-descriptionForeground); }
.pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.8em; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
.warn { color: var(--vscode-editorWarning-foreground); }
`;
