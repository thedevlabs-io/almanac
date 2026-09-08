# Journal

## Knowledge

- `src/core/presence.ts` is the only definition of a tracked minute. Focused
  window plus any observable signal inside the idle window. Every signal kind is
  equal on purpose; see the log entry below for why a hierarchy is a bug.
- `vscode.window.state.active` is VS Code's own "has this window been interacted
  with recently" flag. It is the only way an extension can observe a keystroke
  in the integrated terminal or the settings editor. It is polled once per tick
  in `tracking/signals.ts:sample`, not subscribed to, because between
  transitions no event fires. Three facts about it, read from the VS Code
  source (`domActivityTracker.ts`, `userActivityService.ts`,
  `webviewElement.ts`): it counts only `keydown`, `mousedown` and `touchstart`
  on the window's document; it starts true and drops 70 to 100 seconds after
  the last of those; and a webview's input is re-dispatched on `window`, not
  `document`, so the Simple Browser and the dashboard never reach it. The first
  is why `signals.ts` arms the flag before trusting it. A long `withProgress`
  task also extends it (`extendOnly`, so it cannot open a window), which is a
  known way an agent's progress notification can hold the clock.
- Several VS Code windows are several extension hosts writing one
  `activity.json`. `storage/store.ts` holds only this window's unwritten delta
  and merges it onto the file under `activity.json.lock` at write time; what it
  shows is disk plus delta. `core/record.ts:mergeDay` is the merge rule, and it
  works because every field is an additive counter. `commits` is read whole
  from git by each window and merges by max.
- A session is a credited tick more than `SESSION_GAP_MS` after the last one,
  not every reopening of the clock. Sessions and distinct files are counted per
  window and summed by the merge, so a file open in two windows counts twice
  and a long stint in each window is a session in each. Day seconds cannot be
  double counted, because only the focused window credits them. Repository
  seconds can, by choice: `almanac.concurrentProjects` lets an unfocused window
  credit its repository through `store.addProjectTime`, which touches nothing
  but `projects`, so `activeSeconds` stays the focused window's alone and the
  repository rows may exceed it.
- `TerminalShellExecution.read()` is subscribed to purely so that the arrival of
  output acts as a signal during a long command. The chunks are discarded
  unread. Do not start inspecting them; that would put shell output inside the
  extension's reach for no gain.
- `src/core/project.ts` is pure path arithmetic. The filesystem probe that finds
  the `.git` entry lives in `src/tracking/projects.ts` and is injected, which is
  what makes repository attribution testable without a real repository.
- `.git` is a directory in a clone and a *file* in a worktree or submodule, so
  `tracking/projects.ts` checks existence rather than type.
- `ProjectResolver.resolve` returns undefined the first time it sees a folder,
  because the tick path cannot await. `warm()` is called during activation so in
  practice the first tick already has an answer.
- Schema version 2 stores `projects` as repository to `{seconds, folders}`.
  Version 1 stored a flat folder-name map with no repository information, and
  that information was never captured, so it cannot be recovered by migration.
- `storage/store.ts` writes to a temp file and renames, because rename is
  atomic. An unreadable file is renamed to `activity.json.corrupt` rather than
  overwritten, so a parse bug can never destroy history.

## Log

### 2026-09-08 (concurrent repository time, 1.5.0)

- `src/core/presence.ts` - `isActive` split into `isEngaged` (the two-part rule
  without focus) plus focus, and `creditFor` into `intervalSeconds` plus the
  rule, so `projectCreditFor` could reuse both without a second copy of the
  idle and grace arithmetic. `explain` says when an unfocused window is still
  counting for its repository. #tracking
- `src/tracking/tracker.ts` - under `almanac.concurrentProjects` an unfocused
  tick goes through `store.addProjectTime`, never `addTick`, so it opens no
  session and touches no hour, language or signal. Asked for because two
  windows on two clients split an hour by focus and each client's report showed
  half. Off by default: on, the repository rows stop adding up to the day, and
  the dashboard and report say so. #feature #tracking
- `src/core/dashboardModel.ts`, `src/core/report.ts` - carry the setting as a
  boolean on the view model, so the markup can print the caveat without the
  panels growing a settings parameter. #ui
- `src/core/presence.ts`, `src/tracking/signals.ts` - `PresenceState` gained
  `unfocusedAt`, and `isEngaged` refuses an unfocused window whose last signal
  predates it. Review caught that without this the keystroke before every
  alt-tab carried the repository through a whole idle window of nothing, in
  every window, so a single-window user's client report would routinely exceed
  the day. The day detail also stopped calling a day with only repository time
  empty. #fix #tracking

