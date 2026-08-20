# Almanac

Local-only heatmaps and streaks for how you actually work. Days, languages,
repositories and hours, tracked honestly, on your machine and nowhere else.

## What counts as work

The clock runs when two things are true at once.

**Your window has focus.** Switch to a browser or Slack and the clock stops
immediately. This is what stops a focused window on a second monitor from
banking a meeting you were not in.

**Something happened in the window recently.** Anything does:

- typing, scrolling or moving the cursor in a file
- running a command in the terminal, and output arriving from one
- stepping through a debugger, or a task running
- switching tabs, opening a preview, using the Simple Browser

"Recently" is 15 minutes by default (`almanac.idleMinutes`), so reading a long
file or thinking is not scored as idle.

### Why terminal work counts

Typing in the integrated terminal raises no event an extension can observe. VS
Code, however, tracks whether its own window has been interacted with recently
and exposes that as `window.state.active`. Almanac polls it. That single fact
covers terminal keystrokes, the Simple Browser, webviews and the settings
editor, none of which reach an extension any other way.

For the case that misses, watching a twenty minute test run without touching
anything, Almanac follows the output stream of running shell commands. Only the
fact that output arrived is used. The bytes themselves are never inspected.

That second mechanism is bounded, because output proves work is happening and
not that you are still in the chair. Machine evidence (command output, a watch
task restarting, an agent editing an open file, a debugger landing on a frame)
extends a clock you opened for at most **twice the idle window**, 30 minutes at
the default, past the last thing you actually did. It can never open a clock on
its own. So a focused window running `tail -f` while you are at lunch stops
counting after half an hour rather than banking the whole break.

If the count ever looks wrong, run **Almanac: Why am I idle right now?**. It
tells you exactly what state the clock is in and why.

## Repositories, not folders

Almanac walks up from each folder you open until it finds a `.git` entry, and
records your time against that repository.

Open a monorepo, or open one package inside it, and both land in the same place:

```
acme-platform            6h 40m
  └ apps                 4h 10m
      └ web              4h 10m   opened directly
  └ services             2h 30m
      └ billing          2h 30m   opened directly
```

Folders you never opened on their own, `apps` and `services` here, carry only
the total of what is beneath them, which is what makes the ones you did open
distinguishable.

Stored: the repository folder name, and the path from the repository root to the
folder you opened. Never an absolute path, never a file name. Turn it off with
`almanac.trackProjects`.

## Privacy

There is no network code. No account, no sync, no telemetry. The dashboard's
content security policy has no `connect-src`, so the panel cannot make a request
even if some future change tried to.

Everything is one JSON file in this extension's global storage, holding one
aggregate record per calendar day: seconds split by hour, language, repository
and kind of activity; counts of edits, saves, distinct files, sessions and your
own commits; and how much text was typed against how much arrived in blocks.

It does not hold file names, paths, contents, terminal output, commit messages,
or any record of when you pressed a key. A day is a total, not a timeline.

- **Almanac: Export my data to JSON** gives you the whole file.
- **Almanac: Delete all tracked data** destroys it.

## Reading the dashboard

Six figures sit across the top and stay there: today, the last 365 days, your
average active day, days active, the streak, and commits. Under them are three
tabs, and whichever one is open those six do not move.

**Activity** is the calendar grid, one square per day of the year, with weekday
labels down the side and month labels across the top. Levels are cut against
your busiest day rather than a fixed number of hours, so a part-time week and a
full-time week both have shape, and the legend names what each shade is worth.
Hovering a square names the day, the time, and the repository and language most
of it went to. Clicking one opens that day underneath: the hours it spanned, its
repositories and folders, languages, what held the clock open, and the counts.
Beside the grid are the last seven days, your milestones, the raw tallies, and
your lifetime figures, which are deliberately not windowed.

**Where** is the repository tree and the language split.

**When and how** folds the year into 24 hours, then into a weekday-by-hour grid
shaded against its own busiest hour, so it answers whether your Saturdays look
like your Tuesdays. Beside it: what held the clock open, and how much text was
typed against how much arrived in blocks.

