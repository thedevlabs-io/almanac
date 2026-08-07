// ABOUTME: Tests for merging two windows' records and for surviving a damaged file.
// ABOUTME: Both are data-loss surfaces, so they're pinned hard. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeDatabases, mergeDays, normalizeDatabase, normalizeDay } from "../src/core/merge";
import { emptyDay, type DayRecord } from "../src/core/types";
import { applyTick, bump } from "../src/core/record";

function day(date: string, seconds: number, language: string, project: string): DayRecord {
  return applyTick(emptyDay(date), { seconds, hour: 9, language, project });
}

test("two windows' work on the same day adds up rather than replacing", () => {
  const a = bump(day("2026-08-07", 600, "typescript", "cadence"), "saves", 2);
  const b = bump(day("2026-08-07", 900, "rust", "other"), "saves", 3);
  const merged = mergeDays(a, b);

  assert.equal(merged.activeSeconds, 1500);
  assert.equal(merged.saves, 5);
  assert.deepEqual(merged.languages, { typescript: 600, rust: 900 });
  assert.deepEqual(merged.projects, { cadence: 600, other: 900 });
  assert.equal(merged.hours[9], 1500);
});

test("the same language from both windows sums", () => {
  const merged = mergeDays(
    day("2026-08-07", 600, "go", "a"),
    day("2026-08-07", 300, "go", "b")
  );
  assert.equal(merged.languages.go, 900);
});

test("commits are an absolute count, so they take the higher rather than doubling", () => {
  const a = { ...day("2026-08-07", 60, "go", "a"), commits: 4 };
  const b = { ...day("2026-08-07", 60, "go", "a"), commits: 4 };
  assert.equal(mergeDays(a, b).commits, 4);
});

test("merging a delta into what's on disk leaves untouched days alone", () => {
  const onDisk = { "2026-08-06": day("2026-08-06", 1200, "css", "x") };
  const delta = { "2026-08-07": day("2026-08-07", 600, "css", "x") };
  const merged = mergeDatabases(onDisk, delta);

  assert.equal(merged["2026-08-06"].activeSeconds, 1200);
  assert.equal(merged["2026-08-07"].activeSeconds, 600);
});

test("a delta for a day already on disk adds to it", () => {
  const merged = mergeDatabases(
    { "2026-08-07": day("2026-08-07", 1200, "css", "x") },
    { "2026-08-07": day("2026-08-07", 600, "css", "x") }
  );
  assert.equal(merged["2026-08-07"].activeSeconds, 1800);
});

test("a record missing fields is filled in rather than crashing the dashboard", () => {
  const record = normalizeDay({ date: "2026-08-07", activeSeconds: 300 });
  assert.equal(record.hours.length, 24);
  assert.deepEqual(record.languages, {});
  assert.deepEqual(record.composition, { typedChars: 0, insertedChars: 0, removedChars: 0 });
  assert.equal(record.edits, 0);
});

test("a short or overlong hours array is corrected to 24 buckets", () => {
  assert.equal(normalizeDay({ date: "2026-08-07", hours: [1, 2, 3] }).hours.length, 24);
  assert.equal(
    normalizeDay({ date: "2026-08-07", hours: new Array<number>(50).fill(1) }).hours.length,
    24
  );
});

test("nonsense values are dropped instead of poisoning the totals", () => {
  const record = normalizeDay({
    date: "2026-08-07",
    activeSeconds: Number.NaN,
    edits: -5,
    languages: { good: 10, bad: Number.POSITIVE_INFINITY },
  });
  assert.equal(record.activeSeconds, 0);
  assert.equal(record.edits, 0);
  assert.deepEqual(record.languages, { good: 10 });
});

test("a damaged file loses only the damaged days", () => {
  const days = normalizeDatabase({
    "2026-08-07": { activeSeconds: 600 },
    "not-a-date": { activeSeconds: 9999 },
    "2026-08-06": null,
  });
  assert.deepEqual(Object.keys(days), ["2026-08-07"]);
  assert.equal(days["2026-08-07"].activeSeconds, 600);
});

test("a non-object days blob yields nothing rather than throwing", () => {
  assert.deepEqual(normalizeDatabase("nope"), {});
  assert.deepEqual(normalizeDatabase(null), {});
});
