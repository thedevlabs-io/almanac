# Almanac

<img src="media/icon.png" width="96" align="right" alt="Almanac logo" />

A [thedevlabs-io](https://github.com/thedevlabs-io) VS Code extension that shows
you how you actually work: a year of heatmaps, streaks by day and by language,
when in the week you're at your sharpest — all measured honestly, and all kept
on your own machine.

## Honest by construction

Most "time in editor" numbers are fiction: they count a focused window whether
or not anyone is at the keyboard. Almanac counts a minute only when **the window
has focus and you typed, moved the cursor, or saved within the last two minutes**.
Walk away and the clock stops. Read code for three minutes without touching
anything and it stops too — which is the honest answer, even when it's the less
flattering one.

A long gap can never bank more than one tick, so a suspended laptop doesn't wake
up and credit you with eight hours.

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
