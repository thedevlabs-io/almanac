// ABOUTME: Tests for client reports — grouping, per-day rounding, CSV and the day drill-down.
// ABOUTME: These numbers can end up on an invoice, so they're pinned tightly. Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReport,
  clientOf,
  dayDetail,
  presetRange,
  roundSeconds,
  toCsv,
} from "../src/core/report";
import { applyTick, bump } from "../src/core/record";
import { emptyDay, type DayRecord } from "../src/core/types";

function day(date: string, entries: [string, number][], language = "typescript"): DayRecord {
  let record = emptyDay(date);
  for (const [project, seconds] of entries) {
    record = applyTick(record, { seconds, hour: 10, language, project });
  }
  return record;
}

const db = (records: DayRecord[]): Record<string, DayRecord> =>
  Object.fromEntries(records.map((r) => [r.date, r]));

const CLIENTS = { "thedevlabs-api": "thedevlabs", "thedevlabs-web": "thedevlabs" };

const OPTIONS = {
  from: "2026-08-01",
  to: "2026-08-31",
  label: "This month",
  clients: CLIENTS,
  rounding: "none" as const,
};

test("projects with no client label report under their own name", () => {
  assert.equal(clientOf("side-project", CLIENTS), "side-project");
  assert.equal(clientOf("thedevlabs-api", CLIENTS), "thedevlabs");
});

test("two repos for one client are billed as one client", () => {
  const report = buildReport(
    db([
      day("2026-08-03", [["thedevlabs-api", 3600]]),
      day("2026-08-04", [["thedevlabs-web", 1800]]),
    ]),
    OPTIONS
  );
  assert.equal(report.clients.length, 1);
  assert.equal(report.clients[0].client, "thedevlabs");
  assert.equal(report.clients[0].seconds, 5400);
  assert.equal(report.clients[0].days, 2);
  assert.deepEqual(
    report.clients[0].projects.map((p) => p.project),
    ["thedevlabs-api", "thedevlabs-web"]
  );
});

test("only days inside the range are counted", () => {
  const report = buildReport(
    db([
      day("2026-07-31", [["thedevlabs-api", 3600]]),
      day("2026-08-01", [["thedevlabs-api", 1800]]),
      day("2026-09-01", [["thedevlabs-api", 3600]]),
    ]),
    OPTIONS
  );
  assert.equal(report.totalSeconds, 1800);
  assert.equal(report.daysWorked, 1);
});

test("rounding is per client per day, not on the total", () => {
  // Three days of 20 minutes each: rounded to the half hour that is 3 x 30, not 60.
  const records = ["2026-08-03", "2026-08-04", "2026-08-05"].map((d) =>
    day(d, [["thedevlabs-api", 1200]])
  );
  const report = buildReport(db(records), { ...OPTIONS, rounding: "30m" });
  assert.equal(report.clients[0].seconds, 3600);
  assert.equal(report.clients[0].rounded, 5400);
});

test("rounding never turns a day off into billable time", () => {
  assert.equal(roundSeconds(0, "1h"), 0);
  assert.equal(roundSeconds(-5, "15m"), 0);
});

test("rounding rounds up to the increment", () => {
  assert.equal(roundSeconds(1, "15m"), 900);
  assert.equal(roundSeconds(900, "15m"), 900);
  assert.equal(roundSeconds(901, "15m"), 1800);
  assert.equal(roundSeconds(5000, "none"), 5000);
});

test("time tracked with no folder open is reported separately, not dropped", () => {
  const record = applyTick(emptyDay("2026-08-03"), { seconds: 600, hour: 9 });
  const report = buildReport(db([record]), OPTIONS);
  assert.equal(report.unassignedSeconds, 600);
  assert.equal(report.clients.length, 0);
  assert.equal(report.totalSeconds, 600);
});

test("the day breakdown lists each project, biggest first", () => {
  const report = buildReport(
    db([day("2026-08-03", [["thedevlabs-api", 600], ["thedevlabs-web", 1800]])]),
    OPTIONS
  );
  assert.deepEqual(
    report.byDay[0].entries.map((e) => e.project),
    ["thedevlabs-web", "thedevlabs-api"]
  );
});

test("CSV has a row per day per project, with hours and seconds", () => {
  const report = buildReport(
    db([
      day("2026-08-03", [["thedevlabs-api", 3600]]),
      day("2026-08-04", [["side-project", 1800]]),
    ]),
    OPTIONS
  );
  const lines = toCsv(report).trim().split("\n");
  assert.equal(lines[0], "date,client,project,hours,rounded_hours,seconds");
  assert.equal(lines[1], "2026-08-03,thedevlabs,thedevlabs-api,1.00,1.00,3600");
  assert.equal(lines[2], "2026-08-04,side-project,side-project,0.50,0.50,1800");
});

test("a client name containing a comma survives the CSV", () => {
  const report = buildReport(db([day("2026-08-03", [["p", 3600]])]), {
    ...OPTIONS,
    clients: { p: 'thedevlabs, Ltd "trading"' },
  });
  assert.ok(toCsv(report).includes('"thedevlabs, Ltd ""trading"""'));
});

test("the day drill-down summarises one day", () => {
  const record = bump(
    day("2026-08-03", [["thedevlabs-api", 3600]], "rust"),
    "saves",
    4
  );
  const detail = dayDetail(record, CLIENTS);
  assert.ok(detail);
  assert.equal(detail.total, "1h");
  assert.equal(detail.languages[0].name, "Rust");
  assert.equal(detail.projects[0].client, "thedevlabs");
  assert.equal(detail.saves, 4);
  assert.equal(detail.hours.length, 24);
});

test("a day with no activity has no detail to show", () => {
  assert.equal(dayDetail(undefined, CLIENTS), undefined);
  assert.equal(dayDetail(emptyDay("2026-08-03"), CLIENTS), undefined);
});

test("last month covers whole calendar months, including short ones", () => {
  assert.deepEqual(presetRange("last-month", "2026-03-15"), {
    from: "2026-02-01",
    to: "2026-02-28",
    label: "Last month",
  });
  assert.deepEqual(presetRange("this-month", "2026-08-07"), {
    from: "2026-08-01",
    to: "2026-08-07",
    label: "This month",
  });
});