### 2026-09-01 (multi-window data loss, phantom launch time, 1.4.0)

- `src/storage/store.ts` - rewritten around a base plus delta. The old store
  loaded once and wrote its whole memory back every two seconds, so with two
  windows open each write erased the other window's day: the "multiple VS Code
  windows make the time and streaks a mess" report. Now a write re-reads the
  file, merges this window's delta under a lock and adopts the result. The lock
  wait is bounded and a miss keeps the delta for the next write. A stamp of
  inode, mtime and size skips the parse when nothing moved. `onDidChange` tells
  the panels when another window wrote. #fix #storage
- `src/core/record.ts` - `mergeDay` and `mergeDays`, the merge rule the store
  needs. Pinned by tests that two stores on one directory keep each other's
  seconds, languages, hours and sessions.
- `src/tracking/signals.ts` - `state.active` is distrusted until armed. VS Code
  starts the flag true and clears it only after 70 to 100 seconds of no input,
  and `sample` stamped every one of those ticks as human, so a window restored
  at login credited up to 100 seconds plus the whole idle window to an empty
  chair. Armed by a false to true transition, a keyboard or mouse selection, or
  `ACTIVE_SETTLE_MS` passing, after which the flag can only be true honestly. #fix
- `src/tracking/tracker.ts` - sessions are now a credited tick more than
  `SESSION_GAP_MS` after the previous one. Before, every reopening of the clock
  counted, so an alt-tab to a browser was a session and a laptop that slept for
  two minutes was another, while a real resume after sleep was missed because
  `wasActive` was reset in the same tick. Languages are read only from `file`,
  `untitled` and notebook-cell documents, so the output panel no longer files
  time under `log`. #fix
- `src/core/dashboardModel.ts` - the grid was aggregated from the Monday before
  the window while every total used the window, so a busy day the page did not
  count could set the legend and squash the year; the padding is blank now. The
  window is 52 whole weeks, because 365 days holds today's weekday one extra
  time and "busiest weekday" named it on that alone. Milestones use lifetime
  figures like the card beside them, instead of two windowed rows and one
  lifetime row in one table. `describeHours` no longer says `00:00 to 00:00`
  for a night across midnight. #fix
- `src/ui/report.ts` - the report panel never re-rendered on its own; open
  across midnight or through an afternoon it kept the numbers from its last
  click. It refreshes like the dashboard now, and both sync the store first so a
  second window's minutes appear. `src/ui/dashboard.ts` also redraws on reveal,
  since a retained panel showed an hour-old today. #fix
- `src/ui/dashboardHtml.ts` - "In blocks" read 100% on a day with nothing
  written, because it was `100 - typed` and `typed` was 0. #fix
- `src/core/migrate.ts` - a project entry with a total but no folders lost all
  of its time; the total goes to the root now. `src/core/report.ts` - CSV
  fields starting with `=`, `+`, `-` or `@` are prefixed so a client name
  cannot run as a formula. `src/core/format.ts` - `duration(59.7)` printed
  `60s`. `src/extension.ts` - the tracker and store were disposed twice, and
  `almanac.exportCsv` opened the report panel twice. #fix

### 2026-08-20 (filters, day drill-down, 1.3.0)

Review findings fixed before the commit:

- `src/core/dashboardModel.ts` - `weekHoursLegend`. The matrix was shaded against
  the busiest single hour while the legend beneath it printed thresholds cut
  against the busiest whole *day*, so every bound it named was several times too
  large. Two scales on one screen need two legends. Pinned by a test that asserts
  the two legends' top stops differ, which is the assertion whose absence let it
  through. #fix
- `recentDays` is now cut against the year's busiest day rather than the busiest
  of its own seven, so a quiet Tuesday cannot be the hottest square on a screen
  that also shows the grid. Same class of bug as the legend. #fix
- The Lifetime card is now "All time on record" and says days past
  `almanac.retentionDays` are pruned. Calling a retention-bounded total a
  lifetime was the same dishonesty the card's own comment complained about.
- `src/ui/shell.ts` - the strip's extra line is a plain string escaped here,
  not raw HTML trusted to the caller. A raw-HTML parameter guarded only by a
  comment rots.
