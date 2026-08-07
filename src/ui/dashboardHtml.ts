// ABOUTME: Markup, styles and browser-side script for the Almanac dashboard.
// ABOUTME: Everything it renders comes from a pure model; this file only draws.

import { csp, embed, nonce } from "./webview";
import { baseStyles } from "./style";
import type { DashboardModel } from "../core/dashboardModel";

export function dashboardHtml(model: DashboardModel): string {
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
  .wrap { max-width: 1000px; margin: 0 auto; padding: var(--sp-4); }

  header { display: flex; align-items: baseline; gap: var(--sp-3); margin-bottom: var(--sp-4); }
  header h1 { font-size: 15px; font-weight: 600; margin: 0; }
  header .spacer { margin-left: auto; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
           gap: var(--sp-2); margin-bottom: var(--sp-4); }
  .stat { padding: var(--sp-3); border: 1px solid var(--hairline); border-radius: var(--radius); }
  .stat .value { font-size: 22px; font-weight: 600; line-height: 1.2; }
  .stat .value.flame { color: var(--vscode-charts-orange, #f47c20); }
  .stat .note { margin-top: 2px; }

  section { margin-bottom: var(--sp-4); }
  section > h2 { font-size: var(--label); font-weight: 600; letter-spacing: .06em;
                 text-transform: uppercase; color: var(--faint); margin: 0 0 var(--sp-2); }

  .heatmap { display: flex; gap: 3px; overflow-x: auto; padding-bottom: var(--sp-1); }
  .heat-col { display: flex; flex-direction: column; gap: 3px; }
  .heat-col .month { height: 12px; font-size: 10px; color: var(--faint); white-space: nowrap; }
  .cell { width: 11px; height: 11px; border-radius: 2px; background: var(--l0); }
  .cell.l1 { background: var(--l1); } .cell.l2 { background: var(--l2); }
  .cell.l3 { background: var(--l3); } .cell.l4 { background: var(--l4); }
  .cell.blank { background: transparent; }
  :root {
    --l0: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
    --l1: color-mix(in srgb, var(--vscode-charts-orange, #f47c20) 28%, transparent);
    --l2: color-mix(in srgb, var(--vscode-charts-orange, #f47c20) 52%, transparent);
    --l3: color-mix(in srgb, var(--vscode-charts-orange, #f47c20) 76%, transparent);
    --l4: var(--vscode-charts-orange, #f47c20);
  }
  .legend { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--faint);
            margin-top: var(--sp-2); }

  .lang { display: grid; grid-template-columns: 150px 1fr auto; gap: var(--sp-3);
          align-items: center; padding: var(--sp-2) 0; border-bottom: 1px solid var(--hairline); }
  .lang:last-child { border-bottom: 0; }
  .lang .name { font-weight: 600; }
  .lang .sub { font-size: 11px; color: var(--faint); }
  .bar { height: 6px; border-radius: 3px; background: var(--l0); overflow: hidden; }
  .bar span { display: block; height: 100%; background: var(--vscode-charts-orange, #f47c20); }
  .mini { display: flex; gap: 2px; }
  .mini .cell { width: 7px; height: 7px; border-radius: 1px; }
  .lang .right { text-align: right; white-space: nowrap; }

  .punch { display: grid; grid-template-columns: 34px 1fr; gap: 4px; align-items: center; }
  .punch .row { display: flex; gap: 3px; }
  .punch .rlabel { font-size: 11px; color: var(--faint); }
  .punch .hours { display: flex; gap: 3px; margin-left: 38px; margin-top: 4px;
                  font-size: 10px; color: var(--faint); }
  .punch .hours span { width: 11px; text-align: center; }

  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: var(--sp-2); }
  .fact { display: flex; justify-content: space-between; gap: var(--sp-2);
          padding: var(--sp-2) 0; border-bottom: 1px solid var(--hairline); }
  .fact .k { color: var(--muted); }

  .miles { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: var(--sp-2); }
  .mile { padding: var(--sp-2) var(--sp-3); border: 1px solid var(--hairline); border-radius: var(--radius); }
  .mile.done { border-color: color-mix(in srgb, var(--vscode-charts-orange, #f47c20) 45%, transparent); }
  .mile .t { display: flex; align-items: center; gap: var(--sp-2); }
  .mile .tick { color: var(--vscode-charts-orange, #f47c20); }
  .mile .bar { margin-top: 6px; }

  .split-bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: var(--l0); }
  .split-bar .typed { background: var(--vscode-charts-blue, #4a9eff); }
  .split-bar .inserted { background: var(--vscode-charts-orange, #f47c20); }
  .split-key { display: flex; gap: var(--sp-4); margin-top: var(--sp-2); font-size: 12px;
               color: var(--muted); flex-wrap: wrap; }
  .swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; }
  .swatch.typed { background: var(--vscode-charts-blue, #4a9eff); }
  .swatch.inserted { background: var(--vscode-charts-orange, #f47c20); }
  .cell.clickable { cursor: pointer; }
  .cell.clickable:hover { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  .detail:empty { display: none; }
  .detail { margin-top: var(--sp-3); padding: var(--sp-3); border: 1px solid var(--hairline);
            border-radius: var(--radius); }
  .detail-head { display: flex; align-items: center; gap: var(--sp-3); margin-bottom: var(--sp-2); }
  .detail-head .ghost { margin-left: auto; }
  .detail-row { display: grid; grid-template-columns: 90px 1fr; gap: var(--sp-3);
                padding: var(--sp-2) 0; border-top: 1px solid var(--hairline); }
  .detail-lang { display: grid; grid-template-columns: 130px 1fr auto; gap: var(--sp-2);
                 align-items: center; }
  .empty-state { padding: var(--sp-4); border: 1px dashed var(--hairline);
                 border-radius: var(--radius); color: var(--muted); }
  footer { margin-top: var(--sp-4); padding-top: var(--sp-3);
           border-top: 1px solid var(--hairline); font-size: 12px; color: var(--faint);
           display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
  footer .spacer { margin-left: auto; }
</style>
</head>
<body>
<div class="wrap" id="root"></div>
<script nonce="${n}" type="application/json" id="model">${embed(model)}</script>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const model = JSON.parse(document.getElementById('model').textContent);
  const root = document.getElementById('root');

  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) { node.className = cls; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  };

  function stat(value, label, note, flame) {
    const box = make('div', 'stat');
    box.appendChild(make('div', 'value' + (flame ? ' flame' : ''), value));
    box.appendChild(make('div', 'label', label));
    if (note) { box.appendChild(make('div', 'note hint', note)); }
    return box;
  }

  function cell(c, opts) {
    const node = make('div', 'cell' + (c ? ' l' + c.level : ' blank'));
    if (c) {
      const commits = model.commits.byDay[c.date];
      node.title = c.date + ' · ' + (c.seconds ? Math.round(c.seconds / 60) + ' min' : 'nothing')
        + (commits ? ' · ' + commits + ' commits' : '');
      if (opts && opts.clickable && model.details[c.date]) {
        node.classList.add('clickable');
        node.addEventListener('click', () => showDay(c.date));
      }
    }
    return node;
  }

  /** The drill-down: what one day actually consisted of. */
  function showDay(date) {
    const detail = model.details[date];
    const host = document.getElementById('dayDetail');
    host.innerHTML = '';
    if (!detail) { return; }

    const head = make('div', 'detail-head');
    head.appendChild(make('strong', null, date));
    head.appendChild(make('span', 'hint', detail.total + ' · ' + detail.files + ' files · '
      + detail.saves + ' saves' + (detail.commits ? ' · ' + detail.commits + ' commits' : '')));
    const close = make('button', 'ghost', 'Close');
    close.addEventListener('click', () => { host.innerHTML = ''; });
    head.appendChild(close);
    host.appendChild(head);

    if (detail.projects.length) {
      const row = make('div', 'detail-row');
      row.appendChild(make('span', 'label', 'Projects'));
      const list = make('div');
      for (const project of detail.projects) {
        const line = make('div', null);
        line.appendChild(make('span', null, project.name));
        if (project.client !== project.name) {
          line.appendChild(make('span', 'hint', '  → ' + project.client));
        }
        line.appendChild(make('span', 'hint', '  ' + project.label));
        list.appendChild(line);
      }
      row.appendChild(list);
      host.appendChild(row);
    }

    if (detail.languages.length) {
      const row = make('div', 'detail-row');
      row.appendChild(make('span', 'label', 'Languages'));
      const list = make('div');
      for (const language of detail.languages) {
        const line = make('div', 'detail-lang');
        line.appendChild(make('span', null, language.name));
        const bar = make('div', 'bar');
        const fill = make('span');
        fill.style.width = Math.max(language.share * 100, 2) + '%';
        bar.appendChild(fill);
        line.appendChild(bar);
        line.appendChild(make('span', 'hint', language.label));
        list.appendChild(line);
      }
      row.appendChild(list);
      host.appendChild(row);
    }

    const row = make('div', 'detail-row');
    row.appendChild(make('span', 'label', 'Hours'));
    const hours = make('div', 'mini');
    for (const hour of detail.hours) {
      const node = make('div', 'cell' + (hour.level ? ' l' + hour.level : ''));
      node.title = hour.hour + ':00 · ' + Math.round(hour.seconds / 60) + ' min';
      hours.appendChild(node);
    }
    row.appendChild(hours);
    host.appendChild(row);
    host.scrollIntoView({ block: 'nearest' });
  }

  function heatmap(columns) {
    const grid = make('div', 'heatmap');
    for (const column of columns) {
      const col = make('div', 'heat-col');
      col.appendChild(make('div', 'month', column.month || ''));
      for (const c of column.cells) { col.appendChild(cell(c, { clickable: true })); }
      grid.appendChild(col);
    }
    return grid;
  }

  function section(title, body) {
    const s = make('section');
    s.appendChild(make('h2', null, title));
    s.appendChild(body);
    return s;
  }

  // ---- header + headline stats
  const header = make('header');
  header.appendChild(make('h1', null, 'Almanac'));
  header.appendChild(make('span', 'hint', model.headline.streakNote));
  const spacer = make('span', 'spacer');
  header.appendChild(spacer);
  const report = make('button', 'secondary', 'Report');
  report.addEventListener('click', () => vscode.postMessage({ type: 'report' }));
  header.appendChild(report);
  const refresh = make('button', 'secondary', 'Refresh');
  refresh.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
  header.appendChild(refresh);
  root.appendChild(header);

  const stats = make('div', 'stats');
  stats.appendChild(stat(model.headline.streak, 'Current streak', null, true));
  stats.appendChild(stat(model.headline.longest, 'Longest streak'));
  stats.appendChild(stat(model.headline.today, 'Today'));
  stats.appendChild(stat(model.headline.week, 'Last 7 days'));
  stats.appendChild(stat(model.headline.total, 'All time'));
  root.appendChild(stats);

  if (model.empty) {
    const empty = make('div', 'empty-state');
    empty.appendChild(make('div', null, 'Nothing tracked yet.'));
    empty.appendChild(make('div', 'hint',
      'Almanac counts a minute when this window has focus and you have typed, moved the cursor or saved in the last two minutes. Come back after a stint of work.'));
    root.appendChild(empty);
  }

  // ---- day heatmap
  const heatWrap = make('div');
  heatWrap.appendChild(heatmap(model.columns));
  heatWrap.appendChild(make('div', 'hint', 'Click a day to see what it consisted of.'));
  const legend = make('div', 'legend');
  legend.appendChild(make('span', null, model.legendLabels[0]));
  for (const level of [0, 1, 2, 3, 4]) { legend.appendChild(cell({ level, date: '', seconds: 0 })); }
  legend.appendChild(make('span', null, model.legendLabels[1]));
  heatWrap.appendChild(legend);
  const detailHost = make('div', 'detail');
  detailHost.id = 'dayDetail';
  heatWrap.appendChild(detailHost);
  root.appendChild(section('Every day', heatWrap));

  // ---- languages
  if (model.languages.length) {
    const list = make('div');
    for (const language of model.languages) {
      const row = make('div', 'lang');
      const left = make('div');
      left.appendChild(make('div', 'name', language.name));
      left.appendChild(make('div', 'sub',
        language.streak > 0 ? language.streak + '-day streak · best ' + language.longest
                            : language.days + ' days · best ' + language.longest));
      row.appendChild(left);

      const middle = make('div');
      const bar = make('div', 'bar');
      const fill = make('span');
      fill.style.width = Math.max(language.share * 100, 2) + '%';
      bar.appendChild(fill);
      middle.appendChild(bar);
      const mini = make('div', 'mini');
      mini.style.marginTop = '6px';
      for (const c of language.heatmap.slice(-40)) { mini.appendChild(cell(c)); }
      middle.appendChild(mini);
      row.appendChild(middle);

      row.appendChild(make('div', 'right', language.label));
      list.appendChild(row);
    }
    root.appendChild(section('Languages', list));
  }

  // ---- projects
  if (model.projects.length) {
    const list = make('div');
    for (const project of model.projects) {
      const row = make('div', 'lang');
      const left = make('div');
      left.appendChild(make('div', 'name', project.name));
      left.appendChild(make('div', 'sub', project.days));
      row.appendChild(left);
      const bar = make('div', 'bar');
      const fill = make('span');
      fill.style.width = Math.max(project.share * 100, 2) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);
      row.appendChild(make('div', 'right', project.label));
      list.appendChild(row);
    }
    root.appendChild(section('Projects', list));
  }

  // ---- punchcard
  const punch = make('div', 'punch');
  for (const row of model.punchcard.rows) {
    punch.appendChild(make('div', 'rlabel', row.label));
    const cells = make('div', 'row');
    for (const c of row.cells) {
      const node = make('div', 'cell' + (c.level ? ' l' + c.level : ''));
      node.title = row.label + ' ' + c.hour + ':00 · ' + Math.round(c.seconds / 60) + ' min';
      cells.appendChild(node);
    }
    punch.appendChild(cells);
  }
  const punchWrap = make('div');
  punchWrap.appendChild(punch);
  const hours = make('div', 'hours');
  for (let h = 0; h < 24; h++) { hours.appendChild(make('span', null, h % 6 === 0 ? String(h) : '')); }
  punchWrap.appendChild(hours);
  punchWrap.appendChild(make('div', 'hint', 'Busiest: ' + model.punchcard.busiest));
  root.appendChild(section('When you work', punchWrap));

  // ---- how the code arrived
  {
    const box = make('div');
    const bar = make('div', 'split-bar');
    const typed = make('span', 'typed');
    typed.style.width = Math.round(model.composition.typedShare * 100) + '%';
    const inserted = make('span', 'inserted');
    inserted.style.width = Math.round(model.composition.insertedShare * 100) + '%';
    bar.appendChild(typed);
    bar.appendChild(inserted);
    box.appendChild(bar);

    const key = make('div', 'split-key');
    const one = make('span');
    one.appendChild(make('i', 'swatch typed'));
    one.appendChild(make('span', null, ' Typed  ' + model.composition.typed.toLocaleString() + ' chars'));
    const two = make('span');
    two.appendChild(make('i', 'swatch inserted'));
    two.appendChild(make('span', null, ' Arrived in blocks  ' + model.composition.inserted.toLocaleString() + ' chars'));
    key.appendChild(one);
    key.appendChild(two);
    box.appendChild(key);

    box.appendChild(make('div', 'hint', model.composition.known
      ? model.composition.summary
      : 'Nothing written yet.'));
    box.appendChild(make('div', 'hint',
      'A block is anything that landed at once — an autocomplete accept, a paste, a refactor or an agent edit. VS Code gives no way to tell those apart, so Almanac does not guess.'
      + (model.assistants.length ? ' Installed assistants: ' + model.assistants.join(', ') + '.' : '')));
    root.appendChild(section('How the code arrived', box));
  }

  // ---- milestones
  if (model.milestones.length) {
    const grid = make('div', 'miles');
    for (const milestone of model.milestones) {
      const box = make('div', 'mile' + (milestone.reached ? ' done' : ''));
      const title = make('div', 't');
      if (milestone.reached) { title.appendChild(make('span', 'tick', '●')); }
      title.appendChild(make('span', null, milestone.label));
      box.appendChild(title);
      if (milestone.reached) {
        box.appendChild(make('div', 'hint', milestone.detail));
      } else {
        const bar = make('div', 'bar');
        const fill = make('span');
        fill.style.width = Math.round(milestone.progress * 100) + '%';
        bar.appendChild(fill);
        box.appendChild(bar);
        box.appendChild(make('div', 'hint', Math.round(milestone.progress * 100) + '%'));
      }
      grid.appendChild(box);
    }
    root.appendChild(section('Milestones', grid));
  }

  // ---- facts
  const facts = make('div', 'facts');
  for (const fact of model.facts) {
    const row = make('div', 'fact');
    row.appendChild(make('span', 'k', fact.label));
    row.appendChild(make('span', null, fact.value));
    facts.appendChild(row);
  }
  if (model.commits.total) {
    const row = make('div', 'fact');
    row.appendChild(make('span', 'k', 'Commits'));
    row.appendChild(make('span', null, String(model.commits.total)));
    facts.appendChild(row);
  }
  root.appendChild(section('Totals', facts));

  // ---- footer
  const footer = make('footer');
  footer.appendChild(make('span', null, 'Everything here stays on this machine. Almanac has no network access.'));
  footer.appendChild(make('span', 'spacer'));
  const exportBtn = make('button', 'secondary', 'Export');
  exportBtn.addEventListener('click', () => vscode.postMessage({ type: 'export' }));
  const resetBtn = make('button', 'secondary', 'Delete data');
  resetBtn.addEventListener('click', () => vscode.postMessage({ type: 'reset' }));
  footer.appendChild(exportBtn);
  footer.appendChild(resetBtn);
  root.appendChild(footer);
</script>
</body>
</html>`;
}
