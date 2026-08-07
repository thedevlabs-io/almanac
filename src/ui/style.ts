// ABOUTME: The shared visual language for Postbox's webviews — tokens, controls, tables.
// ABOUTME: Every colour is a VS Code theme token, so the panels look native in any theme.

/**
 * One spacing rhythm (4/8/12/16) and one type scale, so panels built at different
 * times still line up. Fallbacks are given for tokens older themes may not set.
 */
export const baseStyles = /* css */ `
  :root {
    --sp-1: 4px;
    --sp-2: 8px;
    --sp-3: 12px;
    --sp-4: 16px;
    --radius: 5px;
    --radius-sm: 4px;
    --hairline: var(--vscode-panel-border, rgba(128,128,128,.35));
    --label: 11px;
    --muted: color-mix(in srgb, var(--vscode-foreground) 65%, transparent);
    --faint: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);
    --hover: var(--vscode-list-hoverBackground, rgba(128,128,128,.12));
  }

  html, body { height: 100%; }
  body {
    margin: 0;
    font-family: var(--vscode-font-family);
    font-size: 13px;
    line-height: 1.5;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    overflow: hidden;
  }
  *, *::before, *::after { box-sizing: border-box; }

  /* ---- type ------------------------------------------------------------ */

  .label {
    font-size: var(--label);
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--faint);
  }
  .mono { font-family: var(--vscode-editor-font-family); }
  .muted { color: var(--muted); }

  /* ---- controls -------------------------------------------------------- */

  input, textarea, select {
    font: inherit;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: var(--radius-sm);
    padding: 5px 8px;
  }
  input::placeholder, textarea::placeholder { color: var(--faint); }
  select {
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border-color: var(--vscode-dropdown-border, transparent);
  }
  input:focus-visible, textarea:focus-visible, select:focus-visible, button:focus-visible,
  [tabindex]:focus-visible {
    outline: 1px solid var(--vscode-focusBorder);
    outline-offset: -1px;
  }

  button {
    font: inherit;
    border: none;
    border-radius: var(--radius-sm);
    padding: 5px 11px;
    cursor: pointer;
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
  }
  button:hover { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
  button.secondary {
    color: var(--vscode-button-secondaryForeground);
    background: var(--vscode-button-secondaryBackground);
  }
  button.secondary:hover {
    background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-secondaryBackground));
  }
  button.ghost {
    background: transparent;
    color: var(--muted);
    padding: 4px 8px;
  }
  button.ghost:hover { background: var(--hover); color: var(--vscode-foreground); }

  /* Toggle switch — a real checkbox underneath, so keyboard and a11y still work. */
  .switch { position: relative; display: inline-block; width: 26px; height: 15px; vertical-align: middle; }
  .switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
  .slider {
    position: absolute; inset: 0; border-radius: 999px; pointer-events: none;
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-checkbox-border, var(--vscode-input-border, #6b6b6b));
    transition: background .12s ease, border-color .12s ease;
  }
  .slider::before {
    content: ""; position: absolute; width: 9px; height: 9px; border-radius: 50%;
    left: 2px; top: 2px; background: var(--vscode-foreground); opacity: .6;
    transition: transform .12s ease, background .12s ease, opacity .12s ease;
  }
  .switch input:checked + .slider {
    background: var(--vscode-button-background);
    border-color: var(--vscode-button-background);
  }
  .switch input:checked + .slider::before {
    transform: translateX(11px);
    background: var(--vscode-button-foreground);
    opacity: 1;
  }
  .switch input:focus-visible + .slider { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }

  /* Segmented control — for small, mutually exclusive choices. */
  .segmented {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    border-radius: var(--radius);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, transparent);
  }
  .segmented button {
    background: transparent;
    color: var(--muted);
    padding: 3px 10px;
    border-radius: 3px;
    font-size: 12px;
  }
  .segmented button:hover { background: var(--hover); color: var(--vscode-foreground); }
  .segmented button[aria-pressed="true"] {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  /* ---- tables ---------------------------------------------------------- */

  .grid { width: 100%; border-collapse: collapse; }
  .grid th {
    text-align: left;
    padding: 0 var(--sp-2) var(--sp-1);
    font-size: var(--label);
    font-weight: 600;
    letter-spacing: .06em;
    text-transform: uppercase;
    color: var(--faint);
    border-bottom: 1px solid var(--hairline);
  }
  .grid td { padding: 2px var(--sp-1); }
  .grid tr.row:hover { background: var(--hover); }
  .grid td.check { width: 44px; padding-left: var(--sp-2); }
  .grid td.act { width: 30px; }
  .grid input {
    width: 100%;
    background: transparent;
    border-color: transparent;
    font-family: var(--vscode-editor-font-family);
    padding: 5px 6px;
  }
  .grid input:hover { border-color: var(--vscode-input-border, var(--hairline)); }
  .grid input:focus {
    background: var(--vscode-input-background);
    border-color: var(--vscode-focusBorder);
  }
  .grid tr.row .x { opacity: 0; transition: opacity .1s ease; }
  .grid tr.row:hover .x, .grid tr.row:focus-within .x { opacity: 1; }
  .x {
    background: transparent;
    color: var(--muted);
    padding: 2px 6px;
    line-height: 1;
  }
  .x:hover { background: transparent; color: var(--vscode-errorForeground, #f85149); }
  .add-row td { padding-top: var(--sp-1); }
  .add-row button {
    width: 100%;
    text-align: left;
    background: transparent;
    color: var(--faint);
    border: 1px dashed var(--hairline);
    border-radius: var(--radius-sm);
    padding: 5px 10px;
  }
  .add-row button:hover { color: var(--vscode-foreground); border-color: var(--vscode-focusBorder); }

  /* ---- misc ------------------------------------------------------------ */

  .empty { padding: var(--sp-4); color: var(--faint); }
  .hint { color: var(--muted); font-size: 12px; }
  .bad-var { border-color: var(--vscode-inputValidation-errorBorder, #f85149) !important; }
`;