- `src/ui/dashboard.ts` - `isDayKey` round-trips through `dateOf`/`keyOf`, so
  `2026-99-99` is rejected rather than rolled over into an empty month name.
- `src/ui/report.ts` - filter keys capped at 500. Every key is tested against
  every folder of every day in range.
- `docs/mockups/README.md` - the samples use inline style attributes and their
  own palette, both of which the panels forbid. Says why that is fine in a
  `file://` page, so the directory does not read as the repo ignoring its own
  rules. `preview/` is gitignored as build output.

- `src/core/report.ts` - `include`, `matches`, `selectionKey`/`parseSelection`
  and `filterOptions`. Rows are now summed folder by folder rather than taken
  from `ProjectRecord.seconds`, because a folder filter can only be applied at
  that level. A folder key matches by path prefix, so `src` covers `src/core`;
  matching the exact path only would report a fraction of the work and look like
  the filter had eaten it. `foldersOf` falls back to a single root entry for
  days migrated from schema 1, which have a repository total and no folder
  detail: without it a filtered report could come out smaller than the
  unfiltered one for old days. #decision
- `filterOptions` reads the unfiltered days on purpose. Options built from the
  filtered set vanish as they are used, which leaves no way back. #decision
- `src/core/dashboardModel.ts` - `WindowName` and `windowRange(name, today)` are
  gone; the dashboard is a fixed 365 days. The window tabs were four labels for
  the same question, and worse, `averageDay` and `activeDays` silently changed
  meaning between them. `dayDetail` builds a single day through `totalsFor` over
  a one-day range, so a day cannot disagree with the year. #breaking
- Cell tooltips gained the busiest repository and language via `busiestKey`.
  Still no new storage: both are the day's own top entries.
- `src/ui/dashboard.ts` - holds `selectedDay`. The Close button posts the same
  `day` message with an empty date, so there is one path in and one out, and the
  date is regex-checked before reaching the model because a webview is untrusted
  input. Same for the report's filter keys.
- `src/ui/dashboardHtml.ts` - three tabs, When and How merged. Squares are
  `role="button"` with `tabindex` and an Enter/Space handler, so the drill-down
  is reachable without a mouse.
- `test/heatmap.test.ts` - the window-tab tests were deleted with the feature and
  replaced by ones covering the fixed range, the tooltip contents and the day
  drill-down. Not weakened to pass: the behaviour they described no longer exists.

### 2026-08-20 (panel redesign, built)

- `src/ui/shell.ts` - new. The strip, tab bar, panes, cards, bars and legend
  both panels share. The dashboard and the report are the same page with a
  different default tab, so writing the shell twice would have guaranteed drift.
- `src/ui/dashboardHtml.ts`, `src/ui/reportHtml.ts` - rebuilt on that shell as
  four and two tabs. Progress-bar lists became tight tables with the bar reduced
  to a 68px cell, which is the only change that actually removed the crowding:
  the bars were carrying five different kinds of fact and reading as one texture.
- `src/ui/dashboard.ts`, `src/ui/report.ts` - each panel now owns its open tab
  and passes it into the renderer. The dashboard re-renders every 30 seconds and
  on every theme change, so a tab held only in the webview would snap back to
  the first one while being read. The webview toggles classes itself and the
  message only records the choice; re-rendering on it would make the click
  flicker. #decision
- `src/core/aggregate.ts` - `weekHours`, 7 rows of 24. Derived, not stored:
  `DayRecord.hours` plus the date is enough, so the weekday-by-hour grid costs
  no schema change and keeps the no-event-log rule intact. Shaded against its
  own busiest cell, because an hour of a Tuesday and a whole Tuesday are
  different quantities and one scale would leave every cell in the coldest band.
- `src/core/dashboardModel.ts` - `weekHours`, `recentDays`, `busiestWeekdayLabel`
  and `lifetime`. Lifetime is read from every day on record rather than the
  window: a month view claiming four hours tracked in total reads as data loss,
  not as a filter. #decision
- `src/ui/style.ts` - strip, tabnav, panes, twelve-column grid, tight tables,
  matrix, sparkline and client stack. Surfaces still come from
  `var(--vscode-*)`; the brand still supplies only accent, type and radius.
- `scripts/preview-panels.ts`, `npm run preview` - renders the shipping markup
  to `docs/mockups/preview` with a stand-in for VS Code's theme variables. A
  layout change was otherwise unreviewable without an extension host, and a
  mockup does not prove the real renderer produces the same page.
