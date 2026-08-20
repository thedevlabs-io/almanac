## One local file, no network

Almanac has no network code. There is no account, no sync, no telemetry, and the
dashboard's content security policy has no `connect-src`, so the panel cannot
make a request even if some future change tried to.

Everything lives in one JSON file in VS Code's global storage for this
extension. It holds one aggregate record per calendar day:

- seconds worked, split by hour, language, repository and kind of activity
- counts of edits, saves, distinct files, sessions and your own commits
- how much text was typed against how much arrived in blocks

It does not hold file names, file paths, file contents, terminal output, commit
messages, or any record of *when* you pressed a key. A day is a total, not a
timeline.

**Almanac: Export my data to JSON** hands you the whole file.
**Almanac: Delete all tracked data** destroys it.
