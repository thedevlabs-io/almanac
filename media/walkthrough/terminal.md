## A day in the terminal is a day of work

Typing in the integrated terminal raises no event an extension can see. Almanac
handles that in two ways:

**It asks VS Code directly.** VS Code tracks whether its window has been
interacted with recently, whatever you were interacting with. That covers
terminal keystrokes, the Simple Browser, webviews and the settings editor.

**It follows running commands.** When a command starts, Almanac notices output
arriving from it. A twenty minute test run, a build, or a coding agent working
in your terminal reads as work rather than as idle time.

Almanac never reads what the output says. It only notices that some arrived.

Output alone is bounded, though. It can keep a clock running for at most twice
the idle window past the last thing you actually did, and it can never start one
in a window where you have done nothing. A `tail -f` left running while you are
at lunch stops counting; a test run you are watching does not.

If you ever think the count is wrong, run **Almanac: Why am I idle right now?**
and it will tell you exactly what it thinks is happening.
