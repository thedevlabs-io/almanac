# Changelog

All notable changes to Almanac are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Almanac follows
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0]

Two VS Code windows made the numbers a mess. This release is the reason why,
and a pass over everything else the audit turned up.

### Fixed

- **Two windows no longer erase each other's day.** Every window runs its own
  copy of Almanac, and each one used to load `activity.json` once and write its
  whole memory back every two seconds, so whichever wrote last won and the
  other window's minutes, sessions and streak days vanished. A window now keeps
  only what it has not yet written and merges that onto the file under a lock,
  so the total is the sum of every window. Nothing needs migrating; the file
  format is unchanged. One consequence: commit counts merge by taking the
  larger reading, so a rebase that squashes today's commits keeps the higher
  figure.
- **The status bar, dashboard and report show every window's time**, not only
  the one you are looking at. They pick up what another window wrote within
  thirty seconds.
- **A window restored at login no longer banks time to an empty chair.** VS
  Code marks a fresh window as recently interacted with for up to 100 seconds,
  and Almanac believed it, which opened the clock for the whole idle window.
  The flag is now trusted only once you have demonstrably done something.
- **Sessions mean something.** A session is now a resumption after the clock
  has been closed for at least five minutes. Before, switching to a browser and
  back was a session, a laptop that slept for two minutes was another, and
  coming back from a real sleep was missed.
- **The heatmap's scale comes from the days it counts.** The grid was drawn
  from the Monday before the window while every total used the window itself,
  so a busy day outside the window could set the legend and squash the year.
- **The dashboard covers 52 whole weeks** rather than 365 days. A 365 day
  window holds today's weekday one more time than the other six, and "busiest
  weekday" was naming it on the strength of that extra sample.
- **Milestones use lifetime figures**, like the "All time on record" card next
  to them. Two of three rows were windowed and nothing on screen said so.
- **The report panel refreshes.** Left open across midnight or through an
  afternoon of work, it kept whatever it showed when last clicked.
- **"In blocks" no longer reads 100% on a day with nothing written.**
- **A late night reads as one stretch.** A day worked from 23:00 to 02:00 was
  described as `00:00 to 00:00`.
- The language table no longer files time under `log` for reading the output
  panel. A repository record with a total but no folders no longer loses its
  time on load. A CSV field starting with `=`, `+`, `-` or `@` is prefixed so a
  spreadsheet cannot run a client name as a formula. `59.7` seconds printed as
  `60s`. The tracker was disposed twice on exit, and **Export report as CSV**
  opened the report panel twice.

### Changed

- Almanac no longer claims to count reading in the Simple Browser or another
  webview. It never could: a webview's keystrokes do not reach the flag VS Code
  exposes. The walkthrough and README say so now.

## [1.3.0]

The dashboard and the report were one long scroll of progress bars. Both are now
one page: headline figures that never move, and tabs beneath them.

### Added

- **Filter a report by repository or folder.** Checkboxes above the tabs, one
  per repository and one per folder inside it, with the time each holds. Tick
  several and the report covers exactly those. It narrows both tables and the
  CSV, and a filtered export is named `-filtered` so it cannot be mistaken for
  the whole range later. Selecting a folder includes everything beneath it:
  picking `src` and getting only the minutes that exact folder was open would be
  a filter that lies. The options come from the unfiltered range, so a filter
  can always be undone.
- **Click a day in the heatmap to open it.** The day expands under the grid:
  the hours it spanned, its repositories and folders, languages, what held the
  clock open, files, saves, commits and how the text arrived. The grid stays on
  screen, because comparing one Tuesday with the last is the reason to click a
  square at all. Hovering now names the busiest repository and language too, so
  finding the day you want does not take a click per square.

### Changed

- **The dashboard covers one rolling year, and the Week, Month, Quarter and Year
  tabs are gone.** They were four ways to ask a question the page already
  answered twice, once in the heatmap and once in the recent-days table, and
  every figure quietly changed meaning between them: "average day" over a week
  and over a year are different claims with the same label.
- **When and How are one tab.** "You work at 14:00, mostly on Tuesdays, and the
  terminal held the clock open" is a single thought about the shape of the work,
  and splitting it made both halves look thinner than they were.

- **The dashboard is tabbed.** Activity, Where, When and How. Above them sits a
  strip of six figures, today, the window total, the average day, active days,
  the streak and commits, that stays on screen whichever tab is open. That strip
  is what earns the tabs the right to hide anything: navigating never costs you
  the numbers you opened the panel for.
