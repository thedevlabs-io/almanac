# Almanac

<img src="media/icon.png" width="96" align="right" alt="Almanac logo" />

A [thedevlabs-io](https://github.com/thedevlabs-io) VS Code extension that shows
you how you actually work: a year of heatmaps, streaks by day and by language,
when in the week you're at your sharpest — all measured honestly, and all kept
on your own machine.

## Honest by construction

Most "time in editor" numbers are fiction: they count a focused window whether
or not anyone is at the keyboard. Almanac counts a minute only when **the window
has focus and you did something within the last five minutes** — typed, moved
the cursor or scrolled. Walk away and the clock stops. Leave a focused window
untouched and it stops too, which is the honest answer even when it's the less
flattering one.

Honest cuts both ways: work that never moves the editor is still work, so
running a command in the terminal and stepping through a breakpoint count too.
But neither can prove *you* did it — an agent shows the terminal it works in,
and a crash loop lands on a stack frame just as your step does — so these can
only hold open a clock your keyboard already opened. Nothing automated can
claim more than one idle window past the last thing you actually did.

Saving isn't a signal at all. VS Code reports an extension's `save()` call as
"manual", so a save can't tell you from an agent — and a save of your own comes
after the typing that already counted.

Set the tail with `almanac.idleMinutes` (1–30, 5 by default). A long gap can
never bank more than one tick, so a suspended laptop doesn't wake up and credit
you with eight hours.

**Agent-written code is counted, not credited as time.** Every edit lands in the
totals whoever made it, split by how the text arrived — typed a key at a time,
or in a block. What an agent's writing cannot do is make it look as though you
were sitting there.

## What it shows

- **Streaks** — current and longest, by calendar day. A day counts once you pass
  `almanac.streak.minMinutes` (5 by default), so opening the editor to check one
  thing doesn't keep a streak alive.
- **A year of days** — the GitHub-style grid, shaded relative to *your* range, so
  it reads properly whether you work two hours a week or forty.
- **Languages** — time, days, current and longest streak per language, each with
  its own mini heatmap. The language you keep coming back to is usually not the
  one you'd guess.
- **Projects** — where the week went, by workspace folder.
- **When you work** — a 7×24 punchcard, and your busiest hour.
- **Commits** — per day, authored by you, read from open repositories.
- **How the code arrived** — characters you typed one key at a time, versus
  characters that landed in a block. See the note below before reading anything
  into it.
- **Milestones** — a quiet list. No popups, no confetti.
- **Totals** — sessions, files touched, saves, edits, best day, tracking since.

## What Almanac will *not* tell you

It won't tell you how much of your code was written by AI, because nothing
available to an extension can. VS Code exposes no API for whether a completion
came from Copilot, and terminal agents like Claude Code write files the same way
any other tool does.

What it can measure honestly is **typed versus arrived in a block**. An
autocomplete accept, a paste, a multi-cursor edit, a refactor and an agent's
write all land as blocks and are indistinguishable from one another. So the
dashboard reports exactly that, and names the assistants you have installed as
context — never as attribution. A number claiming "43% AI-written" would look
precise and be a guess, which is the one thing this extension is built not to do.

## Reports for client work

**Almanac: Open report** (or the *Report* button on the dashboard) gives you time
by client and by day over a date range.

- **Client labels** — run **Almanac: Set the client for this project** to map a
  folder to a client, so `thedevlabs-api` and `thedevlabs-web` report as one
  line. Unlabelled projects report under their folder name.
- **Ranges** — this month, last month, last 7 or 30 days, all time.
- **Rounding** — round each day up to 15 minutes, 30 minutes or the hour, per
  client per day, the way consultancies bill. Exact time is always shown too.
- **CSV export** — one row per day per project (`date, client, project, hours,
  rounded_hours, seconds`), which drops straight into a spreadsheet or an
  invoicing tool.
- **Day drill-down** — click any day in the heatmap for what it consisted of:
  projects, languages, hours worked, files, saves, commits.

Almanac reports **time spent in the editor**. Time in meetings, browsers,
terminals-only work and thinking away from the keyboard is not tracked, so treat
the report as evidence supporting an invoice rather than the invoice itself.

## Your data

Almanac has **no network access at all**. Everything lives in the extension's own
global storage on this machine.

- **Daily aggregates only.** Never an event log — a timeline of when you touched
  the keyboard would be both creepy and enormous.
- **No file names, no paths, no content.** Files touched is a count. Languages
  are language ids. Projects are the **workspace folder name only**, and
  `almanac.trackProjects` turns even that off.
- **Export** your data to JSON, or **delete** all of it, from the dashboard
  footer or the command palette.
- **Pause** tracking any time with **Almanac: Pause tracking**.

Commit counts come from VS Code's built-in Git extension and are filtered to your
own `user.email`, so pulling your team's work doesn't inflate them. That API
isn't formally stable; if it's unavailable, the feature quietly disappears.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `almanac.tracking.enabled` | `true` | Record activity at all |
| `almanac.trackProjects` | `true` | Record the workspace folder name |
| `almanac.trackGitCommits` | `true` | Count your commits per day |
| `almanac.streak.minMinutes` | `5` | Minutes before a day counts towards a streak |
| `almanac.statusBar.enabled` | `true` | Show streak and today's time in the status bar |
| `almanac.retentionDays` | `730` | Days of history to keep |

## Develop / run locally

```bash
npm install
npm run lint && npm test
npm run build
```

Press **F5** to launch an Extension Development Host.

## License

MIT © thedevlabs-io
