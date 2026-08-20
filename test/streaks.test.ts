import { strict as assert } from "node:assert";
import { test } from "node:test";
import { atRisk, secondsToKeepStreak, streaks } from "../src/core/streaks";
import { emptyDay, type DayRecord } from "../src/core/types";

function days(entries: Record<string, number>): Record<string, DayRecord> {
  const result: Record<string, DayRecord> = {};
  for (const [date, minutes] of Object.entries(entries)) {
    result[date] = { ...emptyDay(date), activeSeconds: minutes * 60 };
  }
  return result;
}

test("no qualifying days means no streak", () => {
  assert.deepEqual(streaks(days({ "2026-08-01": 1 }), "2026-08-01", 5), {
    current: 0,
    longest: 0,
  });
});

test("consecutive qualifying days build a streak", () => {
  const result = streaks(
    days({ "2026-08-01": 30, "2026-08-02": 30, "2026-08-03": 30 }),
    "2026-08-03",
    5
  );
  assert.equal(result.current, 3);
  assert.equal(result.longest, 3);
});

test("yesterday still counts as current, so a streak does not break at breakfast", () => {
  const result = streaks(days({ "2026-08-01": 30, "2026-08-02": 30 }), "2026-08-03", 5);
  assert.equal(result.current, 2);
});

test("a two day gap ends the current streak but not the longest", () => {
  const result = streaks(
    days({ "2026-08-01": 30, "2026-08-02": 30, "2026-08-03": 30, "2026-08-10": 30 }),
    "2026-08-12",
    5
  );
  assert.equal(result.current, 0);
  assert.equal(result.longest, 3);
});

test("a day below the threshold does not qualify", () => {
  const result = streaks(days({ "2026-08-01": 30, "2026-08-02": 2 }), "2026-08-02", 5);
  assert.equal(result.current, 1);
  assert.equal(result.lastQualifying, "2026-08-01");
});

test("time still needed today is reported, and clamped at zero", () => {
  assert.equal(secondsToKeepStreak(days({ "2026-08-02": 2 }), "2026-08-02", 5), 180);
  assert.equal(secondsToKeepStreak(days({ "2026-08-02": 30 }), "2026-08-02", 5), 0);
});

test("a streak is at risk only when yesterday qualified and today has not", () => {
  assert.equal(atRisk(days({ "2026-08-01": 30 }), "2026-08-02", 5), true);
  assert.equal(atRisk(days({ "2026-08-01": 30, "2026-08-02": 30 }), "2026-08-02", 5), false);
  assert.equal(atRisk(days({}), "2026-08-02", 5), false);
});