- `test/panelHtml.test.ts`, `test/aggregate.test.ts` - the strip must sit outside
  every pane, exactly one pane may be open, the caller decides which, and the
  weekday grid must not leak an hour across weekdays.

### 2026-08-20 (panel redesign, samples)

- `src/ui/report.ts` - the report panel never set `iconPath`, so its tab showed
  VS Code's generic webview glyph while the dashboard showed the Almanac mark.
  Same one-liner the dashboard already had. #fix
- `docs/mockups/` - five standalone HTML samples of a redesigned dashboard and
  report, on fake data covering every tracked figure, for Akhshy to pick from
  before any panel code changes. Browser-only review artefacts, not shipped.
  A sixth, `6-hybrid.html`, followed his review: Console's density with Focus's
  tabs, plus a stat strip that survives tab switches so navigation never hides
  the headline numbers.
- `eslint.config.mjs` - ignore `docs/mockups/**`. It is browser HTML with
  `window` and `document` globals and no TypeScript, so the extension's lint
  config has nothing useful to say about it. #decision

### 2026-08-20 (heatmap)

- `src/ui/style.ts` - `--heat-0` was `var(--vscode-editorWidget-background)`,
  which is the exact value `.card` paints behind it, so every day with no
  activity rendered invisible and a year of work read as a few floating blobs.
  Now a tint of `--vscode-foreground`, which stays visible in light, dark and
  high contrast without picking a literal colour.

- `src/core/dashboardModel.ts`, `src/ui/style.ts` - month labels collided. The
  row was a flex of one 12px span per week while a month name needs about 22px,
  so `Jul` and `Aug` printed over each other and read as `JulAug`. The row is
  now a grid sharing the calendar's column template, each label placed with
  `grid-column: <col> / span <n>` through `DynamicStyles`, and a month with
  fewer than `MIN_LABEL_COLUMNS` is dropped rather than squeezed. `#decision`

- `src/core/dashboardModel.ts` - added a weekday gutter, and padded the trailing
  column to seven cells so rows stay aligned with it. Only alternate rows are
  labelled; seven labels at a 13px row height is unreadable text down the side.

- `src/core/aggregate.ts` - `heatmap` returns the scale it cut against, not just
  the cells. A legend reading "Less to More" says nothing, and levels are
  relative to the busiest day in the window, so the same shade means different
  things in different windows. The legend is the only place that can say so, and
  it needed the thresholds to do it. `#breaking`

- `src/core/dashboardModel.ts` - the week window shows day rows rather than the
  grid. Seven squares in one column has no shape to read and no way to tell
  Tuesday from Thursday. Each row names the day, its duration, and the stretch
  of the day the work fell in, derived from the hour buckets rather than stored:
  Almanac keeps totals, not a timeline, so this is the span that had activity
  and not a claim the whole span was worked. `#decision`

- `test/heatmap.test.ts` - added. Asserts the three reported bugs specifically:
  no two month labels can overlap at any window, `--heat-0` is not the card
  colour, and every column is seven rows tall with each cell in the row its
  weekday claims. All three shipped with a full green suite, because nothing was
  testing the rendered geometry.

### 2026-08-20 (design system)

- `design-system/` - added as a git submodule, matching how the website,
  learning portal and community apps consume it. Vendoring a copy would have
  been simpler and would have guaranteed drift; the submodule means a brand
  change is a bump plus `npm run tokens`, and any divergence shows as a diff in
  the generated file. `#decision`

- `scripts/build-brand.mjs`, `src/ui/brand.ts` - generate the brand primitives
  Almanac uses from `design-system/design-tokens.json`, and copy the webfonts
  out of the `@fontsource` dev dependencies into `media/fonts/`. `brand.ts` is
  checked in so a clone without submodules still typechecks; `media/fonts/` is
  gitignored because it is a binary copy that `npm run build` regenerates.

- `src/ui/style.ts` - `SHARED_STYLES` became `sharedStyles(fonts, theme)`. The
  hybrid it implements: surfaces from `var(--vscode-*)` so a panel belongs
  inside any theme including high contrast, identity from the design system
  (accent, Space Grotesk, IBM Plex Mono, radius and spacing scale). A panel that
  ignores the editor's theme looks broken; one that ignores the brand looks like
  nobody made it. `#decision`

