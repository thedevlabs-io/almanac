## The one setting that matters

`almanac.idleMinutes`, default **15**. How long the clock keeps running after
the last sign of activity.

- Raise it if long stretches of reading or thinking are being scored as idle.
- Lower it for a stricter count.

The window still has to be focused, at any value. This setting also sets the
bound on machine evidence: command output can carry the clock for twice this
value past your last real interaction, and no further.

Everything else has a default meant to be right without being touched:

| Setting | Default | Turn it off if |
|---|---|---|
| `almanac.countTerminal` | on | terminal output should not count as presence |
| `almanac.countDebug` | on | you debug crash loops that restart on their own |
| `almanac.trackProjects` | on | a repository name would say more than you want |
| `almanac.trackGitCommits` | on | you would rather not read git logs |
| `almanac.streak.minMinutes` | 5 | a day should need more work to count |
| `almanac.retentionDays` | 730 | you want a shorter history |

`almanac.clients` maps repositories to a client name for the report, and is the
only setting with no sensible default, because it is about your billing and not
about your editor.
