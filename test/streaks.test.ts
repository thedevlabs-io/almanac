// ABOUTME: Tests for streak arithmetic — the number users will care most about being right.
// ABOUTME: Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { qualifyingDays, streakOf } from "../src/core/streaks";

test("no days means no streak", () => {
  assert.deepEqual(streakOf([], "2026-08-07"), { current: 0, longest: 0, todayCounts: false });
});

test("consecutive days ending today count as the current streak", () => {
  const days = ["2026-08-05", "2026-08-06", "2026-08-07"];
  const streak = streakOf(days, "2026-08-07");
  assert.equal(streak.current, 3);
  assert.equal(streak.longest, 3);
  assert.equal(streak.todayCounts, true);
});

test("today not qualifying yet does not break the streak", () => {
  // At 9am you haven't worked yet; the run through yesterday still stands.
  const streak = streakOf(["2026-08-05", "2026-08-06"], "2026-08-07");
  assert.equal(streak.current, 2);
  assert.equal(streak.todayCounts, false);
});

test("a missed day does break it", () => {
  const streak = streakOf(["2026-08-01", "2026-08-02", "2026-08-05"], "2026-08-07");
  assert.equal(streak.current, 0);
  assert.equal(streak.longest, 2);
});

test("the longest run is found anywhere in history, with its dates", () => {
  const days = [
    "2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04",
    "2026-03-01",
    "2026-08-06", "2026-08-07",
  ];
  const streak = streakOf(days, "2026-08-07");
  assert.equal(streak.longest, 4);
  assert.equal(streak.longestFrom, "2026-01-01");
  assert.equal(streak.longestTo, "2026-01-04");
  assert.equal(streak.current, 2);
});

test("a streak spanning a month boundary is unbroken", () => {
  const streak = streakOf(["2026-01-30", "2026-01-31", "2026-02-01"], "2026-02-01");
  assert.equal(streak.current, 3);
});

test("a streak spanning a leap day is unbroken", () => {
  const streak = streakOf(["2028-02-28", "2028-02-29", "2028-03-01"], "2028-03-01");
  assert.equal(streak.current, 3);
});

test("duplicate days do not inflate a streak", () => {
  const streak = streakOf(["2026-08-06", "2026-08-06", "2026-08-07"], "2026-08-07");
  assert.equal(streak.current, 2);
});

test("only days over the bar qualify", () => {
  const records = [
    { date: "2026-08-05", activeSeconds: 600 },
    { date: "2026-08-06", activeSeconds: 30 },
    { date: "2026-08-07", activeSeconds: 400 },
  ];
  assert.deepEqual(qualifyingDays(records, 300), ["2026-08-05", "2026-08-07"]);
  assert.equal(streakOf(qualifyingDays(records, 300), "2026-08-07").current, 1);
});
