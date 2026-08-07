// ABOUTME: Human-readable durations, counts and language names for the dashboard.
// ABOUTME: Pure — the same helpers run in the status bar and inside the webview.

/** "1h 23m", "48m", "—" for nothing. Never "0h 0m". */
export function duration(seconds: number): string {
  if (seconds <= 0) {
    return "—";
  }
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) {
    return `${Math.max(minutes, 1)}m`;
  }
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Compact form for the status bar, where space is tight. */
export function shortDuration(seconds: number): string {
  if (seconds <= 0) {
    return "0m";
  }
  const total = Math.round(seconds / 60);
  const hours = Math.floor(total / 60);
  return hours === 0 ? `${Math.max(total, 1)}m` : `${hours}h ${total % 60}m`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * VS Code language ids are lowercase identifiers; these are the ones whose
 * display name isn't just the id capitalised.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  typescript: "TypeScript",
  typescriptreact: "TypeScript React",
  javascript: "JavaScript",
  javascriptreact: "JavaScript React",
  python: "Python",
  csharp: "C#",
  cpp: "C++",
  c: "C",
  objectivec: "Objective-C",
  objectivecpp: "Objective-C++",
  fsharp: "F#",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  json: "JSON",
  jsonc: "JSON with comments",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  markdown: "Markdown",
  shellscript: "Shell",
  powershell: "PowerShell",
  sql: "SQL",
  php: "PHP",
  ruby: "Ruby",
  rust: "Rust",
  go: "Go",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  dart: "Dart",
  lua: "Lua",
  r: "R",
  perl: "Perl",
  haskell: "Haskell",
  elixir: "Elixir",
  clojure: "Clojure",
  scala: "Scala",
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  ignore: "Ignore file",
  properties: "Properties",
  plaintext: "Plain text",
  vue: "Vue",
  svelte: "Svelte",
  graphql: "GraphQL",
  terraform: "Terraform",
};

export function languageName(id: string): string {
  return LANGUAGE_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}
