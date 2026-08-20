import { strict as assert } from "node:assert";
import { test } from "node:test";
import { duration, durationPadded, hoursDecimal, languageName, plural, relativeDays } from "../src/core/format";

test("a fresh install shows seconds rather than sitting at zero", () => {
  assert.equal(duration(0), "0m");
  assert.equal(duration(-10), "0m");
  assert.equal(duration(30), "30s");
  assert.equal(duration(59), "59s");
});

test("durations read the way a person would say them", () => {
  assert.equal(duration(60), "1m");
  assert.equal(duration(3600), "1h");
  assert.equal(duration(3660), "1h 1m");
  assert.equal(duration(7 * 3600 + 25 * 60), "7h 25m");
});

test("the padded form lines up in a table", () => {
  assert.equal(durationPadded(3660), "1h 01m");
  assert.equal(durationPadded(0), "0h 00m");
});

test("decimal hours are what an invoice wants", () => {
  assert.equal(hoursDecimal(3600), "1.00");
  assert.equal(hoursDecimal(5400), "1.50");
  assert.equal(hoursDecimal(-10), "0.00");
});

test("language ids become names, and unknown ones are title cased", () => {
  assert.equal(languageName("typescriptreact"), "TSX");
  assert.equal(languageName("csharp"), "C#");
  assert.equal(languageName("brainfuck"), "Brainfuck");
});

test("plurals and relative days", () => {
  assert.equal(plural(1, "day"), "1 day");
  assert.equal(plural(2, "day"), "2 days");
  assert.equal(relativeDays(0), "today");
  assert.equal(relativeDays(1), "yesterday");
  assert.equal(relativeDays(5), "5 days ago");
});
