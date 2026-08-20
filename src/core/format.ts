/**
 * A duration a person would say out loud. Under a minute stays in seconds so a
 * fresh install does not sit at "0m" for its first minute and look broken.
 */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0m";
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** A duration for a dense table cell, where `4h 05m` lines up and `4h 5m` does not. */
export function durationPadded(seconds: number): string {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes < 10 ? "0" : ""}${minutes}m`;
}

/** Decimal hours, the unit an invoice wants. */
export function hoursDecimal(seconds: number): string {
  return (Math.max(0, seconds) / 3600).toFixed(2);
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Display names for the language ids VS Code reports. Only the ones whose id is
 * not already presentable are listed; anything unknown is title-cased, which is
 * right far more often than it is wrong.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  javascriptreact: "JSX",
  typescriptreact: "TSX",
  javascript: "JavaScript",
  typescript: "TypeScript",
  csharp: "C#",
  cpp: "C++",
  objectivec: "Objective-C",
  objectivecpp: "Objective-C++",
  fsharp: "F#",
  php: "PHP",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  json: "JSON",
  jsonc: "JSON with comments",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  sql: "SQL",
  shellscript: "Shell",
  powershell: "PowerShell",
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  markdown: "Markdown",
  plaintext: "Plain text",
  ini: "INI",
  bat: "Batch",
  vue: "Vue",
  svelte: "Svelte",
  graphql: "GraphQL",
  restructuredtext: "reStructuredText",
  latex: "LaTeX",
  ruby: "Ruby",
  rust: "Rust",
  go: "Go",
  python: "Python",
  java: "Java",
  kotlin: "Kotlin",
  swift: "Swift",
  dart: "Dart",
  lua: "Lua",
  perl: "Perl",
  r: "R",
  scala: "Scala",
  haskell: "Haskell",
  elixir: "Elixir",
  erlang: "Erlang",
  clojure: "Clojure",
  zig: "Zig",
};

export function languageName(id: string): string {
  const known = LANGUAGE_NAMES[id];
  if (known) {
    return known;
  }
  return id.charAt(0).toUpperCase() + id.slice(1);
}

/** `3 days ago`, for a heatmap tooltip. */
export function relativeDays(days: number): string {
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${days} days ago`;
}
