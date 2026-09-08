import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addProjectSeconds, applyTick, bump, mergeDay, mergeDays, setCommits } from "../src/core/record";
import { emptyDay } from "../src/core/types";

test("merging two records of a day sums every counter", () => {
  let a = applyTick(emptyDay("2026-08-20"), {
    seconds: 60,
    hour: 9,
    language: "typescript",
    kind: "editor",
    project: { repo: "acme", folder: "." },
  });
  a = bump(a, "edits", 4);
  let b = applyTick(emptyDay("2026-08-20"), {
    seconds: 30,
    hour: 9,
    language: "typescript",
    kind: "terminal",
    project: { repo: "acme", folder: "apps/web" },
  });
  b = applyTick(b, { seconds: 15, hour: 23, language: "go" });
  b = bump(b, "sessions");

  const merged = mergeDay(a, b);
  assert.equal(merged.activeSeconds, 105);
  assert.deepEqual(merged.languages, { typescript: 90, go: 15 });
  assert.deepEqual(merged.signals, { editor: 60, terminal: 30 });
  assert.deepEqual(merged.projects, { acme: { seconds: 90, folders: { ".": 60, "apps/web": 30 } } });
  assert.equal(merged.hours[9], 90);
  assert.equal(merged.hours[23], 15);
  assert.equal(merged.edits, 4);
  assert.equal(merged.sessions, 1);
  assert.equal(merged.commits, undefined);
});

test("commits merge by the larger reading, and an absent one does not zero it", () => {
  const day = emptyDay("2026-08-20");
  assert.equal(mergeDay(setCommits(day, 3), setCommits(day, 5)).commits, 5);
  assert.equal(mergeDay(setCommits(day, 5), setCommits(day, 3)).commits, 5);
  assert.equal(mergeDay(setCommits(day, 5), day).commits, 5);
  assert.equal(mergeDay(day, setCommits(day, 5)).commits, 5);
});

test("merging maps keeps days only one side has", () => {
  const a = { "2026-08-20": applyTick(emptyDay("2026-08-20"), { seconds: 60, hour: 9 }) };
  const b = { "2026-08-21": applyTick(emptyDay("2026-08-21"), { seconds: 30, hour: 9 }) };
  const merged = mergeDays(a, b);
  assert.deepEqual(Object.keys(merged).sort(), ["2026-08-20", "2026-08-21"]);
  assert.equal(merged["2026-08-20"]?.activeSeconds, 60);
  assert.equal(merged["2026-08-21"]?.activeSeconds, 30);
});

test("project seconds land on the repository and nowhere else", () => {
  const day = applyTick(emptyDay("2026-08-20"), { seconds: 60, hour: 9, project: { repo: "acme", folder: "." } });
  const after = addProjectSeconds(day, { repo: "beta", folder: "api" }, 45);
  assert.equal(after.activeSeconds, 60);
  assert.deepEqual(after.hours, day.hours);
  assert.deepEqual(after.projects, {
    acme: { seconds: 60, folders: { ".": 60 } },
    beta: { seconds: 45, folders: { api: 45 } },
  });
  assert.equal(addProjectSeconds(day, { repo: "beta", folder: "." }, 0), day);
});

// Two windows, each crediting its own repository for the same hour under
// almanac.concurrentProjects. Only the focused one adds to the day.
test("a merge keeps repository time counted per window above the day total", () => {
  const focused = applyTick(emptyDay("2026-08-20"), { seconds: 3600, hour: 9, project: { repo: "acme", folder: "." } });
  const unfocused = addProjectSeconds(emptyDay("2026-08-20"), { repo: "beta", folder: "." }, 3600);
  const merged = mergeDay(focused, unfocused);
  assert.equal(merged.activeSeconds, 3600);
  assert.deepEqual(merged.projects, {
    acme: { seconds: 3600, folders: { ".": 3600 } },
    beta: { seconds: 3600, folders: { ".": 3600 } },
  });
});
