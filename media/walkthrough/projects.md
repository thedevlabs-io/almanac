## Time belongs to a repository

Almanac walks up from the folder you opened until it finds a `.git` entry. That
repository is what your time is recorded against.

Open the whole monorepo, or open just one package inside it, and both land in
the same place:

```
acme-platform            6h 40m
  └ apps                 4h 10m
      └ web              4h 10m   opened directly
  └ services             2h 30m
      └ billing          2h 30m   opened directly
```

`apps` and `services` were never opened on their own, so they carry only the
total of what is beneath them. The folders you actually opened are marked.

What gets stored is the repository folder name and the path from the repository
root to the folder you opened. Never an absolute path, never a file name.
Turn it off entirely with `almanac.trackProjects`.
