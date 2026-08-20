# Design samples

Six standalone pages exploring how the dashboard and the report could look, plus
`preview/`, which holds the real panel markup rendered by `npm run preview`.

Sample 6 is the one that shipped, as a hybrid of 3's density and 5's navigation.
The other five are kept as the record of what was considered and rejected.

## These are browser pages, not extension code

They are opened directly in a browser, so two of the repo's hard rules do not
reach them and should not be read as being broken here:

- **Inline `style` attributes are fine in this directory.** The rule exists
  because the webviews' CSP has no `'unsafe-inline'` and a nonce covers `<style>`
  elements only. There is no CSP on a `file://` page.
- **They use their own colours.** The real panels take every surface from
  `var(--vscode-*)`. These simulate a VS Code palette instead, because outside
  the editor those variables do not exist.

`preview/` is generated and gitignored. Regenerate it with `npm run preview`
after changing a panel; it renders the shipping markup, so it is the honest way
to review a layout change without launching an extension host.

Delete this whole directory whenever it stops paying for itself. Nothing in
`src/` depends on it, and `scripts/preview-panels.ts` will happily recreate
`preview/` on its own.
