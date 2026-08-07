# Changelog

All notable changes to Cadence are documented here. This project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-08-07

First release.

### Added

- **Streaks** by calendar day, current and longest, with a configurable bar
  (`cadence.streak.minMinutes`, 5 by default) so a two-minute visit does not
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
  a paste or an agent write, so Cadence measures what it can see and says so.
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
  the workspace folder name, and `cadence.trackProjects` turns that off.
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
