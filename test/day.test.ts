import { strict as assert } from "node:assert";
import { test } from "node:test";
import { daysBetween, keyOf, range, shift, startOfMonth, startOfWeek, weekdayOf } from "../src/core/day";

test("a key is the local calendar day, not a UTC one", () => {
  assert.equal(keyOf(new Date(2026, 7, 3, 23, 59)), "2026-08-03");
  assert.equal(keyOf(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
});

test("shifting crosses month and year boundaries", () => {
  assert.equal(shift("2026-08-31", 1), "2026-09-01");
  assert.equal(shift("2026-01-01", -1), "2025-12-31");
  assert.equal(shift("2024-02-28", 1), "2024-02-29", "2024 is a leap year");
});

test("days between is whole days even across a daylight saving change", () => {
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(daysBetween("2026-08-03", "2026-08-03"), 0);
  assert.equal(daysBetween("2026-08-04", "2026-08-03"), -1);
});

test("a range is inclusive at both ends", () => {
  assert.deepEqual(range("2026-08-01", "2026-08-03"), ["2026-08-01", "2026-08-02", "2026-08-03"]);
  assert.deepEqual(range("2026-08-01", "2026-08-01"), ["2026-08-01"]);
});

test("weeks start on Monday", () => {
  assert.equal(weekdayOf("2026-08-03"), 0, "2026-08-03 is a Monday");
  assert.equal(weekdayOf("2026-08-09"), 6, "and 2026-08-09 is the Sunday");
  assert.equal(startOfWeek("2026-08-06"), "2026-08-03");
  assert.equal(startOfWeek("2026-08-03"), "2026-08-03");
});

test("start of month keeps the month it was given", () => {
  assert.equal(startOfMonth("2026-08-31"), "2026-08-01");
});
