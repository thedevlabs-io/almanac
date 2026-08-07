# CLAUDE.md

## What this is

Cadence is a VS Code extension (publisher `thedevlabs-io`) that tracks how you
work — active time, streaks, languages, projects, hours — and shows it as
heatmaps in a dashboard. The defining constraints are that the numbers are
**honest** and the data **never leaves the machine**.

## Architecture

Bundled by esbuild into a single CJS file. Tests live in `test/`, never beside
the source. `core/` has no `vscode` import, so every number is unit-testable.

```
src/
  core/                 pure logic
    types.ts            DayRecord, Database — the aggregate shape
    day.ts              local calendar-day keys and arithmetic
    activityClock.ts    the rule deciding whether a moment counts as work
    record.ts           folding ticks and counters into a day
    streaks.ts          current/longest streak arithmetic
    aggregate.ts        rollups: heat levels, languages, punchcard, totals
    milestones.ts       milestone tracks
    format.ts           durations, plurals, language display names
    dashboardModel.ts   the exact view model the dashboard renders
  storage/
    store.ts            activity.json in globalStorage; queued, debounced writes
  tracking/
    tracker.ts          focus + input listeners, credits ticks to the day
    git.ts              commit counts via the built-in Git extension, guarded
  ui/
    style.ts            shared tokens/controls, all from VS Code theme variables
    webview.ts          nonce, CSP, JSON embedding
    dashboard.ts        the dashboard panel
    dashboardHtml.ts    its markup/styles/script
    statusBar.ts        streak + today's time
  extension.ts          activation and commands only
```

### The two rules that matter

1. **Honesty.** `activityClock.ts` is the whole definition of a tracked minute:
   focused *and* input within `IDLE_MS`. Do not add a path that credits time
   without both. `creditFor` caps a tick at `TICK_MS` on purpose — without it a
   sleeping laptop banks hours on wake.

2. **Privacy.** Cadence has no network code and must never gain any. Store
   aggregates, never events. Never record file names, paths or contents;
   `tracker.noteFile` deliberately keeps a per-day `Set` in memory only, to count
   distinct files without storing anything identifying. Projects are the
   workspace **folder name**, gated behind `cadence.trackProjects`.

## Conventions specific to this repo

- Source files start with a 2-line `ABOUTME:` comment.
- **No runtime dependencies** — only dev tooling.
- Comments earn their place: a non-obvious *why*, an invariant, or a boundary.
- Webview markup lives in its own `*Html.ts`, never inline with panel behaviour.
- `npm run lint` and `npm test` must pass; `vscode:prepublish` runs both.

## User Preference

- never commit to main — always build first (`npm run build`), verify the extension works,
  then push feature branch and create a PR.
- always review changes before committing with sub agent out of the context agent for skeptical eyes.
- push back on requests that are not in the scope of the extension, or that are not aligned with the
  purpose of the extension.
- document all changes with a clear description of the change, the reason for the change,
  and the impact of the change. Maintain a changelog for all changes made to the extension.