There is no week, month or quarter control. The grid already shows every day and
the table already shows the last seven, and a range control made figures like
"average day" mean something different without saying so.

## Reading the report

The report is the same page, billing instead of activity. Its strip carries the
billable and tracked totals, the working days, the client count and the rounding
in force. Above the tabs is a filter: one checkbox per repository and one per
folder inside it, with the time each holds. Tick a few and both tables and the
CSV cover exactly those. Ticking a folder includes everything beneath it, and
an export made under a filter is named `-filtered` so it cannot be mistaken for
the whole range months later.

**By client** maps repository time to clients, with an unmapped repository
billing under its own name rather than disappearing. **Day by day** is one row
per client per day, which is the shape the CSV takes.

## Branding

Almanac's panels use [The Dev Labs design system](https://github.com/thedevlabs-io/design-system),
consumed as a git submodule exactly as the website, learning portal and
community apps do. `npm run tokens` regenerates `src/ui/brand.ts` from
`design-system/design-tokens.json` and copies the webfonts into `media/fonts/`,
so bumping the submodule is all it takes to follow a brand change.

The split is deliberate. Backgrounds, text and borders come from
`var(--vscode-*)`, so a panel belongs inside whatever theme you run, high
contrast included. The design system supplies what carries identity: flask
orange for the heat ramp, bars and punchcard, Space Grotesk and IBM Plex Mono,
and the token radius and spacing scale.

Light and dark are decided by **VS Code's active colour theme**, never by the
OS. A dark editor on a light machine gets a dark-appropriate accent, which is
the opposite of what a `prefers-color-scheme` media query would do. The accent
darkens to `#d9660c` as text on light themes to hold AA contrast.

The fonts ship inside the extension and load through webview URIs. The CSP
allows `font-src` from the extension's own resources and nothing else, so there
is still no path by which a panel can reach the network.

## Commands

| Command | What it does |
|---|---|
| `Almanac: Open dashboard` | Heatmap, languages, repositories, punchcard, milestones |
| `Almanac: Open report` | Time per client per day, with optional rounding |
| `Almanac: Why am I idle right now?` | Explains the clock's current state |
| `Almanac: Show the introduction` | Reopens the walkthrough |
| `Almanac: Pause tracking` / `Resume tracking` | Stops and starts recording |
| `Almanac: Set the client for this repository` | Maps a repository to a client |
| `Almanac: Export report as CSV` | Writes the report as CSV |
| `Almanac: Export my data to JSON` | Writes the whole database |
| `Almanac: Delete all tracked data` | Deletes everything |

## Settings

The defaults are meant to be right without being touched.

| Setting | Default | Meaning |
|---|---|---|
| `almanac.enabled` | `true` | Track at all |
| `almanac.idleMinutes` | `15` | How long the clock runs after the last signal |
| `almanac.countTerminal` | `true` | Count terminal work, including output arriving |
| `almanac.countDebug` | `true` | Count debug stepping |
| `almanac.trackProjects` | `true` | Record repository and folder names |
| `almanac.trackGitCommits` | `true` | Count commits you authored |
| `almanac.statusBar.enabled` | `true` | Show the status bar item |
| `almanac.streak.minMinutes` | `5` | Minutes a day needs to count towards a streak |
| `almanac.retentionDays` | `730` | How much history to keep |
| `almanac.clients` | `{}` | Maps repositories to client names for the report |
| `almanac.report.rounding` | `none` | Rounding per client per day in reports |

## Honesty, stated plainly

Some things are genuinely not knowable from an extension, and Almanac says so
rather than guessing:

- **Authorship of a block of text.** A paste, a formatter, a refactor and a
  coding agent are the same API event. The dashboard splits typed from block and
  refuses to attribute a block to anyone.
- **A debugger that stopped on its own.** A crash loop under `restart` lands on
  a new stack frame exactly as your step does. Hence `almanac.countDebug`.
- **Whether you were reading or staring into space.** A focused window with
  output arriving counts. Fifteen minutes of complete silence does not.

## Requirements

VS Code 1.94 or later. Terminal shell integration must be enabled, which it is
by default, for command and output signals to be seen.

## License

MIT.
