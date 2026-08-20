# Journal

## Knowledge

- `src/core/presence.ts` is the only definition of a tracked minute. Focused
  window plus any observable signal inside the idle window. Every signal kind is
  equal on purpose; see the log entry below for why a hierarchy is a bug.
- `vscode.window.state.active` is VS Code's own "has this window been interacted
  with recently" flag. It is the only way an extension can observe a keystroke
  in the integrated terminal, the Simple Browser, a webview or the settings
  editor. It is polled once per tick in `tracking/signals.ts:sample`, not
  subscribed to, because between transitions no event fires.
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
