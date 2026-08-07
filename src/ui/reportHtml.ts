// ABOUTME: Markup, styles and browser-side script for the client report tab.
// ABOUTME: Renders a prebuilt report; every number is computed in core/report.ts.

import { csp, embed, nonce } from "./webview";
import { baseStyles } from "./style";
import type { Report, Rounding } from "../core/report";

export interface ReportView {
  report: Report;
  presets: { id: string; label: string }[];
  activePreset: string;
  rounding: Rounding;
  /** Pre-formatted so the webview never does duration maths. */
  labels: {
    total: string;
    rounded: string;
    unassigned: string;
    clients: { client: string; total: string; rounded: string; projects: { project: string; total: string }[] }[];
    days: { date: string; total: string; rounded: string; entries: { label: string; total: string }[] }[];
  };
}

export function reportHtml(view: ReportView): string {
  const n = nonce();
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp(n)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
${baseStyles}
  body { overflow: auto; }
  .wrap { max-width: 940px; margin: 0 auto; padding: var(--sp-4); }
  header { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; margin-bottom: var(--sp-3); }
  header h1 { font-size: 15px; font-weight: 600; margin: 0; }
  header .spacer { margin-left: auto; }
  .range { color: var(--muted); font-size: 12px; }

  .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: var(--sp-2); margin: var(--sp-3) 0 var(--sp-4); }
  .total { padding: var(--sp-3); border: 1px solid var(--hairline); border-radius: var(--radius); }
  .total .value { font-size: 20px; font-weight: 600; }

  section { margin-bottom: var(--sp-4); }
  section > h2 { font-size: var(--label); font-weight: 600; letter-spacing: .06em;
                 text-transform: uppercase; color: var(--faint); margin: 0 0 var(--sp-2); }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: var(--label); font-weight: 600; letter-spacing: .06em;
       text-transform: uppercase; color: var(--faint); padding: 0 var(--sp-2) var(--sp-1);
       border-bottom: 1px solid var(--hairline); }
  th.num, td.num { text-align: right; white-space: nowrap; }
  td { padding: var(--sp-2); border-bottom: 1px solid var(--hairline); }
  tr.client td { font-weight: 600; }
  tr.project td { color: var(--muted); }
  tr.project td:first-child { padding-left: var(--sp-4); font-weight: 400; }
  tr.day td:first-child { font-family: var(--vscode-editor-font-family); white-space: nowrap; }
  .entries { color: var(--muted); font-size: 12px; }

  .note { margin-top: var(--sp-3); padding: var(--sp-3); border: 1px dashed var(--hairline);
          border-radius: var(--radius); color: var(--muted); font-size: 12px; }
  .empty-state { padding: var(--sp-4); border: 1px dashed var(--hairline);
                 border-radius: var(--radius); color: var(--muted); }
