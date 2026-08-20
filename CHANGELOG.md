# Changelog

All notable changes to Almanac are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Almanac follows
[semantic versioning](https://semver.org/spec/v2.0.0.html).

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
