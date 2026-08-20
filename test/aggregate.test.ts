import { strict as assert } from "node:assert";
import { test } from "node:test";
import { averageActiveDay, heatLevel, heatmap, punchcard, repositories, signalSplit, topLanguages, totalsFor } from "../src/core/aggregate";
import { applyTick } from "../src/core/record";
import { emptyDay, type DayRecord } from "../src/core/types";

function dayWith(date: string, ticks: Parameters<typeof applyTick>[1][]): DayRecord {
  return ticks.reduce((record, tick) => applyTick(record, tick), emptyDay(date));
}

test("heat levels are cut against the busiest day, not a fixed scale", () => {
  assert.equal(heatLevel(0, 1000), 0);
  assert.equal(heatLevel(250, 1000), 1);
  assert.equal(heatLevel(500, 1000), 2);
  assert.equal(heatLevel(750, 1000), 3);
  assert.equal(heatLevel(1000, 1000), 4);
});

test("any time on a day with no busiest reference still shows as level 1", () => {
  assert.equal(heatLevel(10, 0), 1);
});

test("the heatmap covers every day in the window including empty ones", () => {
  const cells = heatmap({ "2026-08-02": dayWith("2026-08-02", [{ seconds: 60, hour: 9 }]) }, "2026-08-01", "2026-08-03");
  assert.deepEqual(cells.map((cell) => cell.date), ["2026-08-01", "2026-08-02", "2026-08-03"]);
  assert.deepEqual(cells.map((cell) => cell.level), [0, 4, 0]);
});

test("totals sum languages, hours, signals and repositories across days", () => {
  const days = {
    "2026-08-01": dayWith("2026-08-01", [
      { seconds: 100, hour: 9, language: "typescript", kind: "editor", project: { repo: "acme", folder: "apps/web" } },
      { seconds: 200, hour: 9, language: "typescript", kind: "terminal", project: { repo: "acme", folder: "." } },
    ]),
    "2026-08-02": dayWith("2026-08-02", [
      { seconds: 50, hour: 14, language: "python", kind: "terminal", project: { repo: "notes", folder: "." } },
    ]),
  };

  const totals = totalsFor(days, "2026-08-01", "2026-08-02");
  assert.equal(totals.seconds, 350);
  assert.equal(totals.activeDays, 2);
  assert.deepEqual(totals.languages, { typescript: 300, python: 50 });
  assert.deepEqual(totals.signals, { editor: 100, terminal: 250 });
  assert.equal(totals.hours[9], 300);
  assert.equal(totals.hours[14], 50);
  assert.equal(totals.projects.acme?.seconds, 300);
  assert.deepEqual(totals.projects.acme?.folders, { "apps/web": 100, ".": 200 });
});

test("the signal split shows where a terminal-heavy day actually went", () => {
  const days = {
    "2026-08-01": dayWith("2026-08-01", [
      { seconds: 100, hour: 9, kind: "editor" },
      { seconds: 900, hour: 9, kind: "terminal" },
    ]),
  };
  const split = signalSplit(totalsFor(days, "2026-08-01", "2026-08-01"));
  assert.equal(split[0]?.key, "terminal");
  assert.equal(split[0]?.seconds, 900);
  assert.equal(Math.round((split[0]?.share ?? 0) * 100), 90);
});

test("languages are ranked and limited", () => {
  const days = {
    "2026-08-01": dayWith("2026-08-01", [
      { seconds: 10, hour: 9, language: "css" },
      { seconds: 90, hour: 9, language: "typescript" },
    ]),
  };
  const ranked = topLanguages(totalsFor(days, "2026-08-01", "2026-08-01"), 1);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]?.key, "typescript");
});

test("repositories come back as trees, busiest first", () => {
  const days = {
    "2026-08-01": dayWith("2026-08-01", [
      { seconds: 10, hour: 9, project: { repo: "small", folder: "." } },
      { seconds: 90, hour: 9, project: { repo: "big", folder: "apps/web" } },
    ]),
  };
  const trees = repositories(totalsFor(days, "2026-08-01", "2026-08-01"));
  assert.deepEqual(trees.map((tree) => tree.repo), ["big", "small"]);
  assert.equal(trees[0]?.children[0]?.name, "apps");
});

test("the punchcard names the busiest hour, and none when there is no work", () => {
  const days = {
    "2026-08-01": dayWith("2026-08-01", [
      { seconds: 100, hour: 9 },
      { seconds: 300, hour: 22 },
    ]),
  };
  assert.equal(punchcard(totalsFor(days, "2026-08-01", "2026-08-01")).peakHour, 22);
  assert.equal(punchcard(totalsFor({}, "2026-08-01", "2026-08-01")).peakHour, undefined);
});

test("the average active day ignores days with nothing on them", () => {
  const days = {
    "2026-08-01": dayWith("2026-08-01", [{ seconds: 100, hour: 9 }]),
    "2026-08-03": dayWith("2026-08-03", [{ seconds: 300, hour: 9 }]),
  };
  assert.equal(averageActiveDay(totalsFor(days, "2026-08-01", "2026-08-05")), 200);
  assert.equal(averageActiveDay(totalsFor({}, "2026-08-01", "2026-08-05")), 0);
});

test("an out of range hour is clamped rather than dropped", () => {
  const record = applyTick(emptyDay("2026-08-01"), { seconds: 10, hour: 99 });
  assert.equal(record.hours[23], 10);
  assert.equal(record.activeSeconds, 10);
});

test("a zero or negative tick changes nothing", () => {
  const base = emptyDay("2026-08-01");
  assert.equal(applyTick(base, { seconds: 0, hour: 9 }), base);
  assert.equal(applyTick(base, { seconds: -5, hour: 9 }), base);
});