- `src/ui/panel.ts` - `brandTheme()` reads
  `vscode.window.activeColorTheme.kind`, not `prefers-color-scheme`. The design
  system's `tokens.css` falls back to the OS when no `data-theme` is set, which
  is wrong inside an editor: a dark VS Code on a light machine would get the
  light accent. Both high contrast kinds map to the side they belong to. Panels
  re-render on `onDidChangeActiveColorTheme`, since the accent that holds AA
  changes with it. `#decision`

- `test/panelHtml.test.ts` - added. Renders both panels and asserts the things
  that fail silently rather than loudly: no inline `style` attribute anywhere
  (the CSP has no `unsafe-inline`, and a nonce cannot cover an attribute), every
  generated class actually used, no `connect-src` in the policy, the fonts
  declared and pointed at bundled files, a repository named like markup rendered
  as text, and the accent flipping with the theme argument rather than a media
  query. The CSP regression this guards against had no coverage at all when it
  shipped.

- `eslint.config.mjs` - ignores `design-system/**`, which is a separate repo
  with its own conventions and lint setup.

### 2026-08-20 (review pass)

- `src/ui/webview.ts`, `src/ui/dashboardHtml.ts`, `src/ui/style.ts` - the CSP
  dropped `'unsafe-inline'` from `style-src` in favour of a nonce, but a nonce
  applies to `<style>` elements only; inline style *attributes* fall under
  `style-src-attr` and no nonce can satisfy them. Every bar and punchcard column
  carried its value in a `style="width:..."` attribute, so the dashboard would
  have rendered every bar at zero. Added `DynamicStyles`, which collects
  data-driven dimensions into generated classes emitted inside the nonced
  stylesheet, and moved the fixed ones into `style.ts`. There are now zero
  inline style attributes in either panel. `#decision`

- `src/core/presence.ts`, `src/tracking/signals.ts` - signals gained a `source`
  of `human` or `machine`. Unbounded machine evidence was crediting time nobody
  worked: a focused window with `tail -f`, a watch task, a `Command`-kind
  selection change from any extension, notebook cell output, or an agent editing
  the file you have open would each hold the clock open indefinitely. Machine
  evidence now extends a human-opened clock for at most `MACHINE_GRACE_WINDOWS`
  (2) idle windows and can never open one, so a lunch break behind a running dev
  server costs 30 minutes rather than 90. This is not the old two-tier bug
  returning: the human tier is `window.state.active`, which sees terminal
  keystrokes, which is exactly what the old editor-only tier could not.
  `#decision`

- `src/tracking/signals.ts` - `countTerminal` and `countDebug` were dead
  settings. `sample()` credited any interaction in a focused window and the
  settings only chose a *label*, so turning `countTerminal` off recorded the
  same time under the `window` bucket. The settings check moved into
  `activeSurface()`, which now returns undefined for a suppressed surface.

- `src/tracking/signals.ts` - `followOutput` had no dispose guard, so a reader
  on a never-ending command kept calling `signal()` after deactivate. Readers
  are tracked in a set and aborted on dispose.

- `src/core/migrate.ts` - added `UnreadableDatabase`. Parseable JSON with a
  `days` field that is not a map used to return an empty database, which the
  store then wrote back over the original within seconds. It also ignored
  `version` entirely, so an older build reading a newer file silently dropped
  every field it did not recognise. Both now throw and are quarantined.
  `#breaking`

- `src/storage/store.ts` - a failed write cleared `dirty` and swallowed the
  error, so a full disk during the final flush on deactivate lost the session
  with nothing left to retry. The catch restores `dirty`. Quarantine filenames
  are timestamped so a second casualty cannot discard the first. `retentionDays`
  is guarded with `Number.isFinite`: VS Code does not coerce a settings value
  that violates the contributed schema, and `"abc"` produced a `"NaN-NaN-NaN"`
  cutoff key that pruned every day.

- `src/tracking/tracker.ts` - a suspend longer than `SUSPEND_MS` now resets
  `wasActive`, so resuming after a closed lid counts as a new session.

- `src/tracking/projects.ts` - `onDidChangeWorkspaceFolders` re-warms rather
  than only clearing, so adding one folder no longer costs a tick of attribution
  for every folder already open.

- `test/store.test.ts` - added. The store had no tests at all; these cover
  quarantine, the retention guard, and that a failed write is retried rather
  than lost.

- `scripts/smoke.mjs` - the original version set `windowActive` and fired a
  shell execution together, so it could not tell which mechanism was working.
  Split into four phases: the `state.active` poll alone with no shell execution,
  `countTerminal: false` actually suppressing, focus loss stopping the clock,
  and machine output failing to open a clock no person opened.

