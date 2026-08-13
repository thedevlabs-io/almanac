# Changelog

All notable changes to Almanac are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.3.0] — 2026-08-13

Time tracked now matches time worked.

The clock only ever listened for typing, cursor moves and saves inside a text
editor, and gave up two minutes after the last one. Everything else a working
day is made of — running the test suite, stepping through a debugger, reading a
file you scroll but never touch — was scored as idle, so tracked time came in
well under real time.

### Added

- **Terminal work counts**: switching to a terminal, and starting a command in
  it through shell integration (VS Code 1.93+, probed at runtime so older builds
  are unaffected). Only the *start*, because a command that outlives the idle
  window is the kind you walked away from, and only in the *active* terminal.
  Off via `almanac.trackTerminal`.
- **Scrolling counts**, in the editor you're actually in, when the top line
  really moved — a pane resize is not a scroll.
- **Stepping in the debugger counts** (VS Code 1.94+, probed at runtime), with
  `almanac.trackDebug` to turn it off: a session that stops on its own, like a
  crash loop under `restart`, lands on a new frame exactly as a step does, and
  nothing in the API separates them. Starting a session and changing breakpoints
  deliberately do **not** count — the debug adapter fires both by itself.
- **Typing outside a saved file counts** — untitled buffers, notebook cells.
  Only files are still counted towards edits, saves and distinct-file totals.
- `almanac.idleMinutes` (1–30) to set the tail yourself.

### Changed

- The idle window default moved from 2 minutes to **5**. Reading a paragraph or
  watching a build no longer stops the clock.

### Fixed

- **Saving no longer counts as input.** VS Code reports an extension's `save()`
  as `Manual`, exactly like your Ctrl+S, so with `files.autoSave` — or any agent
  that saves what it wrote — a machine's save credited time as though you were
  there. A save of your own follows the typing that already counted, so nothing
  real is lost. Saves are still counted in the day's totals; they just no longer
  move the clock.

- **Opening a window no longer credits time on its own.** The clock started as
  though input had just happened, so a window restored on login and left alone
  banked an idle window's worth of time. It now starts shut and opens on the
  first thing you do.

### Security of the number

- **A machine signal can hold a clock open, never start one.** Terminal commands
  and debug steps now only extend a clock a keyboard or pointer opened, because
  an agent shows the terminal it works in — which makes it the active one — and
  a crash loop lands on a stack frame just as a step does. Whatever an extension
  is doing, it cannot claim more than one idle window past the last thing you
  actually did.

### Unchanged

- The rule itself: focused **and** a human signal inside the idle window. No path
  credits time without both, a tick is still capped at its own length, and
  regaining focus alone still does not restart the clock.
- **Every edit is still counted, whoever made it** — yours, a paste, a refactor,
  an agent — split by how the text arrived, not by who is guessed to have
  written it. Widening the clock changes *when time is credited*, never *what is
  counted*.
- No network code, no events stored, no file names or paths recorded.

### Internal

- `tracking/` split by job: `signals.ts` answers "is a person here?",
  `tracker.ts` records what was produced, `settings.ts` caches configuration so
  scroll and selection events don't re-read it many times a second.
- The scroll rule moved into `core/activityClock.ts` as `isHumanScroll`, where
  the rules that define a tracked minute live and can be tested.

## [0.2.0] — 2026-08-07

Reporting for client work.

### Added

- **Client reports** over a date range (this/last month, last 7 or 30 days, all
  time), grouped by client then project, with a per-day breakdown.
- **Client labels** map several folders onto one client
  (`almanac.clients`, set via **Almanac: Set the client for this project**).
- **Rounding** per client per day — 15m, 30m or 1h — alongside exact time.
- **CSV export**: one row per day per project, for a spreadsheet or invoicing tool.
- **Day drill-down**: click a day in the heatmap for its projects, languages,
  hours, files, saves and commits.
- Reports cover editor time only, which the report states plainly.

## [0.1.0] — 2026-08-07

First release.

### Added

- **Streaks** by calendar day, current and longest, with a configurable bar
  (`almanac.streak.minMinutes`, 5 by default) so a two-minute visit does not
  keep a streak alive.
- **A year of days** as a GitHub-style heatmap, shaded relative to your own
  range rather than a fixed scale.
- **Languages** — time, days, current and longest streak each, with per-language
  mini heatmaps.
- **Projects**, by workspace folder name.
- **A 7x24 punchcard** of when you actually work, and your busiest hour.
- **Commits per day**, authored by you, via the built-in Git extension.
- **Milestones** as a quiet list — no popups.
- **How the code arrived** — typed characters versus characters that landed in a
  block, with installed AI assistants listed as context. Deliberately not framed
  as "AI vs human": no extension API can distinguish an autocomplete accept from
  a paste or an agent write, so Almanac measures what it can see and says so.
- **Status bar** showing the current streak and today active time.
- **Export to JSON** and **delete all data**, from the dashboard or the palette.

### How time is counted

A minute counts only when the window has focus **and** there was a keystroke,
cursor move or save within the last two minutes. A single tick can never credit
more than its own length, so a suspended machine cannot bank hours on wake.

### Privacy posture

- **No network code**, at all.
- **Daily aggregates only** — never an event log.
- **No file names, paths or contents.** Files touched is a count; projects are
  the workspace folder name, and `almanac.trackProjects` turns that off.
- Everything lives in the extension own global storage; nothing is written into
  your workspace.

### Fixed before release, from a review pass

- **Two VS Code windows no longer overwrite each other's history.** Each window
  runs its own extension host; writes now re-read the file and merge additively
  inside a serialized queue, instead of replacing it wholesale.
- **Writes are atomic** — written beside the real file and renamed — so being
  killed mid-write can't truncate two years of history. A file that won't parse
  is preserved as `activity.corrupt.json` and tracking pauses rather than
  overwriting it.
- **Pausing actually pauses.** Edit, save and file counters kept recording while
  paused; every handler now returns early.
- **Time is only credited for human input.** Regaining window focus, a formatter
  or agent writing a file, and an extension opening a document all used to hold
  the clock open. Now only cursor movement, saves, and keystroke-sized edits in
  the editor you're looking at count — which matters most precisely because this
  extension also measures agent-inserted blocks.
- Commits: a repo whose `user.email` can't be determined is skipped rather than
  counting the whole team, and commit days outside the retention window no longer
  create records that retention immediately prunes.
- The last few seconds of work are flushed on shutdown rather than dropped.

### Internal

- No runtime dependencies. Type-aware ESLint and a `node:test` suite over the
  pure modules — the activity rule, streaks and rollups.