- **The report is tabbed too**, By client and Day by day, over the same strip,
  which now states the rounding as a figure instead of burying it in a caption
  under the title. The two panels are the same page with a different default tab.
- **Fewer bars, more numbers.** Languages, signals, milestones and composition
  were five stacked lists of progress bars, which made everything look like one
  texture and gave no exact figures. They are tables now: duration, share, and a
  short bar at the end of the row where a share of a whole is genuinely the point.
- **The panels are denser.** Smaller cards, monospace uppercase headings, and a
  twelve column grid, so a pane can split 7/5 or 8/4 instead of every card
  claiming the full width.

### Added

- **A weekday-by-hour grid.** Seven rows, 24 columns, shaded against its own
  busiest hour rather than the day heatmap's busiest day. It answers what the
  hour-of-day chart could not: whether your Saturdays look like your Tuesdays.
  No new data is stored. A day already keeps 24 hour buckets and knows its own
  date, so the weekday is arithmetic.
- **Lifetime figures on the dashboard**, deliberately not windowed: first tracked
  day, total time, active days, longest streak. Windowing them would make them
  wrong rather than filtered.
- **A recent-days table** on the Activity tab, so the last seven days are legible
  at any window rather than only in the week view.
- **`npm run preview`** writes the real panel markup to `docs/mockups/preview`
  with a stand-in for VS Code's theme variables, so a layout change can be
  reviewed in a browser without launching an extension host.

### Fixed

- **The report panel had no icon.** It never set `iconPath`, so its tab showed
  VS Code's generic webview glyph while the dashboard showed the Almanac mark.

## [1.2.0]

The heatmap was hard to read. Three bugs and a missing idea.

### Fixed

- **Days with no activity were invisible.** `--heat-0` was
  `var(--vscode-editorWidget-background)`, the exact colour of the card painted
  behind it, so an empty day rendered as nothing. A year of work read as a few
  floating blobs with no grid to place them against. Empty cells are now a tint
  of the foreground, visible in light, dark and high contrast alike.
- **Month labels printed on top of each other.** Every week column got a fixed
  12px span while a month name needs about 22px, so `Jul` and `Aug` ran together
  and read as `JulAug`. The month row is now a grid sharing the calendar's
  columns, each label given the columns up to the next month, and a month too
  narrow to print is dropped rather than squeezed.
- **The punchcard tooltip said `9:00, 1234 seconds`.** It now names the hour it
  ends at and the time in hours and minutes.

### Added

- **Weekday labels.** Mon, Wed and Fri down the side of the grid, in a gutter
  that stays put while a year of columns scrolls under it. Tooltips name the
  weekday and a readable date rather than only `2026-08-20`.
- **A legend in real hours.** It read `Less` to `More`, which says nothing.
  Each step now names the duration it tops out at. Levels are cut against the
  busiest day in the window, so the same shade means different things in
  different windows, and the legend is the only thing that can say so.
- **The week window shows named days instead of a single column.** Seven
  squares stacked vertically is a heatmap of nothing: no shape to read, no way
  to tell Tuesday from Thursday. At that range it is now a row per day with the
  day's name, its duration, a bar, and the stretch of the day the work fell in,
  read off the hour buckets. Days with nothing tracked are listed too, because a
  week silently missing Wednesday looks like a week with six days.

## [1.1.0]

### Added

- **The Dev Labs design system**, consumed as a git submodule the same way the
  website, learning portal and community apps consume it. `npm run tokens`
  regenerates `src/ui/brand.ts` from `design-system/design-tokens.json` and
  copies the brand webfonts into `media/fonts/`, so a brand change is a
  submodule bump rather than a hand edit.
- Flask orange `#f47c20` now drives the heatmap ramp, every bar, the punchcard
  and the selected tab. Space Grotesk sets headings and body, IBM Plex Mono sets
  labels, numerals and durations. Radius and spacing come from the token scale.
- Both fonts ship inside the extension and load through webview URIs, so the
  panels look the same on a machine that has never seen them and still cannot
  reach the network. Adds about 52 KB to the package.

### Changed

- Light and dark are selected from **VS Code's active colour theme** rather than
  the OS `prefers-color-scheme` the design system defaults to. A dark editor on
  a light machine would otherwise get a light-theme accent. Both high contrast
  kinds map to the side they belong to, and the accent darkens to `#d9660c` as
  text on light themes to hold AA.
- Surfaces are unchanged and still come entirely from `var(--vscode-*)`. A panel
  has to belong inside the theme someone chose, high contrast included, so the
  brand supplies identity rather than a canvas.