### 2026-08-20

- `src/**`, `test/**` - rewrote the extension. The reported symptom was a full
  day in VS Code recording as a few minutes for a user who works mostly in the
  terminal. `#decision` `#breaking`

  Root cause: the old `tracking/signals.ts` had two tiers. `note()` opened the
  clock and was reachable only from an editor keystroke, cursor move or scroll.
  `extend()` was gated on `withinIdle(now, lastDevice)` where `lastDevice` was
  written only by `note()`. Terminal typing raises no VS Code event, so after
  one idle window `extend()` became a permanent no-op and the clock could not
  reopen until the user clicked into a text editor.
  `onDidStartTerminalShellExecution` fired once per command and, by design,
  could not open the clock either.

  Fix: one tier. Focused window plus any signal inside the idle window, with
  `window.state.active` polled per tick to catch input that raises no event.
  Idle window default raised 5 to 15 minutes, since focus now bounds the
  generosity rather than signal type. Rejected alternative: keep two tiers and
  promote terminal signals only. That would have fixed the reported symptom and
  left the identical hole for the Simple Browser, webviews and the settings
  editor, which is how the original bug was written in the first place.

- `src/core/project.ts`, `src/tracking/projects.ts` - attribute time to the git
  repository rather than the opened workspace folder name, with a folder tree
  beneath it. A monorepo subfolder now rolls up to its repository and is still
  distinguishable from the repository root. `#breaking`

- `src/core/migrate.ts` - added, replacing an implicit trust in whatever JSON
  was on disk. Every field is validated on read, so a corrupt field costs that
  field and never the whole history.

- `src/storage/store.ts` - writes are now temp-file-plus-rename, and an
  unreadable database is quarantined rather than overwritten.

- `src/ui/onboarding.ts`, `media/walkthrough/*` - added a five step walkthrough
  shown on first install, plus `Almanac: Show the introduction`.

- `src/core/presence.ts:explain`, `src/ui/statusBar.ts` - the clock now explains
  itself, in the status bar tooltip and via `Almanac: Why am I idle right now?`.
  A tracker nobody can interrogate is a tracker nobody believes.

- `src/core/activityClock.ts` - deleted, replaced by `src/core/presence.ts`. The
  name was part of the problem: it described a clock, but the file it lived
  beside ranked signals by how much they resembled a keyboard. `#breaking`

- `src/core/merge.ts` - deleted. It merged two databases for an import path that
  no command ever called, and it carried its own copy of the day-folding rules,
  which is exactly how two code paths drift apart. Re-add it with a command
  attached if importing is ever wanted.

- `src/tracking/assistants.ts` - deleted. It tried to identify which coding
  assistant produced a block of text by looking at installed extensions. That is
  a guess presented as data, and it contradicts the rule in `composition.ts`
  that a block is never attributed to a tool.

- `scripts/make-icon.py` - deleted. It regenerated `media/icon.png`, which has
  not changed in three releases and is now checked in as the artefact rather
  than as a recipe with a Python dependency.

- `scripts/smoke.mjs` - added, run by `npm run smoke`. Loads the built bundle
  against a stub VS Code API and drives a terminal-only stretch end to end. It
  exists because the bug that caused this rewrite was invisible to unit tests:
  every rule was individually correct, and the fault was in how `signals.ts`
  wired them together. This asserts the wiring: commands register, terminal-only
  work credits time, the repository tree resolves, losing focus stops the clock.

- `eslint.config.mjs` - scoped the strict rule block to `src/**` and `test/**`
  and gave `scripts/**/*.mjs` Node globals, since the smoke harness reports its
  results by printing them.

- `.vscodeignore` - excluded `dist/test/**`, `AGENTS.md` and `CLAUDE.md`. The
  published package was shipping the compiled test suite and the agent
  instructions; the vsix went from 25 files to 14.

- `src/**`, `test/**` - removed the 2-line `ABOUTME:` banner from every file at
  the author's request, and dropped the convention from `AGENTS.md`.

- `package.json` - engine raised to `^1.94.0` for `window.state.active` (1.87),
  `onDidStartTerminalShellExecution` (1.93) and `onDidChangeActiveStackItem`
  (1.94). Renamed `almanac.tracking.enabled` to `almanac.enabled`,
  `trackTerminal` to `countTerminal`, `trackDebug` to `countDebug`. `#breaking`