</style>
</head>
<body>
<div class="wrap" id="root"></div>
<script nonce="${n}" type="application/json" id="view">${embed(view)}</script>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const view = JSON.parse(document.getElementById('view').textContent);
  const root = document.getElementById('root');

  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) { node.className = cls; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  };

  const header = make('header');
  header.appendChild(make('h1', null, 'Report'));

  const preset = make('select');
  for (const option of view.presets) {
    const o = make('option', null, option.label);
    o.value = option.id;
    if (option.id === view.activePreset) { o.selected = true; }
    preset.appendChild(o);
  }
  preset.addEventListener('change', () =>
    vscode.postMessage({ type: 'range', preset: preset.value }));
  header.appendChild(preset);

  const rounding = make('select');
  for (const [value, label] of [['none', 'Exact time'], ['15m', 'Round to 15m'],
                                ['30m', 'Round to 30m'], ['1h', 'Round to 1h']]) {
    const o = make('option', null, label);
    o.value = value;
    if (value === view.rounding) { o.selected = true; }
    rounding.appendChild(o);
  }
  rounding.addEventListener('change', () =>
    vscode.postMessage({ type: 'rounding', rounding: rounding.value }));
  header.appendChild(rounding);

  header.appendChild(make('span', 'spacer'));
  const clientsBtn = make('button', 'secondary', 'Clients…');
  clientsBtn.addEventListener('click', () => vscode.postMessage({ type: 'clients' }));
  header.appendChild(clientsBtn);
  const csv = make('button', null, 'Export CSV');
  csv.addEventListener('click', () => vscode.postMessage({ type: 'csv' }));
  header.appendChild(csv);
  root.appendChild(header);

  root.appendChild(make('div', 'range', view.report.from + '  →  ' + view.report.to));

  const totals = make('div', 'totals');
  const totalBox = make('div', 'total');
  totalBox.appendChild(make('div', 'value', view.labels.total));
  totalBox.appendChild(make('div', 'label', 'Tracked'));
  totals.appendChild(totalBox);
  if (view.rounding !== 'none') {
    const roundedBox = make('div', 'total');
    roundedBox.appendChild(make('div', 'value', view.labels.rounded));
    roundedBox.appendChild(make('div', 'label', 'Rounded'));
    totals.appendChild(roundedBox);
  }
  const daysBox = make('div', 'total');
  daysBox.appendChild(make('div', 'value', String(view.report.daysWorked)));
  daysBox.appendChild(make('div', 'label', 'Days worked'));
  totals.appendChild(daysBox);
  root.appendChild(totals);

  if (!view.labels.clients.length && !view.report.unassignedSeconds) {
    const empty = make('div', 'empty-state');
    empty.appendChild(make('div', null, 'Nothing tracked in this range.'));
    empty.appendChild(make('div', 'hint', 'Pick a wider range, or check that project tracking is on.'));
    root.appendChild(empty);
  }

  // ---- by client
  if (view.labels.clients.length) {
    const table = make('table');
    const head = make('tr');
    for (const [text, cls] of [['Client / project', ''], ['Days', 'num'], ['Time', 'num'],
                               [view.rounding === 'none' ? '' : 'Rounded', 'num']]) {
      const th = make('th', cls, text);
      head.appendChild(th);
    }
    table.appendChild(head);

    view.report.clients.forEach((client, i) => {
      const labels = view.labels.clients[i];
      const tr = make('tr', 'client');
      tr.appendChild(make('td', null, client.client));
      tr.appendChild(make('td', 'num', String(client.days)));
      tr.appendChild(make('td', 'num', labels.total));
      tr.appendChild(make('td', 'num', view.rounding === 'none' ? '' : labels.rounded));
      table.appendChild(tr);

      if (client.projects.length > 1) {
        client.projects.forEach((project, j) => {
          const row = make('tr', 'project');
          row.appendChild(make('td', null, project.project));
          row.appendChild(make('td', 'num', String(project.days)));
          row.appendChild(make('td', 'num', labels.projects[j].total));
          row.appendChild(make('td', 'num', ''));
          table.appendChild(row);
        });
      }
    });

    const section = make('section');
    section.appendChild(make('h2', null, 'By client'));
    section.appendChild(table);
    root.appendChild(section);
  }

  // ---- by day
  if (view.labels.days.length) {
    const table = make('table');
    const head = make('tr');
    for (const [text, cls] of [['Date', ''], ['Worked on', ''], ['Time', 'num'],
                               [view.rounding === 'none' ? '' : 'Rounded', 'num']]) {
      head.appendChild(make('th', cls, text));
    }
    table.appendChild(head);

    for (const day of view.labels.days) {
      const tr = make('tr', 'day');
      tr.appendChild(make('td', null, day.date));
      tr.appendChild(make('td', 'entries',
        day.entries.map((e) => e.label + ' ' + e.total).join('  ·  ') || '—'));
      tr.appendChild(make('td', 'num', day.total));
      tr.appendChild(make('td', 'num', view.rounding === 'none' ? '' : day.rounded));
      table.appendChild(tr);
    }

    const section = make('section');
    section.appendChild(make('h2', null, 'By day'));
    section.appendChild(table);
    root.appendChild(section);
  }

  const note = make('div', 'note');
  note.appendChild(make('div', null, 'This is time spent in the editor.'));
  note.appendChild(make('div', null, view.report.unassignedSeconds
    ? view.labels.unassigned + ' was tracked with no project folder open, so it is in the total but not against a client.'
    : 'Every tracked minute in this range is assigned to a project.'));
  root.appendChild(note);
</script>
</body>
</html>`;
}
