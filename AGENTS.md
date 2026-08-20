# AGENTS.md

## What this is

Almanac is a VS Code extension (publisher `thedevlabs-io`) that tracks how you
work: active time, streaks, languages, repositories, hours, and shows it as
heatmaps in a dashboard. The defining constraints are that the numbers are
**honest** and the data **never leaves the machine**.

## Architecture

Bundled by esbuild into a single CJS file. Tests live in `test/`, never beside
the source. `core/` has no `vscode` import, so every number is unit-testable.

```
src/
  core/                 pure logic, no vscode import
    types.ts            DayRecord, Database, Tick: the aggregate shape
    day.ts              local calendar-day keys and arithmetic
    presence.ts         the rule deciding whether a moment counts as work
    project.ts          repository attribution and the folder tree
    record.ts           folding ticks and counters into a day
    migrate.ts          reads any database Almanac has ever written
    streaks.ts          current/longest streak arithmetic
    aggregate.ts        rollups: heat levels, languages, repositories, punchcard
    milestones.ts       milestone tracks
    composition.ts      typed against block, never attributed to a tool
    format.ts           durations, plurals, language display names
    report.ts           client rollups, rounding, CSV
    dashboardModel.ts   the exact view model the dashboard renders
  storage/
    store.ts            activity.json in globalStorage; queued, atomic writes
  tracking/
    settings.ts         cached configuration
    signals.ts          what counts as a person being present
    projects.ts         filesystem probe for the repository root, cached
    tracker.ts          runs the clock, credits ticks to the day
    git.ts              commit counts via the built-in Git extension, guarded
  ui/
    brand.ts            GENERATED from the design-system submodule; do not edit
    panel.ts            webview font URIs, and the theme taken from VS Code
    style.ts            shared stylesheet: editor surfaces, brand identity
    webview.ts          nonce, CSP, JSON embedding
    dashboard.ts        the dashboard panel
    dashboardHtml.ts    its markup
    report.ts           the report panel
    reportHtml.ts       its markup
    statusBar.ts        streak, today's time, and why the clock is or is not running
    onboarding.ts       the first-run walkthrough
  extension.ts          activation and commands only
```

### The three rules that matter

1. **Honesty.** `presence.ts` is the whole definition of a tracked minute:
   the window is focused, and something happened in it inside the idle window.
   Do not add a path that credits time without both.

   Signals have two sources, and the distinction is *not* the tier system the
   rewrite removed. The old design ranked signals by how much they resembled a
   keystroke in a text editor, so terminal work could never open the clock at
   all. The human tier is now `window.state.active`, VS Code's own
   recent-interaction flag, which sees the terminal, the Simple Browser,
   webviews and the settings editor alike, plus editor selections whose `kind`
   is `Keyboard` or `Mouse`.

   Everything else is `machine`: command output, a watch task restarting, an
   agent editing an open file, a debugger landing on a frame. Machine evidence
   extends a clock a person opened, for at most `MACHINE_GRACE_WINDOWS` idle
   windows, and can never open one. Do not promote a machine signal to human
   without being able to say what makes it impossible for software to produce.

   `creditFor` caps a tick at `TICK_MS` and drops intervals longer than
   `SUSPEND_MS` entirely, so a sleeping laptop cannot bank hours on wake.

2. **Privacy.** Almanac has no network code and must never gain any. Store
   aggregates, never events. Never record file names, paths or contents.
   `tracker.noteFile` keeps a per-day `Set` in memory only, to count distinct
   files without storing anything identifying. Terminal output is subscribed to
   for the fact that it arrived and is never inspected. What `project.ts` stores
   is a repository folder name plus a path relative to the repository root,
   gated behind `almanac.trackProjects`.

3. **Branding without hijacking.** `design-system/` is a submodule, the same
   one the website, learning portal and community apps use. `src/ui/brand.ts` is
   generated from it by `npm run tokens` and must never be hand edited; a brand
   change is a submodule bump plus a regenerate, so Almanac cannot drift from
   the other three.

   Surfaces stay on `var(--vscode-*)`. Backgrounds, foregrounds and borders
   belong to the theme the user chose, high contrast included, and a panel that
   overrides them looks broken inside the editor. The brand supplies accent,
   type, radius and spacing.

   Light and dark come from `vscode.window.activeColorTheme.kind`, never from
   `prefers-color-scheme`. `tokens.css` falls back to the OS when nothing says
   otherwise, and inside an editor that is wrong: a dark VS Code on a light
   machine would get a light-theme accent.

4. **Explicability.** A tracker that miscounts silently is worse than one that
   miscounts loudly. `presence.explain` and the `almanac.why` command exist so a
   user can always find out what the clock thinks, and the dashboard's signal
   breakdown exists so they can check it against a day they remember.

## Conventions specific to this repo

- **No runtime dependencies**, only dev tooling.
- Comments earn their place: a non-obvious *why*, an invariant, or a boundary.
- Webview markup lives in its own `*Html.ts`, never inline with panel behaviour.
- **No inline `style` attributes in a webview.** The CSP has no `'unsafe-inline'`,
  and a nonce covers `<style>` elements only, never attributes. Anything varying
  with data goes through `DynamicStyles` into the nonced stylesheet; anything
  fixed goes into `style.ts`.
- No em dashes anywhere, including comments and docs.
- `npm run lint` and `npm test` must pass; `vscode:prepublish` runs both.

## User preference

- Never commit to main. Build first (`npm run build`), verify the extension
  works, then push a feature branch and open a PR.
- Always review changes before committing with a sub agent, for skeptical eyes.
- Push back on requests outside the scope or purpose of the extension.
- Document all changes: what changed, why, and the impact. Keep the changelog
  current.
