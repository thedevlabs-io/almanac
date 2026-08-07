// ABOUTME: Tests for the rollups behind the dashboard — heat levels, language stats, punchcard.
// ABOUTME: Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { languageHeatmap, levelsFor, summarize } from "../src/core/aggregate";
import { emptyDay, type DayRecord } from "../src/core/types";
import { applyTick, bump } from "../src/core/record";

function day(date: string, seconds: number, language = "typescript", project = "cadence"): DayRecord {
  return applyTick(emptyDay(date), { seconds, hour: 10, language, project });
}

function db(records: DayRecord[]): Record<string, DayRecord> {
  return Object.fromEntries(records.map((r) => [r.date, r]));
}

const OPTIONS = { today: "2026-08-07", minSeconds: 300, heatmapDays: 7 };

test("an empty database summarises to zeroes rather than throwing", () => {
  const summary = summarize({}, OPTIONS);
  assert.equal(summary.total, 0);
  assert.equal(summary.streak.current, 0);
  assert.deepEqual(summary.languages, []);
  assert.equal(summary.heatmap.length, 7);
  assert.equal(summary.heatmap.every((c) => c.level === 0), true);
});

test("today, week and month windows count the right days", () => {
  const summary = summarize(
    db([
      day("2026-08-07", 3600),
      day("2026-08-03", 1800),
      day("2026-07-20", 900),
      day("2026-05-01", 600),
    ]),
    OPTIONS
  );
  assert.equal(summary.today, 3600);
  assert.equal(summary.week, 5400);
  assert.equal(summary.month, 6300);
  assert.equal(summary.total, 6900);
});

test("the heatmap covers exactly the requested window, ending today", () => {
  const summary = summarize(db([day("2026-08-07", 60)]), OPTIONS);
  assert.equal(summary.heatmap[0].date, "2026-08-01");
  assert.equal(summary.heatmap[6].date, "2026-08-07");
});

test("heat levels are relative to how much you actually work", () => {
  const level = levelsFor([600, 1200, 1800, 2400]);
  assert.equal(level(0), 0);
  assert.equal(level(600), 1);
  assert.equal(level(2400), 4);
  // A light user's busiest day is still level 4.
  const lighter = levelsFor([60, 120]);
  assert.equal(lighter(120), 4);
});

test("languages are ranked by time, with display names", () => {
  const mixed = applyTick(day("2026-08-07", 600, "python"), {
    seconds: 7200,
    hour: 11,
    language: "rust",
  });
  const summary = summarize(db([day("2026-08-06", 3600, "rust"), mixed]), OPTIONS);
  assert.deepEqual(
    summary.languages.map((l) => l.id),
    ["rust", "python"]
  );
  assert.equal(summary.languages[0].seconds, 10800);
  assert.equal(summary.languages[1].name, "Python");
});

test("a language's streak uses the same bar as the day streak", () => {
  const summary = summarize(
    db([day("2026-08-05", 3600, "go"), day("2026-08-06", 60, "go"), day("2026-08-07", 3600, "go")]),
    OPTIONS
  );
  const go = summary.languages.find((l) => l.id === "go");
  assert.ok(go);
  // 2026-08-06 was only a minute, so it doesn't hold the streak together.
  assert.equal(go.streak.current, 1);
  assert.equal(go.days, 2);
});

test("the punchcard buckets by weekday and hour", () => {
  // 2026-08-07 is a Friday (weekday 5).
  const summary = summarize(db([day("2026-08-07", 1800)]), OPTIONS);
  assert.equal(summary.punchcard[5][10], 1800);
  assert.equal(summary.punchcard[4][10], 0);
});

test("counters and commits roll up across days", () => {
  const a = bump(bump(day("2026-08-06", 600), "edits", 10), "saves", 2);
  const b = { ...day("2026-08-07", 600), commits: 3 };
  const summary = summarize(db([a, b]), OPTIONS);
  assert.equal(summary.totals.edits, 10);
  assert.equal(summary.totals.saves, 2);
  assert.equal(summary.totals.commits, 3);
  assert.deepEqual(summary.commitsByDay, { "2026-08-07": 3 });
});

test("the best day ignores days with no activity", () => {
  const summary = summarize(db([day("2026-08-05", 0), day("2026-08-06", 1200)]), OPTIONS);
  assert.deepEqual(summary.best, { date: "2026-08-06", seconds: 1200 });
});

test("a language heatmap covers the window even where the language is absent", () => {
  const cells = languageHeatmap(
    db([day("2026-08-07", 600, "css")]),
    "css",
    "2026-08-05",
    "2026-08-07"
  );
  assert.equal(cells.length, 3);
  assert.equal(cells[0].seconds, 0);
  assert.equal(cells[2].seconds, 600);
});