### Fixed

- Panels re-render when the colour theme changes, instead of keeping an accent
  that no longer holds contrast.

## [1.0.0]

A rewrite. The tracking rule, the data model and the panels were all replaced.
Existing data is migrated on first run and nothing is lost.

### Fixed

- **Terminal work is counted.** This is the reason for the rewrite. The previous
  rule required a keystroke inside a text editor to open the clock, and demoted
  every other signal to something that could only extend a clock a keystroke had
  already opened. Typing in a terminal raises no event an extension can see, so
  a day spent in the terminal was recorded as a few minutes of work. The clock
  now opens on any observable activity, and reads VS Code's own
  `window.state.active` flag, which sees interaction with the terminal, the
  Simple Browser, webviews and the settings editor.
- **Long-running commands count.** Almanac follows the output stream of a
  running shell command, so a twenty minute test run or a coding-agent session
  reads as work rather than as idle time. Only the arrival of output is used;
  the output itself is never inspected.
- **Machine activity cannot count forever.** Output from a running command, a
  watch task restarting, an agent editing an open file and a debugger landing on
  a frame are all real evidence that work is happening, and none of them prove
  you are still at the desk. They extend a clock you opened for at most twice
  the idle window, 30 minutes at the default, and can never open one. A focused
  window running `tail -f` through a lunch break stops counting.
- **A suspended machine credits nothing.** A gap between ticks longer than a
  minute means the host stopped running, and that interval is now dropped rather
  than capped at one tick.

- **`countTerminal` and `countDebug` actually suppress.** Turning them off used
  to change only the label the time was filed under.
- **Webview bars render.** The dashboard's content security policy dropped
  `'unsafe-inline'` for a nonce, but a nonce covers `<style>` elements and never
  inline style attributes, which is where every bar width and column height
  lived. Data-driven dimensions now go through generated classes in the nonced
  stylesheet.
- **A newer or structurally broken database is refused, not overwritten.** A
  file whose `days` field was not a map used to be read as empty and written
  back over the original. A file from a future schema version used to be read
  and silently stripped of every unrecognised field.
- **A failed write is retried.** A full disk during the final flush on
  deactivate used to lose the session silently.
- **A nonsense `retentionDays` no longer deletes everything.** VS Code does not
  coerce a settings value that violates the contributed schema, and a
  non-numeric one produced a cutoff date that pruned every day.

### Added

- **Repository-based project tracking.** Time is attributed to the git
  repository containing the folder you opened, found by walking up for a `.git`
  entry. A monorepo subfolder rolls up under its repository and appears as a
  tree beneath it, with the folders you actually opened distinguished from the
  intermediate ones. Works for worktrees and submodules, where `.git` is a file.
- **An introduction on first install.** A five step walkthrough covering what
  counts as work, why terminal time is counted, how repositories are attributed,
  what is stored, and the one setting worth changing.
- **`Almanac: Why am I idle right now?`** Explains the clock's current state in
  a sentence. The same explanation is in the status bar tooltip.
- **A "where the time came from" breakdown** on the dashboard, splitting the day
  by kind of activity, so a claim that terminal work is being missed can be
  checked rather than argued about.
- **Atomic writes.** The database is written to a temporary file and renamed, so
  a crash mid-write can no longer truncate a year of history. An unreadable file
  is kept as `activity.json.corrupt` rather than overwritten.

### Changed

- **Default idle window is 15 minutes**, up from 5. The clock is now held open
  by anything in the window, and the gaps it has to survive are real ones:
  reading, thinking, waiting on a build. Focus is what bounds the generosity.
- **Minimum VS Code version is 1.94**, for `window.state.active`,
  `onDidStartTerminalShellExecution` and `onDidChangeActiveStackItem`.
- `almanac.tracking.enabled` is now `almanac.enabled`; `almanac.trackTerminal`
  is now `almanac.countTerminal`; `almanac.trackDebug` is now
  `almanac.countDebug`.
- Clients map from repository names rather than workspace folder names.

### Migration

Version 1 stored projects as a flat map of workspace folder name to seconds,
with no record of which repository a folder belonged to. That information was
never captured and cannot be recovered, so each old folder name becomes a
repository of its own with all of its time at the root. That is exactly what
version 1 was claiming. New time lands in the real tree from the upgrade on.

## [0.3.0]

- Counted work the clock was missing, without letting machines claim it.

## [0.2.0]

- Client reports, CSV export and day drill-down.

## [0.1.0]

- First release: heatmap, streaks, languages, projects, hours, milestones.
