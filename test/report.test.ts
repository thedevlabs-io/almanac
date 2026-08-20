import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildReport, clientOf, reportToCsv, roundSeconds } from "../src/core/report";
import { applyTick } from "../src/core/record";
import { emptyDay, type DayRecord } from "../src/core/types";

function day(date: string, entries: [string, number][]): DayRecord {
  return entries.reduce(
    (record, [repo, seconds]) =>
      applyTick(record, { seconds, hour: 10, project: { repo, folder: "." } }),
    emptyDay(date)
  );
}

test("rounding always rounds up, because rounding down bills less than was worked", () => {
  assert.equal(roundSeconds(0, "15m"), 0);
  assert.equal(roundSeconds(1, "15m"), 900);
  assert.equal(roundSeconds(900, "15m"), 900);
  assert.equal(roundSeconds(901, "15m"), 1800);
  assert.equal(roundSeconds(3601, "1h"), 7200);
  assert.equal(roundSeconds(1234, "none"), 1234);
});

test("an unmapped repository reports under its own name rather than vanishing", () => {
  assert.equal(clientOf("acme-api", { "acme-api": "acme" }), "acme");
  assert.equal(clientOf("side-project", { "acme-api": "acme" }), "side-project");
  assert.equal(clientOf("acme-api", { "acme-api": "   " }), "acme-api");
});

test("repositories sharing a client are billed as one line per day", () => {
  const days = {
    "2026-08-01": day("2026-08-01", [["acme-api", 3600], ["acme-web", 1800], ["personal", 600]]),
  };
  const report = buildReport(days, {
    from: "2026-08-01",
    to: "2026-08-01",
    clients: { "acme-api": "Acme", "acme-web": "Acme" },
  });

  assert.equal(report.rows.length, 2);
  const acme = report.rows.find((row) => row.client === "Acme");
  assert.equal(acme?.seconds, 5400);
  assert.deepEqual(acme?.repos, ["acme-api", "acme-web"], "busiest repository first");
  assert.equal(report.rows.find((row) => row.client === "personal")?.seconds, 600);
});

test("rounding is applied per client per day, not once at the end", () => {
  const days = {
    "2026-08-01": day("2026-08-01", [["acme", 60]]),
    "2026-08-02": day("2026-08-02", [["acme", 60]]),
  };
  const report = buildReport(days, { from: "2026-08-01", to: "2026-08-02", rounding: "1h" });

  assert.equal(report.seconds, 120, "raw time is unchanged");
  assert.equal(report.billableSeconds, 7200, "two days each round up to an hour");
  assert.equal(report.clients[0]?.days, 2);
});

test("days with no repository time produce no rows", () => {
  const report = buildReport({ "2026-08-01": emptyDay("2026-08-01") }, {
    from: "2026-08-01",
    to: "2026-08-01",
  });
  assert.deepEqual(report.rows, []);
  assert.equal(report.billableSeconds, 0);
});

test("the CSV quotes fields that would otherwise break it", () => {
  const days = { "2026-08-01": day("2026-08-01", [["repo", 3600]]) };
  const csv = reportToCsv(
    buildReport(days, { from: "2026-08-01", to: "2026-08-01", clients: { repo: 'Ac"me, Ltd' } })
  );

  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "date,client,repositories,tracked_hours,billable_hours");
  assert.equal(lines[1], '2026-08-01,"Ac""me, Ltd",repo,1.00,1.00');
});
